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
	'buybutton', 'payfiftybutton', 'gojfbutton', 'resignbutton',
	'auctionbid', 'auctionpass', 'auctionexit',
	'proposetradebutton', 'accepttradebutton', 'rejecttradebutton', 'canceltradebutton',
	'buyhousebutton', 'sellhousebutton', 'mortgagebutton', 'bankunmortgage']);
const MANAGE = new Set(['buyhousebutton', 'sellhousebutton', 'mortgagebutton']);
const TRADE_BUTTONS = new Set(['proposetradebutton', 'accepttradebutton', 'rejecttradebutton', 'canceltradebutton']);
const AUCTION_BUTTONS = new Set(['auctionbid', 'auctionpass', 'auctionexit']);

const win = window;
const queue = [];
let started = false;
let myIndex = 0;         // my player number inside the engine
let bypass = false;      // true while we press a button for a relayed action
let timer = null;
let waitingSince = 0;
let savedDice = null;
let tradeShared = false; // a trade offer is on everybody's screen (not just being edited by one player)
let originalConfirm = null;
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
const byName = (name) => {
	for (let i = 1; i <= win.pcount; i++) if (win.player[i] && win.player[i].name === name) return i;
	return 0;
};
const text = (id) => (document.getElementById(id) || {}).textContent || '';

// Who may press this button right now? (the engine decides whose turn it is; so do we)
function allowed(id, who) {
	if (AUCTION_BUTTONS.has(id)) return who === win.game.getCurrentBidder();
	if (TRADE_BUTTONS.has(id)) return who === byName(text('trade-leftp-name'));
	const t = win.player[win.turn];
	if (id === 'bankunmortgage') return !!t && who === t.creditor;
	if (who === win.turn) return true;
	if (id === 'popupclose' || id === 'popupyes' || id === 'popupno') {
		if (tradeShared && (who === byName(text('trade-leftp-name')) || who === byName(text('trade-rightp-name')))) return true;
		if (t && t.money < 0 && t.creditor > 0 && who === t.creditor) return true; // creditor of a bankrupt player
	}
	return false;
}

function whoseTurnText(id) {
	if (AUCTION_BUTTONS.has(id)) return `It is ${win.player[win.game.getCurrentBidder()].name}'s turn to bid.`;
	if (TRADE_BUTTONS.has(id)) return `This trade is waiting for ${text('trade-leftp-name')}.`;
	return `It is ${win.player[win.turn].name}'s turn.`;
}

const say = (el, msg) => { if (el) { el.value = msg; el.style.color = 'red'; } };

// Checks made before a click is shared, so a mistake never reaches the other players.
// Returns the extra data to send, or null to cancel.
function prepare(id) {
	const g = win.game;
	if (id === 'auctionbid') {
		const input = document.getElementById('bid');
		const bid = parseInt(input.value, 10);
		const best = parseInt(text('highestbid'), 10) || 0;
		const money = win.player[g.getCurrentBidder()].money;
		if (input.value === '' || Number.isNaN(bid)) { say(input, 'Please enter a bid.'); return null; }
		if (bid > money) { say(input, `You don't have enough money to bid $${bid}.`); return null; }
		if (bid <= best) { say(input, `Your bid must be greater than highest bid. ($${best})`); return null; }
		return { v: bid };
	}
	if (id === 'auctionexit') {
		return originalConfirm('Are you sure you want to stop bidding on this property altogether?') ? {} : null;
	}
	if (MANAGE.has(id)) return { check: win.getCheckedProperty() };
	if (id === 'proposetradebutton') {
		const l = document.getElementById('trade-leftp-money');
		const r = document.getElementById('trade-rightp-money');
		if (Number.isNaN(Number(l.value)) || Number.isNaN(Number(r.value))) { say(Number.isNaN(Number(l.value)) ? l : r, 'This value must be a number.'); return null; }
		const t = g.snapshotTrade();
		const from = win.player[t.i], to = win.player[t.r];
		if (t.m > 0 && t.m > from.money) { say(l, `${from.name} does not have $${t.m}.`); return null; }
		if (t.m < 0 && -t.m > to.money) { say(r, `${to.name} does not have $${-t.m}.`); return null; }
		if (!t.p.some(Boolean) && !t.cc && !t.ch) { win.popup('<p>One or more properties must be selected in order to trade.</p>'); return null; }
		if (!originalConfirm(`${from.name}, are you sure you want to make this offer to ${to.name}?`)) return null;
		return { v: t };
	}
	if (id === 'accepttradebutton') {
		const from = win.player[byName(text('trade-leftp-name'))], to = win.player[byName(text('trade-rightp-name'))];
		return originalConfirm(`${from.name}, are you sure you want to make this exchange with ${to.name}?`) ? {} : null;
	}
	if (id === 'bankunmortgage') return null; // set by the caller (needs the square number)
	return {};
}

// ---- sending: stop the click, share it instead -------------------------------
function share(id, extra) {
	send({ t: 'act', a: { id, turn: win.turn, ...extra } }).catch(() => toast('Connection lost. Reconnecting...'));
}

function onClickCapture(e) {
	if (!started || bypass || !(e.target instanceof Element)) return;
	const holder = e.target.closest('[id]');
	let id = holder && holder.id;
	if (!id) return;
	let square = null;
	if (id.startsWith('bankunmortgage')) { square = Number(id.slice(14)); id = 'bankunmortgage'; }

	// Opening the trade window is private to the player whose turn it is.
	if (id === 'trade-menu-item') {
		if (win.turn !== myIndex || tradeShared) {
			e.preventDefault();
			e.stopImmediatePropagation();
			toast(win.turn !== myIndex ? `It is ${win.player[win.turn].name}'s turn.` : 'Finish the open trade first.');
		}
		return;
	}
	// Cancelling your own draft (nothing shared yet) is local.
	if (id === 'canceltradebutton' && !tradeShared) return;
	if (!RELAYED.has(id)) return;

	e.preventDefault();
	e.stopImmediatePropagation();
	if (!allowed(id, myIndex)) { toast(whoseTurnText(id)); return; }
	const extra = square !== null ? { v: square } : prepare(id);
	if (extra) share(id, extra);
}

// Pressing Enter in the bid box is a bid.
function onKeyCapture(e) {
	if (!started || bypass || e.key !== 'Enter' || !(e.target instanceof Element) || e.target.id !== 'bid') return;
	e.preventDefault();
	e.stopImmediatePropagation();
	if (!allowed('auctionbid', myIndex)) { toast(whoseTurnText('auctionbid')); return; }
	const extra = prepare('auctionbid');
	if (extra) share('auctionbid', extra);
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

	const id = m.a.id;
	const direct = id === 'proposetradebutton' || id === 'forfeit' || id === 'bankunmortgage';
	const manage = MANAGE.has(id);

	// Before pressing a house / mortgage button, tick the same property as the sender did.
	if (manage && m.a.check !== undefined) {
		for (let i = 0; i < 42; i++) {
			const box = document.getElementById(`propertycheckbox${i}`);
			if (box) box.checked = i === m.a.check;
		}
		win.updateOption();
	}

	const el = document.getElementById(id);
	let ready;
	if (direct) ready = !(win.jQuery && win.jQuery(':animated').length);
	else if (manage) ready = !!el && !el.disabled && el.style.display !== 'none';
	else ready = !!el && !el.disabled && isVisible(el);
	if (!ready) {
		// The engine is not ready for this click yet (dice still rolling, pop-up fading in).
		if (!waitingSince) waitingSince = Date.now();
		if (Date.now() - waitingSince > 12000) setInfo({ desync: true });
		return;
	}
	waitingSince = 0;
	queue.shift();
	if (m.a.turn && win.turn !== m.a.turn) setInfo({ desync: true });
	bypass = true;
	try {
		if (id === 'proposetradebutton') { win.game.applyTrade(m.a.v); tradeShared = true; }
		else if (id === 'forfeit') {
			// Only if that player is still in the game and it is their turn (two people may press at once).
			const room = getOnline().room;
			const who = room && room.players.find((x) => x.seat === m.a.v);
			const idx = who ? byName(who.name) : 0;
			if (idx && idx === win.turn) { win.game.forfeit(); tradeShared = false; }
		}
		else if (id === 'bankunmortgage') win.game.bankruptcyUnmortgageSquare(m.a.v);
		else {
			if (id === 'auctionbid') el.parentElement.parentElement.querySelector('#bid').value = String(m.a.v);
			el.click();
			if (id === 'accepttradebutton' || id === 'rejecttradebutton' || id === 'canceltradebutton') {
				tradeShared = isVisible(document.getElementById('trade'));
			}
		}
	} finally { bypass = false; }
}

function restoreFast() {
	if (win.jQuery) win.jQuery.fx.off = false;
	if (savedDice) { if (!win.animateDice) win.animateDice = savedDice; savedDice = null; }
}

function refreshInfo() {
	if (!started || !win.player || !win.player[win.turn]) return;
	const myTurn = win.turn === myIndex;
	document.body.classList.toggle('online-wait', !myTurn);
	// Something is waiting for me: my turn, my bid, or a trade offer made to me.
	let waitingFor = win.turn;
	if (document.getElementById('currentbidder') && isVisible(document.getElementById('currentbidder'))) waitingFor = win.game.getCurrentBidder();
	else if (tradeShared) waitingFor = byName(text('trade-leftp-name'));
	setInfo({ myTurn, turnName: win.player[win.turn].name, waitingMe: waitingFor === myIndex, waitingName: win.player[waitingFor] ? win.player[waitingFor].name : '',
		turnIndex: win.turn, players: win.pcount });
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
	// The engine asks "are you sure?" with confirm(). The player already answered before the click
	// was shared (see prepare), so while a shared click is replayed the answer is yes.
	originalConfirm = win.confirm.bind(win);
	win.confirm = (msg) => (bypass ? true : originalConfirm(msg));

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
	document.addEventListener('keydown', onKeyCapture, true);
	timer = setInterval(() => { tick(); refreshInfo(); }, 40);
}

export function stopOnlineGame() {
	clearInterval(timer);
	document.removeEventListener('click', onClickCapture, true);
	document.removeEventListener('keydown', onKeyCapture, true);
}

// A player removed because they stayed away: the engine takes everything they own back to the bank.
export const forfeitPlayer = (seat) => send({ t: 'forfeit', seat, turn: win.turn });
export const playerIndexOfSeat = (room, seat) => {
	const p = room.players.find((x) => x.seat === seat);
	return p ? byName(p.name) : 0;
};

export const isOnlineGameRunning = () => started;
// Still catching up on clicks (rejoin, or a click is on its way): the turn timer waits.
export const isReplaying = () => queue.length > 0;

// The turn timer ran out: end the turn for the player, exactly as if they had pressed "End turn".
// Online, only the player whose turn it is sends it (it goes through the server like any click).
export function autoEndTurn() {
	if (started) {
		if (win.turn === myIndex && queue.length === 0) share('nextbutton', {});
		return;
	}
	const el = document.getElementById('nextbutton');
	if (el && !el.disabled) el.click();
}
export const currentRoomId = () => (getOnline().room ? getOnline().room.id : null);
