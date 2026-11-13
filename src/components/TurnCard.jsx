import { useEffect, useState } from 'react';

// The "YOUR TURN / name / dice" card in the middle of the board. Shown on small screens only (on wide screens
// the same things are part of the centre panel). It mirrors the engine's own elements (#pname, #die0, #die1),
// which stay in the page, hidden.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ n }) {
	if (!n) return <span className="tc-die tc-blank" />;
	return (
		<span className="tc-die" role="img" aria-label={`Die showing ${n}`}>
			{PIPS[n].map((cell) => <i key={cell} style={{ gridColumn: (cell % 3) + 1, gridRow: Math.floor(cell / 3) + 1 }} />)}
		</span>
	);
}

const dieValue = (id) => {
	const el = document.getElementById(id);
	if (!el) return 0;
	const img = el.querySelector('img');
	const n = parseInt(img ? img.alt : el.textContent, 10);
	return n >= 1 && n <= 6 ? n : 0;
};

export default function TurnCard() {
	const [v, setV] = useState({ name: '', a: 0, b: 0 });
	useEffect(() => {
		const read = () => {
			const name = (document.getElementById('pname') || {}).textContent || '';
			const next = { name, a: dieValue('die0'), b: dieValue('die1') };
			setV((o) => (o.name === next.name && o.a === next.a && o.b === next.b ? o : next));
		};
		read();
		const t = setInterval(read, 150);
		return () => clearInterval(t);
	}, []);
	return (
		<div className="turn-card">
			<span className="tc-label">YOUR TURN</span>
			<span className="tc-name">{v.name}</span>
			<div className="tc-dice"><Die n={v.a} /><Die n={v.b} /></div>
		</div>
	);
}
