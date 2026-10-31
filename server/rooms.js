// Online rooms: lobby, seats, and the ordered stream of game actions.
//
// "Relay" model: the game engine runs in every player's browser. The server does
// not know the rules; it (1) hands out the random seed, (2) lets only room
// members send actions, (3) gives every action a number (seq) and broadcasts it
// to everyone, in that order, and (4) stores it so a player who refreshes or
// joins late can replay the game from the start.
import { randomBytes, randomInt } from 'node:crypto';

export const COLORS = ['yellow', 'blue', 'red', 'lime', 'green', 'aqua', 'orange', 'purple',
	'fuchsia', 'teal', 'maroon', 'navy', 'olive', 'silver', 'gray', 'black'];
// Buttons whose clicks are shared between players (see src/online.js).
export const RELAYED = new Set(['nextbutton', 'popupclose', 'popupyes', 'popupno',
	'buybutton', 'payfiftybutton', 'gojfbutton', 'resignbutton',
	// Milestone 3: auctions, trade, building, mortgage, bankruptcy
	'auctionbid', 'auctionpass', 'auctionexit',
	'proposetradebutton', 'accepttradebutton', 'rejecttradebutton', 'canceltradebutton',
	'buyhousebutton', 'sellhousebutton', 'mortgagebutton', 'bankunmortgage']);

// Extra data an action may carry; everything is rebuilt from numbers, never copied as is.
function cleanPayload(a) {
	const out = { id: a.id, turn: Number(a.turn) || 0 };
	const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
	if (a.check !== undefined) { const c = int(a.check, -1, 41); if (c !== null) out.check = c; }
	if (a.v !== undefined && a.v !== null) {
		if (typeof a.v === 'number') { const n = int(a.v, -1_000_000, 1_000_000); if (n !== null) out.v = n; }
		else if (typeof a.v === 'object') {
			const t = a.v;
			if (Array.isArray(t.p) && t.p.length === 40) {
				out.v = { i: int(t.i, 1, 8) ?? 0, r: int(t.r, 1, 8) ?? 0, m: int(t.m, -1_000_000, 1_000_000) ?? 0,
					p: t.p.map((x) => int(x, -1, 1) ?? 0), cc: int(t.cc, -1, 1) ?? 0, ch: int(t.ch, -1, 1) ?? 0 };
			}
		}
	}
	return out;
}

const MAX_PLAYERS = 8;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LEAVE_GRACE_MS = 20000;
// A player who has been away this long can be removed from a running game by the others.
const num = (v, d) => (Number(v) > 0 ? Number(v) : d);
const FORFEIT_AFTER_MS = () => num(process.env.FORFEIT_AFTER_MS, 60_000);
// A running game that nobody has had open for this long is marked "abandoned".
const ABANDON_AFTER_MS = () => num(process.env.ABANDON_AFTER_MS, 30 * 60_000);
const SWEEP_EVERY_MS = () => num(process.env.SWEEP_EVERY_MS, 30_000);

export function createRooms(db) {
	const q = {
		insertGame: db.prepare("INSERT INTO games (owner_id, mode, status, room_code, seed) VALUES (?, 'online', 'waiting', ?, NULL)"),
		codeTaken: db.prepare('SELECT 1 FROM games WHERE room_code = ?'),
		gameByCode: db.prepare("SELECT * FROM games WHERE room_code = ? AND mode = 'online'"),
		gameById: db.prepare("SELECT * FROM games WHERE id = ? AND mode = 'online'"),
		members: db.prepare('SELECT seat, name, color, user_id FROM game_players WHERE game_id = ? AND user_id IS NOT NULL ORDER BY seat'),
		insertMember: db.prepare('INSERT INTO game_players (game_id, seat, name, color, is_ai, user_id) VALUES (?, ?, ?, ?, 0, ?)'),
		deleteMember: db.prepare('DELETE FROM game_players WHERE game_id = ? AND user_id = ?'),
		setSeat: db.prepare('UPDATE game_players SET seat = ? WHERE game_id = ? AND user_id = ?'),
		setColor: db.prepare('UPDATE game_players SET color = ? WHERE game_id = ? AND user_id = ?'),
		setOwner: db.prepare('UPDATE games SET owner_id = ? WHERE id = ?'),
		activate: db.prepare("UPDATE games SET status = 'active', seed = ?, updated_at = datetime('now') WHERE id = ?"),
		deleteGame: db.prepare('DELETE FROM games WHERE id = ?'),
		lastSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM game_actions WHERE game_id = ?'),
		insertAction: db.prepare('INSERT INTO game_actions (game_id, seq, turn, type, text) VALUES (?, ?, ?, ?, ?)'),
		clicksAfter: db.prepare("SELECT seq, text FROM game_actions WHERE game_id = ? AND type = 'click' AND seq > ? ORDER BY seq"),
		touch: db.prepare("UPDATE games SET updated_at = datetime('now'), turn_count = ? WHERE id = ?"),
		finish: db.prepare("UPDATE games SET status = 'finished', winner_name = ?, turn_count = ?, finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"),
		abandon: db.prepare("UPDATE games SET status = 'abandoned', updated_at = datetime('now') WHERE id = ? AND status IN ('active','waiting')"),
		bump: db.prepare("UPDATE games SET updated_at = datetime('now') WHERE id = ?"),
		finalPlayer: db.prepare('UPDATE game_players SET final_money = ?, final_rank = ? WHERE game_id = ? AND seat = ?'),
	};

	/** @type {Map<number, any>} */
	const rooms = new Map();
	const sessions = new Set(); // every open socket {conn, user, room}

	const send = (conn, msg) => { try { conn.send(JSON.stringify(msg)); } catch { /* socket gone */ } };
	const err = (conn, message) => send(conn, { t: 'error', message });

	function newCode() {
		for (let i = 0; i < 50; i++) {
			let code = '';
			for (let k = 0; k < 5; k++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
			if (!q.codeTaken.get(code)) return code;
		}
		throw new Error('no free room code');
	}

	// ---- loading rooms (also after a server restart) ------------------------
	function hydrate(row) {
		if (!row || (row.status !== 'waiting' && row.status !== 'active')) return null;
		let room = rooms.get(row.id);
		if (room) return room;
		room = {
			id: row.id, code: row.room_code, hostId: row.owner_id, status: row.status, seed: row.seed,
			seq: q.lastSeq.get(row.id).n, turnCount: row.turn_count || 0,
			members: new Map(), // userId -> { seat, name, color, sessions:Set }
		};
		for (const m of q.members.all(row.id)) {
			room.members.set(m.user_id, { userId: m.user_id, seat: m.seat, name: m.name, color: m.color, sessions: new Set(), offlineSince: Date.now() });
		}
		rooms.set(row.id, room);
		return room;
	}
	const roomByCode = (code) => hydrate(q.gameByCode.get(String(code || '').toUpperCase().trim()));
	const roomById = (id) => hydrate(q.gameById.get(Number(id)));

	// ---- what clients may see -------------------------------------------------
	function publicRoom(room) {
		return {
			id: room.id, code: room.code, status: room.status, hostId: room.hostId, forfeitAfterMs: FORFEIT_AFTER_MS(),
			seed: room.status === 'active' ? room.seed : null,
			players: [...room.members.values()].sort((a, b) => a.seat - b.seat).map((m) => ({
				seat: m.seat, userId: m.userId, name: m.name, color: m.color,
				host: m.userId === room.hostId, online: m.sessions.size > 0,
				awayMs: m.sessions.size === 0 && m.offlineSince ? Date.now() - m.offlineSince : 0,
			})),
		};
	}
	function broadcast(room, msg) {
		const text = JSON.stringify(msg);
		for (const m of room.members.values()) for (const s of m.sessions) { try { s.conn.send(text); } catch { /* gone */ } }
	}
	const broadcastRoom = (room) => broadcast(room, { t: 'room', room: publicRoom(room) });

	// ---- membership ----------------------------------------------------------
	function uniqueName(room, wanted) {
		const base = String(wanted || 'Player').trim().slice(0, 16) || 'Player';
		const taken = new Set([...room.members.values()].map((m) => m.name.toLowerCase()));
		if (!taken.has(base.toLowerCase())) return base;
		for (let i = 2; i < 20; i++) {
			const name = `${base.slice(0, 16 - String(i).length - 1)} ${i}`;
			if (!taken.has(name.toLowerCase())) return name;
		}
		return base;
	}

	function addMember(room, user) {
		const used = new Set([...room.members.values()].map((m) => m.color));
		const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
		const m = { userId: user.id, seat: room.members.size + 1, name: uniqueName(room, user.name), color, sessions: new Set(), offlineSince: null };
		q.insertMember.run(room.id, m.seat, m.name, m.color, user.id);
		room.members.set(user.id, m);
		return m;
	}

	function attach(session, room) {
		detach(session);
		const m = room.members.get(session.user.id);
		m.sessions.add(session);
		m.offlineSince = null;
		session.room = room;
		return m;
	}

	function detach(session) {
		const room = session.room;
		if (!room) return;
		session.room = null;
		const m = room.members.get(session.user.id);
		if (!m) return;
		m.sessions.delete(session);
		if (m.sessions.size > 0) return;
		m.offlineSince = Date.now();
		broadcastRoom(room);
		if (room.status === 'waiting') {
			// A tab closed in the lobby: remove the player unless they come back soon.
			const timer = setTimeout(() => {
				const again = room.members.get(session.user.id);
				if (again && again.sessions.size === 0 && room.status === 'waiting') removeMember(room, session.user.id);
			}, LEAVE_GRACE_MS);
			timer.unref();
		}
	}

	function removeMember(room, userId) {
		if (!room.members.has(userId)) return;
		q.deleteMember.run(room.id, userId);
		room.members.delete(userId);
		if (room.members.size === 0) {
			q.deleteGame.run(room.id);
			rooms.delete(room.id);
			return;
		}
		// close the gap in the seat numbers and pass the host role on if needed
		[...room.members.values()].sort((a, b) => a.seat - b.seat).forEach((m, i) => {
			if (m.seat !== i + 1) { m.seat = i + 1; q.setSeat.run(m.seat, room.id, m.userId); }
		});
		if (room.hostId === userId) {
			const next = [...room.members.values()].sort((a, b) => a.seat - b.seat)[0];
			room.hostId = next.userId;
			q.setOwner.run(next.userId, room.id);
		}
		broadcastRoom(room);
	}

	// ---- message handlers ------------------------------------------------------
	function joinedPayload(room, member, after) {
		const msg = { t: 'joined', room: publicRoom(room), you: { seat: member.seat, userId: member.userId } };
		if (room.status === 'active') {
			msg.actions = q.clicksAfter.all(room.id, Number(after) || 0).map((r) => ({ seq: r.seq, ...JSON.parse(r.text) }));
		}
		return msg;
	}

	const handlers = {
		create(s) {
			if (s.room) leaveRoom(s);
			const code = newCode();
			const id = Number(q.insertGame.run(s.user.id, code).lastInsertRowid);
			const room = roomById(id);
			const m = addMember(room, s.user);
			attach(s, room);
			send(s.conn, joinedPayload(room, m));
		},

		// By code (new player or returning) or by game id (returning member only).
		join(s, msg) {
			const room = msg.code ? roomByCode(msg.code) : roomById(msg.gameId);
			if (!room) return err(s.conn, msg.code ? 'No room with this code' : 'This online game is not available');
			let m = room.members.get(s.user.id);
			if (!m) {
				if (!msg.code) return err(s.conn, 'You are not a player in this game');
				if (room.status !== 'waiting') return err(s.conn, 'This game has already started');
				if (room.members.size >= MAX_PLAYERS) return err(s.conn, 'This room is full');
				m = addMember(room, s.user);
			}
			attach(s, room);
			send(s.conn, joinedPayload(room, m, msg.after));
			broadcastRoom(room);
		},

		leave(s) { leaveRoom(s); send(s.conn, { t: 'left' }); },

		color(s, msg) {
			const room = s.room;
			if (!room || room.status !== 'waiting') return;
			const color = String(msg.color || '').toLowerCase();
			if (!COLORS.includes(color)) return err(s.conn, 'Unknown colour');
			if ([...room.members.values()].some((m) => m.userId !== s.user.id && m.color === color)) return err(s.conn, 'That colour is taken');
			room.members.get(s.user.id).color = color;
			q.setColor.run(color, room.id, s.user.id);
			broadcastRoom(room);
		},

		start(s) {
			const room = s.room;
			if (!room || room.status !== 'waiting') return;
			if (room.hostId !== s.user.id) return err(s.conn, 'Only the host can start the game');
			if (room.members.size < 2) return err(s.conn, 'At least 2 players are needed');
			room.seed = randomBytes(4).readUInt32BE();
			room.status = 'active';
			q.activate.run(room.seed, room.id);
			broadcast(room, { t: 'started', room: publicRoom(room) });
		},

		// A shared button click. The sender must be a member of an active game.
		// Whose turn it is is decided by the engine in the browsers, so the server
		// can only check membership (cheating is not prevented; see README).
		act(s, msg) {
			const room = s.room;
			if (!room || room.status !== 'active') return;
			const a = msg.a || {};
			if (!RELAYED.has(a.id)) return err(s.conn, 'Unknown action');
			const member = room.members.get(s.user.id);
			const action = { seat: member.seat, a: cleanPayload(a) };
			const seq = ++room.seq;
			q.insertAction.run(room.id, seq, action.a.turn, 'click', JSON.stringify(action));
			q.bump.run(room.id);
			broadcast(room, { t: 'act', seq, ...action });
		},

		// Remove a player who has been away for a while (their turn would block everybody).
		forfeit(s, msg) {
			const room = s.room;
			if (!room || room.status !== 'active') return;
			const target = [...room.members.values()].find((m) => m.seat === Number(msg.seat));
			if (!target || target.userId === s.user.id) return err(s.conn, 'Cannot remove this player');
			if (target.sessions.size > 0 || !target.offlineSince || Date.now() - target.offlineSince < FORFEIT_AFTER_MS()) {
				return err(s.conn, 'This player is not away long enough yet');
			}
			const member = room.members.get(s.user.id);
			const action = { seat: member.seat, a: { id: 'forfeit', turn: Number(msg.turn) || 0, v: target.seat } };
			const seq = ++room.seq;
			q.insertAction.run(room.id, seq, action.a.turn, 'click', JSON.stringify(action));
			q.bump.run(room.id);
			broadcast(room, { t: 'act', seq, ...action });
		},

		// The host ends a running game without a winner.
		abandon(s) {
			const room = s.room;
			if (!room || room.status !== 'active') return;
			if (room.hostId !== s.user.id) return err(s.conn, 'Only the host can abandon the game');
			abandonRoom(room);
		},

		// The host's browser uploads the readable game log (shown in History).
		log(s, msg) {
			const room = s.room;
			if (!room || room.status !== 'active' || room.hostId !== s.user.id) return;
			let seq = room.seq;
			const events = Array.isArray(msg.events) ? msg.events.slice(0, 200) : [];
			// log lines share the seq counter with actions (clients only look at 'click' rows)
			for (const e of events) q.insertAction.run(room.id, ++seq, Number(e.turn) || 0, 'alert', String(e.text || '').slice(0, 500));
			room.seq = seq;
			q.touch.run(Number(msg.turn_count) || room.turnCount, room.id);
		},

		end(s, msg) {
			const room = s.room;
			if (!room || room.status !== 'active' || room.hostId !== s.user.id) return;
			room.status = 'finished';
			q.finish.run(String(msg.winner_name || '').slice(0, 16) || null, Number(msg.turn_count) || room.turnCount, room.id);
			for (const r of Array.isArray(msg.players) ? msg.players : []) {
				q.finalPlayer.run(Math.round(Number(r.money) || 0), Number(r.rank) || null, room.id, Number(r.seat));
			}
			broadcast(room, { t: 'ended', room: publicRoom(room) });
			rooms.delete(room.id);
		},
	};

	function abandonRoom(room) {
		room.status = 'abandoned';
		q.abandon.run(room.id);
		broadcast(room, { t: 'ended', room: publicRoom(room) });
		rooms.delete(room.id);
	}

	// Games nobody has opened for a long time are marked abandoned (also after a server restart).
	function sweep() {
		const cutoff = Date.now() - ABANDON_AFTER_MS();
		for (const room of [...rooms.values()]) {
			if (room.status !== 'active') continue;
			const people = [...room.members.values()];
			if (people.some((m) => m.sessions.size > 0)) continue;
			if (people.every((m) => (m.offlineSince || 0) < cutoff)) abandonRoom(room);
		}
		// rooms that are not loaded (server restarted): judge by the last save
		const stale = db.prepare("SELECT id FROM games WHERE mode = 'online' AND status = 'active' AND updated_at < datetime(?, 'unixepoch')")
			.all(Math.floor(cutoff / 1000));
		for (const g of stale) if (!rooms.has(g.id)) q.abandon.run(g.id);
	}
	const sweeper = setInterval(sweep, SWEEP_EVERY_MS());
	sweeper.unref();

	function leaveRoom(s) {
		const room = s.room;
		if (!room) return;
		detach(s);
		if (room.status === 'waiting') removeMember(room, s.user.id);
	}

	return {
		publicRoom,
		connect(conn, user) {
			const session = { conn, user, room: null };
			sessions.add(session);
			send(conn, { t: 'hello', user: { id: user.id, name: user.name } });
			conn.on('message', (text) => {
				let msg;
				try { msg = JSON.parse(text); } catch { return err(conn, 'Bad message'); }
				const fn = msg && typeof msg.t === 'string' && Object.hasOwn(handlers, msg.t) ? handlers[msg.t] : null;
				if (!fn) return err(conn, 'Unknown message');
				try { fn(session, msg); } catch (e) { console.error(e); err(conn, 'Server error'); }
			});
			conn.on('close', () => { sessions.delete(session); detach(session); });
		},
		sweep,
		connections: () => [...sessions].map((s) => s.conn),
	};
}
