import { useEffect, useMemo, useRef, useState } from 'react';
import ReplayBoard from './ReplayBoard.jsx';
import { SQUARES } from './boardData.js';
import { buildFrames } from './replayModel.js';

// Replays a saved game on the board: dice roll, tokens hop square by square, money / houses / owners follow the log.
// The log only keeps the SUM of the two dice, so the faces shown are worked out from the sum.
const SPEEDS = [1, 2, 4, 8];
const rand = () => 1 + Math.floor(Math.random() * 6);

export default function Replay({ events, players, onClose }) {
	const { frames, fx } = useMemo(() => buildFrames(events, players), [events, players]);
	const list = useMemo(() => [...players].sort((a, b) => a.seat - b.seat), [players]);
	const total = events.length;
	const [pos, setPos] = useState(0);          // frames[pos] is on screen
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(2);
	const [anim, setAnim] = useState(null);     // { k } while event k is being animated
	const [hop, setHop] = useState(null);       // { player, square } while a token walks
	const [faces, setFaces] = useState(null);   // random faces while the dice tumble
	const listRef = useRef(null);
	const timers = useRef([]);
	const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; setAnim(null); setHop(null); setFaces(null); };
	const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
	useEffect(() => clear, []);

	const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// how long the animation of event k takes
	const duration = (k) => {
		const f = fx[k]; if (!f) return 400;
		if (f.kind === 'roll') return 1000;
		if (f.kind === 'move') return reduce ? 300 : (f.forward >= 1 && f.forward <= 12 ? f.forward * 150 + 250 : 500);
		return 450;
	};

	const play = (k) => { // show what event k did: dice tumble or the token walking
		clear();
		const f = fx[k]; if (!f || reduce) return;
		setAnim({ k });
		const sp = speed;
		if (f.kind === 'roll') {
			for (let t = 0; t < 1000 / sp; t += 90) later(() => setFaces([rand(), rand()]), t);
			later(() => setFaces(null), 800 / sp);
		} else if (f.kind === 'move' && f.forward >= 1 && f.forward <= 12 && !f.jailed) {
			for (let s = 1; s <= f.forward; s++) later(() => setHop({ player: f.player, square: (f.from + s) % 40 }), ((s - 1) * 150) / sp);
			later(() => setHop(null), (f.forward * 150) / sp);
		}
	};

	const go = (n, animate) => { // jump to frame n
		if (animate && n > 0 && n <= total) play(n - 1); else clear();
		setPos(n);
	};

	useEffect(() => {
		if (!playing) return undefined;
		if (pos >= total) { setPlaying(false); return undefined; }
		const t = setTimeout(() => go(pos + 1, true), (pos === 0 ? 300 : duration(pos - 1)) / speed);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [playing, pos, speed, total]);

	useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [pos]);

	const state = frames[pos];
	const current = pos > 0 ? events[pos - 1] : null;
	const rolling = !!(faces && anim && fx[anim.k]?.kind === 'roll');
	const shownDice = rolling ? faces : state.dice;
	const turns = useMemo(() => [...new Set(events.map((e) => e.turn))].filter((n) => n > 0), [events]);
	const jump = (turn) => { setPlaying(false); const i = events.findIndex((e) => e.turn >= turn); go(i < 0 ? total : i + 1, false); };

	if (!total) {
		return (
			<>
				<h3 className="modal-title">Replay</h3>
				<p className="muted">This game has no saved log lines, so there is nothing to replay.</p>
				<div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Back</button></div>
			</>
		);
	}

	const shown = events.slice(Math.max(0, pos - 40), pos);
	return (
		<>
			<h3 className="modal-title">Replay</h3>
			<div className="replay-main">
				<ReplayBoard state={state} players={list} hop={hop} rolling={rolling} shownDice={shownDice}
					caption={current ? current.text : 'Press Play to watch the game.'} />
				<div className="replay-side">
					<div className="rp-players">
						{list.map((p, i) => {
							const props = state.owner.filter((o) => o === i).length;
							return (
								<div key={p.seat} className={`rp${state.turn === i && !state.out[i] ? ' rp-on' : ''}${state.out[i] ? ' rp-out' : ''}`}>
									<span className="player-chip"><i style={{ background: p.color }} />{p.name}</span>
									<span className="rp-money">{state.out[i] ? 'Bankrupt' : `$${state.money[i]}`}</span>
									<span className="rp-sub">{props} propert{props === 1 ? 'y' : 'ies'}{state.jail[i] ? ' · in jail' : ''}{state.cards[i] > 0 ? ' · jail card' : ''}</span>
								</div>
							);
						})}
					</div>
					<div className="log replay-log" ref={listRef} aria-live="off">
						{shown.length === 0 && <p className="muted">Press Play to start.</p>}
						{shown.map((e, i) => <div key={e.seq} className={i === shown.length - 1 ? 'replay-now' : ''}><span className="log-turn">T{e.turn}</span>{e.text}</div>)}
					</div>
					<div className="rp-props">
						{list.map((p, i) => {
							const mine = SQUARES.map((sq, k) => k).filter((k) => state.owner[k] === i);
							return (
								<div key={p.seat} className={`rp-props-row${state.out[i] ? ' rp-out' : ''}`}>
									<span className="player-chip"><i style={{ background: p.color }} />{p.name}</span>
									<span className="rp-props-list">
										{mine.length === 0 && <span className="muted">no properties</span>}
										{mine.map((k) => {
											const h = state.houses[k];
											return (
												<span key={k} className={`rp-prop${state.mort[k] ? ' rp-prop-mort' : ''}`} title={`${SQUARES[k].n}${state.mort[k] ? ' (mortgaged)' : ''}`}>
													<i style={{ background: SQUARES[k].c || '#9ca3af' }} />{SQUARES[k].n}
													{h > 0 && <b>{h === 5 ? ' 🏨' : ` ${'🏠'.repeat(h)}`}</b>}
												</span>
											);
										})}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			</div>
			<div className="replay-controls" role="group" aria-label="Replay controls">
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); go(0, false); }} aria-label="Back to the start">⏮</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); go(Math.max(0, pos - 1), false); }} aria-label="Previous line">◀</button>
				<button className="btn-primary btn-sm" onClick={() => { if (pos >= total) go(0, false); setPlaying((v) => !v); }}>{playing ? 'Pause' : pos >= total ? 'Again' : 'Play'}</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); go(Math.min(total, pos + 1), true); }} aria-label="Next line">▶</button>
				<button className="btn-ghost btn-sm" onClick={() => { setPlaying(false); go(total, false); }} aria-label="Go to the end">⏭</button>
				<label className="replay-speed">Speed
					<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>{SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}</select>
				</label>
			</div>
			<input className="replay-scrub" type="range" min="0" max={total} value={pos} aria-label="Position in the game"
				onChange={(e) => { setPlaying(false); go(Number(e.target.value), false); }} />
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
			<p className="muted replay-note">The log saves the dice total, not each die, so the faces shown are worked out from the total.</p>
			<div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Back to details</button></div>
		</>
	);
}
