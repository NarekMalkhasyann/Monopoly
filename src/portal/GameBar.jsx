import { useEffect, useState } from 'react';
import { subscribeStatus } from '../session.js';

const LABEL = { idle: '', saving: 'Saving…', saved: 'Saved', offline: 'Offline – will retry' };

// Small floating bar over the game: back to the menu + save status.
// Going back reloads the page, which gives the next game a clean engine.
export default function GameBar() {
	const [status, setStatus] = useState('idle');
	useEffect(() => subscribeStatus(setStatus), []);
	return (
		<div className="game-bar">
			<button className="btn-ghost" onClick={() => window.location.reload()}>← Menu</button>
			{LABEL[status] && <span className={`save-state ${status}`}>{LABEL[status]}</span>}
		</div>
	);
}
