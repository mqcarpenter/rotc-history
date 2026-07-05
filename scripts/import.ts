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

async function importSeason(db: Db, year: number, leagueId: string) {
  console.log(`\n=== ${year} (league ${leagueId}) ===`);
  const info = await fetchLeagueInfo(year, leagueId);
  const league = info.league;
  const franchises = asArray(league.franchises?.franchise);
  if (franchises.length === 0) {
    console.log(`  no franchise data returned, skipping`);
    return;
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

  for (let week = startWeek; week <= endWeek; week++) {
    let weekly;
    try {
      weekly = await fetchWeeklyResults(year, leagueId, week);
    } catch (err) {
      console.log(`  week ${week}: fetch failed (${(err as Error).message})`);
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
  db.save();
}

async function main() {
  const { league, start, end } = parseArgs();
  console.log(`Importing league ${league}, seasons ${start}-${end}...`);
  const db = await getDb();

  const historyMap = await fetchLeagueHistory(end, league);
  console.log(`Resolved league IDs for ${Object.keys(historyMap).length} seasons from league history.`);

  for (let year = start; year <= end; year++) {
    const leagueIdForYear = historyMap[year];
    if (!leagueIdForYear) {
      console.log(`\n=== ${year} ===\n  no league ID on file for this year, skipping (add it manually if needed)`);
      continue;
    }
    try {
      await importSeason(db, year, leagueIdForYear);
    } catch (err) {
      console.error(`  FAILED: ${(err as Error).message}`);
    }
  }

  db.save();
  // Deliberately not calling db.close() here: this is a one-shot CLI script
  // that exits right after main() resolves, so there's nothing to clean up.
  // (Calling close() would also invalidate the shared getDb() cache for
  // anything else running in this same process.)
  console.log("\nDone. Saved to data/league.db");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
