// Run: node server/test-ws.js  (uses Node's built-in WebSocket client)
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

const server = createApp(openDb(':memory:'), { secret: 'test-secret' });
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;
const call = async (method, path, body, token) => {
	const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
	return { status: r.status, body: await r.json() };
};
const register = async (name) => (await call('POST', '/api/auth/register', { name, email: `${name.toLowerCase()}@x.am`, password: 'password1' })).body.token;

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
				setTimeout(() => rej(new Error('timeout waiting for ' + type)), 3000);
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

// the SPA fallback is only active when a build exists, API 404s stay JSON
assert.equal((await call('GET', '/api/nope')).status, 404);

console.log('all websocket tests passed');
for (const x of [a, b2s, c]) x.close();
server.close();
setTimeout(() => process.exit(0), 100);
