import { useEffect, useRef, useState } from 'react';
import { subscribeReplay, replayPlay, replayPause, replaySetSpeed, replaySeek, replayTurnCursor } from '../onlineGame.js';
import { SoundButton } from './GameBar.jsx';

const SPEEDS = [1, 2, 4];
const icon = (d) => <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">{d}</svg>;

// The top header of a replayed game (it takes the place of the game bar): back to History, sound, previous / play or
// pause / next turn, a slider over every move, the turn and the speed (1x / 2x / 4x).
export default function ReplayBar({ id }) {
	const [r, setR] = useState(null);
	const [drag, setDrag] = useState(null); // the slider value while it is being dragged
	const barRef = useRef(null);
	const ready = !!r;
	useEffect(() => subscribeReplay(setR), []);
	useEffect(() => { // on phones the header has two rows: the page starts below it (portal.css)
		const el = barRef.current;
		if (!ready || !el || typeof ResizeObserver === 'undefined') return undefined;
		const set = () => document.documentElement.style.setProperty('--replay-top-h', `${el.offsetHeight}px`);
		set();
		const ro = new ResizeObserver(set); ro.observe(el);
		document.body.classList.add('has-replay-bar');
		return () => { ro.disconnect(); document.documentElement.style.removeProperty('--replay-top-h'); document.body.classList.remove('has-replay-bar'); };
	}, [ready]);
	if (!r) return null;
	const shown = drag ?? r.cursor;
	const commit = () => { if (drag !== null) { replaySeek(drag); setDrag(null); } };
	return (
		<div className="game-bar replay-top" ref={barRef} role="group" aria-label="Replay controls">
			<button className="btn-ghost" onClick={() => { window.location.assign(`/history/${id}`); }}>← History</button>
			<SoundButton />
			<span className="gb-brand">
				<span className="gb-mark" aria-hidden="true">A</span>
				<b>ACT Monopoly</b>
				<span className="gb-sub">Replay · Game #{id}</span>
			</span>
			<div className="rb-buttons">
				<button className="rb-btn" onClick={() => replaySeek(replayTurnCursor(-1))} aria-label="Previous turn" title="Previous turn">{icon(<path d="M6 6h2v12H6zM9.5 12L18 6v12z" />)}</button>
				<button className="rb-btn rb-play" onClick={() => (r.playing ? replayPause() : replayPlay())} aria-label={r.playing ? 'Pause' : r.finished ? 'Play again' : 'Play'} title={r.playing ? 'Pause' : r.finished ? 'Play again' : 'Play'}>
					{r.playing ? icon(<path d="M7 5h4v14H7zM13 5h4v14h-4z" />) : icon(<path d="M8 5v14l11-7z" />)}
				</button>
				<button className="rb-btn" onClick={() => replaySeek(replayTurnCursor(1))} aria-label="Next turn" title="Next turn">{icon(<path d="M16 6h2v12h-2zM6 18V6l8.5 6z" />)}</button>
			</div>
			<input className="rb-slider" type="range" min="0" max={r.total} value={shown} step="1"
				aria-label="Position in the game" aria-valuetext={`Move ${shown} of ${r.total}`}
				style={{ '--p': `${r.total ? (shown / r.total) * 100 : 0}%` }}
				onChange={(e) => setDrag(Number(e.target.value))}
				onPointerUp={commit} onKeyUp={commit} onBlur={() => setDrag(null)} />
			<div className="rb-label" title={r.text}>
				<b>{r.finished ? 'Game over' : r.turn ? `Turn ${r.turn}` : 'Start'}</b>
				<span>{r.finished && r.winner ? `${r.winner} won` : `${shown}/${r.total}`}</span>
			</div>
			<div className="rb-speed" role="group" aria-label="Speed">
				{SPEEDS.map((s) => <button key={s} className={r.speed === s ? 'on' : ''} aria-pressed={r.speed === s} onClick={() => replaySetSpeed(s)}>{s}x</button>)}
			</div>
		</div>
	);
}
