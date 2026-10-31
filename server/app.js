// HTTP API. Plain node:http, no framework.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';
import { acceptUpgrade, startHeartbeat } from './ws.js';
import { createRooms } from './rooms.js';

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
	const q = {
		userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
		userById: db.prepare('SELECT * FROM users WHERE id = ?'),
		insertUser: db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'),
		insertGame: db.prepare('INSERT INTO games (owner_id, mode, edition) VALUES (?, ?, ?)'),
		insertPlayer: db.prepare('INSERT INTO game_players (game_id, seat, name, color, is_ai) VALUES (?, ?, ?, ?, ?)'),
		game: db.prepare('SELECT * FROM games WHERE id = ? AND owner_id = ?'),
		// a game is visible to its owner and to every player of an online game
		visibleGame: db.prepare('SELECT * FROM games WHERE id = ? AND (owner_id = ? OR id IN (SELECT game_id FROM game_players WHERE user_id = ?))'),
		mySeat: db.prepare('SELECT seat FROM game_players WHERE game_id = ? AND user_id = ?'),
		players: db.prepare('SELECT seat, name, color, is_ai, final_money, final_rank FROM game_players WHERE game_id = ? ORDER BY seat'),
		actions: db.prepare("SELECT seq, turn, type, text, created_at FROM game_actions WHERE game_id = ? AND type != 'click' ORDER BY seq"),
		lastSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM game_actions WHERE game_id = ?'),
		insertAction: db.prepare('INSERT INTO game_actions (game_id, seq, turn, type, text) VALUES (?, ?, ?, ?, ?)'),
		checkpoint: db.prepare("UPDATE games SET snapshot = ?, turn_count = ?, updated_at = datetime('now') WHERE id = ?"),
		finish: db.prepare("UPDATE games SET status = 'finished', winner_name = ?, turn_count = ?, snapshot = NULL, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"),
		finalPlayer: db.prepare('UPDATE game_players SET final_money = ?, final_rank = ? WHERE game_id = ? AND seat = ?'),
		deleteGame: db.prepare('DELETE FROM games WHERE id = ? AND owner_id = ?'),
	};

	const tx = (fn) => {
		db.exec('BEGIN');
		try { const r = fn(); db.exec('COMMIT'); return r; }
		catch (e) { db.exec('ROLLBACK'); throw e; }
	};

	const authUser = (req) => {
		const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
		const payload = m && verifyToken(m[1], secret);
		const user = payload && q.userById.get(payload.sub);
		if (!user) throw new HttpError(401, 'Please log in');
		return user;
	};

	const gameSummary = (g) => ({
		id: g.id, mode: g.mode, status: g.status, edition: g.edition, room_code: g.room_code, owner_id: g.owner_id,
		winner_name: g.winner_name, turn_count: g.turn_count,
		created_at: g.created_at, updated_at: g.updated_at, finished_at: g.finished_at,
		players: q.players.all(g.id).map((p) => ({ ...p, is_ai: !!p.is_ai })),
	});

	const ownedGame = (user, id) => {
		const g = q.game.get(Number(id), user.id);
		if (!g) throw new HttpError(404, 'Game not found');
		return g;
	};

	const appendEvents = (gameId, events) => {
		let seq = q.lastSeq.get(gameId).n;
		for (const e of events.slice(0, 500)) {
			q.insertAction.run(gameId, ++seq, Number(e.turn) || 0, String(e.type || 'event').slice(0, 30), String(e.text || '').slice(0, 500));
		}
	};

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
			if (q.userByEmail.get(email)) throw new HttpError(409, 'This email is already registered');
			const r = q.insertUser.run(name, email, hashPassword(password));
			const user = q.userById.get(Number(r.lastInsertRowid));
			return [201, { token: signToken({ sub: user.id }, secret), user: publicUser(user) }];
		}
		if (method === 'POST' && path === '/api/auth/login') {
			const b = await readJson(req);
			const user = q.userByEmail.get(String(b.email || '').trim().toLowerCase());
			if (!user || !verifyPassword(String(b.password || ''), user.password_hash)) throw new HttpError(401, 'Wrong email or password');
			return [200, { token: signToken({ sub: user.id }, secret), user: publicUser(user) }];
		}
		if (method === 'GET' && path === '/api/me') {
			return [200, { user: publicUser(authUser(req)) }];
		}

		if (method === 'POST' && path === '/api/games') {
			const user = authUser(req);
			const b = await readJson(req);
			const mode = b.mode === 'online' ? 'online' : 'local';
			if (mode === 'online') throw new HttpError(400, 'Online games are created over the WebSocket (see server/rooms.js)');
			const players = Array.isArray(b.players) ? b.players : [];
			if (players.length < 2 || players.length > 8) throw new HttpError(400, '2-8 players required');
			const id = tx(() => {
				const gid = Number(q.insertGame.run(user.id, mode, String(b.edition || 'classic').slice(0, 30)).lastInsertRowid);
				players.forEach((p, i) => q.insertPlayer.run(gid, i + 1, String(p.name || `Player ${i + 1}`).slice(0, 16), String(p.color || 'gray').slice(0, 20), p.ai ? 1 : 0));
				return gid;
			});
			return [201, { game: gameSummary(q.game.get(id, user.id)) }];
		}
		if (method === 'GET' && path === '/api/health') return [200, { ok: true }];
		if (method === 'GET' && path === '/api/games') {
			const user = authUser(req);
			const status = url.searchParams.get('status');
			const mode = url.searchParams.get('mode');
			const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
			const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
			const where = ["status != 'waiting'", '(owner_id = ? OR id IN (SELECT game_id FROM game_players WHERE user_id = ?))']; const args = [user.id, user.id];
			if (status === 'active' || status === 'finished' || status === 'abandoned') { where.push('status = ?'); args.push(status); }
			if (mode === 'local' || mode === 'online') { where.push('mode = ?'); args.push(mode); }
			const rows = db.prepare(`SELECT * FROM games WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
			const total = db.prepare(`SELECT COUNT(*) AS n FROM games WHERE ${where.join(' AND ')}`).get(...args).n;
			return [200, { total, games: rows.map(gameSummary) }];
		}
		if ((m = /^\/api\/games\/(\d+)$/.exec(path))) {
			const user = authUser(req);
			if (method === 'GET') {
				const g = q.visibleGame.get(Number(m[1]), user.id, user.id);
				if (!g) throw new HttpError(404, 'Game not found');
				const seat = q.mySeat.get(g.id, user.id);
				return [200, { game: { ...gameSummary(g), you: seat ? seat.seat : null, snapshot: g.snapshot ? JSON.parse(g.snapshot) : null, events: q.actions.all(g.id) } }];
			}
			const g = ownedGame(user, m[1]);
			if (method === 'DELETE') {
				if (g.mode === 'online' && g.status === 'active') throw new HttpError(409, 'Finish the online game first');
				q.deleteGame.run(g.id, user.id);
				return [200, { ok: true }];
			}
		}
		if (method === 'PUT' && (m = /^\/api\/games\/(\d+)\/checkpoint$/.exec(path))) {
			const user = authUser(req);
			const g = ownedGame(user, m[1]);
			if (g.status !== 'active') throw new HttpError(409, 'Game already finished');
			const b = await readJson(req);
			if (!b.snapshot || typeof b.snapshot !== 'object') throw new HttpError(400, 'snapshot required');
			tx(() => {
				appendEvents(g.id, Array.isArray(b.events) ? b.events : []);
				q.checkpoint.run(JSON.stringify(b.snapshot), Number(b.turn_count) || 0, g.id);
			});
			return [200, { ok: true }];
		}
		if (method === 'POST' && (m = /^\/api\/games\/(\d+)\/finish$/.exec(path))) {
			const user = authUser(req);
			const g = ownedGame(user, m[1]);
			if (g.status !== 'active') throw new HttpError(409, 'Game already finished');
			const b = await readJson(req);
			const results = Array.isArray(b.players) ? b.players : [];
			tx(() => {
				appendEvents(g.id, Array.isArray(b.events) ? b.events : []);
				q.finish.run(String(b.winner_name || '').slice(0, 16) || null, Number(b.turn_count) || g.turn_count, g.id);
				for (const r of results) q.finalPlayer.run(Math.round(Number(r.money) || 0), Number(r.rank) || null, g.id, Number(r.seat));
			});
			return [200, { game: gameSummary(q.game.get(g.id, user.id)) }];
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
	server.on('upgrade', (req, socket) => {
		const url = new URL(req.url, 'http://localhost');
		const payload = url.pathname === '/ws' && verifyToken(url.searchParams.get('token'), secret);
		const user = payload && q.userById.get(payload.sub);
		if (!user) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
		const conn = acceptUpgrade(req, socket);
		if (conn) rooms.connect(conn, user);
	});
	const stopHeartbeat = startHeartbeat(() => rooms.connections());
	server.on('close', stopHeartbeat);
	return server;
}
