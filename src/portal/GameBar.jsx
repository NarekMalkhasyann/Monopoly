import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeStatus } from '../session.js';
import { subscribeGameInfo, forfeitPlayer } from '../onlineGame.js';
import { send } from '../online.js';
import { navigate } from '../router.jsx';
import { useOnline } from '../online.js';
import { Modal } from './GameDetails.jsx';

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

	const leave = () => window.location.assign('/play');
	const offlineCount = isOnline ? online.room.players.filter((p) => !p.online).length : 0;

	// Seconds each player has been away, counted from when the server last told us.
	const [, tick] = useState(0);
	const [seen, setSeen] = useState(Date.now());
	useEffect(() => setSeen(Date.now()), [online.room]);
	useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
	const room = isOnline ? online.room : null;
	const turnPlayer = room && !info.over && info.turnName ? room.players.find((p) => p.name === info.turnName) : null;
	const away = turnPlayer && !turnPlayer.online ? turnPlayer.awayMs + (Date.now() - seen) : 0;
	const canRemove = turnPlayer && away >= room.forfeitAfterMs && turnPlayer.userId !== online.you?.userId;
	const isHost = room && online.you && room.hostId === online.you.userId;
	const ended = room && room.status === 'abandoned';

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
			<button className="btn-ghost" onClick={leave}>← Menu</button>
			<span className="gb-brand">
				<span className="gb-mark" aria-hidden="true">A</span>
				<b>ACT Monopoly</b>
				<span className="gb-sub">{isOnline ? `Game #${online.room.id} · Online · ${online.room.players.length} players` : 'Local game'}</span>
			</span>
			{isOnline && <span className="gb-conn"><i aria-hidden="true" />{online.room.players.length - offlineCount} connected</span>}
			{isOnline ? (
				<>
					{info.desync ? (
						<button className="btn-danger" onClick={() => window.location.reload()} title={`${info.desyncWhy || 'The game screens differ'}. Reloading replays the game from the start.`}>Out of sync – reload</button>
					) : (
						<span className={`save-state ${info.myTurn ? 'saved' : ''}`}>
							{info.over ? 'Game over' : info.turnName ? (info.myTurn ? 'Your turn' : `${info.turnName}'s turn`) : ''}
						</span>
					)}
					{online.conn !== 'open' && <span className="save-state offline">Reconnecting…</span>}
					{offlineCount > 0 && !info.over && <span className="save-state offline">{offlineCount} away</span>}
					{info.waitingMe && !info.myTurn && <span className="save-state saved">Your move</span>}
					{turnPlayer && !turnPlayer.online && !canRemove && (
						<span className="save-state offline">{turnPlayer.name} is away ({Math.max(0, Math.ceil((room.forfeitAfterMs - away) / 1000))}s)</span>
					)}
					{canRemove && (
						<button className="btn-danger" onClick={() => setAsk({ kind: 'remove', seat: turnPlayer.seat, name: turnPlayer.name })} title="Removes them from the game; their properties return to the bank">
							Remove {turnPlayer.name}
						</button>
					)}
					{isHost && room.status === 'active' && (
						<button className="btn-ghost" onClick={() => setAsk({ kind: 'abandon' })}>Abandon game</button>
					)}
					{ask && createPortal( // (outside the bar: the bar has its own positioning, the dialog must cover the whole page)
						<Modal onClose={() => setAsk(null)}>
							<h3 className="modal-title">{ask.kind === 'abandon' ? 'Abandon the game?' : `Remove ${ask.name}?`}</h3>
							<p className="muted">
								{ask.kind === 'abandon'
									? 'Are you sure you want to abandon the game? It ends for everybody without a winner (you can bring it back later from History).'
									: `Are you sure you want to remove ${ask.name} from the game? Their properties return to the bank. This cannot be undone.`}
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
