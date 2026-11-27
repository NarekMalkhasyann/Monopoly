import { useEffect, useState } from 'react';
import { useLoading } from '../loading.js';

// Pips lit on a 3x3 grid (cells 0-8, left to right, top to bottom) for each face.
const FACES = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const SEQUENCE = [2, 3, 4, 5, 6, 1]; // same order as the reference animation

// An outlined die that keeps turning while its face counts through the numbers.
function SpinningDie() {
	const [i, setI] = useState(0);
	useEffect(() => {
		if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
		const t = setInterval(() => setI((n) => (n + 1) % SEQUENCE.length), 450);
		return () => clearInterval(t);
	}, []);
	const on = FACES[SEQUENCE[i]];
	return (
		<div className="loading-die" aria-hidden="true">
			{Array.from({ length: 9 }, (_, c) => <i key={c} className={on.includes(c) ? 'on' : ''} />)}
		</div>
	);
}

// Full-screen "Loading your game" with a progress bar. It covers the board while a saved game is put back
// together (online games replay every stored move, which would otherwise flash by on the board).
export default function LoadingScreen() {
	const s = useLoading();
	if (!s.active) return null;
	const pct = Math.round(s.value * 100);
	return (
		<div className={`loading-screen${s.closing ? ' closing' : ''}`} role="status" aria-live="polite">
			<div className="loading-card">
				<SpinningDie />
				<h2>{s.title}</h2>
				<div className="loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={s.title}>
					<div className="loading-fill" style={{ width: `${pct}%` }} />
				</div>
				<div className="loading-meta">
					<span className="loading-detail">{s.detail}</span>
					<span className="loading-pct">{pct}%</span>
				</div>
			</div>
		</div>
	);
}
