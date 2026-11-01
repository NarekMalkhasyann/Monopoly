// Database access for the server, one small async interface over two engines:
//
//   * no DATABASE_URL  -> SQLite file (node:sqlite, built into Node 22+). Used for development and tests.
//   * DATABASE_URL set -> PostgreSQL (Neon, Supabase, Render...) through the "pg" package.
//
// All SQL in server/*.js is written once, in the part both engines understand:
//   - "?" placeholders (turned into $1, $2... for PostgreSQL),
//   - timestamps are TEXT written by the server (see now()), never database functions,
//   - inserts that need the new id use db.insert().
//
//   db.get(sql, params)   -> first row or undefined
//   db.all(sql, params)   -> array of rows
//   db.run(sql, params)   -> number of changed rows
//   db.insert(sql, params)-> id of the new row
//   db.tx(async (t) => {...}) -> t has get/all/run/insert; commits when the function returns, rolls back if it throws
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** 'YYYY-MM-DD HH:MM:SS' in UTC, same shape SQLite's datetime('now') gave. */
export const now = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

const tables = (pg) => {
	const id = pg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
	const big = pg ? 'BIGINT' : 'INTEGER'; // the online seed is an unsigned 32-bit number
	return [
		`CREATE TABLE IF NOT EXISTS users (
			id ${id},
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'player',
			created_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS games (
			id ${id},
			owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			mode TEXT NOT NULL DEFAULT 'local',          -- local | online
			status TEXT NOT NULL DEFAULT 'active',       -- waiting (online lobby) | active | finished | abandoned
			edition TEXT NOT NULL DEFAULT 'classic',
			winner_name TEXT,
			turn_count INTEGER NOT NULL DEFAULT 0,
			snapshot TEXT,                               -- JSON checkpoint taken at the start of a turn (local games)
			room_code TEXT,                              -- online games: 5-letter join code
			seed ${big},                                 -- online games: seed of the shared random numbers
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			finished_at TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS game_players (
			game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
			seat INTEGER NOT NULL,
			name TEXT NOT NULL,
			color TEXT NOT NULL,
			is_ai INTEGER NOT NULL DEFAULT 0,
			user_id INTEGER,                             -- online games: the account that sits here
			final_money INTEGER,
			final_rank INTEGER,
			PRIMARY KEY (game_id, seat)
		)`,
		`CREATE TABLE IF NOT EXISTS game_actions (
			game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
			seq INTEGER NOT NULL,
			turn INTEGER NOT NULL DEFAULT 0,
			type TEXT NOT NULL,                          -- click (shared button press) | alert / event (readable log line)
			text TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (game_id, seq)
		)`,
		'CREATE INDEX IF NOT EXISTS games_owner ON games(owner_id, updated_at DESC)',
		'CREATE UNIQUE INDEX IF NOT EXISTS games_room_code ON games(room_code) WHERE room_code IS NOT NULL',
		'CREATE INDEX IF NOT EXISTS players_user ON game_players(user_id)',
	];
};

// ---- SQLite -----------------------------------------------------------------
async function openSqlite(file) {
	const { DatabaseSync } = await import('node:sqlite');
	if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
	const raw = new DatabaseSync(file);
	raw.exec('PRAGMA foreign_keys = ON');

	// Files made by Milestones 1-3 stored timestamps with DEFAULT datetime('now'); the columns are the same.
	const fresh = !raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'games'").get();
	if (fresh) for (const sql of tables(false)) raw.exec(sql);
	else {
		const has = (table, col) => raw.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
		if (!has('games', 'room_code')) raw.exec('ALTER TABLE games ADD COLUMN room_code TEXT');
		if (!has('games', 'seed')) raw.exec('ALTER TABLE games ADD COLUMN seed INTEGER');
		if (!has('game_players', 'user_id')) raw.exec('ALTER TABLE game_players ADD COLUMN user_id INTEGER');
		raw.exec(`CREATE UNIQUE INDEX IF NOT EXISTS games_room_code ON games(room_code) WHERE room_code IS NOT NULL;
			CREATE INDEX IF NOT EXISTS players_user ON game_players(user_id);`);
	}

	// node:sqlite is synchronous, so a transaction cannot be interleaved with another request
	// as long as it only awaits these functions (they resolve in the same tick).
	const api = {
		dialect: 'sqlite',
		get: async (sql, p = []) => raw.prepare(sql).get(...p),
		all: async (sql, p = []) => raw.prepare(sql).all(...p),
		run: async (sql, p = []) => Number(raw.prepare(sql).run(...p).changes),
		insert: async (sql, p = []) => Number(raw.prepare(sql).run(...p).lastInsertRowid),
		async tx(fn) {
			raw.exec('BEGIN');
			try { const r = await fn(api); raw.exec('COMMIT'); return r; }
			catch (e) { raw.exec('ROLLBACK'); throw e; }
		},
		close: async () => raw.close(),
	};
	return api;
}

// ---- PostgreSQL ---------------------------------------------------------------
const toPg = (sql) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };

async function openPostgres(url) {
	let pg;
	try { pg = (await import('pg')).default; }
	catch { throw new Error('DATABASE_URL is set but the "pg" package is not installed (run npm install)'); }
	pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT (seed, counts) -> number
	const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX) || 5 });

	const on = (client) => ({
		get: async (sql, p = []) => (await client.query(toPg(sql), p)).rows[0],
		all: async (sql, p = []) => (await client.query(toPg(sql), p)).rows,
		run: async (sql, p = []) => (await client.query(toPg(sql), p)).rowCount,
		insert: async (sql, p = []) => (await client.query(`${toPg(sql)} RETURNING id`, p)).rows[0].id,
	});
	const api = {
		dialect: 'pg',
		...on(pool),
		async tx(fn) {
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				const r = await fn(on(client));
				await client.query('COMMIT');
				return r;
			} catch (e) {
				await client.query('ROLLBACK').catch(() => {});
				throw e;
			} finally { client.release(); }
		},
		close: () => pool.end(),
	};

	for (const sql of tables(true)) await pool.query(sql);
	return api;
}

/** Opens the database: PostgreSQL when DATABASE_URL is set (or url is given), otherwise a SQLite file. */
export async function openDb(target = process.env.DATABASE_URL || process.env.DB_FILE || 'server/data/monopoly.db') {
	return /^postgres(ql)?:\/\//.test(target) ? openPostgres(target) : openSqlite(target);
}
