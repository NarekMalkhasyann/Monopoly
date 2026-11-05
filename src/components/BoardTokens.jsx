import { useEffect, useRef, useState } from 'react';

// The player pieces. The engine redraws them in their new square at once (a jump); this layer draws its own
// pieces on top, which walk square by square after a roll (and glide for longer moves such as cards or "Go to jail").
// The engine's own pieces stay in the page (hidden) and remain the source of truth: this only watches
// player[].position and player[].jail.
const STEP_MS = 120;
const SIZE = 24;   // piece diameter in board pixels
const GAP = 26;    // distance between pieces that share a square
const reduce = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function targets() {
	const w = window;
	if (!w.player || !w.pcount || !w.square) return [];
	const out = [];
	for (let i = 1; i <= w.pcount; i++) {
		const p = w.player[i];
		if (p) out.push({ name: p.name, color: p.color, sq: p.position, jail: !!p.jail });
	}
	return out;
}

export default function BoardTokens() {
	const [view, setView] = useState({ tokens: [], geo: '' });
	const disp = useRef(new Map()); // name -> { sq, jail, color, walking }
	const timers = useRef(new Set());

	useEffect(() => {
		const later = (fn, ms) => { const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms); timers.current.add(t); };
		const publish = () => {
			const inner = document.getElementById('stage-inner');
			const ir = inner ? inner.getBoundingClientRect() : null;
			setView({ tokens: [...disp.current.entries()].map(([name, d]) => ({ name, ...d })), geo: ir ? `${Math.round(ir.left)}|${Math.round(ir.top)}|${Math.round(ir.width)}` : '' });
		};
		const walk = (name, to) => {
			const d = disp.current.get(name);
			if (!d) return;
			const fwd = (to - d.sq + 40) % 40;
			if (reduce() || fwd < 1 || fwd > 12 || d.jail) { Object.assign(d, { sq: to, walking: false }); publish(); return; }
			d.walking = true;
			const stepOnce = () => {
				const cur = disp.current.get(name);
				if (!cur) return;
				cur.sq = (cur.sq + 1) % 40;
				publish();
				if (cur.sq !== to) later(stepOnce, STEP_MS); else cur.walking = false;
			};
			stepOnce();
		};
		const tick = () => {
			const board = document.getElementById('board');
			if (!board || board.offsetWidth === 0) { if (disp.current.size) { disp.current.clear(); publish(); } return; }
			const want = targets();
			let changed = false;
			const names = new Set(want.map((x) => x.name));
			for (const name of [...disp.current.keys()]) if (!names.has(name)) { disp.current.delete(name); changed = true; }
			for (const t of want) {
				const d = disp.current.get(t.name);
				if (!d) { disp.current.set(t.name, { sq: t.sq, jail: t.jail, color: t.color, walking: false }); changed = true; continue; }
				d.color = t.color;
				if (d.walking) continue;
				if (t.jail !== d.jail) { d.jail = t.jail; d.sq = t.sq; changed = true; continue; }
				if (t.sq !== d.sq) walk(t.name, t.sq);
			}
			if (changed) publish();
			else { // follow the board when the page is resized or scrolled into a different scale
				const inner = document.getElementById('stage-inner'); const ir = inner.getBoundingClientRect();
				const geo = `${Math.round(ir.left)}|${Math.round(ir.top)}|${Math.round(ir.width)}`;
				setView((v) => (v.geo === geo ? v : { ...v, geo }));
			}
		};
		const iv = setInterval(tick, 60);
		return () => { clearInterval(iv); timers.current.forEach(clearTimeout); timers.current.clear(); };
	}, []);

	const inner = typeof document !== 'undefined' ? document.getElementById('stage-inner') : null;
	if (!inner || !view.tokens.length) return <div id="token-layer" />;
	const ir = inner.getBoundingClientRect();
	const scale = inner.offsetWidth ? ir.width / inner.offsetWidth : 1;
	const spot = (d) => { // where the square (or the jail box) is, in the board's own pixels
		const el = d.jail ? document.getElementById('jail') : document.getElementById(`cell${d.sq}`);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: (r.left - ir.left) / scale, y: (r.top - ir.top) / scale, w: r.width / scale, h: r.height / scale };
	};
	const groups = new Map();
	view.tokens.forEach((d) => { const key = d.jail ? 'jail' : d.sq; groups.set(key, [...(groups.get(key) || []), d.name]); });

	return (
		<div id="token-layer">
			{view.tokens.map((d) => {
				const s = spot(d);
				if (!s) return null;
				const mates = groups.get(d.jail ? 'jail' : d.sq);
				const k = mates.indexOf(d.name);
				const n = mates.length;
				const cols = Math.min(n, 3);
				const dx = (k % 3 - (cols - 1) / 2) * GAP;
				const dy = (Math.floor(k / 3) - (Math.ceil(n / 3) - 1) / 2) * GAP + (d.jail ? 12 : 0);
				return <div key={d.name} className="tk" title={d.name} aria-label={d.name} style={{ left: s.x + s.w / 2 - SIZE / 2 + dx, top: s.y + s.h / 2 - SIZE / 2 + dy, backgroundColor: d.color }}>{view.tokens.indexOf(d) + 1}</div>;
			})}
		</div>
	);
}
