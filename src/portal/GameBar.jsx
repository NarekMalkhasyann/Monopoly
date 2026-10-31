import { useEffect, useState } from 'react';
import { subscribeStatus } from '../session.js';
import { subscribeGameInfo } from '../onlineGame.js';
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
				</>
			) : (
				LABEL[status] && <span className={`save-state ${status}`}>{LABEL[status]}</span>
			)}
		</div>
	);
}
