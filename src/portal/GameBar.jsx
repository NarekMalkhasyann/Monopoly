import { useEffect, useState } from 'react';
import { subscribeStatus } from '../session.js';
import { subscribeGameInfo, forfeitPlayer } from '../onlineGame.js';
import { send } from '../online.js';
import { navigate } from '../router.jsx';
import { useOnline } from '../online.js';

const LABEL = { idle: '', saving: 'Saving…', saved: 'Saved', offline: 'Offline – will retry' };

// Small floating bar over the game: back to the menu, save status (local games) and,
// in online games, whose turn it is and the connection state.
// Going back reloads the page, which gives the next game a clean engine.
export default function GameBar() {
	const [status, setStatus] = useState('idle');
	const [info, setInfo] = useState({});
	const online = useOnline();
	const isOnline = !!online.room && online.room.status !== 'waiting';
	useEffect(() => subscribeStatus(setStatus), []);
	useEffect(() => subscribeGameInfo(setInfo), []);

	const leave = () => window.location.assign('/play');
	const offlineCount = isOnline ? online.room.players.filter((p) => !p.online).length : 0;

	// Seconds each player has been away, counted from when the server last told us.
	const [, tick] = useState(0);
	const [seen, setSeen] = useState(Date.now());
	useEffect(() => setSeen(Date.now()), [online.room]);
	useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
	const room = isOnline ? online.room : null;
	const turnPlayer = room && info.turnName ? room.players.find((p) => p.name === info.turnName) : null;
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
		<div className="game-bar">
			<button className="btn-ghost" onClick={leave}>← Menu</button>
			{isOnline ? (
				<>
					{info.desync ? (
						<button className="btn-danger" onClick={() => window.location.reload()} title="Replays the game from the start">Out of sync – reload</button>
					) : (
						<span className={`save-state ${info.myTurn ? 'saved' : ''}`}>
							{info.turnName ? (info.myTurn ? 'Your turn' : `${info.turnName}'s turn`) : ''}
						</span>
					)}
					{online.conn !== 'open' && <span className="save-state offline">Reconnecting…</span>}
					{offlineCount > 0 && <span className="save-state offline">{offlineCount} away</span>}
					{info.waitingMe && !info.myTurn && <span className="save-state saved">Your move</span>}
					{turnPlayer && !turnPlayer.online && !canRemove && (
						<span className="save-state offline">{turnPlayer.name} is away ({Math.max(0, Math.ceil((room.forfeitAfterMs - away) / 1000))}s)</span>
					)}
					{canRemove && (
						<button className="btn-danger" onClick={() => forfeitPlayer(turnPlayer.seat)} title="Removes them from the game; their properties return to the bank">
							Remove {turnPlayer.name}
						</button>
					)}
					{isHost && room.status === 'active' && (
						<button className="btn-ghost" onClick={() => window.confirm('End this game for everybody without a winner?') && send({ t: 'abandon' })}>Abandon game</button>
					)}
				</>
			) : (
				LABEL[status] && <span className={`save-state ${status}`}>{LABEL[status]}</span>
			)}
		</div>
	);
}
