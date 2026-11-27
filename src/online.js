// WebSocket connection to the server (server/ws.js, server/rooms.js) and the state of
// the online room this player is in. Components read it with useOnline().
//
// Messages are JSON: { t: 'create' | 'join' | 'leave' | 'color' | 'start' | 'act' | 'log' | 'end', ... }
// and the server answers with 'hello', 'joined', 'room', 'started', 'act', 'ended', 'left', 'error'.
import { useSyncExternalStore } from 'react';
import { getToken, API_BASE } from './api.js';
import { play } from './sound.js';

let state = { conn: 'closed', room: null, you: null, spectator: false, error: '', left: false, kicked: '', logged: 0 };
const listeners = new Set();
const actionListeners = new Set();
const roomsListeners = new Set();
let ws = null;
let opening = null;
let lastSeq = 0;
let retry = null;
let pending = null; // the caller waiting for the next 'joined' (or error)

function set(patch) {
	state = { ...state, ...patch };
	listeners.forEach((fn) => fn());
}
export const getOnline = () => state;
export function useOnline() {
	return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getOnline);
}
export const onAction = (fn) => { actionListeners.add(fn); return () => actionListeners.delete(fn); };
const auctionListeners = new Set();
export const onAuctionMessage = (fn) => { auctionListeners.add(fn); return () => auctionListeners.delete(fn); };
export const clearError = () => set({ error: '' });

function handle(msg) {
	switch (msg.t) {
		case 'joined':
			if (!state.room || state.room.id !== msg.room.id) lastSeq = 0;
			set({ room: msg.room, you: msg.you, spectator: !!msg.spectator, error: '', left: false, logged: msg.logged || 0 });
			if (pending) { pending.resolve(msg.room); pending = null; }
			for (const a of msg.actions || []) deliver(a);
			// joined in the middle of a live auction: tell the game how much time is left (applied after the backlog)
			if (msg.auction) actionListeners.forEach((fn) => fn({ seq: 0, seat: 0, a: { id: 'aucsync', turn: 0, n: msg.auction.n, v: msg.auction.high, rem: msg.auction.remMs } }));
			break;
		case 'room':
		case 'started':
		case 'ended':
			if (state.room && state.room.id === msg.room.id) {
				const before = state.room;
				if (msg.t === 'room' && before.status === 'waiting' && msg.room.status === 'waiting') { // lobby: somebody came or went
					const ids = (r) => new Set(r.players.map((p) => p.userId));
					const was = ids(before), now = ids(msg.room);
					if ([...now].some((u) => !was.has(u))) play('join'); else if ([...was].some((u) => !now.has(u))) play('leave');
				}
				if (msg.t === 'started' && before.status === 'waiting') play('start');
				set({ room: msg.room });
			}
			break;
		case 'act':
			deliver(msg);
			break;
		case 'kicked':
			set({ room: null, you: null, left: true, kicked: msg.message || 'You were removed from the room.' });
			break;
		case 'left':
			set({ room: null, you: null, spectator: false, left: true });
			break;
		case 'rooms-changed':
			roomsListeners.forEach((fn) => fn());
			break;
		case 'error':
			if (msg.code === 'auction-low') { auctionListeners.forEach((fn) => fn(msg.message)); break; } // "Someone bid higher": shown on the auction itself
			set({ error: msg.message });
			if (pending) { const e = new Error(msg.message); e.code = msg.code || ''; pending.reject(e); pending = null; }
			break;
		default:
	}
}

function deliver(a) {
	if (a.seq <= lastSeq) return;
	lastSeq = a.seq;
	actionListeners.forEach((fn) => fn(a));
}

function open() {
	if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
	if (opening) return opening;
	set({ conn: 'connecting' });
	opening = new Promise((resolve, reject) => {
		const origin = API_BASE ? new URL(API_BASE) : window.location;
		const proto = origin.protocol === 'https:' ? 'wss' : 'ws';
		const socket = new WebSocket(`${proto}://${origin.host}/ws?token=${encodeURIComponent(getToken() || '')}`);
		ws = socket;
		socket.onmessage = (e) => {
			let msg;
			try { msg = JSON.parse(e.data); } catch { return; }
			if (msg.t === 'hello') { set({ conn: 'open' }); opening = null; resolve(); checkVersion(); return; }
			handle(msg);
		};
		socket.onclose = () => {
			if (ws === socket) ws = null;
			opening = null;
			set({ conn: 'closed' });
			reject(new Error('closed'));
			// Lost connection while in a room: reconnect and ask for what we missed.
			if (state.room && !state.left && !retry) {
				retry = setTimeout(async () => {
					retry = null;
					try {
						await open();
						if (state.room) ws.send(JSON.stringify({ t: state.spectator ? 'watch' : 'join', gameId: state.room.id, after: lastSeq }));
					} catch { /* onclose schedules the next try */ }
				}, 1500);
			}
		};
	});
	opening.catch(() => {});
	return opening;
}

export async function send(msg) {
	await open();
	ws.send(JSON.stringify(msg));
}

// Sends a message and resolves with the room once the server confirms we are in it.
function request(msg) {
	return new Promise((resolve, reject) => {
		pending = { resolve, reject };
		send(msg).catch(() => { pending = null; reject(new Error('Cannot reach the server. Is it running?')); });
	});
}
// Starting a new join clears the old "you were removed" notice, otherwise the Play page would keep sending the player away
const fresh = (fn) => (...a) => { if (state.kicked) set({ kicked: '' }); return fn(...a); };
export const createRoom = fresh(() => request({ t: 'create' }));
export const joinByCode = fresh((code, password) => request({ t: 'join', code, ...(password ? { password } : {}) }));
export const kickPlayer = (userId) => send({ t: 'kick', userId });
export const clearKicked = () => set({ kicked: '' });
export const setVisibility = (isPrivate, password) => send({ t: 'visibility', private: !!isPrivate, password: password || '' });
// The open-rooms list: calls fn when the server says it may have changed (keeps the socket open while watching).
export function watchRooms(fn) {
	roomsListeners.add(fn);
	open().catch(() => {});
	return () => roomsListeners.delete(fn);
}
export const joinById = fresh((gameId) => request({ t: 'join', gameId: Number(gameId), after: lastSeq }));
// Watch a running game (read only). Rooms that can not be watched answer with an error.
export const watchGame = fresh((gameId) => request({ t: 'watch', gameId: Number(gameId), after: lastSeq }));
export const leaveRoom = () => send({ t: 'leave' });
export const startRoom = () => send({ t: 'start' });
export const chooseColor = (color) => send({ t: 'color', color });

// A tab that stays open across an update keeps running the old code next to a newer server (and a newer game engine
// after a reload). Compare this page's own bundle with what the site serves now and say so, once.
let versionShown = false;
async function checkVersion() {
	if (versionShown) return;
	try {
		const mine = [...document.querySelectorAll('script[src*="/assets/"]')].map((x) => new URL(x.src).pathname);
		if (!mine.length) return; // dev server: no hashed bundle
		const res = await fetch('/api/version', { cache: 'no-store' });
		const { assets } = await res.json();
		if (!assets.length || mine.every((m) => assets.includes(m))) return;
		versionShown = true;
		const bar = document.createElement('div');
		bar.id = 'new-version';
		bar.setAttribute('role', 'alert');
		bar.innerHTML = '<span>A new version of the game is available.</span><button type="button">Refresh</button>';
		bar.querySelector('button').onclick = () => location.reload();
		document.body.appendChild(bar);
	} catch { /* offline: nothing to say */ }
}
