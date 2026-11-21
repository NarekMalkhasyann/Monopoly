import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import ReplayBoard from './ReplayBoard.jsx';
import { SQUARES } from './boardData.js';
import { buildFrames } from './replayModel.js';
import { Modal } from './GameDetails.jsx';

// The admin watches a running online game: the board follows the game log, which is read again every 1.5 seconds
// (only the new lines). New lines are shown one after another (the token hops, the dice tumble); after a long gap
// (or when the page was in the background) the board simply jumps to the latest state.
const rand = () => 1 + Math.floor(Math.random() * 6);

export default function LiveBoard({ id, onClose }) {
	const [game, setGame] = useState(null);
	const [events, setEvents] = useState([]);
	const [error, setError] = useState('');
	const [pos, setPos] = useState(0);
	const [hop, setHop] = useState(null);
	const [faces, setFaces] = useState(null);
	const [animK, setAnimK] = useState(null);
	const last = useRef(0);
	const started = useRef(false);
	const timers = useRef([]);
	const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
	const listRef = useRef(null);

	useEffect(() => {
		let stop = false;
		const load = async () => {
			try {
				const r = await api('GET', `/games/${id}?after=${last.current}`);
				if (stop) return;
				setGame((g) => ({ ...(g || {}), ...r.game, events: undefined }));
				if (r.game.events.length) {
					last.current = r.game.events[r.game.events.length - 1].seq;
					setEvents((e) => [...e, ...r.game.events]);
				}
				setError('');
			} catch (e) { if (!stop) setError(e.message); }
		};
		load();
		const t = setInterval(() => { if (!document.hidden) load(); }, 1500);
		return () => { stop = true; clearInterval(t); timers.current.forEach(clearTimeout); };
	}, [id]);

	const players = game && game.players ? game.players : [];
	const list = useMemo(() => [...players].sort((a, b) => a.seat - b.seat), [players]);
	const { frames, fx } = useMemo(() => (list.length ? buildFrames(events, list) : { frames: [null], fx: [] }), [events, list]);
	const total = events.length;
	const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	useEffect(() => { // follow the log
		if (!list.length) return undefined;
		if (!started.current) { started.current = true; setPos(total); return undefined; } // first look: the present state
		if (pos >= total) return undefined;
		if (total - pos > 6 || reduce || document.hidden) { setPos(total); return undefined; }
		const k = pos, f = fx[k];
		let wait = 350;
		if (f && f.kind === 'roll') {
			wait = 900;
			for (let t = 0; t < 800; t += 90) later(() => setFaces([rand(), rand()]), t);
			later(() => setFaces(null), 800);
			setAnimK(k);
		} else if (f && f.kind === 'move' && f.forward >= 1 && f.forward <= 12 && !f.jailed) {
			wait = f.forward * 150 + 200;
			for (let s = 1; s <= f.forward; s++) later(() => setHop({ player: f.player, square: (f.from + s) % 40 }), (s - 1) * 150);
			later(() => setHop(null), f.forward * 150);
		}
		const t = setTimeout(() => setPos(k + 1), wait);
		timers.current.push(t);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [total, pos, list.length]);

	useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [pos]);

	const state = frames[Math.min(pos, frames.length - 1)];
	const current = pos > 0 ? events[pos - 1] : null;
	const rolling = !!(faces && animK != null && fx[animK] && fx[animK].kind === 'roll');
	const shown = events.slice(Math.max(0, pos - 40), pos);
	const ended = game && game.status && game.status !== 'active';

	return (
		<Modal onClose={onClose} wide>
			<h3 className="modal-title live-title">
				Game #{id} {game && game.room_code ? `· ${game.room_code}` : ''}
				{ended ? <span className="badge badge-done">{game.status === 'finished' ? 'Finished' : 'Ended'}</span> : <span className="live-pill"><span className="live-dot on" /> LIVE</span>}
			</h3>
			{error && <p className="auth-error">{error}</p>}
			{!game && !error && <p className="muted">Loading…</p>}
			{state && list.length > 0 && (
				<div className="replay-main">
					<ReplayBoard state={state} players={list} hop={hop} rolling={rolling} shownDice={rolling ? faces : state.dice}
						caption={current ? current.text : 'Waiting for the first move…'} />
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
							{shown.length === 0 && <p className="muted">No moves yet.</p>}
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
			)}
			<p className="muted replay-note">Built from the game log, so it follows a second or two behind. The log saves the dice total, not each die.</p>
			<div className="modal-actions"><button className="btn-ghost" onClick={onClose}>Close</button></div>
		</Modal>
	);
}
