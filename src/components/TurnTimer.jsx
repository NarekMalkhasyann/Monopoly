import { useEffect, useRef, useState } from 'react';
import { autoEndTurn, isReplaying } from '../onlineGame.js';

// 30 seconds after "End turn" appears, the turn ends by itself. A radial sweep inside the button darkens it
// clockwise from 12 o'clock, like a clock hand, until the button is full. The clock waits while something else needs attention: a pop-up, an auction,
// the trade window, the stats window, or while an online game is still catching up on clicks.
// (Tests can shorten it with window.turnTimerSeconds.)
const TOTAL_SECONDS = 30;

const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight));

function readState() {
	const w = window;
	const btn = document.getElementById('nextbutton');
	const who = w.player && w.pcount > 1 ? w.player[w.turn] : null;
	const armed = !!(btn && who && who.human && /end turn/i.test(btn.value) && !btn.disabled && visible(btn));
	const paused = ['popupwrap', 'popupbackground', 'statswrap', 'trade', 'auctionbid'].some((id) => visible(document.getElementById(id))) || isReplaying();
	return { btn, armed, paused, name: who ? who.name : '' };
}

export default function TurnTimer() {
	const [view, setView] = useState(null); // null = hidden
	const clock = useRef({ left: TOTAL_SECONDS, last: performance.now(), firedAt: 0 });

	useEffect(() => {
		const id = setInterval(() => {
			const c = clock.current;
			const total = Number(window.turnTimerSeconds) || TOTAL_SECONDS;
			const now = performance.now();
			const dt = (now - c.last) / 1000;
			c.last = now;
			const { btn, armed, paused, name } = readState();
			if (!armed) { c.left = total; c.firedAt = 0; setView((v) => (v ? null : v)); return; }
			if (c.left > total) c.left = total;
			if (!paused) c.left = Math.max(0, c.left - dt);
			if (c.left <= 0 && !paused && now - c.firedAt > 3000) { // try again after 3 s if nothing happened
				c.firedAt = now;
				autoEndTurn();
			}
			const r = btn.getBoundingClientRect();
			const radius = getComputedStyle(btn).borderRadius;
			const next = { left: Math.round(c.left * 10) / 10, total, paused, name, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), radius };
			setView((v) => (v && v.left === next.left && v.paused === paused && v.x === next.x && v.y === next.y && v.w === next.w && v.h === next.h && v.name === name ? v : next));
		}, 100);
		return () => clearInterval(id);
	}, []);

	if (!view) return null;
	const secs = Math.ceil(view.left);
	const tone = view.left <= 5 ? 'danger' : view.left <= 10 ? 'warn' : 'ok';
	const done = 360 * (1 - view.left / view.total); // degrees already swept, clockwise from the top
	return (
		<div className={`turn-timer ${tone}${view.paused ? ' paused' : ''}`}
			style={{ left: view.x, top: view.y, width: view.w, height: view.h, borderRadius: view.radius, '--done': `${done.toFixed(1)}deg` }}
			role="timer" aria-label={`${view.name}'s turn ends in ${secs} seconds`} title={`The turn ends by itself in ${secs} s`} />
	);
}
