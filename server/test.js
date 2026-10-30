// Run: node server/test.js
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

const server = createApp(openDb(':memory:'), { secret: 'test-secret' });
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
console.log('all server tests passed');
server.close();
