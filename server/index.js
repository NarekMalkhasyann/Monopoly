import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';

const secret = process.env.JWT_SECRET || (console.warn('JWT_SECRET not set: using a random one (logins reset on restart)'), randomBytes(32).toString('hex'));
const port = Number(process.env.PORT) || 3001;
// After `npm run build` the API also serves the website from dist/ (used by `npm start`).
const dist = resolve('dist');
const staticDir = existsSync(dist) ? dist : undefined;
createApp(openDb(), { secret, staticDir }).listen(port, () => {
	console.log(`API + WebSocket on http://localhost:${port}${staticDir ? ' (serving dist/)' : ''}`);
});
