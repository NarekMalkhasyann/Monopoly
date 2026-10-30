// SQLite database (node:sqlite, built into Node 22+ - no install needed).
// The same schema maps 1:1 to PostgreSQL for the deployed version.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file = process.env.DB_FILE || 'server/data/monopoly.db') {
	if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
	const db = new DatabaseSync(file);
	db.exec(`
		PRAGMA foreign_keys = ON;
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'player',
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS games (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			mode TEXT NOT NULL DEFAULT 'local',          -- local | online
			status TEXT NOT NULL DEFAULT 'active',       -- active | finished
			edition TEXT NOT NULL DEFAULT 'classic',
			winner_name TEXT,
			turn_count INTEGER NOT NULL DEFAULT 0,
			snapshot TEXT,                               -- JSON checkpoint taken at the start of a turn
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			finished_at TEXT
		);
		CREATE TABLE IF NOT EXISTS game_players (
			game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
			seat INTEGER NOT NULL,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			is_ai INTEGER NOT NULL DEFAULT 0,
			final_money INTEGER,
			final_rank INTEGER,
			PRIMARY KEY (game_id, seat)
		);
		CREATE TABLE IF NOT EXISTS game_actions (
			game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
			seq INTEGER NOT NULL,
			turn INTEGER NOT NULL DEFAULT 0,
			type TEXT NOT NULL,
			text TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (game_id, seq)
		);
		CREATE INDEX IF NOT EXISTS games_owner ON games(owner_id, updated_at DESC);
	`);
	return db;
}
