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
  return db
    .prepare(
      `SELECT season, league_name, num_teams, last_regular_season_week, end_week
       FROM seasons ORDER BY season DESC`
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
