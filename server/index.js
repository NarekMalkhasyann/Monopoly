import { randomBytes } from 'node:crypto';
import { openDb } from './db.js';
import { createApp } from './app.js';

const secret = process.env.JWT_SECRET || (console.warn('JWT_SECRET not set: using a random one (logins reset on restart)'), randomBytes(32).toString('hex'));
const port = Number(process.env.PORT) || 3001;
createApp(openDb(), { secret }).listen(port, () => console.log(`API on http://localhost:${port}`));
