import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { subscribeGameEnd } from '../session.js';
import { Modal } from './GameDetails.jsx';
import Recap from './Recap.jsx';

// Shown over the board when a game ends (for every player of an online game): waits until the server has the finished
// game and its log, then shows the recap. Going on to the replay or the menu reloads the page, which gives the next game a clean engine.
export default function RecapOverlay() {
	const [game, setGame] = useState(null);
	const [shown, setShown] = useState(false);

	useEffect(() => subscribeGameEnd(({ id }) => {
		if (!id) return;
		let tries = 0;
		const poll = () => {
			api('GET', `/games/${id}`).then(({ game: g }) => {
				if (g.status === 'finished' && g.events && g.events.length) { setGame(g); setShown(true); }
				else if (++tries < 12) setTimeout(poll, 1200);
			}).catch(() => { if (++tries < 12) setTimeout(poll, 1500); });
		};
		poll();
	}), []);

	if (!shown || !game) return null;
	const go = (path) => { window.location.assign(path); };
	return (
		<Modal wide onClose={() => setShown(false)}>
			<h3 className="modal-title">Game over</h3>
			<Recap game={game} onReplay={() => go(`/history/${game.id}/replay`)} onClose={() => go('/play')} closeLabel="Back to menu" />
			<p className="rc-keep"><button className="link-btn" onClick={() => setShown(false)}>Look at the board</button></p>
		</Modal>
	);
}
