import { useEffect, useMemo, useRef, useState } from 'react';

// Steps through the saved log of a game, like a video: play / pause, step, speed, jump to a turn.
// The log is the list of readable lines the game wrote (who rolled, bought, paid, traded...).
// Money is not part of the log, so the side panel counts what the lines say: purchases and rent paid.
const SPEEDS = [1, 2, 4, 8];
const BOUGHT = /^(.+?) bought (.+?) for \$(\d+)/;
const RENT = /^(.+?) paid \$(\d+) (?:rent )?to (.+?)[ .]/i;

export default function Replay({ events, players, onClose }) {
	const [pos, setPos] = useState(0);        // how many lines are shown
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(2);
	const listRef = useRef(null);
	const total = events.length;

	useEffect(() => {
		if (!playing) return undefined;
		if (pos >= total) { setPlaying(false); return undefined; }
		const t = setTimeout(() => setPos((p) => Math.min(total, p + 1)), 700 / speed);
		return () => clearTimeout(t);
	}, [playing, pos, total, speed]);

	useEffect(() => { // keep the newest line in view
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [pos]);

	const turns = useMemo(() => [...new Set(events.map((e) => e.turn))].filter((n) => n > 0), [events]);
	const shown = events.slice(0, pos);
	const current = shown.length ? shown[shown.length - 1] : null;

	// what the lines up to here add up to
	const tally = useMemo(() => {
		const t = new Map(players.map((p) => [p.name, { bought: 0, spent: 0, rent: 0 }]));
		for (const e of shown) {
			let m = BOUGHT.exec(e.text);
			if (m && t.has(m[1])) { t.get(m[1]).bought += 1; t.get(m[1]).spent += Number(m[3]); }
			m = RENT.exec(e.text);
			if (m && t.has(m[1])) t.get(m[1]).rent += Number(m[2]);
		}
		return t;
	}, [shown, players]);

	const jump = (turn) => {
		const i = events.findIndex((e) => e.turn >= turn);
		setPos(i < 0 ? total : i + 1);
	};

	if (!total) {
		return (
			<>
				<h3 className="modal-title">Replay</h3>
				<p className="muted">This game has no saved log lines, so there is nothing to replay.</p>
				<div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Back</button></div>
			</>
		);
	}

	return (
		<>
			<h3 className="modal-title">Replay</h3>
			<div className="replay-controls" role="group" aria-label="Replay controls">
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); setPos(0); }} aria-label="Back to the start">⏮</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); setPos((p) => Math.max(0, p - 1)); }} aria-label="Previous line">◀</button>
				<button className="btn-primary btn-sm" onClick={() => { if (pos >= total) setPos(0); setPlaying((v) => !v); }}>{playing ? 'Pause' : pos >= total ? 'Again' : 'Play'}</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); setPos((p) => Math.min(total, p + 1)); }} aria-label="Next line">▶</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); setPos(total); }} aria-label="Go to the end">⏭</button>
				<label className="replay-speed">Speed
					<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
						{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
					</select>
				</label>
			</div>
			<input className="replay-scrub" type="range" min="0" max={total} value={pos} aria-label="Position in the game"
				onChange={(e) => { setPlaying(false); setPos(Number(e.target.value)); }} />
			<div className="replay-status">
				<span>{pos} / {total} lines{current && current.turn > 0 ? ` · turn ${current.turn}` : ''}</span>
				{turns.length > 1 && (
					<label>Jump to turn
						<select value="" onChange={(e) => e.target.value && jump(Number(e.target.value))}>
							<option value="">…</option>
							{turns.map((n) => <option key={n} value={n}>{n}</option>)}
						</select>
					</label>
				)}
			</div>
			<div className="log replay-log" ref={listRef} aria-live="off">
				{shown.length === 0 && <p className="muted">Press Play to start.</p>}
				{shown.map((e, i) => (
					<div key={e.seq} className={i === shown.length - 1 ? 'replay-now' : ''}>
						<span className="log-turn">T{e.turn}</span>{e.text}
					</div>
				))}
			</div>
			<table className="table replay-tally">
				<thead><tr><th>Player</th><th>Bought</th><th>Spent</th><th>Rent paid</th></tr></thead>
				<tbody>
					{players.map((p) => {
						const v = tally.get(p.name);
						return (
							<tr key={p.seat}>
								<td><span className="player-chip"><i style={{ background: p.color }} />{p.name}</span></td>
								<td>{v.bought}</td><td>${v.spent}</td><td>${v.rent}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Back to details</button></div>
		</>
	);
}
