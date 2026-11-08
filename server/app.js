// HTTP API. Plain node:http, no framework.
import { cleanLog } from './log.js';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';
import { acceptUpgrade, startHeartbeat } from './ws.js';
import { createRooms } from './rooms.js';
import { now } from './db.js';

const MIME = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
	'.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
	'.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
};

class HttpError extends Error {
	constructor(status, message) { super(message); this.status = status; }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 1024 * 1024; // checkpoints are a few KB; 1 MB is generous

function readJson(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on('data', (c) => {
			size += c.length;
			if (size > MAX_BODY) { reject(new HttpError(413, 'Body too large')); req.destroy(); return; }
			chunks.push(c);
		});
		req.on('end', () => {
			if (!chunks.length) return resolve({});
			try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
			catch { reject(new HttpError(400, 'Invalid JSON')); }
		});
		req.on('error', reject);
	});
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Who is an administrator: ADMIN_EMAILS (comma separated) is applied at start-up, at sign-up and at every login,
// and an admin can make other people admins in the panel. Everybody else is a 'player'.
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const ROLES = ['player', 'admin'];

export function createApp(db, { secret, staticDir } = {}) {
	if (!secret) throw new Error('JWT secret is required');
	const rooms = createRooms(db);

	// SQL here is portable between SQLite and PostgreSQL (see db.js).
	const q = {
		userByEmail: (email) => db.get('SELECT * FROM users WHERE email = ?', [email]),
		userById: (id) => db.get('SELECT * FROM users WHERE id = ?', [id]),
		game: (id, userId) => db.get('SELECT * FROM games WHERE id = ? AND owner_id = ?', [id, userId]),
		// a game is visible to its owner and to every player of an online game
		visibleGame: (id, userId) => db.get('SELECT * FROM games WHERE id = ? AND (owner_id = ? OR id IN (SELECT game_id FROM game_players WHERE user_id = ?))', [id, userId, userId]),
		mySeat: (gameId, userId) => db.get('SELECT seat FROM game_players WHERE game_id = ? AND user_id = ?', [gameId, userId]),
		players: (gameId) => db.all('SELECT seat, name, color, is_ai, final_money, final_rank FROM game_players WHERE game_id = ? ORDER BY seat', [gameId]),
		actions: (gameId) => db.all("SELECT seq, turn, type, text, created_at FROM game_actions WHERE game_id = ? AND type != 'click' ORDER BY seq", [gameId]),
	};

	const authUser = async (req) => {
		const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
		const payload = m && verifyToken(m[1], secret);
		const user = payload && await q.userById(payload.sub);
		if (!user) throw new HttpError(401, 'Please log in');
		return user;
	};

	const requireAdmin = async (req) => {
		const user = await authUser(req);
		if (user.role !== 'admin') throw new HttpError(403, 'Administrators only');
		return user;
	};
	async function promoteConfigured() {
		for (const email of adminEmails()) await db.run("UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'", [email]);
	}
	promoteConfigured().catch((e) => console.error('ADMIN_EMAILS failed:', e.message));

	const gameSummary = async (g) => ({
		id: g.id, mode: g.mode, status: g.status, edition: g.edition, room_code: g.room_code, owner_id: g.owner_id,
		winner_name: g.winner_name, turn_count: g.turn_count,
		created_at: g.created_at, updated_at: g.updated_at, finished_at: g.finished_at,
		players: (await q.players(g.id)).map((p) => ({ ...p, is_ai: !!p.is_ai })),
	});

	const ownedGame = async (user, id) => {
		const g = await q.game(Number(id), user.id);
		if (!g) throw new HttpError(404, 'Game not found');
		return g;
	};

	const appendEvents = async (t, gameId, events) => {
		let seq = (await t.get('SELECT COALESCE(MAX(seq), 0) AS n FROM game_actions WHERE game_id = ?', [gameId])).n;
		for (const e of events.slice(0, 500)) {
			await t.run('INSERT INTO game_actions (game_id, seq, turn, type, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
				[gameId, ++seq, Number(e.turn) || 0, String(e.type || 'event').slice(0, 30), String(e.text || '').slice(0, 500), now()]);
		}
	};

	// History list: filters (status, mode, text, dates) and sorting, all optional.
	const SORTS = { updated: 'g.updated_at', created: 'g.created_at', turns: 'g.turn_count' };
	async function listGames(user, params, { all = false } = {}) {
		const status = params.get('status');
		const mode = params.get('mode');
		const text = String(params.get('q') || '').trim().toLowerCase().slice(0, 40);
		const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from') : '';
		const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '') ? params.get('to') : '';
		const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100);
		const offset = Math.max(Number(params.get('offset')) || 0, 0);
		const sort = SORTS[params.get('sort')] || SORTS.updated;
		const dir = params.get('dir') === 'asc' ? 'ASC' : 'DESC';

		const where = ["g.status != 'waiting'"];
		const args = [];
		// everybody sees their own games; an admin (all = true) sees every game, optionally those of one user
		const only = all ? Number(params.get('user')) || 0 : user.id;
		// (a player who is not the host can hide a game from their own history; the admin still sees it)
		if (only) { where.push(`(g.owner_id = ? OR g.id IN (SELECT game_id FROM game_players WHERE user_id = ?${all ? '' : ' AND hidden = 0'}))`); args.push(only, only); }
		if (['active', 'finished', 'abandoned'].includes(status)) { where.push('g.status = ?'); args.push(status); }
		if (mode === 'local' || mode === 'online') { where.push('g.mode = ?'); args.push(mode); }
		if (text) {
			const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			where.push(`(LOWER(COALESCE(g.winner_name, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(g.room_code, '')) LIKE ? ESCAPE '\\'
				OR g.id IN (SELECT game_id FROM game_players WHERE LOWER(name) LIKE ? ESCAPE '\\')
				${all ? "OR g.owner_id IN (SELECT id FROM users WHERE LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(email) LIKE ? ESCAPE '\\')" : ''})`);
			args.push(like, like, like);
			if (all) args.push(like, like);
		}
		if (from) { where.push('g.created_at >= ?'); args.push(`${from} 00:00:00`); }
		if (to) { where.push('g.created_at <= ?'); args.push(`${to} 23:59:59`); }

		// "Advanced" filters of the History page (all optional, all combine with the ones above)
		const likeOf2 = (t) => `%${t.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
		const word = (k) => String(params.get(k) || '').trim().slice(0, 30);
		const whole = (k, lo, hi) => { const v = params.get(k); if (v === null || v.trim() === '') return null; const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : null; };
		const player = word('player'), winner = word('winner'), roomCode = word('room');
		if (player) { where.push("g.id IN (SELECT game_id FROM game_players WHERE LOWER(name) LIKE ? ESCAPE '\\')"); args.push(likeOf2(player)); }
		if (winner) { where.push("LOWER(COALESCE(g.winner_name, '')) LIKE ? ESCAPE '\\'"); args.push(likeOf2(winner)); }
		if (roomCode) { where.push("LOWER(COALESCE(g.room_code, '')) LIKE ? ESCAPE '\\'"); args.push(likeOf2(roomCode)); }
		const minTurns = whole('minTurns', 0, 100000), maxTurns = whole('maxTurns', 0, 100000);
		if (minTurns !== null) { where.push('g.turn_count >= ?'); args.push(minTurns); }
		if (maxTurns !== null) { where.push('g.turn_count <= ?'); args.push(maxTurns); }
		const size = whole('size', 1, 8);
		if (size !== null) { where.push('(SELECT COUNT(*) FROM game_players p WHERE p.game_id = g.id) = ?'); args.push(size); }
		const ai = params.get('ai');
		if (ai === 'yes') where.push('EXISTS (SELECT 1 FROM game_players p WHERE p.game_id = g.id AND p.is_ai = 1)');
		if (ai === 'no') where.push('NOT EXISTS (SELECT 1 FROM game_players p WHERE p.game_id = g.id AND p.is_ai = 1)');
		// my result in online games (the account sits at a seat); for the admin list it is the user picked in "user"
		const result = params.get('result');
		if (only && (result === 'won' || result === 'lost')) {
			if (result === 'won') where.push('EXISTS (SELECT 1 FROM game_players p WHERE p.game_id = g.id AND p.user_id = ? AND p.final_rank = 1)');
			else where.push("g.status = 'finished' AND EXISTS (SELECT 1 FROM game_players p WHERE p.game_id = g.id AND p.user_id = ? AND (p.final_rank IS NULL OR p.final_rank > 1))");
			args.push(only);
		}

		const rows = await db.all(`SELECT g.* FROM games g WHERE ${where.join(' AND ')} ORDER BY ${sort} ${dir}, g.id ${dir} LIMIT ? OFFSET ?`, [...args, limit, offset]);
		const total = (await db.get(`SELECT COUNT(*) AS n FROM games g WHERE ${where.join(' AND ')}`, args)).n;
		const games = await Promise.all(rows.map(gameSummary));
		if (all) await addOwners(games);
		else for (const g of games) g.is_host = g.owner_id === user.id; // the host deletes for everybody, the others only hide
		return { total, games };
	}

	// For the admin lists: who created each game.
	async function addOwners(games) {
		const ids = [...new Set(games.map((g) => g.owner_id))];
		if (!ids.length) return games;
		const users = await db.all(`SELECT id, name, email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
		const byId = new Map(users.map((u) => [u.id, u]));
		for (const g of games) g.owner = byId.get(g.owner_id) || null;
		return games;
	}

	// ---- admin ----------------------------------------------------------------
	const day = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
	async function adminStats() {
		const n = async (sql, p = []) => (await db.get(sql, p)).n;
		const since = now(Date.now() - 14 * 864e5);
		const perDay = async (table) => {
			const rows = await db.all(`SELECT SUBSTR(created_at, 1, 10) AS d, COUNT(*) AS n FROM ${table} WHERE created_at >= ?${table === 'games' ? " AND status != 'waiting'" : ''} GROUP BY SUBSTR(created_at, 1, 10)`, [since]);
			const m = new Map(rows.map((r) => [r.d, r.n]));
			return Array.from({ length: 14 }, (_, i) => ({ day: day(13 - i), n: m.get(day(13 - i)) || 0 }));
		};
		const byStatus = Object.fromEntries((await db.all("SELECT status, COUNT(*) AS n FROM games WHERE status != 'waiting' GROUP BY status")).map((r) => [r.status, r.n]));
		const byMode = Object.fromEntries((await db.all("SELECT mode, COUNT(*) AS n FROM games WHERE status != 'waiting' GROUP BY mode")).map((r) => [r.mode, r.n]));
		return {
			users: { total: await n('SELECT COUNT(*) AS n FROM users'), admins: await n("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'"), new7: await n('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', [now(Date.now() - 7 * 864e5)]) },
			games: { total: await n("SELECT COUNT(*) AS n FROM games WHERE status != 'waiting'"), active: byStatus.active || 0, finished: byStatus.finished || 0, abandoned: byStatus.abandoned || 0, local: byMode.local || 0, online: byMode.online || 0, turns: await n("SELECT COALESCE(SUM(turn_count), 0) AS n FROM games WHERE status != 'waiting'"), waitingRooms: await n("SELECT COUNT(*) AS n FROM games WHERE status = 'waiting'") },
			connected: rooms.connections().length,
			gamesPerDay: await perDay('games'),
			signupsPerDay: await perDay('users'),
		};
	}

	const USER_SORTS = { created: 'u.created_at', name: 'LOWER(u.name)', games: 'games', active: 'last_active' };
	const likeOf = (t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
	const userRow = (u) => ({ ...u, last_active: u.last_active || null });
	const USER_COLS = `u.id, u.name, u.email, u.role, u.created_at,
		(SELECT COUNT(*) FROM games g WHERE g.status != 'waiting' AND (g.owner_id = u.id OR g.id IN (SELECT game_id FROM game_players WHERE user_id = u.id))) AS games,
		(SELECT COUNT(*) FROM game_players p WHERE p.user_id = u.id AND p.final_rank = 1) AS wins,
		COALESCE((SELECT MAX(g.updated_at) FROM games g WHERE g.owner_id = u.id OR g.id IN (SELECT game_id FROM game_players WHERE user_id = u.id)), '') AS last_active`;
	async function listUsers(params) {
		const text = String(params.get('q') || '').trim().toLowerCase().slice(0, 40);
		const role = params.get('role');
		const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100);
		const offset = Math.max(Number(params.get('offset')) || 0, 0);
		const sort = USER_SORTS[params.get('sort')] || USER_SORTS.created;
		const dir = params.get('dir') === 'asc' ? 'ASC' : 'DESC';
		const where = ['1 = 1'], args = [];
		if (ROLES.includes(role)) { where.push('u.role = ?'); args.push(role); }
		if (text) { where.push("(LOWER(u.name) LIKE ? ESCAPE '\\' OR LOWER(u.email) LIKE ? ESCAPE '\\')"); args.push(likeOf(text), likeOf(text)); }
		const total = (await db.get(`SELECT COUNT(*) AS n FROM users u WHERE ${where.join(' AND ')}`, args)).n;
		const rows = await db.all(`SELECT ${USER_COLS} FROM users u WHERE ${where.join(' AND ')} ORDER BY ${sort} ${dir}, u.id ${dir} LIMIT ? OFFSET ?`, [...args, limit, offset]);
		return { total, users: rows.map(userRow) };
	}
	const busyOnline = (id) => db.get("SELECT COUNT(*) AS n FROM games g WHERE g.mode = 'online' AND g.status IN ('waiting', 'active') AND (g.owner_id = ? OR g.id IN (SELECT game_id FROM game_players WHERE user_id = ?))", [id, id]);

	async function adminRoute(req, method, path, url) {
		let m;
		const admin = await requireAdmin(req);
		if (method === 'GET' && path === '/api/admin/stats') return [200, await adminStats()];
		if (method === 'GET' && path === '/api/admin/users') return [200, await listUsers(url.searchParams)];
		if ((m = /^\/api\/admin\/users\/(\d+)$/.exec(path))) {
			const id = Number(m[1]);
			const u = await db.get(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`, [id]);
			if (!u) throw new HttpError(404, 'User not found');
			if (method === 'GET') return [200, { user: userRow(u) }];
			if (id === admin.id) throw new HttpError(409, 'You cannot change or delete your own account here');
			if (method === 'PUT') {
				const b = await readJson(req);
				if (!ROLES.includes(b.role)) throw new HttpError(400, 'Role must be player or admin');
				await db.run('UPDATE users SET role = ? WHERE id = ?', [b.role, id]);
				return [200, { user: userRow(await db.get(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`, [id])) }];
			}
			if (method === 'DELETE') {
				if ((await busyOnline(id)).n > 0) throw new HttpError(409, 'This user is in an online room or game. End or abandon it first.');
				await db.tx(async (t) => {
					await t.run('UPDATE game_players SET user_id = NULL WHERE user_id = ?', [id]); // keep other people's history
					await t.run('DELETE FROM users WHERE id = ?', [id]);                           // their own games go with them
				});
				return [200, { ok: true }];
			}
		}
		if (method === 'GET' && path === '/api/admin/games') return [200, await listGames(admin, url.searchParams, { all: true })];
		if ((m = /^\/api\/admin\/games\/(\d+)$/.exec(path)) && method === 'DELETE') {
			const g = await db.get('SELECT * FROM games WHERE id = ?', [Number(m[1])]);
			if (!g) throw new HttpError(404, 'Game not found');
			if (g.mode === 'online' && (g.status === 'active' || g.status === 'waiting')) throw new HttpError(409, 'Abandon the online game first');
			await db.run('DELETE FROM games WHERE id = ?', [g.id]);
			return [200, { ok: true }];
		}
		if ((m = /^\/api\/admin\/games\/(\d+)\/abandon$/.exec(path)) && method === 'POST') {
			if (!(await rooms.adminAbandon(Number(m[1])))) throw new HttpError(409, 'This is not a running online game');
			return [200, { ok: true }];
		}
		throw new HttpError(404, 'Not found');
	}

	async function route(req, res, url) {
		const { method } = req;
		const path = url.pathname;
		let m;

		if (method === 'POST' && path === '/api/auth/register') {
			const b = await readJson(req);
			const name = String(b.name || '').trim();
			const email = String(b.email || '').trim().toLowerCase();
			const password = String(b.password || '');
			if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Name must be 2-40 characters');
			if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email');
			if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
			if (await q.userByEmail(email)) throw new HttpError(409, 'This email is already registered');
			let id;
			try { id = await db.insert('INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)', [name, email, hashPassword(password), now()]); }
			catch (e) {
				if (/UNIQUE|unique|23505/.test(`${e.code} ${e.message}`)) throw new HttpError(409, 'This email is already registered'); // two sign-ups at the same moment
				throw e;
			}
			await promoteConfigured();
			const user = await q.userById(id);
			return [201, { token: signToken({ sub: user.id }, secret), user: publicUser(user) }];
		}
		if (method === 'POST' && path === '/api/auth/login') {
			const b = await readJson(req);
			const user = await q.userByEmail(String(b.email || '').trim().toLowerCase());
			if (!user || !verifyPassword(String(b.password || ''), user.password_hash)) throw new HttpError(401, 'Wrong email or password');
			await promoteConfigured();
			return [200, { token: signToken({ sub: user.id }, secret), user: publicUser(await q.userById(user.id)) }];
		}
		if (method === 'GET' && path === '/api/me') {
			return [200, { user: publicUser(await authUser(req)) }];
		}
		if (path.startsWith('/api/admin/')) return adminRoute(req, method, path, url);
		if (method === 'GET' && path === '/api/rooms') {
			const me = await authUser(req);
			return [200, { rooms: await rooms.listOpen(me.id) }];
		}
		if (method === 'GET' && path === '/api/health') {
			await db.get('SELECT 1 AS ok'); // also proves the database answers
			return [200, { ok: true, db: db.dialect }];
		}

		if (method === 'POST' && path === '/api/games') {
			const user = await authUser(req);
			const b = await readJson(req);
			const mode = b.mode === 'online' ? 'online' : 'local';
			if (mode === 'online') throw new HttpError(400, 'Online games are created over the WebSocket (see server/rooms.js)');
			const players = Array.isArray(b.players) ? b.players : [];
			if (players.length < 2 || players.length > 8) throw new HttpError(400, '2-8 players required');
			const id = await db.tx(async (t) => {
				const stamp = now();
				const gid = await t.insert('INSERT INTO games (owner_id, mode, edition, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
					[user.id, mode, String(b.edition || 'classic').slice(0, 30), stamp, stamp]);
				for (const [i, p] of players.entries()) {
					await t.run('INSERT INTO game_players (game_id, seat, name, color, is_ai) VALUES (?, ?, ?, ?, ?)',
						[gid, i + 1, String(p.name || `Player ${i + 1}`).slice(0, 16), String(p.color || 'gray').slice(0, 20), p.ai ? 1 : 0]);
				}
				return gid;
			});
			return [201, { game: await gameSummary(await q.game(id, user.id)) }];
		}
		if (method === 'GET' && path === '/api/games') {
			const user = await authUser(req);
			return [200, await listGames(user, url.searchParams)];
		}
		if ((m = /^\/api\/games\/(\d+)$/.exec(path))) {
			const user = await authUser(req);
			if (method === 'GET') {
				// an admin may open any game (read only); everybody else only their own
				const g = user.role === 'admin' ? await db.get('SELECT * FROM games WHERE id = ?', [Number(m[1])]) : await q.visibleGame(Number(m[1]), user.id);
				if (!g) throw new HttpError(404, 'Game not found');
				const seat = await q.mySeat(g.id, user.id);
				const owner = user.role === 'admin' ? (await addOwners([{ owner_id: g.owner_id }]))[0].owner : undefined;
				return [200, { game: { ...await gameSummary(g), owner, you: seat ? seat.seat : null, snapshot: g.snapshot ? JSON.parse(g.snapshot) : null, events: cleanLog(await q.actions(g.id)) } }];
			}
			if (method === 'DELETE') {
				// The host deletes the game for everybody. Any other player of an online game only hides it from their own history.
				const mine = await q.game(Number(m[1]), user.id);
				if (!mine) {
					const seat = await q.mySeat(Number(m[1]), user.id);
					const theirs = seat && (await q.visibleGame(Number(m[1]), user.id));
					if (!theirs) throw new HttpError(404, 'Game not found');
					if (theirs.status === 'active') throw new HttpError(409, 'Finish the online game first');
					await db.run('UPDATE game_players SET hidden = 1 WHERE game_id = ? AND user_id = ?', [theirs.id, user.id]);
					return [200, { ok: true, hidden: true }];
				}
			}
			const g = await ownedGame(user, m[1]);
			if (method === 'DELETE') {
				if (g.mode === 'online' && g.status === 'active') throw new HttpError(409, 'Finish the online game first');
				await db.run('DELETE FROM games WHERE id = ? AND owner_id = ?', [g.id, user.id]);
				return [200, { ok: true }];
			}
		}
		if (method === 'POST' && (m = /^\/api\/games\/(\d+)\/resume$/.exec(path))) {
			const user = await authUser(req);
			if (!(await rooms.resume(Number(m[1]), user.id))) throw new HttpError(409, 'Only a player of an abandoned online game can bring it back');
			return [200, { ok: true }];
		}
		if (method === 'PUT' && (m = /^\/api\/games\/(\d+)\/checkpoint$/.exec(path))) {
			const user = await authUser(req);
			const g = await ownedGame(user, m[1]);
			if (g.status !== 'active') throw new HttpError(409, 'Game already finished');
			const b = await readJson(req);
			if (!b.snapshot || typeof b.snapshot !== 'object') throw new HttpError(400, 'snapshot required');
			await db.tx(async (t) => {
				await appendEvents(t, g.id, Array.isArray(b.events) ? b.events : []);
				await t.run('UPDATE games SET snapshot = ?, turn_count = ?, updated_at = ? WHERE id = ?', [JSON.stringify(b.snapshot), Number(b.turn_count) || 0, now(), g.id]);
			});
			return [200, { ok: true }];
		}
		if (method === 'POST' && (m = /^\/api\/games\/(\d+)\/finish$/.exec(path))) {
			const user = await authUser(req);
			const g = await ownedGame(user, m[1]);
			if (g.status !== 'active') throw new HttpError(409, 'Game already finished');
			const b = await readJson(req);
			const results = Array.isArray(b.players) ? b.players : [];
			await db.tx(async (t) => {
				await appendEvents(t, g.id, Array.isArray(b.events) ? b.events : []);
				const stamp = now();
				await t.run("UPDATE games SET status = 'finished', winner_name = ?, turn_count = ?, snapshot = NULL, finished_at = ?, updated_at = ? WHERE id = ?",
					[String(b.winner_name || '').slice(0, 16) || null, Number(b.turn_count) || g.turn_count, stamp, stamp, g.id]);
				for (const r of results) {
					await t.run('UPDATE game_players SET final_money = ?, final_rank = ? WHERE game_id = ? AND seat = ?',
						[Math.round(Number(r.money) || 0), Number(r.rank) || null, g.id, Number(r.seat)]);
				}
			});
			return [200, { game: await gameSummary(await q.game(g.id, user.id)) }];
		}

		throw new HttpError(404, 'Not found');
	}

	// Serves the built site (npm run build -> dist/). Unknown paths get index.html so
	// that /play/12, /history and every other client-side route also work on reload.
	async function serveStatic(req, res, url) {
		if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
		const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
		let file = join(staticDir, clean);
		if (!file.startsWith(staticDir)) return false;
		if (!existsSync(file) || extname(file) === '') {
			// A missing file (/images/x.png) is a 404; a page address (/play/12) gets index.html.
			if (extname(clean) !== '') return false;
			file = join(staticDir, 'index.html');
		}
		try {
			const body = await readFile(file);
			const type = MIME[extname(file)] || 'application/octet-stream';
			res.writeHead(200, { 'Content-Type': type, 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
			res.end(req.method === 'HEAD' ? undefined : body);
			return true;
		} catch {
			return false;
		}
	}

	// The website may be hosted elsewhere (Vercel): ALLOWED_ORIGIN = its address(es), comma separated.
	const origins = (process.env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);

	const server = createServer(async (req, res) => {
		const cors = {};
		const origin = req.headers.origin;
		if (origin && origins.includes(origin)) {
			Object.assign(cors, { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' });
			if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
		}
		const send = (status, body) => {
			res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors });
			res.end(JSON.stringify(body));
		};
		try {
			const url = new URL(req.url, 'http://localhost');
			if (!url.pathname.startsWith('/api/') && await serveStatic(req, res, url)) return;
			const [status, body] = await route(req, res, url);
			send(status, body);
		} catch (e) {
			if (e instanceof HttpError) return send(e.status, { error: e.message });
			console.error(e);
			send(500, { error: 'Server error' });
		}
	});

	// WebSocket: /ws?token=<JWT>. Everything after the handshake is in rooms.js.
	server.on('upgrade', async (req, socket) => {
		try {
			const url = new URL(req.url, 'http://localhost');
			const payload = url.pathname === '/ws' && verifyToken(url.searchParams.get('token'), secret);
			const user = payload && await q.userById(payload.sub);
			if (!user) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
			const conn = acceptUpgrade(req, socket);
			if (conn) rooms.connect(conn, user);
		} catch (e) {
			console.error(e);
			socket.destroy();
		}
	});
	const stopHeartbeat = startHeartbeat(() => rooms.connections());
	server.on('close', stopHeartbeat);
	return server;
}
