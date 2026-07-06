/**
 * Imports league history directly from MyFantasyLeague's export API into
 * the local SQLite database.
 *
 * Usage:
 *   npm run import -- --league 67102 --start 2003 --end 2025
 *
 * --league  The MFL league ID for the CURRENT season (find it in your
 *           league's URL, e.g. myfantasyleague.com/2026/home/67102 -> 67102).
 *           Older seasons often used a different league ID before MFL
 *           consolidated multi-year leagues under one ID — this script
 *           looks that up automatically via the league's "history" data.
 * --start   First season to import (defaults to 2003).
 * --end     Last season to import (defaults to --league's current year).
 */
import path from "node:path";
import fs from "node:fs";
import { getDb, Db } from "../lib/db";
import {
  fetchLeagueInfo,
  fetchLeagueHistory,
  fetchWeeklyResults,
  asArray,
} from "../lib/mfl-client";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(`--${flag}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const currentYear = new Date().getFullYear();
  return {
    league: get("league", "67102")!,
    start: parseInt(get("start", "2003")!, 10),
    end: parseInt(get("end", String(currentYear))!, 10),
  };
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once.
 * A season's worth of weekly fetches used to run one at a time — for a
 * 23-season import that's 300+ sequential round trips to MFL, slow enough to
 * risk a Vercel build timeout (which silently truncates whichever seasons
 * hadn't been reached yet, with no failed-build signal). Running a handful
 * concurrently cuts wall-clock time by roughly the concurrency factor while
 * staying polite to MFL's server. */
async function pMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function getOrCreateTeam(db: Db, name: string): number {
  const trimmed = name.trim();
  const existing = db
    .prepare("SELECT id FROM teams WHERE base_name = ? COLLATE NOCASE")
    .get(trimmed) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db
    .prepare("INSERT INTO teams (base_name) VALUES (?)")
    .run(trimmed);
  return Number(result.lastInsertRowid);
}

export interface SeasonImportResult {
  gameCount: number;
  failedWeeks: number[];
  totalWeeks: number;
}

/** Returns import stats for this season (gameCount 0 if the league had no
 * franchise data yet, e.g. a not-yet-drafted future season) — callers use
 * this to decide whether the season is "real" enough to show in the app,
 * and whether individual week failures left it incomplete even though it
 * has *some* games. */
async function importSeason(db: Db, year: number, leagueId: string): Promise<SeasonImportResult> {
  console.log(`\n=== ${year} (league ${leagueId}) ===`);
  const info = await fetchLeagueInfo(year, leagueId);
  const league = info.league;
  const franchises = asArray(league.franchises?.franchise);
  if (franchises.length === 0) {
    console.log(`  no franchise data returned, skipping`);
    return { gameCount: 0, failedWeeks: [], totalWeeks: 0 };
  }

  const divisions = asArray(league.divisions?.division);
  const conferences = asArray(league.conferences?.conference);
  const confNameById = new Map(conferences.map((c) => [c.id, c.name]));
  const divInfoById = new Map(
    divisions.map((d) => [d.id, { name: d.name, conference: confNameById.get(d.conference) ?? d.conference }])
  );

  const startWeek = parseInt(league.startWeek ?? "1", 10);
  const lastRegWeek = parseInt(league.lastRegularSeasonWeek ?? league.endWeek ?? "13", 10);
  const endWeek = parseInt(league.endWeek ?? String(lastRegWeek), 10);

  db.prepare(
    `INSERT INTO seasons (season, mfl_league_id, league_name, start_week, reg_season_weeks, last_regular_season_week, end_week, num_conferences, num_divisions, num_teams)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(season) DO UPDATE SET
       mfl_league_id=excluded.mfl_league_id, league_name=excluded.league_name,
       start_week=excluded.start_week, reg_season_weeks=excluded.reg_season_weeks,
       last_regular_season_week=excluded.last_regular_season_week, end_week=excluded.end_week,
       num_conferences=excluded.num_conferences, num_divisions=excluded.num_divisions, num_teams=excluded.num_teams`
  ).run(
    year,
    leagueId,
    league.name ?? null,
    startWeek,
    lastRegWeek - startWeek + 1,
    lastRegWeek,
    endWeek,
    conferences.length,
    divisions.length,
    franchises.length
  );

  const franchiseToTeamId = new Map<string, number>();
  for (const f of franchises) {
    const teamId = getOrCreateTeam(db, f.name);
    franchiseToTeamId.set(f.id, teamId);
    const divInfo = f.division ? divInfoById.get(f.division) : undefined;
    db.prepare(
      `INSERT INTO team_seasons (team_id, season, franchise_id, team_name, conference, division)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(season, franchise_id) DO UPDATE SET
         team_id=excluded.team_id, team_name=excluded.team_name, conference=excluded.conference, division=excluded.division`
    ).run(teamId, year, f.id, f.name.trim(), divInfo?.conference ?? null, divInfo?.name ?? null);
  }
  console.log(`  ${franchises.length} teams`);

  let gameCount = 0;
  const insertGame = db.prepare(
    `INSERT INTO games (season, week, home_team_id, away_team_id, home_score, away_score, game_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(season, week, home_team_id, away_team_id) DO UPDATE SET
       home_score=excluded.home_score, away_score=excluded.away_score, game_type=excluded.game_type`
  );

  // One request at a time, in order. Earlier this ran 6 weeks concurrently
  // to cut build time, but MFL's export API rate-limits hard — firing
  // requests in parallel just produced a wall of 429s instead of finishing
  // faster. The pacing/backoff in lib/mfl-client.ts now does the real work
  // of staying under that limit; concurrency here is left at 1 deliberately.
  const weeks = Array.from({ length: endWeek - startWeek + 1 }, (_, i) => startWeek + i);
  const weeklyResults = await pMap(weeks, 1, async (week) => {
    try {
      return { week, weekly: await fetchWeeklyResults(year, leagueId, week), error: null as string | null };
    } catch (err) {
      return { week, weekly: null, error: (err as Error).message };
    }
  });

  const failedWeeks: number[] = [];
  for (const { week, weekly, error } of weeklyResults) {
    if (error || !weekly) {
      console.log(`  week ${week}: fetch failed (${error})`);
      failedWeeks.push(week);
      continue;
    }
    const matchups = asArray(weekly.weeklyResults?.matchup);
    for (const m of matchups) {
      const sides = asArray(m.franchise);
      if (sides.length !== 2) continue;
      const [a, b] = sides;
      const home = a.isHome === "1" ? a : b;
      const away = a.isHome === "1" ? b : a;
      const homeTeamId = franchiseToTeamId.get(home.id);
      const awayTeamId = franchiseToTeamId.get(away.id);
      if (!homeTeamId || !awayTeamId) continue;
      const homeScore = parseFloat(home.score);
      const awayScore = parseFloat(away.score);
      if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;
      // A real fantasy matchup essentially never ends 0.00-0.00 for both
      // sides — that pattern is a reliable signal of placeholder/demo data
      // (e.g. an unresolved league ID that happened to point at some other,
      // unrelated league) rather than a real played game. Skip it.
      if (homeScore === 0 && awayScore === 0) continue;
      // Best-effort default: MFL flags regular-season weeks; anything past
      // that (or flagged non-regular) is bucketed as "playoff" for now.
      // Edit the `game_type` column directly in data/league.db (or add an
      // admin screen) to split out toilet bowl / consolation games.
      const gameType = m.regularSeason === "1" || week <= lastRegWeek ? "regular" : "playoff";
      insertGame.run(year, week, homeTeamId, awayTeamId, homeScore, awayScore, gameType);
      gameCount++;
    }
  }
  console.log(`  ${gameCount} games (weeks ${startWeek}-${endWeek})`);
  if (failedWeeks.length) {
    console.log(`  INCOMPLETE: ${failedWeeks.length}/${weeks.length} weeks failed to fetch: ${failedWeeks.join(", ")}`);
  }
  // Not calling db.save() here: it re-serializes the *entire* in-memory
  // database to disk on every call, which is wasteful 23 times over. main()
  // saves once after every season has been processed.
  return { gameCount, failedWeeks, totalWeeks: weeks.length };
}

interface ChampionEntry {
  season: number;
  leagueChampion?: string | null;
  runnerUp?: string | null;
  toiletBowlChampion?: string | null;
}

/** Loads hand-entered postseason results from data/champions.json (committed
 * to git, unlike data/league.db) into the `champions` table. This runs on
 * every build alongside the MFL import, since the SQLite file itself is
 * rebuilt from scratch each deploy (see vercel.json) — champions.json is the
 * only place this data persists across deploys. */
function loadChampions(db: Db) {
  const file = path.join(process.cwd(), "data", "champions.json");
  if (!fs.existsSync(file)) {
    console.log("\nNo data/champions.json found — skipping postseason champion import.");
    return;
  }

  let entries: ChampionEntry[];
  try {
    entries = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`\ndata/champions.json failed to parse: ${(err as Error).message}`);
    return;
  }

  const findTeamId = (name?: string | null): number | null => {
    if (!name) return null;
    const row = db
      .prepare("SELECT id FROM teams WHERE base_name = ? COLLATE NOCASE")
      .get(name.trim()) as { id: number } | undefined;
    if (!row) {
      console.log(`  champions.json: no team matching "${name}" — check spelling against the Teams page`);
      return null;
    }
    return row.id;
  };

  console.log(`\n=== Postseason champions (${entries.length} seasons in champions.json) ===`);
  let populated = 0;
  const upsert = db.prepare(
    `INSERT INTO champions (season, league_champ_team_id, runner_up_team_id, toilet_champ_team_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(season) DO UPDATE SET
       league_champ_team_id=excluded.league_champ_team_id,
       runner_up_team_id=excluded.runner_up_team_id,
       toilet_champ_team_id=excluded.toilet_champ_team_id`
  );
  for (const e of entries) {
    const champTeamId = findTeamId(e.leagueChampion);
    const runnerUpTeamId = findTeamId(e.runnerUp);
    const toiletTeamId = findTeamId(e.toiletBowlChampion);
    if (champTeamId || runnerUpTeamId || toiletTeamId) populated++;
    upsert.run(e.season, champTeamId, runnerUpTeamId, toiletTeamId);
  }
  console.log(`  ${populated}/${entries.length} seasons have at least one champion filled in`);
}

async function main() {
  const { league, start, end } = parseArgs();
  console.log(`Importing league ${league}, seasons ${start}-${end}...`);
  const db = await getDb();

  const historyMap = await fetchLeagueHistory(end, league);
  console.log(`Resolved league IDs for ${Object.keys(historyMap).length} seasons from league history.`);

  const imported: number[] = [];
  const empty: number[] = []; // franchise data existed but zero games (e.g. season hasn't started)
  const incomplete: { year: number; failedWeeks: number[]; totalWeeks: number }[] = []; // some games, but some weeks failed to fetch
  const failed: { year: number; reason: string }[] = [];

  const skipped: number[] = [];

  for (let year = start; year <= end; year++) {
    // IMPORTANT: do NOT fall back to the `--league` ID directly when a year
    // is missing from history data. A previous version of this script did
    // that, reasoning that recent seasons usually share the current ID — but
    // MFL league IDs get reassigned to unrelated leagues over time, and for
    // at least one season (2003) that fallback silently pulled in a
    // completely different, unrelated league's placeholder/demo data (10
    // fake teams, every game scored 0-0). Wrong data is worse than missing
    // data on a history site, so a year with no resolved ID is skipped and
    // reported — find the real historical league ID (check your MFL admin
    // account or old bookmarks/emails) and re-run with it if you want that
    // season included.
    const leagueIdForYear = historyMap[year];
    if (!leagueIdForYear) {
      console.log(`\n=== ${year} ===\n  no league ID in history data — skipping (find the real ID and re-import manually)`);
      skipped.push(year);
      continue;
    }
    try {
      const result = await importSeason(db, year, leagueIdForYear);
      if (result.gameCount > 0) {
        imported.push(year);
        if (result.failedWeeks.length > 0) {
          incomplete.push({ year, failedWeeks: result.failedWeeks, totalWeeks: result.totalWeeks });
        }
      } else {
        empty.push(year);
      }
    } catch (err) {
      failed.push({ year, reason: (err as Error).message });
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  loadChampions(db);

  db.save();
  // Deliberately not calling db.close() here: this is a one-shot CLI script
  // that exits right after main() resolves, so there's nothing to clean up.
  // (Calling close() would also invalidate the shared getDb() cache for
  // anything else running in this same process.)
  console.log("\nDone. Saved to data/league.db");

  // A season silently missing from the site is much easier to miss than a
  // red build in Vercel's dashboard — print a summary that's impossible to
  // scroll past, so a partial import gets noticed.
  console.log("\n=== Import summary ===");
  console.log(`  Imported with games: ${imported.length ? imported.join(", ") : "(none)"}`);
  if (empty.length) console.log(`  No games yet (season not started): ${empty.join(", ")}`);
  if (skipped.length) {
    console.log(
      `  Skipped, no league ID resolved (${skipped.length}): ${skipped.join(", ")} — find the real historical league ID for these years and re-import manually if you want them included.`
    );
  }
  if (failed.length) {
    console.log(`  FAILED (${failed.length}):`);
    for (const f of failed) console.log(`    ${f.year}: ${f.reason}`);
    console.log(
      "\n  Some seasons failed to import — re-running `npm run import` often fixes transient MFL API errors."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
