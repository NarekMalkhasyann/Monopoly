// Run: node server/test-ws.js  (uses Node's built-in WebSocket client)
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { createApp } from './app.js';

process.env.FORFEIT_AFTER_MS = '400';
process.env.ABANDON_AFTER_MS = '700';
process.env.SWEEP_EVERY_MS = '200';
process.env.ADMIN_EMAILS = 'root@x.am';
const db = await openDb(process.env.TEST_DATABASE_URL || ':memory:');
const server = createApp(db, { secret: 'test-secret' });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;
const call = async (method, path, body, token) => {
	const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
	return { status: r.status, body: await r.json() };
};
const PW = randomBytes(9).toString('hex'); // the test accounts' password: random on every run
const register = async (name) => (await call('POST', '/api/auth/register', { name, email: `${name.toLowerCase()}@x.am`, password: PW })).body.token;

// A socket that records everything it receives
function open(token) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
		const inbox = []; const waiters = [];
		ws.onmessage = (e) => {
			const m = JSON.parse(e.data); inbox.push(m);
			for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
		};
		ws.onerror = () => reject(new Error('ws error'));
		const c = {
			ws, inbox,
			send: (m) => ws.send(JSON.stringify(m)),
			next: (type, extra = () => true) => new Promise((res, rej) => {
				const hit = inbox.find((m) => m.t === type && extra(m) && !m._seen);
				const test = (m) => m.t === type && extra(m);
				if (hit) { hit._seen = true; return res(hit); }
				const w = { test, resolve: (m) => { m._seen = true; res(m); } };
				waiters.push(w);
				setTimeout(() => rej(new Error('timeout waiting for ' + type + '; got ' + JSON.stringify(inbox.slice(-3).map((m) => m.t + ':' + (m.message || ''))))), 3000);
			}),
			close: () => ws.close(),
		};
		ws.onopen = () => resolve(c);
	});
}

// no token -> refused
await assert.rejects(new Promise((res, rej) => { const w = new WebSocket(`ws://localhost:${port}/ws`); w.onopen = res; w.onerror = () => rej(new Error('refused')); }));

const tA = await register('Anna'); const tB = await register('Ben'); const tC = await register('Cleo');
const a = await open(tA); await a.next('hello');
const b = await open(tB); await b.next('hello');

// create + join
a.send({ t: 'create' });
let j = await a.next('joined');
assert.equal(j.room.status, 'waiting'); assert.equal(j.you.seat, 1); assert.match(j.room.code, /^[A-Z2-9]{5}$/);
const code = j.room.code;
b.send({ t: 'join', code: 'ZZZZZ' }); assert.match((await b.next('error')).message, /No room/);
b.send({ t: 'join', code: code.toLowerCase() });
j = await b.next('joined'); assert.equal(j.you.seat, 2);
let room = (await a.next('room', (m) => m.room.players.length === 2)).room;
assert.deepEqual(room.players.map((p) => p.name), ['Anna', 'Ben']);
assert.equal(room.players[0].host, true);
assert.notEqual(room.players[0].color, room.players[1].color);

// colours
b.send({ t: 'color', color: room.players[0].color }); assert.match((await b.next('error')).message, /taken/);
b.send({ t: 'color', color: 'teal' });
room = (await a.next('room', (m) => m.room.players[1].color === 'teal')).room;

// start: only host, needs 2 players, actions before start ignored
b.send({ t: 'start' }); assert.match((await b.next('error')).message, /host/);
b.send({ t: 'act', a: { id: 'nextbutton', turn: 1 } }); // ignored (not started)
a.send({ t: 'start' });
const st = await a.next('started'); await b.next('started');
assert.equal(st.room.status, 'active'); assert.equal(typeof st.room.seed, 'number');
assert.equal((await call('GET', '/api/games', null, tA)).body.total, 1);

// a third player cannot join a started game
const c = await open(tC); await c.next('hello');
c.send({ t: 'join', code }); assert.match((await c.next('error')).message, /already started/);
c.send({ t: 'join', gameId: j.room.id }); assert.match((await c.next('error')).message, /not a player/);

// relay: both get the same actions in the same order
a.send({ t: 'act', a: { id: 'nextbutton', turn: 1 } });
b.send({ t: 'act', a: { id: 'hack', turn: 1 } }); assert.match((await b.next('error')).message, /Unknown action/);
a.send({ t: 'act', a: { id: 'buybutton', turn: 1 } });
const a1 = await a.next('act'); const a2 = await a.next('act');
const b1 = await b.next('act'); const b2 = await b.next('act');
assert.deepEqual([a1.seq, a2.seq], [1, 2]); assert.deepEqual([b1.seq, b2.seq], [1, 2]);
assert.equal(a1.a.id, 'nextbutton'); assert.equal(b2.a.id, 'buybutton'); assert.equal(b1.seat, 1);

// host uploads the readable log
a.send({ t: 'log', events: [{ type: 'alert', turn: 1, text: 'Anna rolled 7.' }], turn_count: 1 });
b.send({ t: 'log', events: [{ type: 'alert', turn: 1, text: 'forged' }] }); // ignored: not host
await new Promise((r) => setTimeout(r, 100));

// Ben refreshes: reconnect, rejoin by game id, replay from where he was
b.close(); await new Promise((r) => setTimeout(r, 100));
a.send({ t: 'act', a: { id: 'nextbutton', turn: 2 } }); await a.next('act', (m) => m.seq === 4);
const b2s = await open(tB); await b2s.next('hello');
b2s.send({ t: 'join', gameId: j.room.id, after: 1 });
j = await b2s.next('joined');
assert.equal(j.you.seat, 2);
assert.deepEqual(j.actions.map((x) => x.seq), [2, 4]); // only clicks after seq 1, log row (3) is not an action
assert.equal(j.room.players.every((p) => p.online), true);

// history is visible to both players; details never expose the click rows
for (const t of [tA, tB]) {
	const g = (await call('GET', '/api/games?status=active', null, t)).body;
	assert.equal(g.total, 1); assert.equal(g.games[0].mode, 'online'); assert.equal(g.games[0].room_code, code);
}
const gd = (await call('GET', `/api/games/${j.room.id}`, null, tB)).body.game;
assert.equal(gd.you, 2); assert.deepEqual(gd.events.map((e) => e.text), ['Anna rolled 7.']);
assert.equal((await call('GET', `/api/games/${j.room.id}`, null, tC)).status, 404);
assert.equal((await call('DELETE', `/api/games/${j.room.id}`, null, tA)).status, 409);

// finish
b2s.send({ t: 'end', winner_name: 'Ben', players: [] }); // not host: ignored
a.send({ t: 'end', winner_name: 'Anna', turn_count: 9, players: [{ seat: 1, money: 2400, rank: 1 }, { seat: 2, money: 0, rank: 2 }] });
await a.next('ended');
const fin = (await call('GET', `/api/games/${j.room.id}`, null, tB)).body.game;
assert.equal(fin.status, 'finished'); assert.equal(fin.winner_name, 'Anna'); assert.equal(fin.players[1].final_rank, 2);
assert.equal((await call('DELETE', `/api/games/${j.room.id}`, null, tA)).status, 200);

// lobby: leaving removes the player, host passes on, an empty room disappears
a.send({ t: 'create' }); const ja = await a.next('joined', (m) => m.room.id !== j.room.id);
b2s.send({ t: 'join', code: ja.room.code }); await b2s.next('joined', (m) => m.room.id === ja.room.id);
a.send({ t: 'leave' }); await a.next('left');
const r2 = (await b2s.next('room', (m) => m.room.id === ja.room.id && m.room.players.length === 1)).room;
assert.equal(r2.players[0].name, 'Ben'); assert.equal(r2.players[0].seat, 1); assert.equal(r2.players[0].host, true);
b2s.send({ t: 'leave' }); await b2s.next('left');
a.send({ t: 'join', code: ja.room.code }); assert.match((await a.next('error', (m) => /No room/.test(m.message))).message, /No room/);

// ---- Milestone 3: payloads, removing an away player, abandoned games ----
{
	const tM = await register('Mia'); const tN = await register('Noa');
	const m = await open(tM); await m.next('hello'); const n = await open(tN); await n.next('hello');
	m.send({ t: 'create' }); const jm = await m.next('joined');
	n.send({ t: 'join', code: jm.room.code }); await n.next('joined');
	m.send({ t: 'start' }); await m.next('started'); await n.next('started');

	// numbers and trade offers pass through, anything else is dropped or rebuilt
	m.send({ t: 'act', a: { id: 'auctionbid', turn: 1, v: 120, evil: 'x' } });
	let act = await n.next('act'); assert.deepEqual(act.a, { id: 'auctionbid', turn: 1, v: 120 });
	m.send({ t: 'act', a: { id: 'mortgagebutton', turn: 1, check: 7 } });
	act = await n.next('act', (x) => x.a.id === 'mortgagebutton'); assert.equal(act.a.check, 7);
	const offer = { i: 1, r: 2, m: 50, p: Array.from({ length: 40 }, (_, k) => (k === 6 ? 1 : k === 8 ? -1 : 0)), cc: 0, ch: 0 };
	m.send({ t: 'act', a: { id: 'proposetradebutton', turn: 1, v: { ...offer, extra: 1 } } });
	act = await n.next('act', (x) => x.a.id === 'proposetradebutton'); assert.deepEqual(act.a.v, offer);
	m.send({ t: 'act', a: { id: 'proposetradebutton', turn: 1, v: { i: 1, p: [1] } } });
	act = await n.next('act', (x) => x.a.id === 'proposetradebutton' && x.seq > act.seq); assert.equal(act.a.v, undefined);
	m.send({ t: 'act', a: { id: 'forfeit', turn: 1 } }); assert.match((await m.next('error')).message, /Unknown action/);

	// someone who is online cannot be removed; someone away long enough can
	m.send({ t: 'forfeit', seat: 2 }); assert.match((await m.next('error', (x) => /Cannot|away/.test(x.message))).message, /away/);
	n.close(); await m.next('room', (x) => x.room.players[1].online === false);
	m.send({ t: 'forfeit', seat: 2, turn: 1 }); assert.match((await m.next('error', (x) => /away/.test(x.message))).message, /not away long enough/);
	await new Promise((r) => setTimeout(r, 450));
	m.send({ t: 'forfeit', seat: 2, turn: 2 });
	act = await m.next('act', (x) => x.a.id === 'forfeit'); assert.deepEqual(act.a, { id: 'forfeit', turn: 2, v: 2 });

	// the returning player replays everything, forfeit included
	const n2 = await open(tN); await n2.next('hello');
	n2.send({ t: 'join', gameId: jm.room.id, after: 0 });
	const back = await n2.next('joined'); assert.ok(back.actions.some((x) => x.a.id === 'forfeit'));

	// only the host may abandon
	n2.send({ t: 'abandon' }); assert.match((await n2.next('error')).message, /host/);
	m.send({ t: 'abandon' }); const ab = await m.next('ended'); assert.equal(ab.room.status, 'abandoned');
	await n2.next('ended');
	const g = (await call('GET', `/api/games/${jm.room.id}`, null, tM)).body.game;
	assert.equal(g.status, 'abandoned');
	assert.equal((await call('GET', '/api/games?status=abandoned', null, tM)).body.total, 1);
	assert.equal((await call('DELETE', `/api/games/${jm.room.id}`, null, tM)).status, 200);
	m.close(); n2.close();

	// a running game that nobody opens is abandoned by the server
	const tP = await register('Pia'); const tQ = await register('Quin');
	const p = await open(tP); await p.next('hello'); const qq = await open(tQ); await qq.next('hello');
	p.send({ t: 'create' }); const jp = await p.next('joined');
	qq.send({ t: 'join', code: jp.room.code }); await qq.next('joined');
	p.send({ t: 'start' }); await p.next('started');
	p.close(); qq.close();
	await new Promise((r) => setTimeout(r, 1500));
	assert.equal((await call('GET', `/api/games/${jp.room.id}`, null, tP)).body.game.status, 'abandoned');
}

// ---- admin: end a running online game for everybody ----
{
	const tR = await register('Rita'); const tS = await register('Sam'); const tRoot = await register('Root');
	const r1 = await open(tR); await r1.next('hello'); const s1 = await open(tS); await s1.next('hello');
	r1.send({ t: 'create' }); const jr = await r1.next('joined');
	s1.send({ t: 'join', code: jr.room.code }); await s1.next('joined');
	r1.send({ t: 'start' }); await r1.next('started'); await s1.next('started');
	const gid = jr.room.id;
	const ritaId = (await call('GET', '/api/me', null, tR)).body.user.id;

	assert.equal((await call('POST', `/api/admin/games/${gid}/abandon`, null, tS)).status, 403);   // players cannot
	assert.equal((await call('DELETE', `/api/admin/games/${gid}`, null, tRoot)).status, 409);       // a running game must be ended first
	assert.equal((await call('DELETE', `/api/admin/users/${ritaId}`, null, tRoot)).status, 409);    // ...and so must its players' accounts
	assert.ok((await call('GET', '/api/admin/stats', null, tRoot)).body.connected >= 2);
	assert.equal((await call('GET', `/api/admin/games?user=${ritaId}&status=active`, null, tRoot)).body.total, 1);

	assert.equal((await call('POST', `/api/admin/games/${gid}/abandon`, null, tRoot)).status, 200);
	assert.equal((await r1.next('ended')).room.status, 'abandoned');
	assert.equal((await s1.next('ended')).room.status, 'abandoned');
	assert.equal((await call('GET', `/api/games/${gid}`, null, tR)).body.game.status, 'abandoned');
	assert.equal((await call('POST', `/api/admin/games/${gid}/abandon`, null, tRoot)).status, 409);  // already over
	assert.equal((await call('DELETE', `/api/admin/games/${gid}`, null, tRoot)).status, 200);
	assert.equal((await call('GET', `/api/games/${gid}`, null, tR)).status, 404);
	r1.close(); s1.close();
	// Sam's seat in someone else's game is cleared (not left pointing at nobody) when an account is deleted
	assert.equal((await call('DELETE', `/api/admin/users/${ritaId}`, null, tRoot)).status, 200);
}

// rooms: private rooms with a password, the open-rooms list, one room per account, kicking players
{
	const [tH, tG, tK] = [await register('Hostie'), await register('Guesty'), await register('Kicky')];
	const roomPw = randomBytes(6).toString('hex'), wrongPw = randomBytes(6).toString('hex'), shortPw = randomBytes(1).toString('hex').slice(0, 1) + 'xy'; // a different value on every run
	const h = await open(tH), g = await open(tG), k = await open(tK);
	await h.next('hello'); await g.next('hello'); await k.next('hello');
	h.send({ t: 'create' }); const created = await h.next('joined');
	const code = created.room.code;
	assert.equal(created.room.isPrivate, false);                                              // public by default
	assert.ok((await call('GET', '/api/rooms', null, tG)).body.rooms.some((r) => r.code === code && !r.isPrivate));
	assert.ok(!(await call('GET', '/api/rooms', null, tH)).body.rooms.some((r) => r.code === code)); // not in the host's own list
	// only the host sets a password, 4+ characters; the hash never leaves the server
	g.send({ t: 'join', code }); await g.next('joined');
	g.send({ t: 'visibility', private: true, password: roomPw }); assert.match((await g.next('error')).message, /Only the host/);
	h.send({ t: 'visibility', private: true, password: shortPw }); assert.equal((await h.next('error')).code, 'password');
	h.send({ t: 'visibility', private: true, password: roomPw }); await h.next('room', (m) => m.room.isPrivate);
	assert.ok(!JSON.stringify(created).includes('pwHash'));
	// a new player needs the password
	k.send({ t: 'join', code }); assert.equal((await k.next('error')).code, 'password');
	k.send({ t: 'join', code, password: wrongPw }); assert.match((await k.next('error')).message, /Wrong password/);
	// the same account on a second device is refused while the first one is inside
	const g2 = await open(tG); await g2.next('hello');
	g2.send({ t: 'create' }); assert.equal((await g2.next('error')).code, 'busy');
	g2.send({ t: 'join', code }); assert.equal((await g2.next('error')).code, 'busy');
	g2.close();
	// kicking: host only, waiting room only, the player is told and cannot come back
	k.send({ t: 'join', code, password: roomPw }); await k.next('joined');
	const kickyId = (await call('GET', '/api/me', null, tK)).body.user.id;
	g.send({ t: 'kick', userId: kickyId }); assert.match((await g.next('error')).message, /Only the host/);
	h.send({ t: 'kick', userId: kickyId });
	assert.match((await k.next('kicked')).message, /removed you/);
	await g.next('room', (m) => m.room.players.length === 2);
	k.send({ t: 'join', code, password: roomPw }); assert.equal((await k.next('error')).code, 'kicked');
	h.close(); g.close(); k.close();
}

// the SPA fallback is only active when a build exists, API 404s stay JSON
assert.equal((await call('GET', '/api/nope')).status, 404);

console.log('all websocket tests passed');
for (const x of [a, b2s, c]) x.close();
server.close();
process.exit(0); // exit at once: the 200 ms test sweeper must not run against a closed database
