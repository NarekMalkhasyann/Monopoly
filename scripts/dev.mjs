// Starts the API and the Vite dev server together: npm run dev:all
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const procs = [run('node', ['server/index.js']), run('npx', ['vite'])];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
procs.forEach((p) => p.on('exit', stop));
