// HTTP API. Plain node:http, no framework.
import { createServer } from 'node:http';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';

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

export function createApp(db, { secret }) {
	if (!secret) throw new Error('JWT secret is required');
	const q = {
		userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
		userById: db.prepare('SELECT * FROM users WHERE id = ?'),
		insertUser: db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'),
		insertGame: db.prepare('INSERT INTO games (owner_id, mode, edition) VALUES (?, ?, ?)'),
		insertPlayer: db.prepare('INSERT INTO game_players (game_id, seat, name, color, is_ai) VALUES (?, ?, ?, ?, ?)'),
		game: db.prepare('SELECT * FROM games WHERE id = ? AND owner_id = ?'),
		players: db.prepare('SELECT seat, name, color, is_ai, final_money, final_rank FROM game_players WHERE game_id = ? ORDER BY seat'),
		actions: db.prepare('SELECT seq, turn, type, text, created_at FROM game_actions WHERE game_id = ? ORDER BY seq'),
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
		id: g.id, mode: g.mode, status: g.status, edition: g.edition,
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
			if (mode === 'online') throw new HttpError(400, 'Online games arrive in the next milestone');
			const players = Array.isArray(b.players) ? b.players : [];
			if (players.length < 2 || players.length > 8) throw new HttpError(400, '2-8 players required');
			const id = tx(() => {
				const gid = Number(q.insertGame.run(user.id, mode, String(b.edition || 'classic').slice(0, 30)).lastInsertRowid);
				players.forEach((p, i) => q.insertPlayer.run(gid, i + 1, String(p.name || `Player ${i + 1}`).slice(0, 16), String(p.color || 'gray').slice(0, 20), p.ai ? 1 : 0));
				return gid;
			});
			return [201, { game: gameSummary(q.game.get(id, user.id)) }];
		}
		if (method === 'GET' && path === '/api/games') {
			const user = authUser(req);
			const status = url.searchParams.get('status');
			const mode = url.searchParams.get('mode');
			const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100);
			const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
			const where = ['owner_id = ?']; const args = [user.id];
			if (status === 'active' || status === 'finished') { where.push('status = ?'); args.push(status); }
			if (mode === 'local' || mode === 'online') { where.push('mode = ?'); args.push(mode); }
			const rows = db.prepare(`SELECT * FROM games WHERE ${where.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
			const total = db.prepare(`SELECT COUNT(*) AS n FROM games WHERE ${where.join(' AND ')}`).get(...args).n;
			return [200, { total, games: rows.map(gameSummary) }];
		}
		if ((m = /^\/api\/games\/(\d+)$/.exec(path))) {
			const user = authUser(req);
			const g = ownedGame(user, m[1]);
			if (method === 'GET') {
				return [200, { game: { ...gameSummary(g), snapshot: g.snapshot ? JSON.parse(g.snapshot) : null, events: q.actions.all(g.id) } }];
			}
			if (method === 'DELETE') {
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

	return createServer(async (req, res) => {
		const send = (status, body) => {
			res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
			res.end(JSON.stringify(body));
		};
		try {
			const url = new URL(req.url, 'http://localhost');
			const [status, body] = await route(req, res, url);
			send(status, body);
		} catch (e) {
			if (e instanceof HttpError) return send(e.status, { error: e.message });
			console.error(e);
			send(500, { error: 'Server error' });
		}
	});
}
