// Board animations (the drawing is in board.css, classes fx-breathe / fx-wave).
//   * a property is bought: its square "breathes" in the owner's colour;
//   * the buy completes a set: the squares of the set pop one after another, in board order, in the owner's colour
//     (the order follows the squares, so a set that turns a corner of the board works too).
// Nothing plays while old moves are replayed (rejoining a game) or while the tab is hidden.
//
// Also here (drawn from the game state a few times a second, so they are right after a rejoin too):
//   * houses and hotels on the colour bar of each street (a new house drops in);
//   * mortgaged squares turn grey;
//   * a property that changes hands in a trade pulses in its new owner's colour; a bankrupt player's properties
//     sweep back to the bank one after another;
// and from the game log (window.onGameFx, see addAlert in monopoly.js):
//   * rent: coins fly from the square to the owner's cash;  * GO: the salary pops up on GO;
//   * jail: the box flashes red and the piece shakes;       * mortgage: the amount pops up on the square;
//   * the cash numbers in the player list count up / down instead of jumping.
import { isReplaying, play } from './sound.js';

const DURATION = 1500; // ms, longer than the CSS animations

function run(index, cls, color, delay = 0) {
	const cell = document.getElementById(`cell${index}`);
	if (!cell) return;
	cell.classList.remove('fx-breathe', 'fx-wave');
	void cell.offsetWidth; // lets the animation start again if it is already running
	cell.style.setProperty('--fx', color);
	cell.style.setProperty('--fx-delay', `${delay}ms`);
	cell.classList.add(cls);
	setTimeout(() => { cell.classList.remove(cls); cell.style.removeProperty('--fx'); cell.style.removeProperty('--fx-delay'); }, DURATION + delay);
}

window.fxBought = (index, color, set) => {
	if (isReplaying() || document.hidden) return;
	try {
		if (set && set.length >= 2) { set.forEach((sq, k) => run(sq, 'fx-wave', color, k * 180)); play('set'); }
		else run(index, 'fx-breathe', color);
	} catch { /* animation must never break the game */ }
};


// ---------------------------------------------------------------------------------------------
const reduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const quiet = () => isReplaying() || document.hidden || reduce();
const cellEl = (i) => document.getElementById(`cell${i}`);
const idxOf = (name) => { for (let i = 1; i <= (window.pcount || 0); i++) if (window.player[i] && window.player[i].name === name) return i; return 0; };

let layer = null;
function fxLayer() {
	if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.id = 'fx-layer'; document.body.appendChild(layer); }
	return layer;
}
const center = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };

function floatText(el, text, neg) {
	const c = center(el);
	if (!c) return;
	const e = document.createElement('div');
	e.className = 'fx-fly' + (neg ? ' neg' : '');
	e.textContent = text;
	e.style.left = c.x + 'px'; e.style.top = c.y + 'px';
	fxLayer().appendChild(e);
	e.animate([
		{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
		{ transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.25 },
		{ transform: 'translate(-50%,-260%) scale(1)', opacity: 0 },
	], { duration: 1500, easing: 'ease-out' }).onfinish = () => e.remove();
}

function coins(fromEl, toEl) {
	const a = center(fromEl), b = center(toEl);
	if (!a || !b) return;
	for (let n = 0; n < 5; n++) {
		const c = document.createElement('div');
		c.className = 'fx-coin';
		c.style.left = a.x + 'px'; c.style.top = a.y + 'px';
		fxLayer().appendChild(c);
		c.animate([
			{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
			{ transform: `translate(calc(-50% + ${(b.x - a.x) * 0.5}px), calc(-50% + ${(b.y - a.y) * 0.5 - 40 - n * 6}px)) scale(1.2)`, opacity: 1, offset: 0.5 },
			{ transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(.6)`, opacity: 0.2 },
		], { duration: 800 + n * 90, delay: n * 90, easing: 'ease-in-out', fill: 'both' }).onfinish = () => c.remove();
	}
}

function pulse(el, cls, ms = 1000, delay = 0) {
	if (!el) return;
	const go = () => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
	delay ? setTimeout(go, delay) : go();
}

// ---- game log events ----
window.onGameFx = (kind, text) => {
	if (quiet() || !window.player) return;
	try {
		let m;
		if ((m = /^(.+) paid \$(\d+) rent to (.+)\.$/.exec(text))) {
			const payer = window.player[idxOf(m[1])], owner = idxOf(m[3]);
			const from = payer ? cellEl(payer.position) : null;
			coins(from, document.getElementById(`p${owner}moneybar`));
			floatText(from, `-$${m[2]}`, true);
		} else if ((m = /^(.+) collected a \$(\d+) salary for (?:passing|landing on) GO\.$/.exec(text))) {
			const go = cellEl(0);
			pulse(go, 'fx-go', 900);
			floatText(go, `+$${m[2]}`, false);
		} else if (/was sent directly to jail\.$/.test(text) || /rolled doubles three times in a row\.$/.test(text)) {
			const name = text.replace(/ (was sent directly to jail|rolled doubles three times in a row)\.$/, '');
			setTimeout(() => {
				pulse(document.getElementById('jail'), 'fx-jail', 2200);
				const tk = [...document.querySelectorAll('#token-layer .tk')].find((t) => t.getAttribute('aria-label') === name);
				if (tk) tk.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px) rotate(-8deg)' }, { transform: 'translateX(5px) rotate(8deg)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 500 });
			}, 650);
		} else if ((m = /^(.+) (mortgaged|unmortgaged) (.+) for \$(\d+)\.$/.exec(text))) {
			const i = window.square.findIndex((s) => s.name === m[3]);
			if (i >= 0) floatText(cellEl(i), `${m[2] === 'mortgaged' ? '+' : '-'}$${m[4]}`, m[2] !== 'mortgaged');
		} else if ((m = /^(.+) is bankrupt\.$/.exec(text))) {
			const p = window.player[idxOf(m[1])];
			if (p) floatText(cellEl(p.position), 'BANKRUPT', true);
		}
	} catch { /* animation must never break the game */ }
};

// ---- houses, mortgages, ownership changes: read from the game state ----
const HOUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12 12 3l9 9v9H3z" fill="#34c759" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const HOTEL = '<svg class="bh-hotel" viewBox="0 0 30 20" aria-hidden="true"><rect x="2" y="5" width="26" height="14" rx="2" fill="#e5484d" stroke="#fff" stroke-width="1.6"/><rect x="2" y="1" width="26" height="6" rx="2" fill="#ff6b70" stroke="#fff" stroke-width="1.6"/><g fill="#fff"><rect x="7" y="10" width="3" height="3"/><rect x="13.5" y="10" width="3" height="3"/><rect x="20" y="10" width="3" height="3"/></g></svg>';

const shown = new Array(40).fill(-1);   // what is drawn on each colour bar: 0..4 houses, 5 = hotel
let owners = null;                       // owner's name per square, last time we looked

function syncBoard() {
	const S = window.square, P = window.player;
	const board = document.getElementById('board');
	if (!S || !P || !board || !board.offsetWidth) return;
	const q = quiet();
	const now = S.map((s) => (s.owner > 0 && P[s.owner] ? P[s.owner].name : ''));
	const sweep = [];
	for (let i = 0; i < 40; i++) {
		const sq = S[i];
		if (sq.groupNumber >= 3) {
			const n = sq.hotel ? 5 : Math.min(4, sq.house || 0);
			const bar = document.getElementById(`cell${i}colorbar`);
			if (bar && shown[i] !== n) {
				const old = shown[i];
				bar.classList.toggle('has-b', n > 0);
				bar.innerHTML = n === 5 ? HOTEL : HOUSE.repeat(n);
				if (!q && old >= 0 && n > old) { // a house (or hotel) was built: the new one drops in
					const items = bar.querySelectorAll('svg');
					items[items.length - 1].classList.add(n === 5 ? 'bh-pop' : 'bh-new');
					if (n === 5) pulse(cellEl(i), 'fx-hotel', 900);
				}
				shown[i] = n;
			}
			const c = cellEl(i);
			if (c) c.classList.toggle('mortgaged', !!sq.mortgage);
		}
		if (owners && !q && owners[i] !== now[i]) {
			if (owners[i] && !now[i]) sweep.push(i);                              // back to the bank
			else if (owners[i] && now[i]) pulse(cellEl(i), 'fx-swap', 1100);     // trade (or handed to a creditor)
		}
	}
	sweep.forEach((i, k) => pulse(cellEl(i), 'fx-sweep', 900, k * 250));
	owners = now;
}
setInterval(syncBoard, 150);

// ---- cash counting ----
const counters = new Map(); // element -> { final, shown, raf, written }
function countTo(el, st, to) {
	cancelAnimationFrame(st.raf);
	const from = st.shown, t0 = performance.now(), d = Math.min(1100, 500 + Math.abs(to - from) * 0.8);
	el.classList.remove('cnt-up', 'cnt-dn');
	el.classList.add(to >= from ? 'cnt-up' : 'cnt-dn');
	const step = (t) => {
		const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
		st.shown = Math.round(from + (to - from) * e);
		st.written = String(st.shown); el.textContent = st.written;
		if (k < 1) st.raf = requestAnimationFrame(step); else setTimeout(() => el.classList.remove('cnt-up', 'cnt-dn'), 400);
	};
	st.raf = requestAnimationFrame(step);
}
function watchCash() {
	for (let n = 1; n <= 8; n++) {
		const el = document.getElementById(`p${n}money`);
		if (!el || counters.has(el)) continue;
		const st = { final: parseInt(el.textContent, 10), shown: parseInt(el.textContent, 10), raf: 0, written: '' };
		counters.set(el, st);
		new MutationObserver(() => {
			const txt = el.textContent;
			if (txt === st.written) return; // our own frame
			const v = parseInt(txt, 10);
			if (Number.isNaN(v) || v === st.final) { if (!Number.isNaN(v) && st.raf) el.textContent = st.written; return; }
			st.final = v;
			if (quiet()) { cancelAnimationFrame(st.raf); st.shown = v; st.written = ''; return; }
			countTo(el, st, v);
		}).observe(el, { childList: true, characterData: true, subtree: true });
	}
}
setInterval(watchCash, 1000);
watchCash();
