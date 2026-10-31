// WebSocket connection to the server (server/ws.js, server/rooms.js) and the state of
// the online room this player is in. Components read it with useOnline().
//
// Messages are JSON: { t: 'create' | 'join' | 'leave' | 'color' | 'start' | 'act' | 'log' | 'end', ... }
// and the server answers with 'hello', 'joined', 'room', 'started', 'act', 'ended', 'left', 'error'.
import { useSyncExternalStore } from 'react';
import { getToken, API_BASE } from './api.js';

let state = { conn: 'closed', room: null, you: null, error: '', left: false };
const listeners = new Set();
const actionListeners = new Set();
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
export const clearError = () => set({ error: '' });

function handle(msg) {
	switch (msg.t) {
		case 'joined':
			if (!state.room || state.room.id !== msg.room.id) lastSeq = 0;
			set({ room: msg.room, you: msg.you, error: '', left: false });
			if (pending) { pending.resolve(msg.room); pending = null; }
			for (const a of msg.actions || []) deliver(a);
			break;
		case 'room':
		case 'started':
		case 'ended':
			if (state.room && state.room.id === msg.room.id) set({ room: msg.room });
			break;
		case 'act':
			deliver(msg);
			break;
		case 'left':
			set({ room: null, you: null, left: true });
			break;
		case 'error':
			set({ error: msg.message });
			if (pending) { pending.reject(new Error(msg.message)); pending = null; }
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
			if (msg.t === 'hello') { set({ conn: 'open' }); opening = null; resolve(); return; }
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
						if (state.room) ws.send(JSON.stringify({ t: 'join', gameId: state.room.id, after: lastSeq }));
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
export const createRoom = () => request({ t: 'create' });
export const joinByCode = (code) => request({ t: 'join', code });
export const joinById = (gameId) => request({ t: 'join', gameId: Number(gameId), after: lastSeq });
export const leaveRoom = () => send({ t: 'leave' });
export const startRoom = () => send({ t: 'start' });
export const chooseColor = (color) => send({ t: 'color', color });
