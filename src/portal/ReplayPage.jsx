import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { startReplayGame } from '../onlineGame.js';
import { startLoading, setLoading, finishLoading } from '../loading.js';
import { navigate } from '../router.jsx';
import Shell from './Shell.jsx';

// /replay/:id - a finished online game played again on the real board (read only, like watching a live game).
// The moves come from the server; ?at=N&speed=S&play=0|1 are set when the page is loaded again to go back in time.
export default function ReplayPage({ id, user, live, onLive, search }) {
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const started = useRef(false);

	useEffect(() => {
		let stale = false;
		startLoading('Loading the replay', 'Fetching the moves…'); setLoading(0.1);
		api('GET', `/games/${id}/replay`).then((d) => {
			if (stale) return;
			setData(d); setLoading(0.25, 'Setting up the board'); onLive(true);
		}).catch((e) => { // no saved moves (an older game): the step-by-step replay from the log
			if (stale) return;
			finishLoading(0);
			if (/no saved moves/i.test(e.message)) navigate(`/history/${id}/replay`, { replace: true }); else setError(e.message);
		});
		return () => { stale = true; };
	}, [id]);

	useEffect(() => {
		if (!live || !data || started.current) return;
		started.current = true;
		startReplayGame(data, {
			at: Number(search.get('at')) || 0,
			speed: [1, 2, 4].includes(Number(search.get('speed'))) ? Number(search.get('speed')) : 1,
			play: search.get('play') !== '0',
		});
	}, [live, data]);

	if (live) return null;
	if (error) {
		return (
			<Shell user={user} screen="history" title="Replay">
				<div className="page-head"><h2>Cannot replay this game</h2></div>
				<p className="auth-error" role="alert">{error}</p>
				<button className="btn-ghost" onClick={() => navigate(`/history/${id}`)}>Back to the game</button>
			</Shell>
		);
	}
	return null;
}
