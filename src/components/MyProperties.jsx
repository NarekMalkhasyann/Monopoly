import { useEffect, useState } from 'react';
import { useOnline } from '../online.js';

// Under "View stats", the properties each player owns, mine first.
// Hover a property to see its title-deed card (the engine's own showdeed / hidedeed).
// The engine keeps the state in page-wide variables (player, square), so this looks at them twice a second
// and redraws only when something changed.
function read() {
	const w = window;
	if (!w.player || !w.square || !w.pcount) return [];
	const out = [];
	for (let p = 1; p <= w.pcount; p++) {
		const pl = w.player[p];
		if (!pl) continue;
		const props = [];
		for (let i = 0; i < 40; i++) {
			const sq = w.square[i];
			if (sq && sq.owner === p && sq.groupNumber) props.push({ i, name: sq.name, color: sq.color, houses: sq.hotel ? 5 : sq.house, mort: !!sq.mortgage });
		}
		out.push({ p, name: pl.name, color: pl.color, props });
	}
	return out;
}
const signature = (list) => JSON.stringify(list);

function moveDeed(e) { // the engine only follows the mouse over its own lists; this panel is at the right edge, so the card goes to the left
	const d = document.getElementById('deed');
	if (!d) return;
	d.style.top = `${Math.min(e.clientY + 20, window.innerHeight - (d.offsetHeight || 279))}px`;
	d.style.left = `${Math.max(8, e.clientX - 250)}px`;
}

export default function MyProperties() {
	const { room, you } = useOnline();
	const [list, setList] = useState([]);
	const online = !!room && room.status === 'active';
	const [local, setLocal] = useState(false); // a local (hot-seat) game is running
	useEffect(() => {
		if (room) return undefined;
		const t = setInterval(() => setLocal(!!(document.body.classList.contains('in-game') && window.player && window.pcount > 0)), 500);
		return () => clearInterval(t);
	}, [room]);
	const active = online || local;

	useEffect(() => {
		if (!active) return undefined;
		let last = '';
		const tick = () => { const l = read(); const s = signature(l); if (s !== last) { last = s; setList(l); } };
		tick();
		const t = setInterval(tick, 500);
		return () => clearInterval(t);
	}, [active]);

	if (!active) return null;
	const meName = online ? (room.players.find((x) => x.userId === (you && you.userId)) || {}).name : (window.player && window.player[window.turn] ? window.player[window.turn].name : null); // local game: whoever's turn it is
	const mine = meName ? list.find((x) => x.name === meName) : null;
	const others = list.filter((x) => x !== mine && x.props.length);
	const groups = mine ? [mine, ...others] : others;

	return (
		<div id="myprops" aria-label="Properties by player">
			{groups.length === 0 && <div className="mp-empty">No one owns a property yet.</div>}
			{groups.map((g) => (
				<section key={g.p} className="mp-group">
					<h4 className="mp-head"><i style={{ background: g.color }} />{g === mine ? 'My properties' : g.name}<span>{g.props.length}</span></h4>
					{g.props.length === 0 && <div className="mp-empty">None yet.</div>}
					<ul>
						{g.props.map((s) => (
							<li key={s.i} className={s.mort ? 'mp-mort' : ''}
								onMouseEnter={() => window.showdeed && window.showdeed(s.i)} onMouseMove={moveDeed} onMouseLeave={() => window.hidedeed && window.hidedeed()}>
								<span className="mp-chip" style={{ background: s.color }} />
								<span className="mp-name">{s.name}</span>
								{s.houses > 0 && <span className="mp-houses" title={s.houses === 5 ? 'Hotel' : `${s.houses} house${s.houses > 1 ? 's' : ''}`}>{s.houses === 5 ? '🏨' : '🏠'.repeat(s.houses)}</span>}
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}
