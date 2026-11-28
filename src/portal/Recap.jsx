import { useEffect, useMemo, useState } from 'react';
import { buildRecap, fmtDuration } from './recap.js';

const ICON = {
	rent: 'M12 3v18M16.5 7.5C16.5 6 14.5 5 12 5S7.5 6 7.5 8s2 2.7 4.5 3 4.5 1 4.5 3-2 3-4.5 3-4.5-1-4.5-2.5',
	visit: 'M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10C18.5 15.3 12 21 12 21zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
	buy: 'M14 4l6 6-3 3-6-6 3-3zM9 9l6 6M3 21l7-7M4 20h8',
	jail: 'M5 3v18M19 3v18M9 3v18M15 3v18M3 8h18M3 16h18',
};
const money = (v) => `$${Number(v).toLocaleString('en-US')}`;

// A number that counts up from 0 when it appears (instantly when the player prefers less motion).
function Count({ to, fmt = (v) => v, delay = 0, ms = 900 }) {
	const [v, setV] = useState(0);
	useEffect(() => {
		if (typeof window === 'undefined' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) { setV(to); return undefined; }
		let raf; let t0;
		const timer = setTimeout(() => {
			const tick = (t) => {
				if (t0 === undefined) t0 = t;
				const k = Math.min(1, (t - t0) / ms);
				setV(Math.round(to * (1 - (1 - k) ** 3))); // ease out
				if (k < 1) raf = requestAnimationFrame(tick);
			};
			raf = requestAnimationFrame(tick);
		}, delay);
		return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
	}, [to]);
	return <>{fmt(v)}</>;
}

function Chart({ chart }) {
	const W = 700, H = 270, L = 46, R = 690, T = 20, B = 230;
	const max = Math.max(1000, ...chart.points.flatMap((p) => p.v));
	const top = Math.ceil(max / 1000) * 1000;
	const x = (t) => L + (t / chart.lastTurn) * (R - L);
	const y = (v) => B - (v / top) * (B - T);
	const step = top > 6000 ? 2000 : 1000;
	const grid = []; for (let g = 0; g <= top; g += step) grid.push(g);
	const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * chart.lastTurn));
	return (
		<svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line chart of each player's net worth by turn">
			{grid.map((g) => <g key={g}><line x1={L} x2={R} y1={y(g)} y2={y(g)} stroke="#ffffff14" /><text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize="12" fontWeight="600" fill="#ffffffa6">{`$${g / 1000}k`}</text></g>)}
			{chart.players.map((p, i) => (
				<path key={p.name} className="rc-line" pathLength="1" style={{ animationDelay: `${0.55 + i * 0.12}s` }} fill="none" stroke={p.color} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"
					d={chart.points.filter((pt) => !p.out || pt.t <= p.out.turn).map((pt, k) => `${k ? 'L' : 'M'}${x(pt.t).toFixed(1)} ${y(pt.v[i]).toFixed(1)}`).join(' ')} />
			))}
			{chart.players.map((p) => p.out && <circle key={p.name} className="rc-pop" style={{ animationDelay: '1.7s' }} cx={x(p.out.turn)} cy={y(0)} r="6" fill="#222" stroke={p.color} strokeWidth="2.5" />)}
			{ticks.map((t) => <text key={t} x={x(t)} y="255" textAnchor="middle" fontSize="12" fontWeight="600" fill="#ffffffa6">{t === 0 ? 'Start' : `T${t}`}</text>)}
		</svg>
	);
}

// The end-of-game screen: winner, final standings, net worth by turn and a few awards.
export default function Recap({ game, onReplay, onClose, closeLabel = 'Close' }) {
	const r = useMemo(() => buildRecap(game), [game]);
	if (!r) return <p className="muted">There is not enough in this game's log to make a recap.</p>;
	const w = r.winner;
	return (
		<div className="rc">
			<div className="rc-top">
				<section className="rc-win">
					<div className="rc-crown"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8zm2.4 12h13.2v2H5.4v-2z" /></svg>WINNER</div>
					<div className="rc-who">
						<span className="rc-av" style={{ background: w.color }}>{w.name.charAt(0).toUpperCase()}</span>
						<div><div className="rc-name">{w.name}</div><div className="rc-sub">Last player standing after {r.turns} turns{r.minutes ? ` · ${fmtDuration(r.minutes)}` : ''}</div></div>
					</div>
					<div className="rc-stats">
						<div><span>NET WORTH</span><b className="hi"><Count to={w.worth} fmt={money} delay={350} /></b></div>
						<div><span>PROPERTIES</span><b><Count to={w.props} delay={450} ms={700} /></b></div>
						<div><span>BUILDINGS</span><b><Count to={w.buildings} delay={550} ms={700} /></b></div>
					</div>
				</section>
				<section className="rc-card rc-stand">
					<h4>Final standings</h4>
					{r.standings.map((s) => {
						const max = Math.max(1, ...r.standings.map((x) => x.worth));
						return (
							<div key={s.name} className="rc-row" style={{ '--i': s.rank }}>
								<span className={`rc-place${s.win ? ' on' : ''}`}>{s.rank}</span>
								<span className="rc-av sm" style={{ background: s.color, opacity: s.win ? 1 : .6 }}>{s.name.charAt(0).toUpperCase()}</span>
								<span className="rc-rn"><b>{s.name}</b><small>{s.note}</small></span>
								<span className="rc-bar"><i style={{ width: `${Math.max(2, (s.worth / max) * 100)}%`, background: s.color }} /></span>
								<b className="rc-worth"><Count to={s.worth} fmt={money} delay={500 + s.rank * 110} /></b>
							</div>
						);
					})}
				</section>
			</div>
			<div className="rc-mid">
				<section className="rc-card rc-chart">
					<div className="rc-chart-head"><h4>Net worth over the game</h4>
						<span className="rc-legend">{r.chart.players.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name}</span>)}<span><i className="ring" />Bankrupt</span></span>
					</div>
					<Chart chart={r.chart} />
				</section>
				{r.awards.length > 0 && (
					<section className="rc-awards">
						{r.awards.map((a, k) => (
							<div key={a.kind} className="rc-card rc-award" style={{ '--tint': a.color, '--i': k }}>
								<span className="rc-ico" style={{ color: a.color, background: `${a.color}22`, boxShadow: `inset 0 0 0 1px ${a.color}44` }}>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[a.kind]} /></svg>
								</span>
								<div><small>{a.title}</small><b>{a.value}</b><span>{a.sub}</span></div>
							</div>
						))}
					</section>
				)}
			</div>
			<div className="rc-actions">
				{onReplay && <button className="btn-replay" onClick={onReplay}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.5-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z" /></svg>
					Watch replay
				</button>}
				<button className="btn-ghost" onClick={onClose}>{closeLabel}</button>
			</div>
		</div>
	);
}
