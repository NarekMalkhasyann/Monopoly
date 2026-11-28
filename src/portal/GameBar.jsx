import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeStatus } from '../session.js';
import { subscribeGameInfo, forfeitPlayer } from '../onlineGame.js';
import { send } from '../online.js';
import { navigate } from '../router.jsx';
import { useOnline } from '../online.js';
import { Modal } from './GameDetails.jsx';
import { soundOn, setSoundOn, subscribeSound } from '../sound.js';

// Speaker button: sound effects on / off (remembered in this browser).
export function SoundButton() {
	const [on, setOn] = useState(soundOn());
	useEffect(() => subscribeSound(() => setOn(soundOn())), []);
	return (
		<button className="btn-ghost gb-sound" onClick={() => setSoundOn(!on)} aria-pressed={on} aria-label={on ? 'Sound effects on' : 'Sound effects off'} title={on ? 'Sound effects: on (click to mute)' : 'Sound effects: off (click to turn on)'}>
			<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
				<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
				{on ? <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></> : <><path d="M17 9l5 6" /><path d="M22 9l-5 6" /></>}
			</svg>
		</button>
	);
}

const LABEL = { idle: '', saving: 'Saving…', saved: 'Saved', offline: 'Offline – will retry' };

// Small floating bar over the game: back to the menu, save status (local games) and,
// in online games, whose turn it is and the connection state.
// Going back reloads the page, which gives the next game a clean engine.
export default function GameBar() {
	const [status, setStatus] = useState('idle');
	const [info, setInfo] = useState({});
	const [ask, setAsk] = useState(null); // { kind: 'abandon' } or { kind: 'remove', seat, name }: waiting for "are you sure?"
	const online = useOnline();
	const isOnline = !!online.room && online.room.status !== 'waiting';
	const barRef = useRef(null);
	useEffect(() => subscribeStatus(setStatus), []);
	// tell the page how tall the bar is, so the bottom of the page can scroll clear of it (styles.css: body padding)
	useEffect(() => {
		const el = barRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return undefined;
		const set = () => document.documentElement.style.setProperty('--game-bar-h', `${el.offsetHeight + 8}px`);
		set();
		const ro = new ResizeObserver(set);
		ro.observe(el);
		return () => { ro.disconnect(); document.documentElement.style.removeProperty('--game-bar-h'); };
	});
	useEffect(() => subscribeGameInfo(setInfo), []);

	// The player cards show the first letter of the name on their coloured token (the .mb-letter element on each card).
	useEffect(() => {
		const mark = () => {
			for (let n = 1; n <= 8; n++) {
				const nameEl = document.getElementById(`p${n}moneyname`);
				const box = document.getElementById(`p${n}letter`);
				const name = nameEl ? (nameEl.textContent || '').trim() : '';
				const letter = /^Player \d+$/.test(name) ? name.slice(7) : name.charAt(0).toUpperCase(); // default names show their number
				if (box && box.textContent !== letter) box.textContent = letter;
			}
		};
		mark();
		const t = setInterval(mark, 1000);
		return () => clearInterval(t);
	}, []);

	// Online games: mark each player's card in the money bar as connected / away (CSS draws the dot from data-presence).
	useEffect(() => {
		for (let n = 1; n <= 8; n++) {
			const card = document.getElementById(`p${n}moneybar`);
			const nameEl = document.getElementById(`p${n}moneyname`);
			if (!card || !nameEl) continue;
			const who = isOnline ? online.room.players.find((p) => p.name === nameEl.textContent) : null;
			if (who) card.dataset.presence = who.online ? 'online' : 'away';
			else delete card.dataset.presence;
		}
	}, [isOnline, online.room, info]);

	const spectating = !!online.spectator;
	const leave = () => window.location.assign(spectating ? '/live' : '/play');
	const offlineCount = isOnline ? online.room.players.filter((p) => !p.online).length : 0;

	// Seconds each player has been away, counted from when the server last told us.
	const [, tick] = useState(0);
	const [seen, setSeen] = useState(Date.now());
	useEffect(() => setSeen(Date.now()), [online.room]);
	useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
	const room = isOnline ? online.room : null;
	const turnPlayer = room && !info.over && info.turnName ? room.players.find((p) => p.name === info.turnName) : null;
	const away = turnPlayer && !turnPlayer.online ? turnPlayer.awayMs + (Date.now() - seen) : 0;
	const isHost = room && online.you && room.hostId === online.you.userId;
	// Only the host removes players (if the host is away too, nobody could: then anybody may)
	const hostPlayer = room && room.players.find((p) => p.userId === room.hostId);
	const hostAway = !!hostPlayer && !hostPlayer.online && hostPlayer.awayMs + (Date.now() - seen) >= room.forfeitAfterMs;
	const canRemove = !spectating && turnPlayer && away >= room.forfeitAfterMs && turnPlayer.userId !== online.you?.userId && (isHost || hostAway);
	const ended = room && room.status === 'abandoned' && !spectating;

	if (ended) {
		return (
			<div className="overlay" role="alertdialog" aria-label="Game abandoned">
				<div className="modal">
					<h3 className="modal-title">Game abandoned</h3>
					<p className="muted">This game was ended without a winner. It stays in your History.</p>
					<div className="modal-actions">
						<button className="btn-primary" onClick={() => { window.location.assign(`/history/${room.id}`); }}>Open History</button>
					</div>
				</div>
			</div>
		);
	}
	return (
		<div className="game-bar" ref={barRef}>
			<button className="btn-ghost" onClick={leave}>{spectating ? '← Live games' : '← Menu'}</button>
			<SoundButton />
			<span className="gb-brand">
				<span className="gb-mark" aria-hidden="true">A</span>
				<b>ACT Monopoly</b>
				<span className="gb-sub">{isOnline ? `Game #${online.room.id} · Online · ${online.room.players.length} players` : 'Local game'}</span>
			</span>
			{spectating && <span className="gb-watch" title="You are watching: you can not play or click on the board"><i aria-hidden="true" />Spectating{online.room.watching > 1 ? ` · ${online.room.watching} watching` : ''}</span>}
			{isOnline && !spectating && online.room.watching > 0 && <span className="gb-watching" title={`${online.room.watching} spectator${online.room.watching === 1 ? ' is' : 's are'} watching this game`}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>{online.room.watching}<span className="gb-watching-word"> watching</span></span>}
			{isOnline && <span className="gb-conn"><i aria-hidden="true" />{online.room.players.length - offlineCount} connected</span>}
			{isOnline ? (
				<>
					{info.desync ? (
						<button className="btn-danger" onClick={() => window.location.reload()} title={`${info.desyncWhy || 'The game screens differ'}. Reloading replays the game from the start.`}>Out of sync – reload</button>
					) : (
						<span className={`save-state ${info.myTurn ? 'saved' : ''}`}>
							{info.over ? 'Game over' : info.turnName ? (info.myTurn && !spectating ? 'Your turn' : `${info.turnName}'s turn`) : ''}
						</span>
					)}
					{online.conn !== 'open' && <span className="save-state offline">Reconnecting…</span>}
					{offlineCount > 0 && !info.over && <span className="save-state offline">{offlineCount} away</span>}
					{!spectating && info.waitingMe && !info.myTurn && <span className="save-state saved">Your move</span>}
					{turnPlayer && !turnPlayer.online && !canRemove && (
						<span className="save-state offline gb-away">{turnPlayer.name} is away{away >= room.forfeitAfterMs ? ' (the host can remove them)' : ` (${Math.max(0, Math.ceil((room.forfeitAfterMs - away) / 1000))}s)`}</span>
					)}
					{canRemove && (
						<button className="btn-danger" onClick={() => setAsk({ kind: 'remove', seat: turnPlayer.seat, name: turnPlayer.name })} title="Removes them from the game; their properties return to the bank">
							Remove {turnPlayer.name}
						</button>
					)}
					{!spectating && isHost && room.status === 'active' && (
						<button className="btn-ghost" onClick={() => setAsk({ kind: 'abandon' })}>Abandon game</button>
					)}
					{ask && createPortal( // (outside the bar: the bar has its own positioning, the dialog must cover the whole page)
						<Modal onClose={() => setAsk(null)}>
							<h3 className="modal-title">{ask.kind === 'abandon' ? 'Abandon the game?' : `Remove ${ask.name}?`}</h3>
							<p className="muted">
								{ask.kind === 'abandon'
									? 'Are you sure you want to abandon the game? It ends for everybody without a winner (you can bring it back later from History).'
									: `Are you sure you want to remove ${ask.name} from the game? Their properties return to the bank (they are not auctioned) and the game goes on. This cannot be undone.`}
							</p>
							<div className="modal-actions">
								<button className="btn-ghost" onClick={() => setAsk(null)}>Cancel</button>
								<button className="btn-danger" onClick={() => { if (ask.kind === 'abandon') send({ t: 'abandon' }); else forfeitPlayer(ask.seat); setAsk(null); }}>{ask.kind === 'abandon' ? 'Abandon game' : 'Remove player'}</button>
							</div>
						</Modal>,
						document.body,
					)}
				</>
			) : (
				LABEL[status] && <span className={`save-state ${status}`}>{LABEL[status]}</span>
			)}
		</div>
	);
}
