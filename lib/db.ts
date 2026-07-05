import path from "node:path";
import fs from "node:fs";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

// Uses sql.js (SQLite compiled to WebAssembly) instead of a native module
// (better-sqlite3) or Node's built-in node:sqlite. Both alternatives depend
// on things that aren't guaranteed on shared/cPanel hosting: native modules
// need a matching prebuilt binary (or a working compiler toolchain), and
// node:sqlite needs Node 22.5+. WASM has neither requirement — it runs on
// any Node version shared hosts are likely to offer.
//
// Trade-off: sql.js keeps the whole database in memory and only touches
// disk when you explicitly save it. That's a non-issue for a personal
// league history site (the whole DB is a few MB), but it means writes
// must call `saveDb()` when they're done — reads never need to.

const DB_PATH = path.join(process.cwd(), "data", "league.db");

export interface StatementResult {
  lastInsertRowid: number;
  changes: number;
}

/** Thin wrapper giving sql.js's Statement API the same shape used
 * throughout this project (prepare().all()/.get()/.run()). */
class Stmt {
  constructor(private raw: SqlJsDatabase, private sql: string) {}

  all<T = Record<string, unknown>>(...params: unknown[]): T[] {
    const stmt = this.raw.prepare(this.sql);
    try {
      stmt.bind(params as never);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Record<string, unknown>>(...params: unknown[]): T | undefined {
    const stmt = this.raw.prepare(this.sql);
    try {
      stmt.bind(params as never);
      return stmt.step() ? (stmt.getAsObject() as T) : undefined;
    } finally {
      stmt.free();
    }
  }

  run(...params: unknown[]): StatementResult {
    this.raw.run(this.sql, params as never);
    const info = this.raw.exec("SELECT last_insert_rowid() AS id, changes() AS changes");
    const row = info[0]?.values[0];
    return { lastInsertRowid: Number(row?.[0] ?? 0), changes: Number(row?.[1] ?? 0) };
  }
}

export class Db {
  constructor(private raw: SqlJsDatabase) {}

  exec(sql: string) {
    this.raw.exec(sql);
  }

  prepare(sql: string) {
    return new Stmt(this.raw, sql);
  }

  /** Writes the in-memory database out to data/league.db. Call this after
   * any batch of writes (the import script does this per season). */
  save() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(this.raw.export()));
  }

  close() {
    this.raw.close();
  }
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = init();
  return dbPromise;
}

async function init(): Promise<Db> {
  const SQL = await initSqlJs();
  const buffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const raw = new SQL.Database(buffer);
  const db = new Db(raw);
  initSchema(db);
  return db;
}

function initSchema(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_name TEXT NOT NULL UNIQUE,
      current_franchise_id TEXT
    );

    CREATE TABLE IF NOT EXISTS seasons (
      season INTEGER PRIMARY KEY,
      mfl_league_id TEXT NOT NULL,
      league_name TEXT,
      start_week INTEGER,
      reg_season_weeks INTEGER,
      last_regular_season_week INTEGER,
      end_week INTEGER,
      num_conferences INTEGER,
      num_divisions INTEGER,
      num_teams INTEGER
    );

    CREATE TABLE IF NOT EXISTS team_seasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      season INTEGER NOT NULL REFERENCES seasons(season),
      franchise_id TEXT NOT NULL,
      team_name TEXT NOT NULL,
      conference TEXT,
      division TEXT,
      UNIQUE(season, franchise_id)
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL REFERENCES seasons(season),
      week INTEGER NOT NULL,
      home_team_id INTEGER NOT NULL REFERENCES teams(id),
      away_team_id INTEGER NOT NULL REFERENCES teams(id),
      home_score REAL NOT NULL,
      away_score REAL NOT NULL,
      game_type TEXT NOT NULL DEFAULT 'regular',
      UNIQUE(season, week, home_team_id, away_team_id)
    );

    CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
    CREATE INDEX IF NOT EXISTS idx_games_teams ON games(home_team_id, away_team_id);

    CREATE TABLE IF NOT EXISTS champions (
      season INTEGER PRIMARY KEY REFERENCES seasons(season),
      league_champ_team_id INTEGER REFERENCES teams(id),
      runner_up_team_id INTEGER REFERENCES teams(id),
      toilet_champ_team_id INTEGER REFERENCES teams(id),
      notes TEXT
    );

    -- Unpivots games (home/away) into one row per team per game, so record
    -- queries don't need to UNION home and away perspectives by hand.
    CREATE VIEW IF NOT EXISTS team_games AS
      SELECT season, week, game_type,
             home_team_id AS team_id, home_score AS score,
             away_team_id AS opp_team_id, away_score AS opp_score,
             CASE WHEN home_score > away_score THEN 'W'
                  WHEN home_score < away_score THEN 'L'
                  ELSE 'T' END AS outcome
      FROM games
      UNION ALL
      SELECT season, week, game_type,
             away_team_id AS team_id, away_score AS score,
             home_team_id AS opp_team_id, home_score AS opp_score,
             CASE WHEN away_score > home_score THEN 'W'
                  WHEN away_score < home_score THEN 'L'
                  ELSE 'T' END AS outcome
      FROM games;
  `);
}
