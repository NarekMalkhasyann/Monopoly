// Saves a running game to the server and restores it later.
//
// How it works
//  - The engine (public/engine/monopoly.js) calls four hooks on `window`:
//      onTurnStart()          between two turns -> we take a snapshot and upload it
//      onGameEvent(text)      every line of the game feed -> kept for the history log
//      onPlayerEliminated(n)  a player went bankrupt -> used for the final ranking
//      onGameEnd(winner)      only one player left -> we upload the result
//  - A snapshot is the plain data the engine keeps (players, squares, card decks).
//    Restoring copies it back and calls the engine's own play(), so the board,
//    money bar and AI turns are drawn by the same code that draws a normal turn.
//  - Uploads are queued one after another. If the network fails, the data stays
//    in memory and is sent with the next checkpoint.

import { api } from './api.js';

const PLAYER_FIELDS = ['name', 'color', 'position', 'money', 'creditor', 'jail', 'jailroll',
	'communityChestJailCard', 'chanceJailCard', 'bidding', 'human'];
const SQUARE_FIELDS = ['owner', 'mortgage', 'house', 'hotel', 'landcount'];

const win = window;

// ---- state of the current session --------------------------------------
let gameId = null;        // server id (null until the first checkpoint creates it)
let seats = [];           // [{ seat, name }] as stored on the server
let turnNo = 0;           // how many turns have started in this game (all sessions)
let events = [];          // log lines not uploaded yet
let eliminated = [];      // names, in the order they went bankrupt
let ended = false;
let chain = Promise.resolve();
let status = 'idle';      // idle | saving | saved | offline
const listeners = new Set();

function setStatus(s) {
	status = s;
	listeners.forEach((fn) => fn(s));
}
export function subscribeStatus(fn) {
	listeners.add(fn);
	fn(status);
	return () => listeners.delete(fn);
}

// ---- snapshot / restore -------------------------------------------------
export function takeSnapshot() {
	const players = [];
	for (let i = 1; i <= win.pcount; i++) {
		const p = win.player[i];
		const copy = { ai: !p.human };
		PLAYER_FIELDS.forEach((f) => { copy[f] = p[f]; });
		players.push(copy);
	}
	return {
		v: 1,
		turnNo,
		eliminated: [...eliminated],
		pcount: win.pcount,
		turn: win.turn,
		doublecount: win.doublecount,
		players,
		squares: win.square.map((s) => Object.fromEntries(SQUARE_FIELDS.map((f) => [f, s[f]]))),
		communityChest: { deck: [...win.communityChestCards.deck], index: win.communityChestCards.index },
		chance: { deck: [...win.chanceCards.deck], index: win.chanceCards.index },
	};
}

function applySnapshot(snap) {
	win.AITest.count = 0;
	win.pcount = snap.pcount;
	win.turn = snap.turn;
	win.doublecount = snap.doublecount;
	snap.players.forEach((saved, i) => {
		const p = win.player[i + 1];
		PLAYER_FIELDS.forEach((f) => { p[f] = saved[f]; });
		p.index = i + 1;
		if (saved.ai) {
			p.AI = new win.AITest(p);
			p.name = saved.name; // the AI constructor picks a new name; keep the saved one
		} else {
			delete p.AI;
		}
	});
	snap.squares.forEach((saved, i) => Object.assign(win.square[i], saved));
	win.communityChestCards.deck = [...snap.communityChest.deck];
	win.communityChestCards.index = snap.communityChest.index;
	win.chanceCards.deck = [...snap.chance.deck];
	win.chanceCards.index = snap.chance.index;
}

// ---- upload queue -------------------------------------------------------
function enqueue(job) {
	chain = chain.then(job).catch(() => { /* handled inside the job */ });
	return chain;
}

async function ensureGame() {
	if (gameId) return;
	const players = [];
	for (let i = 1; i <= win.pcount; i++) {
		const p = win.player[i];
		players.push({ name: p.name, color: p.color, ai: !p.human });
	}
	const { game } = await api('POST', '/games', { mode: 'local', edition: 'classic', players });
	gameId = game.id;
	seats = game.players.map((p) => ({ seat: p.seat, name: p.name }));
}

function checkpoint(snapshot) {
	return enqueue(async () => {
		if (ended) return;
		setStatus('saving');
		const batch = events.splice(0);
		try {
			await ensureGame();
			await api('PUT', `/games/${gameId}/checkpoint`, { snapshot, turn_count: snapshot.turnNo, events: batch });
			setStatus('saved');
		} catch (e) {
			events = batch.concat(events); // keep them for the next try
			setStatus('offline');
		}
	});
}

function finish(winner) {
	return enqueue(async () => {
		const batch = events.splice(0);
		try {
			await ensureGame();
			const order = [winner, ...[...eliminated].reverse()]; // rank 1, 2, 3...
			const used = new Set();
			const results = order.map((name, i) => {
				const seat = seats.find((s) => s.name === name && !used.has(s.seat));
				if (seat) used.add(seat.seat);
				const live = i === 0 ? win.player[1] : null;
				return seat && { seat: seat.seat, rank: i + 1, money: live ? live.money : 0 };
			}).filter(Boolean);
			await api('POST', `/games/${gameId}/finish`, { winner_name: winner, turn_count: turnNo, players: results, events: batch });
			setStatus('saved');
		} catch (e) {
			events = batch.concat(events);
			setStatus('offline');
		}
	});
}

// ---- hooks the engine calls ---------------------------------------------
win.onTurnStart = () => {
	if (ended) return;
	turnNo += 1;
	checkpoint(takeSnapshot());
};
win.onGameEvent = (text) => {
	events.push({ type: 'alert', turn: turnNo, text: String(text).slice(0, 500) });
};
win.onPlayerEliminated = (name) => { eliminated.push(name); };
win.onGameEnd = (winner) => {
	ended = true;
	finish(winner);
};

// ---- called by the screens ----------------------------------------------
// Continue a game from the server. Returns after the engine has drawn the turn.
export function resumeGame(game) {
	const snap = game.snapshot;
	if (!snap) throw new Error('This game has no saved position yet.');
	gameId = game.id;
	seats = game.players.map((p) => ({ seat: p.seat, name: p.name }));
	turnNo = Math.max((snap.turnNo || 1) - 1, 0); // play() below starts this turn again and counts it
	eliminated = snap.eliminated || [];
	ended = false;
	events = [];

	applySnapshot(snap);
	const $ = win.$;
	$('#setup, #noF5').hide();
	$('#board, #moneybar').show();
	const stats = document.getElementById('stats');
	if (snap.pcount === 2) stats.style.width = '454px';
	else if (snap.pcount === 3) stats.style.width = '686px';
	stats.style.top = '0px';
	stats.style.left = '0px';
	win.play(); // draws the turn exactly like a normal turn change
}
