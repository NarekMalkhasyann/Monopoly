import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoEndTurn, autoPass, isReplaying } from '../onlineGame.js';

// Two countdowns, both drawn as a radial sweep inside the button that darkens clockwise from 12 o'clock
// (like a clock hand) until the button is full, and both pressing the button for a player who does nothing:
//   * 30 s after "End turn" appears the turn ends by itself. The clock waits while a pop-up, an auction,
//     the trade window or the stats window is open, or while an online game is still catching up on clicks.
//   * 15 s for each bidder in an auction: when it runs out, "Pass" is pressed. It starts again for every new
//     bidder and after every new bid.
// (Tests can shorten them with window.turnTimerSeconds / window.auctionTimerSeconds.)
const TOTAL_SECONDS = 30;
const AUCTION_SECONDS = 15;

// The overlay is absolutely positioned inside the nearest positioned ancestor of the button (or the page), so it
// scrolls with the button. Returns that element and where its padding box starts on screen.
function anchorFor(btn) {
	let el = btn.parentElement;
	while (el && el !== document.body && el !== document.documentElement && getComputedStyle(el).position === 'static') el = el.parentElement;
	const root = !el || el === document.documentElement || (el === document.body && getComputedStyle(el).position === 'static');
	if (root) return { host: document.body, ox: -window.scrollX, oy: -window.scrollY };
	const r = el.getBoundingClientRect();
	return { host: el, ox: r.left + el.clientLeft - el.scrollLeft, oy: r.top + el.clientTop - el.scrollTop };
}

const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight));

const TURN = {
	key: 'tt-turn',
	seconds: () => Number(window.turnTimerSeconds) || TOTAL_SECONDS,
	label: (name, secs) => `${name}'s turn ends in ${secs} seconds`,
	title: (secs) => `The turn ends by itself in ${secs} s`,
	expire: autoEndTurn,
	read() {
		const w = window;
		const btn = document.getElementById('nextbutton');
		const who = w.player && w.pcount > 1 ? w.player[w.turn] : null;
		const armed = !!(btn && who && who.human && /end turn/i.test(btn.value) && !btn.disabled && visible(btn));
		const paused = ['popupwrap', 'popupbackground', 'statswrap', 'trade', 'auctionbid'].some((id) => visible(document.getElementById(id))) || isReplaying();
		return { btn, armed, paused, name: who ? who.name : '', key: 'turn' };
	},
};

const AUCTION = {
	key: 'tt-auction',
	seconds: () => Number(window.auctionTimerSeconds) || AUCTION_SECONDS,
	label: (name, secs) => `${name} must bid or pass in ${secs} seconds`,
	title: (secs) => `"Pass" is pressed by itself in ${secs} s`,
	expire: autoPass,
	read() {
		const w = window;
		const btn = document.getElementById('auctionpass');
		const open = !!(btn && !btn.disabled && visible(btn) && w.game && w.player);
		const idx = open ? w.game.getCurrentBidder() : 0;
		const who = open ? w.player[idx] : null;
		const armed = !!(who && who.human);
		const best = document.getElementById('highestbid');
		const paused = visible(document.getElementById('statswrap')) || isReplaying();
		return { btn, armed, paused, name: who ? who.name : '', key: `${idx}|${best ? best.textContent : ''}` }; // a new bidder or a new bid starts the clock again
	},
};

function SweepTimer({ kind }) {
	const [view, setView] = useState(null); // null = hidden
	const clock = useRef({ left: kind.seconds(), last: performance.now(), firedAt: 0, key: '' });

	useEffect(() => {
		const id = setInterval(() => {
			const c = clock.current;
			const total = kind.seconds();
			const now = performance.now();
			const dt = (now - c.last) / 1000;
			c.last = now;
			const { btn, armed, paused, name, key } = kind.read();
			if (!armed) { c.left = total; c.firedAt = 0; c.key = ''; setView((v) => (v ? null : v)); return; }
			if (key !== c.key) { c.key = key; c.left = total; c.firedAt = 0; }
			if (c.left > total) c.left = total;
			if (!paused) c.left = Math.max(0, c.left - dt);
			if (c.left <= 0 && !paused && now - c.firedAt > 3000) { // try again after 3 s if nothing happened
				c.firedAt = now;
				kind.expire();
			}
			const { host, ox, oy } = anchorFor(btn);
			const r = btn.getBoundingClientRect();
			const radius = getComputedStyle(btn).borderRadius;
			const next = { left: Math.round(c.left * 10) / 10, total, paused, name, host, x: Math.round(r.left - ox), y: Math.round(r.top - oy), w: Math.round(r.width), h: Math.round(r.height), radius };
			setView((v) => (v && v.left === next.left && v.total === total && v.paused === paused && v.host === host && v.x === next.x && v.y === next.y && v.w === next.w && v.h === next.h && v.name === name ? v : next));
		}, 100);
		return () => clearInterval(id);
	}, [kind]);

	if (!view) return null;
	const secs = Math.ceil(view.left);
	const tone = view.left <= 5 ? 'danger' : view.left <= 10 ? 'warn' : 'ok';
	const done = 360 * (1 - view.left / view.total); // degrees already swept, clockwise from the top
	return createPortal(
		<div className={`turn-timer ${kind.key} ${tone}${view.paused ? ' paused' : ''}`}
			style={{ left: view.x, top: view.y, width: view.w, height: view.h, borderRadius: view.radius, '--done': `${done.toFixed(1)}deg` }}
			role="timer" aria-label={kind.label(view.name, secs)} title={kind.title(secs)} />,
		view.host,
	);
}

export default function TurnTimer() {
	return (
		<>
			<SweepTimer kind={TURN} />
			<SweepTimer kind={AUCTION} />
		</>
	);
}
