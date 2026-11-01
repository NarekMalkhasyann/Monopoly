// Run: node server/test.js
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

process.env.ALLOWED_ORIGIN = 'https://game.example.am/';
const db = await openDb(process.env.TEST_DATABASE_URL || ':memory:');
const server = createApp(db, { secret: 'test-secret' });
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const call = async (method, path, body, token) => {
	const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
	return { status: r.status, body: await r.json() };
};

let r = await call('POST', '/api/auth/register', { name: 'Anna', email: 'a@x.am', password: 'short' });
assert.equal(r.status, 400);
r = await call('POST', '/api/auth/register', { name: 'Anna', email: 'a@x.am', password: 'password1' });
assert.equal(r.status, 201);
const tokenA = r.body.token;
assert.equal((await call('POST', '/api/auth/register', { name: 'Anna', email: 'A@x.am', password: 'password1' })).status, 409);
assert.equal((await call('POST', '/api/auth/login', { email: 'a@x.am', password: 'wrongwrong' })).status, 401);
r = await call('POST', '/api/auth/login', { email: 'a@x.am', password: 'password1' });
assert.equal(r.status, 200);
assert.equal((await call('GET', '/api/me', null, r.body.token)).body.user.email, 'a@x.am');
assert.equal((await call('GET', '/api/me')).status, 401);
assert.equal((await call('GET', '/api/me', null, tokenA + 'x')).status, 401);

const players = [{ name: 'Anna', color: 'red' }, { name: 'AI Test 1', color: 'blue', ai: true }];
assert.equal((await call('POST', '/api/games', { mode: 'local', players: [players[0]] }, tokenA)).status, 400);
r = await call('POST', '/api/games', { mode: 'local', players }, tokenA);
assert.equal(r.status, 201);
const id = r.body.game.id;
assert.equal(r.body.game.players.length, 2);

r = await call('PUT', `/api/games/${id}/checkpoint`, { snapshot: { turn: 2 }, turn_count: 2, events: [{ type: 'alert', turn: 1, text: 'Anna rolled 7' }] }, tokenA);
assert.equal(r.status, 200);
r = await call('PUT', `/api/games/${id}/checkpoint`, { snapshot: { turn: 3 }, turn_count: 3, events: [{ type: 'alert', turn: 2, text: 'AI bought Baltic' }] }, tokenA);
r = await call('GET', `/api/games/${id}`, null, tokenA);
assert.equal(r.body.game.events.length, 2);
assert.deepEqual(r.body.game.snapshot, { turn: 3 });

// Another user cannot see or change it
const tokenB = (await call('POST', '/api/auth/register', { name: 'Ben', email: 'b@x.am', password: 'password2' })).body.token;
assert.equal((await call('GET', `/api/games/${id}`, null, tokenB)).status, 404);
assert.equal((await call('DELETE', `/api/games/${id}`, null, tokenB)).status, 404);
assert.equal((await call('GET', '/api/games', null, tokenB)).body.total, 0);

assert.equal((await call('GET', '/api/games?status=active', null, tokenA)).body.total, 1);
r = await call('POST', `/api/games/${id}/finish`, { winner_name: 'Anna', turn_count: 40, players: [{ seat: 1, money: 3200, rank: 1 }, { seat: 2, money: 0, rank: 2 }] }, tokenA);
assert.equal(r.body.game.status, 'finished');
assert.equal(r.body.game.players[0].final_rank, 1);
assert.equal((await call('PUT', `/api/games/${id}/checkpoint`, { snapshot: {} }, tokenA)).status, 409);
assert.equal((await call('GET', '/api/games?status=active', null, tokenA)).body.total, 0);
assert.equal((await call('GET', '/api/games?status=finished&mode=local', null, tokenA)).body.total, 1);
assert.equal((await call('DELETE', `/api/games/${id}`, null, tokenA)).status, 200);
assert.equal((await call('GET', `/api/games/${id}`, null, tokenA)).status, 404);
// ---- History filters ----
{
	const mk = async (names, turns) => {
		const g = (await call('POST', '/api/games', { players: names.map((n) => ({ name: n, color: 'red' })) }, tokenA)).body.game;
		await call('PUT', `/api/games/${g.id}/checkpoint`, { snapshot: { a: 1 }, turn_count: turns, events: [] }, tokenA);
		return g.id;
	};
	const g1 = await mk(['Zed', 'Yan'], 5); const g2 = await mk(['Quill', 'Ruth'], 40);
	await call('POST', `/api/games/${g2}/finish`, { winner_name: 'Ruth', turn_count: 41, players: [] }, tokenA);
	const list = async (qs) => (await call('GET', `/api/games?${qs}`, null, tokenA)).body;
	assert.deepEqual((await list('q=zed')).games.map((g) => g.id), [g1]);
	assert.deepEqual((await list('q=RUTH')).games.map((g) => g.id), [g2]);          // players and winner, any case
	assert.equal((await list('q=%25')).total, 0);                                   // % is text, not a wildcard
	assert.equal((await list('q=nobody')).total, 0);
	assert.deepEqual((await list('q=ruth&status=active')).games, []);
	assert.deepEqual((await list('sort=turns&dir=desc&limit=2')).games.map((g) => g.id), [g2, g1]);
	assert.deepEqual((await list('sort=turns&dir=asc&limit=1')).games.map((g) => g.id), [(await list('sort=turns&dir=asc&limit=1')).games[0].id]);
	assert.equal((await list('from=2999-01-01')).total, 0);
	assert.equal((await list('to=2000-01-01')).total, 0);
	const today = new Date().toISOString().slice(0, 10);
	assert.ok((await list(`from=${today}&to=${today}`)).total >= 2);
	assert.equal((await list('status=bogus')).total, (await list('')).total);        // unknown filter values are ignored
}
// the website on another address (Vercel) may call the API, nobody else
assert.equal((await call('GET', '/api/health')).body.ok, true);
{
	const ok = await fetch(base + '/api/health', { headers: { Origin: 'https://game.example.am' } });
	assert.equal(ok.headers.get('access-control-allow-origin'), 'https://game.example.am');
	const no = await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } });
	assert.equal(no.headers.get('access-control-allow-origin'), null);
	const pre = await fetch(base + '/api/games', { method: 'OPTIONS', headers: { Origin: 'https://game.example.am', 'Access-Control-Request-Method': 'GET' } });
	assert.equal(pre.status, 204);
}
console.log('all server tests passed');
server.close();
await db.close();
