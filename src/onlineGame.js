// Runs an online game on top of the (unchanged) engine in public/engine.
//
// Every player's browser runs the whole engine. What they share is a list of button
// clicks, in the order the server numbered them:
//
//   1. The player whose turn it is clicks a shared button (Roll, End turn, Buy, OK...).
//   2. Our capture-phase listener below stops that click and sends it to the server.
//   3. The server numbers it and sends it to everyone, the sender included.
//   4. Each browser "presses" the same button, in order, via the queue below.
//
// All randomness (dice, card shuffles, turn order) comes from one seeded generator
// that the server hands out, so the same clicks give the same game everywhere.
import { onAction, send, getOnline } from './online.js';
import { trackOnline } from './session.js';

// Buttons whose clicks are shared (keep in sync with RELAYED in server/rooms.js).
const RELAYED = new Set(['nextbutton', 'popupclose', 'popupyes', 'popupno',
	'buybutton', 'payfiftybutton', 'gojfbutton', 'resignbutton']);
// Not available online yet (Milestone 3): they would need extra state to be shared.
const LATER = new Set(['manage-menu-item', 'trade-menu-item', 'buyhousebutton', 'mortgagebutton', 'sellhousebutton']);

const win = window;
const queue = [];
let started = false;
let myIndex = 0;         // my player number inside the engine
let bypass = false;      // true while we press a button for a relayed action
let timer = null;
let waitingSince = 0;
let savedDice = null;
let info = { myTurn: false, turnName: '', desync: false, me: '' };
const infoListeners = new Set();

export const getGameInfo = () => info;
export function subscribeGameInfo(fn) {
	infoListeners.add(fn);
	fn(info);
	return () => infoListeners.delete(fn);
}
function setInfo(patch) {
	const next = { ...info, ...patch };
	if (Object.keys(next).every((k) => next[k] === info[k])) return;
	info = next;
	infoListeners.forEach((fn) => fn(info));
}

// Small, fast seeded generator (mulberry32). Same seed -> same numbers in every browser.
function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function toast(text) {
	let el = document.getElementById('online-toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'online-toast';
		el.setAttribute('role', 'status');
		document.body.appendChild(el);
	}
	el.textContent = text;
	el.classList.add('show');
	clearTimeout(toast.t);
	toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

const isVisible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

// ---- sending: stop the click, share it instead -------------------------------
function onClickCapture(e) {
	if (!started || bypass || !(e.target instanceof Element)) return;
	const holder = e.target.closest('[id]');
	const id = holder && holder.id;
	if (!id) return;
	if (LATER.has(id)) {
		e.preventDefault();
		e.stopImmediatePropagation();
		toast('Managing properties and trading are not available online yet.');
		return;
	}
	if (!RELAYED.has(id)) return;
	e.preventDefault();
	e.stopImmediatePropagation();
	if (win.turn !== myIndex) {
		toast(`It is ${win.player[win.turn].name}'s turn.`);
		return;
	}
	send({ t: 'act', a: { id, turn: win.turn } }).catch(() => toast('Connection lost. Reconnecting...'));
}

// ---- receiving: press the same button, in the server's order -----------------
function tick() {
	const m = queue[0];
	if (!m) { restoreFast(); return; }

	// A long backlog (rejoining) is replayed without animations.
	if (queue.length > 1) {
		if (win.jQuery) win.jQuery.fx.off = true;
		if (win.animateDice && !savedDice) { savedDice = win.animateDice; win.animateDice = undefined; }
	} else {
		restoreFast();
	}

	const el = document.getElementById(m.a.id);
	if (!el || el.disabled || !isVisible(el)) {
		// The engine is not ready for this click yet (dice still rolling, pop-up fading in).
		if (!waitingSince) waitingSince = Date.now();
		if (Date.now() - waitingSince > 12000) setInfo({ desync: true });
		return;
	}
	waitingSince = 0;
	queue.shift();
	if (m.a.turn && win.turn !== m.a.turn) setInfo({ desync: true });
	bypass = true;
	try { el.click(); } finally { bypass = false; }
}

function restoreFast() {
	if (win.jQuery) win.jQuery.fx.off = false;
	if (savedDice) { if (!win.animateDice) win.animateDice = savedDice; savedDice = null; }
}

function refreshInfo() {
	if (!started || !win.player || !win.player[win.turn]) return;
	const myTurn = win.turn === myIndex;
	document.body.classList.toggle('online-wait', !myTurn);
	setInfo({ myTurn, turnName: win.player[win.turn].name });
}

onAction((a) => queue.push(a));

// ---- starting -------------------------------------------------------------
function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function startOnlineGame(room, you) {
	if (started) return;
	started = true;
	document.body.classList.add('online-game');

	win.seededRandom = seeded(room.seed);

	// The page-load shuffle of the card decks used Math.random: redo it from the seed.
	[win.chanceCards, win.communityChestCards].forEach((cards) => {
		cards.deck = Array.from({ length: 16 }, (_, i) => i);
		for (let i = cards.deck.length - 1; i > 0; i--) {
			const j = Math.floor(win.seededRandom() * (i + 1));
			[cards.deck[i], cards.deck[j]] = [cards.deck[j], cards.deck[i]];
		}
		cards.index = 0;
	});

	// Fill the engine's own setup form (it reads these fields by id) and start.
	const players = [...room.players].sort((a, b) => a.seat - b.seat);
	const count = document.getElementById('playernumber');
	count.value = String(players.length);
	count.dispatchEvent(new Event('change', { bubbles: true }));
	players.forEach((p, i) => {
		document.getElementById(`player${i + 1}name`).value = p.name;
		document.getElementById(`player${i + 1}color`).value = capitalise(p.color);
		document.getElementById(`player${i + 1}ai`).value = '0';
	});
	win.game.addPropertyToAuctionQueue = () => {}; // auctions arrive in Milestone 3: a declined property stays unowned

	trackOnline({
		isHost: you.userId === room.hostId,
		seats: players.map((p) => ({ seat: p.seat, name: p.name })),
		roomId: room.id,
		send: (msg) => send(msg).catch(() => {}),
	});

	win.setup();

	const me = players.find((p) => p.userId === you.userId);
	for (let i = 1; i <= win.pcount; i++) if (win.player[i].name === me.name) myIndex = i;
	setInfo({ me: me.name });

	document.addEventListener('click', onClickCapture, true);
	timer = setInterval(() => { tick(); refreshInfo(); }, 40);
}

export function stopOnlineGame() {
	clearInterval(timer);
	document.removeEventListener('click', onClickCapture, true);
}

export const isOnlineGameRunning = () => started;
export const currentRoomId = () => (getOnline().room ? getOnline().room.id : null);
