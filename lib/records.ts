import { getDb } from "./db";

export interface Season {
  season: number;
  league_name: string | null;
  num_teams: number;
  last_regular_season_week: number;
  end_week: number;
}

export async function getSeasons(): Promise<Season[]> {
  const db = await getDb();
  // Only list seasons that actually have at least one game — the import
  // script creates a `seasons` row as soon as MFL has franchise/draft data
  // for a year, which happens before the season kicks off (so a future,
  // not-yet-played season would otherwise show up here as an empty entry).
  return db
    .prepare(
      `SELECT season, league_name, num_teams, last_regular_season_week, end_week
       FROM seasons
       WHERE EXISTS (SELECT 1 FROM games WHERE games.season = seasons.season)
       ORDER BY season DESC`
    )
    .all() as Season[];
}

export interface StandingsRow {
  team_id: number;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
  win_pct: number;
}

/** Regular-season standings for one season, derived from game results. */
export async function getStandings(season: number): Promise<StandingsRow[]> {
  const db = await getDb();
  const rows = db
    .prepare(
      `SELECT tg.team_id AS team_id, t.base_name AS team_name,
              SUM(CASE WHEN tg.outcome = 'W' THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN tg.outcome = 'L' THEN 1 ELSE 0 END) AS losses,
              SUM(CASE WHEN tg.outcome = 'T' THEN 1 ELSE 0 END) AS ties,
              ROUND(SUM(tg.score), 2) AS points_for,
              ROUND(SUM(tg.opp_score), 2) AS points_against
       FROM team_games tg
       JOIN teams t ON t.id = tg.team_id
       WHERE tg.season = ? AND tg.game_type = 'regular'
       GROUP BY tg.team_id
       ORDER BY wins DESC, points_for DESC`
    )
    .all(season) as Omit<StandingsRow, "win_pct">[];

  return rows.map((r) => ({
    ...r,
    win_pct: r.wins + r.losses + r.ties > 0 ? (r.wins + r.ties * 0.5) / (r.wins + r.losses + r.ties) : 0,
  }));
}

export interface SingleGameRecordRow {
  value: number;
  team_name: string;
  season: number;
  week: number;
  opp_name: string;
  opp_score: number;
}

async function topGames(orderBy: string, limit: number, extraWhere = ""): Promise<SingleGameRecordRow[]> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT tg.score AS value, t.base_name AS team_name, tg.season AS season, tg.week AS week,
              o.base_name AS opp_name, tg.opp_score AS opp_score
       FROM team_games tg
       JOIN teams t ON t.id = tg.team_id
       JOIN teams o ON o.id = tg.opp_team_id
       WHERE 1=1 ${extraWhere}
       ORDER BY ${orderBy}
       LIMIT ?`
    )
    .all(limit) as SingleGameRecordRow[];
}

export interface SingleGameRecords {
  mostPoints: SingleGameRecordRow[];
  fewestPoints: SingleGameRecordRow[];
  fewestInWin: SingleGameRecordRow[];
  mostInLoss: SingleGameRecordRow[];
}

export async function getSingleGameRecords(limit = 15): Promise<SingleGameRecords> {
  const [mostPoints, fewestPoints, fewestInWin, mostInLoss] = await Promise.all([
    topGames("tg.score DESC", limit),
    topGames("tg.score ASC", limit),
    topGames("tg.score ASC", limit, "AND tg.outcome = 'W'"),
    topGames("tg.score DESC", limit, "AND tg.outcome = 'L'"),
  ]);
  return { mostPoints, fewestPoints, fewestInWin, mostInLoss };
}

export interface MatchupRecordRow {
  combined: number;
  team_a: string;
  score_a: number;
  team_b: string;
  score_b: number;
  season: number;
  week: number;
}

export async function getCombinedPointsRecords(
  limit = 15
): Promise<{ most: MatchupRecordRow[]; fewest: MatchupRecordRow[] }> {
  const base = `
    SELECT g.season AS season, g.week AS week,
           ht.base_name AS team_a, g.home_score AS score_a,
           at.base_name AS team_b, g.away_score AS score_b,
           ROUND(g.home_score + g.away_score, 2) AS combined
    FROM games g
    JOIN teams ht ON ht.id = g.home_team_id
    JOIN teams at ON at.id = g.away_team_id
  `;
  const db = await getDb();
  const most = db.prepare(`${base} ORDER BY combined DESC LIMIT ?`).all(limit) as MatchupRecordRow[];
  const fewest = db.prepare(`${base} ORDER BY combined ASC LIMIT ?`).all(limit) as MatchupRecordRow[];
  return { most, fewest };
}

export interface MarginRecordRow {
  margin: number;
  winner: string;
  winner_score: number;
  loser: string;
  loser_score: number;
  season: number;
  week: number;
}

export async function getMarginRecords(
  limit = 15
): Promise<{ biggest: MarginRecordRow[]; smallest: MarginRecordRow[] }> {
  const base = `
    SELECT g.season AS season, g.week AS week,
           CASE WHEN g.home_score > g.away_score THEN ht.base_name ELSE at.base_name END AS winner,
           CASE WHEN g.home_score > g.away_score THEN g.home_score ELSE g.away_score END AS winner_score,
           CASE WHEN g.home_score > g.away_score THEN at.base_name ELSE ht.base_name END AS loser,
           CASE WHEN g.home_score > g.away_score THEN g.away_score ELSE g.home_score END AS loser_score,
           ROUND(ABS(g.home_score - g.away_score), 2) AS margin
    FROM games g
    JOIN teams ht ON ht.id = g.home_team_id
    JOIN teams at ON at.id = g.away_team_id
    WHERE g.home_score <> g.away_score
  `;
  const db = await getDb();
  const biggest = db.prepare(`${base} ORDER BY margin DESC LIMIT ?`).all(limit) as MarginRecordRow[];
  const smallest = db.prepare(`${base} ORDER BY margin ASC LIMIT ?`).all(limit) as MarginRecordRow[];
  return { biggest, smallest };
}

export interface SeasonRecordRow {
  team_name: string;
  season: number;
  total_points: number;
  wins: number;
  losses: number;
  ties: number;
}

export async function getSingleSeasonRecords(
  limit = 15
): Promise<{ mostPoints: SeasonRecordRow[]; fewestPoints: SeasonRecordRow[] }> {
  const base = `
    SELECT t.base_name AS team_name, tg.season AS season,
           ROUND(SUM(tg.score), 2) AS total_points,
           SUM(CASE WHEN tg.outcome = 'W' THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN tg.outcome = 'L' THEN 1 ELSE 0 END) AS losses,
           SUM(CASE WHEN tg.outcome = 'T' THEN 1 ELSE 0 END) AS ties
    FROM team_games tg
    JOIN teams t ON t.id = tg.team_id
    WHERE tg.game_type = 'regular'
    GROUP BY tg.team_id, tg.season
  `;
  const db = await getDb();
  const mostPoints = db.prepare(`${base} ORDER BY total_points DESC LIMIT ?`).all(limit) as SeasonRecordRow[];
  const fewestPoints = db.prepare(`${base} ORDER BY total_points ASC LIMIT ?`).all(limit) as SeasonRecordRow[];
  return { mostPoints, fewestPoints };
}

export interface CareerRecordRow {
  team_id: number;
  team_name: string;
  seasons_played: number;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  points_for: number;
  points_against: number;
  championships: number;
}

export async function getCareerRecords(): Promise<CareerRecordRow[]> {
  const db = await getDb();
  const rows = db
    .prepare(
      `SELECT tg.team_id AS team_id, t.base_name AS team_name,
              COUNT(DISTINCT tg.season) AS seasons_played,
              SUM(CASE WHEN tg.outcome = 'W' THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN tg.outcome = 'L' THEN 1 ELSE 0 END) AS losses,
              SUM(CASE WHEN tg.outcome = 'T' THEN 1 ELSE 0 END) AS ties,
              ROUND(SUM(tg.score), 2) AS points_for,
              ROUND(SUM(tg.opp_score), 2) AS points_against
       FROM team_games tg
       JOIN teams t ON t.id = tg.team_id
       WHERE tg.game_type = 'regular'
       GROUP BY tg.team_id`
    )
    .all() as Omit<CareerRecordRow, "win_pct" | "championships">[];

  const champCounts = db
    .prepare(
      `SELECT league_champ_team_id AS team_id, COUNT(*) AS n
       FROM champions WHERE league_champ_team_id IS NOT NULL GROUP BY league_champ_team_id`
    )
    .all() as { team_id: number; n: number }[];
  const champMap = new Map(champCounts.map((c) => [c.team_id, c.n]));

  return rows
    .map((r) => ({
      ...r,
      win_pct: r.wins + r.losses + r.ties > 0 ? (r.wins + r.ties * 0.5) / (r.wins + r.losses + r.ties) : 0,
      championships: champMap.get(r.team_id) ?? 0,
    }))
    .sort((a, b) => b.win_pct - a.win_pct);
}

export interface TeamSummary {
  id: number;
  base_name: string;
  seasons_played: number;
}

export async function getTeams(): Promise<TeamSummary[]> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT t.id AS id, t.base_name AS base_name, COUNT(DISTINCT ts.season) AS seasons_played
       FROM teams t
       LEFT JOIN team_seasons ts ON ts.team_id = t.id
       GROUP BY t.id
       ORDER BY t.base_name COLLATE NOCASE`
    )
    .all() as TeamSummary[];
}

export interface TeamGameLogRow {
  season: number;
  week: number;
  game_type: string;
  score: number;
  opp_name: string;
  opp_score: number;
  outcome: string;
}

export interface TeamSeasonRow {
  season: number;
  team_name: string;
  conference: string | null;
  division: string | null;
}

export async function getTeam(teamId: number) {
  const db = await getDb();
  const team = db.prepare(`SELECT id, base_name FROM teams WHERE id = ?`).get(teamId) as
    | { id: number; base_name: string }
    | undefined;
  if (!team) return null;

  const seasons = db
    .prepare(
      `SELECT season, team_name, conference, division FROM team_seasons WHERE team_id = ? ORDER BY season`
    )
    .all(teamId) as TeamSeasonRow[];

  const gameLog = db
    .prepare(
      `SELECT tg.season AS season, tg.week AS week, tg.game_type AS game_type, tg.score AS score,
              o.base_name AS opp_name, tg.opp_score AS opp_score, tg.outcome AS outcome
       FROM team_games tg
       JOIN teams o ON o.id = tg.opp_team_id
       WHERE tg.team_id = ?
       ORDER BY tg.season DESC, tg.week DESC`
    )
    .all(teamId) as TeamGameLogRow[];

  return { team, seasons, gameLog };
}

export interface ChampionRow {
  season: number;
  champ_name: string | null;
  runner_up_name: string | null;
  toilet_champ_name: string | null;
}

export async function getChampions(): Promise<ChampionRow[]> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT s.season AS season, ct.base_name AS champ_name, rt.base_name AS runner_up_name, tt.base_name AS toilet_champ_name
       FROM seasons s
       LEFT JOIN champions c ON c.season = s.season
       LEFT JOIN teams ct ON ct.id = c.league_champ_team_id
       LEFT JOIN teams rt ON rt.id = c.runner_up_team_id
       LEFT JOIN teams tt ON tt.id = c.toilet_champ_team_id
       ORDER BY s.season DESC`
    )
    .all() as ChampionRow[];
}

// ---------------------------------------------------------------------------
// Game Center — a week's games plus the head-to-head history between the two
// teams in each one, entirely derived from the `games` table already
// imported (no extra MFL data needed beyond what's fetched today).

export interface GameCenterWeekKey {
  season: number;
  week: number;
}

/** Every (season, week) that has at least one game — drives static params
 * for /gamecenter/[season]/[week]. */
export async function getGameCenterWeeks(): Promise<GameCenterWeekKey[]> {
  const db = await getDb();
  return db
    .prepare(`SELECT DISTINCT season, week FROM games ORDER BY season DESC, week DESC`)
    .all() as GameCenterWeekKey[];
}

/** Seasons that have game data, each with how many weeks were played — used
 * to build the season/week picker on the Game Center pages. */
export async function getGameCenterSeasons(): Promise<{ season: number; weeks: number[] }[]> {
  const weeks = await getGameCenterWeeks();
  const bySeason = new Map<number, number[]>();
  for (const { season, week } of weeks) {
    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season)!.push(week);
  }
  return Array.from(bySeason.entries())
    .map(([season, ws]) => ({ season, weeks: ws.sort((a, b) => a - b) }))
    .sort((a, b) => b.season - a.season);
}

export interface GameCenterGame {
  id: number;
  game_type: string;
  team_a_id: number;
  team_a_name: string;
  score_a: number;
  team_b_id: number;
  team_b_name: string;
  score_b: number;
}

export async function getWeekGames(season: number, week: number): Promise<GameCenterGame[]> {
  const db = await getDb();
  return db
    .prepare(
      `SELECT g.id AS id, g.game_type AS game_type,
              g.home_team_id AS team_a_id, ht.base_name AS team_a_name, g.home_score AS score_a,
              g.away_team_id AS team_b_id, at.base_name AS team_b_name, g.away_score AS score_b
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       WHERE g.season = ? AND g.week = ?
       ORDER BY g.game_type, g.id`
    )
    .all(season, week) as GameCenterGame[];
}

export interface HeadToHeadMeeting {
  season: number;
  week: number;
  game_type: string;
  team_a_name: string;
  score_a: number;
  team_b_name: string;
  score_b: number;
}

export interface HeadToHeadSeries {
  wins_a: number;
  wins_b: number;
  ties: number;
  points_a: number;
  points_b: number;
}

export interface HeadToHead {
  overall: HeadToHeadSeries;
  regular: HeadToHeadSeries;
  postseason: HeadToHeadSeries;
  meetings: HeadToHeadMeeting[];
}

function emptySeries(): HeadToHeadSeries {
  return { wins_a: 0, wins_b: 0, ties: 0, points_a: 0, points_b: 0 };
}

/** All-time head-to-head between two teams — overall, regular-season-only,
 * and postseason-only series records, plus the full list of meetings, oldest
 * first. `teamAId` is just a reference point for which side "a"/"b" means in
 * the returned series objects — it doesn't need to be the home team. */
export async function getHeadToHead(teamAId: number, teamBId: number): Promise<HeadToHead> {
  const db = await getDb();
  const rows = db
    .prepare(
      `SELECT g.season AS season, g.week AS week, g.game_type AS game_type,
              g.home_team_id AS home_team_id, ht.base_name AS home_name, g.home_score AS home_score,
              g.away_team_id AS away_team_id, at.base_name AS away_name, g.away_score AS away_score
       FROM games g
       JOIN teams ht ON ht.id = g.home_team_id
       JOIN teams at ON at.id = g.away_team_id
       WHERE (g.home_team_id = ? AND g.away_team_id = ?) OR (g.home_team_id = ? AND g.away_team_id = ?)
       ORDER BY g.season, g.week`
    )
    .all(teamAId, teamBId, teamBId, teamAId) as {
    season: number;
    week: number;
    game_type: string;
    home_team_id: number;
    home_name: string;
    home_score: number;
    away_team_id: number;
    away_name: string;
    away_score: number;
  }[];

  const overall = emptySeries();
  const regular = emptySeries();
  const postseason = emptySeries();
  const meetings: HeadToHeadMeeting[] = [];

  for (const r of rows) {
    const aIsHome = r.home_team_id === teamAId;
    const scoreA = aIsHome ? r.home_score : r.away_score;
    const scoreB = aIsHome ? r.away_score : r.home_score;
    const bucket = r.game_type === "regular" ? regular : postseason;
    for (const series of [overall, bucket]) {
      series.points_a += scoreA;
      series.points_b += scoreB;
      if (scoreA > scoreB) series.wins_a++;
      else if (scoreB > scoreA) series.wins_b++;
      else series.ties++;
    }
    meetings.push({
      season: r.season,
      week: r.week,
      game_type: r.game_type,
      team_a_name: aIsHome ? r.home_name : r.away_name,
      score_a: scoreA,
      team_b_name: aIsHome ? r.away_name : r.home_name,
      score_b: scoreB,
    });
  }

  return { overall, regular, postseason, meetings };
}
