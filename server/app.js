// HTTP API. Plain node:http, no framework.
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
	async function listGames(user, params) {
		const status = params.get('status');
		const mode = params.get('mode');
		const text = String(params.get('q') || '').trim().toLowerCase().slice(0, 40);
		const from = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from') : '';
		const to = /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '') ? params.get('to') : '';
		const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100);
		const offset = Math.max(Number(params.get('offset')) || 0, 0);
		const sort = SORTS[params.get('sort')] || SORTS.updated;
		const dir = params.get('dir') === 'asc' ? 'ASC' : 'DESC';

		const where = ["g.status != 'waiting'", '(g.owner_id = ? OR g.id IN (SELECT game_id FROM game_players WHERE user_id = ?))'];
		const args = [user.id, user.id];
		if (['active', 'finished', 'abandoned'].includes(status)) { where.push('g.status = ?'); args.push(status); }
		if (mode === 'local' || mode === 'online') { where.push('g.mode = ?'); args.push(mode); }
		if (text) {
			const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
			where.push(`(LOWER(COALESCE(g.winner_name, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(g.room_code, '')) LIKE ? ESCAPE '\\'
				OR g.id IN (SELECT game_id FROM game_players WHERE LOWER(name) LIKE ? ESCAPE '\\'))`);
			args.push(like, like, like);
		}
		if (from) { where.push('g.created_at >= ?'); args.push(`${from} 00:00:00`); }
		if (to) { where.push('g.created_at <= ?'); args.push(`${to} 23:59:59`); }

		const rows = await db.all(`SELECT g.* FROM games g WHERE ${where.join(' AND ')} ORDER BY ${sort} ${dir}, g.id ${dir} LIMIT ? OFFSET ?`, [...args, limit, offset]);
		const total = (await db.get(`SELECT COUNT(*) AS n FROM games g WHERE ${where.join(' AND ')}`, args)).n;
		return { total, games: await Promise.all(rows.map(gameSummary)) };
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
			const user = await q.userById(id);
			return [201, { token: signToken({ sub: user.id }, secret), user: publicUser(user) }];
		}
		if (method === 'POST' && path === '/api/auth/login') {
			const b = await readJson(req);
			const user = await q.userByEmail(String(b.email || '').trim().toLowerCase());
			if (!user || !verifyPassword(String(b.password || ''), user.password_hash)) throw new HttpError(401, 'Wrong email or password');
			return [200, { token: signToken({ sub: user.id }, secret), user: publicUser(user) }];
		}
		if (method === 'GET' && path === '/api/me') {
			return [200, { user: publicUser(await authUser(req)) }];
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
				const g = await q.visibleGame(Number(m[1]), user.id);
				if (!g) throw new HttpError(404, 'Game not found');
				const seat = await q.mySeat(g.id, user.id);
				return [200, { game: { ...await gameSummary(g), you: seat ? seat.seat : null, snapshot: g.snapshot ? JSON.parse(g.snapshot) : null, events: await q.actions(g.id) } }];
			}
			const g = await ownedGame(user, m[1]);
			if (method === 'DELETE') {
				if (g.mode === 'online' && g.status === 'active') throw new HttpError(409, 'Finish the online game first');
				await db.run('DELETE FROM games WHERE id = ? AND owner_id = ?', [g.id, user.id]);
				return [200, { ok: true }];
			}
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
