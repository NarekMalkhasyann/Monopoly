import { useEffect, useRef, useState } from 'react';
import { subscribeReplay, replayPlay, replayPause, replaySetSpeed, replaySeek, replayTurnCursor } from '../onlineGame.js';
import { navigate } from '../router.jsx';

const SPEEDS = [1, 2, 4];

// The controls under the board while a finished game is replayed: play / pause, one turn back / forward, speed,
// and a slider over every move of the game.
export default function ReplayBar({ id }) {
	const [r, setR] = useState(null);
	const [drag, setDrag] = useState(null); // the slider value while it is being dragged
	const barRef = useRef(null);
	useEffect(() => subscribeReplay(setR), []);
	useEffect(() => { // keep the page clear of the bar (same variable the game bar sets)
		const el = barRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return undefined;
		const set = () => document.documentElement.style.setProperty('--game-bar-h', `${el.offsetHeight + 8}px`);
		set(); const ro = new ResizeObserver(set); ro.observe(el);
		return () => { ro.disconnect(); document.documentElement.style.removeProperty('--game-bar-h'); };
	});
	if (!r) return null;
	const shown = drag ?? r.cursor;
	const icon = (d) => <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">{d}</svg>;
	return (
		<div className="replay-bar" ref={barRef} role="group" aria-label="Replay controls">
			<div className="rb-top">
				<button className="btn-ghost rb-exit" onClick={() => { window.location.assign(`/history/${id}`); }}>← History</button>
				<div className="rb-label">
					<b>{r.finished ? 'Game over' : r.turn ? `Turn ${r.turn}` : 'Start'}</b>
					<span>{r.finished && r.winner ? `${r.winner} won` : r.text}</span>
				</div>
				<div className="rb-speed" role="group" aria-label="Speed">
					{SPEEDS.map((s) => <button key={s} className={r.speed === s ? 'on' : ''} aria-pressed={r.speed === s} onClick={() => replaySetSpeed(s)}>{s}x</button>)}
				</div>
			</div>
			<div className="rb-main">
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
					onPointerUp={() => { if (drag !== null) { replaySeek(drag); setDrag(null); } }}
					onKeyUp={() => { if (drag !== null) { replaySeek(drag); setDrag(null); } }}
					onBlur={() => setDrag(null)} />
				<span className="rb-count">{shown}/{r.total}</span>
			</div>
		</div>
	);
}
