import "server-only";
import fs from "node:fs";
import path from "node:path";

// node:sqlite wird über getBuiltinModule geladen, damit der Bundler es nicht auflösen muss.
type SqliteModule = typeof import("node:sqlite");
type Database = import("node:sqlite").DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  norm_title TEXT NOT NULL,
  igdb_id INTEGER UNIQUE,
  cover_url TEXT,
  rating REAL,
  rating_count INTEGER,
  genres TEXT,
  modes TEXT,
  ttb_hastily INTEGER,
  ttb_normally INTEGER,
  ttb_completely INTEGER,
  release_year INTEGER,
  summary TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  enrich_state TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS games_norm_title ON games(norm_title);

CREATE TABLE IF NOT EXISTS ownerships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  playtime_min INTEGER NOT NULL DEFAULT 0,
  last_played TEXT,
  cover_url TEXT,
  source TEXT NOT NULL DEFAULT 'sync',
  UNIQUE(platform, external_id)
);
CREATE INDEX IF NOT EXISTS ownerships_game ON ownerships(game_id);
`;

const globalForDb = globalThis as unknown as { __nextquestDb?: Database };

function open(): Database {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as SqliteModule;
  const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "nextquest.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Additive Migration: vorhandene Spiele, Zuordnungen und Einstellungen bleiben erhalten.
  const columns = new Set((db.prepare("PRAGMA table_info(games)").all() as { name: string }[]).map((c) => c.name));
  for (const column of ["keywords", "session_pref"]) {
    if (!columns.has(column)) db.exec(`ALTER TABLE games ADD COLUMN ${column} TEXT`);
  }
  return db;
}

export function db(): Database {
  if (!globalForDb.__nextquestDb) globalForDb.__nextquestDb = open();
  return globalForDb.__nextquestDb;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
