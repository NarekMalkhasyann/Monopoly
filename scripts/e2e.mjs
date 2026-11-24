// Browser smoke test: starts the server on a spare port with a throw-away database, opens the built site in a real
// browser, starts a local game and rolls the dice.
//
//   npm run build && npm run test:e2e
//
// Needs Playwright (not a project dependency):  npm i --no-save playwright && npx playwright install chromium
// or point PLAYWRIGHT_MODULE at an existing copy, e.g. PLAYWRIGHT_MODULE=/opt/npm-tools/node_modules/playwright
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

if (!existsSync('dist/index.html')) { console.error('Run "npm run build" first.'); process.exit(1); }
let chromium;
try { ({ chromium } = process.env.PLAYWRIGHT_MODULE ? createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE) : await import('playwright')); }
catch { console.error('Playwright is missing: npm i --no-save playwright && npx playwright install chromium'); process.exit(1); }

const PORT = 18000 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${PORT}`;
const dbFile = join(mkdtempSync(join(tmpdir(), 'monopoly-e2e-')), 'e2e.db');
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile }, stdio: 'ignore' });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const done = async (browser) => { if (browser) await browser.close().catch(() => {}); server.kill(); process.exit(failed ? 1 : 0); };

let browser;
try {
	for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/health').catch(() => fetch(base + '/'))).ok) break; } catch { /* not up yet */ } await wait(250); }
	const password = randomBytes(12).toString('hex');
	const reg = await (await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tester', email: `t${Date.now()}@example.com`, password }) })).json();
	const db = new DatabaseSync(dbFile); db.exec("UPDATE users SET role='player'"); db.close(); // new accounts wait for approval

	browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	const errors = [], outside = [];
	ctx.on('request', (q) => { if (/googleapis\.com\/ajax/.test(q.url())) outside.push(q.url()); });
	await ctx.route('**/fonts.googleapis.com/**', (q) => q.fulfill({ body: '', contentType: 'text/css' })); // sandboxes without internet
	await ctx.addInitScript((tk) => localStorage.setItem('yerevanpoly.token', tk), reg.token);
	const p = await ctx.newPage();
	p.on('pageerror', (e) => errors.push(e.message));

	await p.goto(base + '/play');
	await p.waitForSelector('text=New local game');
	check(await p.evaluate(() => typeof window.jQuery) === 'function', 'jQuery is loaded');
	check(outside.length === 0, 'jQuery comes from the site, not from a CDN');

	await p.click('text=New local game');
	await p.click('text=Start Game');
	await p.waitForSelector('#nextbutton', { state: 'visible', timeout: 15000 });
	check(await p.evaluate(() => document.querySelectorAll('#board .cell').length) >= 40, 'the board has its 40 squares');
	check(await p.evaluate(() => window.pcount) === 4, 'four players are in the game');

	await p.click('#nextbutton'); // Roll Dice
	await p.waitForFunction(() => /rolled \d+/.test(document.getElementById('alert')?.innerText || document.body.innerText), null, { timeout: 15000 }).catch(() => {});
	await wait(2500); // the piece walks square by square
	const moved = await p.evaluate(() => window.player[1].position > 0 || window.player[1].jail);
	check(moved, 'the first player moved after rolling');
	check(await p.evaluate(() => document.querySelectorAll('#token-layer .tk').length) === 4, 'four pieces are drawn on the board');
	check(errors.length === 0, 'no JavaScript errors' + (errors.length ? ': ' + errors[0] : ''));
} catch (e) { console.error(e.message); failed++; }
await done(browser);
