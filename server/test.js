// Run: node server/test.js
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { createApp } from './app.js';

process.env.ALLOWED_ORIGIN = 'https://game.example.am/';
process.env.ADMIN_EMAILS = ' Boss@x.am , nobody@x.am ';
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

	// advanced filters
	const ids = async (qs) => (await list(qs)).games.map((g) => g.id).sort((a, b) => a - b);
	assert.deepEqual(await ids('player=quill'), [g2]);                              // a player's name only (not the winner field)
	assert.deepEqual(await ids('winner=ruth'), [g2]);
	assert.deepEqual(await ids('winner=zed'), []);                                 // Zed plays in g1 but won nothing
	assert.equal((await list('player=%25')).total, 0);                              // % is text here too
	assert.equal((await list('room=zzzzz')).total, 0);
	assert.ok((await ids('minTurns=30')).includes(g2) && !(await ids('minTurns=30')).includes(g1));
	assert.ok((await ids('maxTurns=10')).includes(g1) && !(await ids('maxTurns=10')).includes(g2));
	assert.deepEqual(await ids('minTurns=6&maxTurns=39'), []);                      // between the two
	assert.ok((await ids('size=2')).includes(g1));
	assert.equal((await list('size=7')).total, 0);
	assert.equal((await list('minTurns=abc&maxTurns=')).total, (await list('')).total); // garbage is ignored
	assert.ok((await ids('ai=no')).includes(g1));
	assert.equal((await list('ai=yes')).total, 0);
	// my result: only where my account sits at a seat (online games); set up here by hand
	const meId = (await call('GET', '/api/me', null, tokenA)).body.user.id;
	await db.run('UPDATE game_players SET user_id = ?, final_rank = 1 WHERE game_id = ? AND seat = 2', [meId, g2]);
	assert.deepEqual(await ids('result=won'), [g2]);
	assert.deepEqual(await ids('result=lost'), []);
	await db.run('UPDATE game_players SET final_rank = 2 WHERE game_id = ? AND seat = 2', [g2]);
	assert.deepEqual(await ids('result=won'), []);
	assert.deepEqual(await ids('result=lost'), [g2]);
	assert.deepEqual(await ids('result=lost&player=ruth&minTurns=40'), [g2]);       // filters combine
	assert.deepEqual(await ids('result=lost&status=active'), []);
	await db.run('UPDATE game_players SET user_id = NULL, final_rank = NULL WHERE game_id = ? AND seat = 2', [g2]);
}
// ---- admin panel ----
{
	// players cannot reach it, and a role in the list is applied when that person signs up
	assert.equal((await call('GET', '/api/admin/stats')).status, 401);
	assert.equal((await call('GET', '/api/admin/stats', null, tokenA)).status, 403);
	assert.equal((await call('GET', '/api/admin/users', null, tokenA)).status, 403);
	assert.equal((await call('GET', '/api/admin/games', null, tokenA)).status, 403);
	assert.equal((await call('GET', '/api/me', null, tokenA)).body.user.role, 'player');
	r = await call('POST', '/api/auth/register', { name: 'Boss', email: 'boss@x.am', password: 'password3' });
	assert.equal(r.body.user.role, 'admin');
	const tokenX = r.body.token;
	const bossId = r.body.user.id;

	// a game by Anna (local) that the admin can see in full
	const gid = (await call('POST', '/api/games', { players: [{ name: 'Anna', color: 'red' }, { name: 'Zoe', color: 'blue' }] }, tokenA)).body.game.id;
	await call('PUT', `/api/games/${gid}/checkpoint`, { snapshot: { a: 1 }, turn_count: 7, events: [{ type: 'alert', turn: 1, text: 'Anna rolled 5' }] }, tokenA);
	assert.equal((await call('GET', `/api/games/${gid}`, null, tokenB)).status, 404);          // other players still cannot
	r = await call('GET', `/api/games/${gid}`, null, tokenX);
	assert.equal(r.status, 200);
	assert.equal(r.body.game.owner.email, 'a@x.am');
	assert.equal(r.body.game.events.length, 1);

	r = await call('GET', '/api/admin/stats', null, tokenX);
	assert.equal(r.status, 200);
	assert.equal(r.body.users.total, 3);
	assert.equal(r.body.users.admins, 1);
	assert.ok(r.body.games.total >= 3 && r.body.games.active >= 1);
	assert.equal(r.body.gamesPerDay.length, 14);
	assert.ok(r.body.gamesPerDay[13].n >= 3);                                                    // today is the last bar
	assert.equal(r.body.signupsPerDay.reduce((a, d) => a + d.n, 0), 3);

	r = await call('GET', '/api/admin/users', null, tokenX);
	assert.equal(r.body.total, 3);
	const anna = r.body.users.find((u) => u.email === 'a@x.am');
	assert.ok(anna.games >= 3 && anna.last_active);
	assert.equal(r.body.users.find((u) => u.email === 'b@x.am').games, 0);
	assert.equal(r.body.users.find((u) => u.email === 'b@x.am').last_active, null);
	assert.deepEqual((await call('GET', '/api/admin/users?q=BEN', null, tokenX)).body.users.map((u) => u.name), ['Ben']);
	assert.deepEqual((await call('GET', '/api/admin/users?q=x.am&role=admin', null, tokenX)).body.users.map((u) => u.name), ['Boss']);
	assert.equal((await call('GET', '/api/admin/users?q=%25', null, tokenX)).body.total, 0);
	assert.deepEqual((await call('GET', '/api/admin/users?sort=name&dir=asc&limit=2', null, tokenX)).body.users.map((u) => u.name), ['Anna', 'Ben']);
	assert.equal((await call('GET', '/api/admin/users?sort=games&dir=desc&limit=1', null, tokenX)).body.users[0].name, 'Anna');
	assert.equal((await call('GET', `/api/admin/users/${anna.id}`, null, tokenX)).body.user.email, 'a@x.am');
	assert.equal((await call('GET', '/api/admin/users/99999', null, tokenX)).status, 404);

	// every game, filtered by user / text / owner name
	r = await call('GET', '/api/admin/games', null, tokenX);
	assert.ok(r.body.total >= 3);
	assert.ok(r.body.games.every((g) => g.owner && g.owner.email === 'a@x.am'));
	assert.equal((await call('GET', `/api/admin/games?user=${anna.id}`, null, tokenX)).body.total, r.body.total);
	assert.equal((await call('GET', `/api/admin/games?user=${bossId}`, null, tokenX)).body.total, 0);
	assert.deepEqual((await call('GET', '/api/admin/games?q=zoe', null, tokenX)).body.games.map((g) => g.id), [gid]);
	assert.equal((await call('GET', '/api/admin/games?q=a@x.am', null, tokenX)).body.total, r.body.total); // the owner's e-mail finds their games
	assert.equal((await call('GET', '/api/admin/games?status=active', null, tokenX)).body.games.every((g) => g.status === 'active'), true);

	// roles: promote, demote, never yourself, only known roles
	assert.equal((await call('PUT', `/api/admin/users/${bossId}`, { role: 'player' }, tokenX)).status, 409);
	assert.equal((await call('DELETE', `/api/admin/users/${bossId}`, null, tokenX)).status, 409);
	const benId = (await call('GET', '/api/me', null, tokenB)).body.user.id;
	assert.equal((await call('PUT', `/api/admin/users/${benId}`, { role: 'king' }, tokenX)).status, 400);
	assert.equal((await call('PUT', `/api/admin/users/${benId}`, { role: 'admin' }, tokenX)).body.user.role, 'admin');
	assert.equal((await call('GET', '/api/admin/stats', null, tokenB)).status, 200);              // takes effect at once
	assert.equal((await call('PUT', `/api/admin/users/${benId}`, { role: 'player' }, tokenX)).body.user.role, 'player');
	assert.equal((await call('GET', '/api/admin/stats', null, tokenB)).status, 403);
	assert.equal((await call('PUT', `/api/admin/users/${benId}`, { role: 'admin' }, tokenA)).status, 403);

	// delete one game, then a whole user with their games
	assert.equal((await call('DELETE', `/api/admin/games/${gid}`, null, tokenA)).status, 403);
	assert.equal((await call('DELETE', `/api/admin/games/${gid}`, null, tokenX)).status, 200);
	assert.equal((await call('DELETE', `/api/admin/games/${gid}`, null, tokenX)).status, 404);
	assert.equal((await call('POST', `/api/admin/games/${gid}/abandon`, null, tokenX)).status, 409);  // not an online game
	assert.equal((await call('DELETE', `/api/admin/users/${benId}`, null, tokenX)).status, 200);
	assert.equal((await call('GET', '/api/me', null, tokenB)).status, 401);                        // deleted users are signed out
	assert.equal((await call('DELETE', `/api/admin/users/${anna.id}`, null, tokenX)).status, 200);
	assert.equal((await call('GET', '/api/admin/games', null, tokenX)).body.total, 0);
	assert.equal((await call('GET', '/api/admin/users', null, tokenX)).body.total, 1);
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
