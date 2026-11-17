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
import * as live from './liveAuction.js';
import { setTradeOffer, onTradeOfferClick } from './tradeOffer.js';

// Buttons whose clicks are shared (keep in sync with RELAYED in server/rooms.js).
const RELAYED = new Set(['nextbutton', 'popupclose', 'popupyes', 'popupno',
	'buybutton', 'payfiftybutton', 'gojfbutton', 'resignbutton',
	'auctionbid', 'auctionpass', 'auctionexit',
	'proposetradebutton', 'accepttradebutton', 'rejecttradebutton', 'canceltradebutton',
	'buyhousebutton', 'sellhousebutton', 'sellpropertybutton', 'mortgagebutton', 'bankunmortgage']);
const MANAGE = new Set(['buyhousebutton', 'sellhousebutton', 'sellpropertybutton', 'mortgagebutton']);
const TRADE_BUTTONS = new Set(['proposetradebutton', 'accepttradebutton', 'rejecttradebutton', 'canceltradebutton']);
const AUCTION_BUTTONS = new Set(['auctionbid', 'auctionpass', 'auctionexit']);

import { startLoading, setLoading, finishLoading } from './loading.js';

const STALE_AFTER_MS = 1500;
const LOAD_MIN_MOVES = 1; // any backlog (rejoining a game) gets the loading screen with a progress bar, so numbers never flicker through old values

const win = window;
const queue = [];
let started = false;
let myIndex = 0;         // my player number inside the engine (it changes when a player with a lower number leaves the game)
let myName = '';
let bypass = false;      // true while we press a button for a relayed action
let timer = null;
let waitingSince = 0;
let idleSince = 0;      // since when the screen has been still while the next click cannot be pressed
let lastTick = 0;
let savedDice = null;
let tradeViewOpen = false; // the offer's window is expanded on this screen (it starts collapsed: only the card in the side panel shows it)
let tradeSeq = 0;          // the number of the click that opened the offer that is open now (the server's expiry names it)
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
function markDesync(why, kind = 'stuck') {
	console.warn('[online] out of sync:', why);
	if (loadingOn) { loadingOff(); finishLoading(0); }
	setInfo({ desync: true, desyncKind: kind, desyncWhy: why });
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

// Replaying a long history asks this about every click; the exact test forces the browser to lay the page out each time,
// so while the loading screen is up only the inline "display: none" of the element and its parents is looked at.
const isVisible = (el) => {
	if (loadingOn) { for (let e = el; e && e !== document.body; e = e.parentElement) if (e.hidden || e.style.display === 'none') return false; return true; }
	return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
};
const byName = (name) => {
	for (let i = 1; i <= win.pcount; i++) if (win.player[i] && win.player[i].name === name) return i;
	return 0;
};
// The engine renumbers the players when one is eliminated or removed, so the number is looked up again every time.
function syncMyIndex() {
	if (!myName) return;
	for (let i = 1; i <= win.pcount; i++) if (win.player[i] && win.player[i].name === myName) { myIndex = i; return; }
}
const text = (id) => (document.getElementById(id) || {}).textContent || '';

// Who may press this button right now? (the engine decides whose turn it is; so do we)
// "An offer is open" must always match the screen: if the trade window is gone (answered, cancelled, closed by a
// bankruptcy...) a stale flag would block every new offer with "Finish the open trade first."
onTradeOfferClick(() => { if (tradeShared && document.body.classList.contains('trade-bystander') === false) tradeViewOpen = !tradeViewOpen; });

function syncTradeShared() {
	const t = document.getElementById('trade');
	if (tradeShared && (!t || t.style.display === 'none')) tradeShared = false;
}

function allowed(id, who) {
	syncTradeShared();
	if (AUCTION_BUTTONS.has(id)) return who === win.game.getCurrentBidder();
	if (id === 'canceltradebutton') return who === byName(text('trade-rightp-name')); // the one who made the offer may withdraw it
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

// Why a trade cannot be drafted or offered right now (empty = it can).
function tradeBusy() {
	const shown = (id) => { const el = document.getElementById(id); return !!el && isVisible(el); };
	if (shown('popupwrap') && !document.getElementById('popupwrap').classList.contains('pu-gone')) return 'Close the pop-up first.';
	if (shown('auctionbid') || live.getLiveAuction().open) return 'An auction is running.';
	return '';
}

function whoseTurnText(id) {
	if (AUCTION_BUTTONS.has(id)) return `It is ${win.player[win.game.getCurrentBidder()].name}'s turn to bid.`;
	if (id === 'canceltradebutton') return `Only ${text('trade-rightp-name')}, who made the offer, can withdraw it.`;
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
		return { v: t };
	}
	if (id === 'accepttradebutton') {
		return {}; // (no "are you sure?" box: the offer window already shows what is exchanged)
	}
	if (id === 'bankunmortgage') return null; // set by the caller (needs the square number)
	return {};
}

// ---- sending: stop the click, share it instead -------------------------------
// One click of mine at a time: until the server has sent my previous click back, a second one would be
// based on a screen that has not changed yet (a double click, or "End turn" pressed just as the turn timer
// fires, would end two turns and every browser would then report "Out of sync").
let inflightSince = 0;
function share(id, extra) {
	if (inflightSince && Date.now() - inflightSince < 4000) return;
	inflightSince = Date.now();
	send({ t: 'act', a: { id, turn: win.turn, ...extra } }).catch(() => { inflightSince = 0; toast('Connection lost. Reconnecting...'); });
}

function onClickCapture(e) {
	syncMyIndex();
	syncTradeShared();
	if (!started || bypass || !(e.target instanceof Element)) return;
	// The game is over (one player left): the winner's "OK" only closes the pop-up on this screen. There is no
	// turn any more (after the last opponent was removed it is "the bank's turn"), so nothing is shared.
	if (win.pcount <= 1) return;
	// The ✕ of an open offer: for the player who answers it means Reject (shared with everybody, like the button),
	// for anybody else it only closes the window on their own screen. (A local close would leave the offer open for the others.)
	const closeBtn = e.target.closest('.trade-close');
	if (closeBtn && closeBtn.closest('#trade') && tradeShared) {
		e.preventDefault();
		e.stopImmediatePropagation();
		if (myIndex === byName(text('trade-leftp-name'))) {
			if (allowed('rejecttradebutton', myIndex)) { const extra = prepare('rejecttradebutton'); if (extra) share('rejecttradebutton', extra); }
		} else tradeViewOpen = false;
		return;
	}
	const holder = e.target.closest('[id]');
	let id = holder && holder.id;
	if (!id) return;
	let square = null;
	if (id.startsWith('bankunmortgage')) { square = Number(id.slice(14)); id = 'bankunmortgage'; }

	// Manage lists the properties of the player whose turn it is, so only that player may open it.
	if (id === 'manage-menu-item' && win.turn !== myIndex) {
		e.preventDefault();
		e.stopImmediatePropagation();
		toast(`It is ${win.player[win.turn].name}'s turn.`);
		return;
	}
	// Any player may draft a trade at any time (the draft is private until it is offered), but not in the middle of
	// a pop-up or an auction, and not while another offer is open.
	if (id === 'trade-menu-item') {
		const why = tradeShared ? 'Finish the open trade first.' : tradeBusy();
		if (why) {
			e.preventDefault();
			e.stopImmediatePropagation();
			toast(why);
		} else win.onlineTradeSelf = myIndex; // the engine starts the draft for me, not for the player whose turn it is
		return;
	}
	// While an offer is open for the two players it is about, nobody else presses game buttons (the offer covers the board).
	if (tradeShared && RELAYED.has(id) && !TRADE_BUTTONS.has(id) && id !== 'popupclose' && id !== 'popupyes' && id !== 'popupno') {
		e.preventDefault();
		e.stopImmediatePropagation();
		toast('A trade offer is open. Open it from the Trade offer card and answer it first.');
		return;
	}
	// The "X has proposed a trade with you" pop-up exists only on the recipient's screen, so closing it is local too.
	if ((id === 'popupclose') && tradeShared && /proposed a trade/.test(text('popuptext'))) return;
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
	syncMyIndex();
	if (!started || bypass || e.key !== 'Enter' || !(e.target instanceof Element) || e.target.id !== 'bid') return;
	e.preventDefault();
	e.stopImmediatePropagation();
	if (!allowed('auctionbid', myIndex)) { toast(whoseTurnText('auctionbid')); return; }
	const extra = prepare('auctionbid');
	if (extra) share('auctionbid', extra);
}

// ---- receiving: press the same button, in the server's order -----------------
// One loop step. While a long backlog is replayed (a rejoin) many clicks are pressed in one go, as long as each one is
// ready at once; the pause between steps only exists to let the screen draw.
function tick() {
	const t0 = performance.now();
	let n = 0;
	while (tickOnce() && queue.length > 0 && loadingOn && performance.now() - t0 < 25 && ++n < 400);
}

function tickOnce() {
	syncMyIndex();
	syncTradeShared();
	if (loadingOn && Date.now() - loadStart > 90000) { loadingOff(); finishLoading(0); } // never trap the player behind it
	const m = queue[0];
	if (!m) { restoreFast(); if (loadingOn) endLoad(); return false; }

	// A long backlog (rejoining) is replayed without animations.
	if (queue.length > 1) {
		if (win.jQuery) win.jQuery.fx.off = true;
		if (win.animateDice && !savedDice) { savedDice = win.animateDice; win.animateDice = undefined; }
	} else {
		restoreFast();
	}

	const id = m.a.id;
	const direct = id === 'proposetradebutton' || id === 'forfeit' || id === 'tradeexpire' || id === 'autopass' || id === 'autoend' || id === 'bankunmortgage';
	const aucEvent = id === 'aucopen' || id === 'aucbid' || id === 'aucend' || id === 'aucsync';
	const manage = MANAGE.has(id);

	// Before pressing a house / mortgage button, tick the same property as the sender did.
	if (manage && loadingOn && saved.updateOwned) saved.updateOwned(); // (the property list is not drawn while replaying; the click needs its tick boxes)
	if (manage && m.a.check !== undefined) {
		for (let i = 0; i < 42; i++) {
			const box = document.getElementById(`propertycheckbox${i}`);
			if (box) box.checked = i === m.a.check;
		}
		win.updateOption();
	}

	const el = document.getElementById(id);
	let ready;
	if (aucEvent) {
		// the start must wait until this browser's engine has reached the same auction (it opens after the dice / pop-ups)
		const la = live.getLiveAuction();
		if (id === 'aucsync') ready = true;
		// (matched by order, not by number: the server's count is the one that counts, so the browsers' own counts need not agree)
		else if (id === 'aucopen') ready = la.open && la.deadlineAt === 0 && !(win.jQuery && win.jQuery(':animated').length);
		else ready = la.open && la.deadlineAt > 0;
	}
	else if (direct) ready = !(win.jQuery && win.jQuery(':animated').length);
	else if (manage) ready = !!el && !el.disabled && el.style.display !== 'none';
	else if (TRADE_BUTTONS.has(id)) ready = !!el && !el.disabled && tradeShared; // (these buttons are hidden for players they are not meant for, and the whole window is hidden by CSS for some; every game still answers the offer)
	else if (id === 'buybutton' || id === 'payfiftybutton' || id === 'gojfbutton') ready = !!el && !el.disabled; // the real Buy / jail buttons are hidden on purpose (the panel shows its own); they exist only while the action is possible
	else ready = !!el && !el.disabled && isVisible(el);
	const nowMs = Date.now();
	// A hidden tab (or a sleeping laptop) runs timers and animations very slowly: that is not a broken game,
	// so the "stuck" clock only counts time in which this loop really ran in a visible page.
	const throttled = document.hidden || nowMs - lastTick > 1000;
	lastTick = nowMs;
	if (!ready) {
		// Nothing is moving (no animation, no dice) and the button is still not there: it never will be. This is a
		// stale duplicate (an impatient second click on "OK" that was sent before the first one reached the
		// screen). Every browser sees the same still screen, so every browser drops it the same way, and the
		// clicks behind it are not held up for 12 seconds.
		const moving = (win.jQuery && win.jQuery(':animated').length > 0) || document.getElementById('dice-scene')?.classList.contains('visible');
		if (moving || throttled) idleSince = 0;
		else {
			if (!idleSince) idleSince = nowMs;
			if (nowMs - idleSince > STALE_AFTER_MS) {
				console.warn(`[online] dropped a stale click "${id}" (turn ${win.turn}, not pressable on a still screen)`);
				queue.shift(); noteMove();
				if (m.seat === mySeat) inflightSince = 0;
				idleSince = 0; waitingSince = 0;
				return true;
			}
		}
		// The engine is not ready for this click yet (dice still rolling, pop-up fading in).
		if (!waitingSince || throttled) waitingSince = nowMs;
		if (nowMs - waitingSince > 12000) markDesync(`the game could not press "${id}" for 12 seconds (turn ${win.turn}, ${queue.length} click(s) waiting)`);
		return false;
	}
	waitingSince = 0; idleSince = 0;
	if (m.seat === mySeat) inflightSince = 0; // my click reached the screen: the next one may be sent
	if (info.desync && info.desyncKind === 'stuck') setInfo({ desync: false, desyncKind: '', desyncWhy: '' });
	// An offer made while a pop-up, an auction or another offer is on screen is dropped. Every browser sees the same
	// screen at this point of the click order, so every browser drops it.
	if (id === 'proposetradebutton' && (tradeShared || tradeBusy())) {
		queue.shift(); noteMove();
		if (m.seat === mySeat) { inflightSince = 0; toast(tradeShared ? 'Another trade offer is already open.' : 'Not possible right now. Try again in a moment.'); }
		return true;
	}
	queue.shift(); noteMove();
	if (m.a.turn && win.turn !== m.a.turn && !TRADE_BUTTONS.has(id) && id !== 'tradeexpire') markDesync(`"${id}" was sent during turn ${m.a.turn} but this browser is on turn ${win.turn}`, 'mismatch');
	bypass = true;
	try {
		if (aucEvent) applyAuctionEvent(m);
		else if (id === 'proposetradebutton') {
			// The pop-up "X has proposed a trade with you" is only for the player the offer is made to.
			// The pop-up "X has proposed a trade with you" is only for the player the offer is made to (it fades by itself
			// after 5 seconds). The window with the details stays closed until the card in the side panel is clicked.
			const forMe = m.a.v.r === myIndex;
			const orig = win.popup;
			win.popup = (html, ...rest) => (!forMe && /has proposed a trade/.test(html) ? undefined : orig(/has proposed a trade/.test(html) ? html.replace(', reject, or modify the offer', ' or reject the offer') : html, ...rest));
			try { win.game.applyTrade(m.a.v); } finally { win.popup = orig; }
			tradeShared = true; tradeViewOpen = false; tradeSeq = m.seq;
		}
		else if (id === 'tradeexpire') {
			// The server withdrew an offer nobody answered. Only if it is still that offer (it may have been answered meanwhile).
			if (tradeShared && tradeSeq === m.a.v) { win.tradeEnd = 'expired'; win.game.cancelTrade(); tradeShared = false; }
		}
		else if (id === 'forfeit') {
			// Only if that player is still in the game and it is their turn (two people may press at once).
			const room = getOnline().room;
			const who = room && room.players.find((x) => x.seat === m.a.v);
			const idx = who ? byName(who.name) : 0;
			if (idx && idx === win.turn) { win.game.forfeit(); tradeShared = false; }
		}
		else if (id === 'autopass') {
			// "Pass" pressed for a bidder who is not connected. Only if that player is still the bidder (several browsers
			// send this at the same moment; the first one counts, the others find the auction moved on).
			const room = getOnline().room;
			const who = room && room.players.find((x) => x.seat === m.a.v);
			const idx = who ? byName(who.name) : 0;
			const btn = document.getElementById('auctionpass');
			if (idx && btn && !btn.disabled && win.game.getCurrentBidder() === idx) btn.click(); // (the board may be hidden behind the menu: no visibility check)
		}
		else if (id === 'autoend') {
			// "End turn" pressed for a player who is away. Only if it is still that player's turn and the button is there
			// (several browsers send this at the same moment; the first one counts).
			const room = getOnline().room;
			const who = room && room.players.find((x) => x.seat === m.a.v);
			const idx = who ? byName(who.name) : 0;
			const btn = document.getElementById('nextbutton');
			if (idx && idx === win.turn && btn && !btn.disabled && /end turn/i.test(btn.value)) btn.click();
		}
		else if (id === 'bankunmortgage') win.game.bankruptcyUnmortgageSquare(m.a.v);
		else {
			if (id === 'auctionbid') el.parentElement.parentElement.querySelector('#bid').value = String(m.a.v);
			if (id === 'canceltradebutton') win.tradeEnd = 'withdrawn';
			el.click();
			if (id === 'accepttradebutton' || id === 'rejecttradebutton' || id === 'canceltradebutton') {
				tradeShared = document.getElementById('trade').style.display !== 'none'; // (not isVisible: the window is hidden by CSS for bystanders)
			}
		}
	} finally { bypass = false; }
	return true;
}

// ---- live auction (the server numbers and times it, see server/rooms.js) -----------------
function bidderOf(seat) {
	const room = getOnline().room;
	const idx = room ? playerIndexOfSeat(room, seat) : 0;
	return idx ? { idx, seat, name: win.player[idx].name, color: win.player[idx].color } : null;
}
function applyAuctionEvent(m) {
	const { id, v, rem, n } = m.a;
	const la = live.getLiveAuction();
	if (id === 'aucopen') live.serverOpened(rem, n);
	else if (id === 'aucsync') { if (la.open && la.n === n) live.serverSnapshot({ remMs: rem }); }
	else if (id === 'aucbid') {
		const who = bidderOf(m.seat);
		if (who) { win.game.liveAuctionBid(who.idx, v); live.serverBid({ bidder: who, amount: v, remMs: rem }); }
	}
	else if (id === 'aucend') {
		const who = m.a.w > 0 ? bidderOf(m.a.w) : null;
		live.close(); // first: finishing may start the next auction straight away
		win.game.liveAuctionEnd(who ? who.idx : 0, v);
	}
}

function restoreFast() {
	if (win.jQuery) win.jQuery.fx.off = false;
	if (savedDice) { if (!win.animateDice) win.animateDice = savedDice; savedDice = null; }
}

// The cash numbers on the screen always show what the engine has (also right after a rejoin has replayed every move).
function syncMoneyDisplay() {
	for (let i = 1; i <= win.pcount; i++) {
		const q = win.player[i], el = document.getElementById(`p${i}money`);
		if (q && el && el.textContent !== String(q.money)) el.textContent = q.money;
		const nm = document.getElementById(`p${i}moneyname`);
		if (q && nm && nm.textContent !== q.name) nm.textContent = q.name;
	}
	const t = win.player[win.turn];
	const pm = document.getElementById('pmoney');
	if (t && pm && pm.textContent !== `$${t.money}`) pm.textContent = `$${t.money}`;
}
function refreshInfo() {
	syncMyIndex();
	syncTradeShared();
	// the trade button of a player's row: everybody except me (online you always trade as yourself)
	for (let n = 1; n <= 8; n++) { const row = document.getElementById('moneybarrow' + n); if (row) row.classList.toggle('mb-self', n === myIndex); }
	if (!started || !win.player || !win.player[win.turn]) return;
	syncMoneyDisplay();
	const over = win.pcount <= 1;
	const myTurn = !over && win.turn === myIndex;
	document.body.classList.toggle('online-wait', !myTurn && !over);
	// An open offer is only on the screens of the two players it is about.
	const involved = tradeShared && (byName(text('trade-leftp-name')) === myIndex || byName(text('trade-rightp-name')) === myIndex);
	document.body.classList.toggle('trade-bystander', tradeShared && !involved);
	if (!tradeShared) tradeViewOpen = false;
	if (tradeShared) { // the window's buttons for what I may do: answer it (the player it is made to) or withdraw it (the one who made it)
		const answers = myIndex === byName(text('trade-leftp-name')), mine = myIndex === byName(text('trade-rightp-name'));
		const set = (id, on, label) => { const b = document.getElementById(id); if (b) { b.style.display = on ? '' : 'none'; if (label) b.value = label; } };
		set('accepttradebutton', answers); set('rejecttradebutton', answers); set('canceltradebutton', mine, 'Withdraw offer');
	}
	document.body.classList.toggle('trade-collapsed', tradeShared && !tradeViewOpen);
	const toIdx = tradeShared ? byName(text('trade-leftp-name')) : 0; // (the window is written from the point of view of the player who answers)
	const fromIdx = tradeShared ? byName(text('trade-rightp-name')) : 0;
	setTradeOffer(toIdx && fromIdx ? { from: { name: win.player[fromIdx].name, color: win.player[fromIdx].color }, to: { name: win.player[toIdx].name, color: win.player[toIdx].color }, involved, forMe: toIdx === myIndex, expanded: tradeViewOpen } : null);
	// the turn moved on while Manage was open: it would now list the next player's properties, so go back to the main view
	const manage = document.getElementById('manage');
	if (!myTurn && manage && isVisible(manage)) { const back = document.getElementById('buy-menu-item'); if (back) back.click(); }
	// Something is waiting for me: my turn, my bid, or a trade offer made to me.
	let waitingFor = win.turn;
	if (live.getLiveAuction().open) waitingFor = 0; // a live auction waits for nobody in particular
	else if (document.getElementById('currentbidder') && isVisible(document.getElementById('currentbidder'))) waitingFor = win.game.getCurrentBidder();
	else if (tradeShared) waitingFor = byName(text('trade-leftp-name'));
	setInfo({ over, myTurn, turnName: over ? '' : win.player[win.turn].name, waitingMe: !over && waitingFor === myIndex, waitingName: win.player[waitingFor] ? win.player[waitingFor].name : '',
		turnIndex: win.turn, players: win.pcount });
}

let mySeat = -1;
onAction((a) => { queue.push(a); });

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
		meName: players.find((p) => p.userId === you.userId).name,
		seats: players.map((p) => ({ seat: p.seat, name: p.name })),
		roomId: room.id,
		send: (msg) => send(msg).catch(() => {}),
		logged: getOnline().logged || 0, // lines the server has already: replaying the game must not upload them again
	});

	win.liveAuction = { open: (info) => live.engineOpened(info) }; // (a browser replaying old history reports too; the server ignores auctions it already knows)
	win.setup();

	const me = players.find((p) => p.userId === you.userId);
	mySeat = me.seat; inflightSince = 0;
	myName = me.name; syncMyIndex();
	setInfo({ me: me.name });

	// The engine asks before it presses OK on a Chance / Community Chest card by itself: only the player whose turn it is does, and never while moves are being replayed.
	win.onlineMayAutoClick = () => win.turn === myIndex && queue.length === 0 && !loadingOn;
	document.addEventListener('click', onClickCapture, true);
	document.addEventListener('keydown', onKeyCapture, true);
	timer = setInterval(() => { tick(); refreshInfo(); }, 40);

	// Rejoining a long game replays every stored move: show how far it is instead of letting it flash by on the board.
	if (queue.length >= LOAD_MIN_MOVES) {
		loadingOn = true; loadStart = Date.now(); applied = 0;
		// the property lists and cash numbers are drawn once at the end instead of after every single move
		for (const f of REDRAW) { saved[f] = win[f]; win[f] = () => {}; }
		document.body.classList.add('replaying'); // (the board is not drawn while the moves run behind the loading screen)
		startLoading('Loading your game', `Replaying ${queue.length} moves…`);
		setLoading(0.15);
	} else finishLoading();
}

// ---- loading screen while a long backlog is replayed
let loadingOn = false;
const REDRAW = ['updateOwned', 'updateMoney'];
const saved = {};
function loadingOff() {
	loadingOn = false;
	document.body.classList.remove('replaying');
	for (const f of REDRAW) if (saved[f]) { win[f] = saved[f]; saved[f] = undefined; win[f](); }
}
let loadStart = 0;
let applied = 0;
let lastPaint = 0;
let lastMoveAt = 0;
function noteMove() {
	applied++; lastMoveAt = Date.now();
	if (!loadingOn) return;
	const now = Date.now();
	if (now - lastPaint < 80) return;
	lastPaint = now;
	const total = applied + queue.length;
	setLoading(0.15 + 0.85 * (applied / Math.max(1, total)), `Move ${applied} of ${total}`);
}
function endLoad() {
	const moving = (win.jQuery && win.jQuery(':animated').length > 0) || document.getElementById('dice-scene')?.classList.contains('visible');
	if (moving && Date.now() - lastMoveAt < 700) return; // the last move is still being drawn (but never keep the loading screen up for it)
	loadingOff();
	setLoading(1, `Move ${applied} of ${applied}`);
	finishLoading();
}

export function stopOnlineGame() {
	clearInterval(timer);
	loadingOff(); finishLoading(0);
	document.removeEventListener('click', onClickCapture, true);
	document.removeEventListener('keydown', onKeyCapture, true);
	win.liveAuction = undefined; live.close();
}

// A player removed because they stayed away: the engine takes everything they own back to the bank.
export const forfeitPlayer = (seat) => send({ t: 'forfeit', seat, turn: win.turn });
export const playerIndexOfSeat = (room, seat) => {
	const p = room.players.find((x) => x.seat === seat);
	return p ? byName(p.name) : 0;
};

export const myPlayerIndex = () => { syncMyIndex(); return myIndex; };
export const isOnlineGameRunning = () => started;
// Still catching up on clicks (rejoin, or a click is on its way): the turn timer waits.
export const isReplaying = () => queue.length > 0;

// The turn timer ran out: end the turn for the player, exactly as if they had pressed "End turn".
// Online, only the player whose turn it is sends it (it goes through the server like any click).
let autoEndTry = { key: '', at: 0 };
export function autoEndTurn() {
	if (started) {
		if (queue.length > 0) return;
		if (win.turn === myIndex) { share('nextbutton', {}); return; }
		// The player whose turn it is closed the game / lost the connection: their browser cannot press "End turn", so a
		// present player does. If they are connected but do nothing (menu, sleeping tab), the second try, three seconds
		// later, forces it (the server only allows that after a long quiet time).
		const room = getOnline().room;
		const p = room && win.player[win.turn] && room.players.find((x) => x.name === win.player[win.turn].name);
		if (!p) return;
		const tryKey = `${win.turn}`;
		const again = autoEndTry.key === tryKey && Date.now() - autoEndTry.at < 20000;
		autoEndTry = { key: tryKey, at: Date.now() };
		if (!p.online || again) send({ t: 'autoend', seat: p.seat, turn: win.turn, force: p.online }).catch(() => {});
		return;
	}
	const el = document.getElementById('nextbutton');
	if (el && !el.disabled) el.click();
}
let autoPassTry = { key: '', at: 0 };
// The auction timer ran out: press "Pass" for the bidder, exactly as if they had pressed it.
// Online, the bidder's own browser sends it; if the bidder is not connected, any other connected player does it for them.
export function autoPass() {
	if (started) {
		const bidder = win.game.getCurrentBidder();
		if (queue.length > 0) return;
		if (bidder === myIndex) { share('auctionpass', {}); return; }
		// The bidder closed the game / lost the connection: their browser cannot press "Pass", so a present player does.
		const room = getOnline().room;
		const p = room && win.player[bidder] && room.players.find((x) => x.name === win.player[bidder].name);
		if (!p) return;
		// A bidder who is still connected but does not act (they went to the menu, the tab sleeps...) gets the same
		// treatment on the second try, three seconds later: by then their own browser had its chance.
		const tryKey = `${bidder}|${win.turn}|${text('highestbid')}`;
		const again = autoPassTry.key === tryKey && Date.now() - autoPassTry.at < 20000;
		autoPassTry = { key: tryKey, at: Date.now() };
		if (!p.online || again) send({ t: 'autopass', seat: p.seat, turn: win.turn, force: p.online }).catch(() => {});
		return;
	}
	const el = document.getElementById('auctionpass');
	if (el && !el.disabled) el.click();
}
export const currentRoomId = () => (getOnline().room ? getOnline().room.id : null);
