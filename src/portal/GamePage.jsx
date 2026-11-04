import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { resumeGame } from '../session.js';
import { joinById, leaveRoom, useOnline } from '../online.js';
import { startOnlineGame } from '../onlineGame.js';
import { startLoading, setLoading, finishLoading } from '../loading.js';
import { navigate } from '../router.jsx';
import Shell from './Shell.jsx';
import Lobby from './Lobby.jsx';

// /play/:id - decides what a saved game is and shows the right thing:
//   local, unfinished  -> loads the saved position into the engine
//   online, waiting    -> the lobby
//   online, started    -> the board, in sync with the other players
//   finished           -> its History page
// While the board is on screen this renders nothing; App.jsx shows the game itself.
export default function GamePage({ id, user, live, onLive }) {
	const [game, setGame] = useState(null);
	const [error, setError] = useState('');
	const online = useOnline();
	const room = online.room && String(online.room.id) === String(id) ? online.room : null;
	const resumed = useRef(false);

	// 1. find out what kind of game this is
	useEffect(() => {
		let stale = false;
		api('GET', `/games/${id}`).then(({ game: g }) => {
			if (stale) return;
			if (g.status === 'finished' || g.status === 'abandoned') { navigate(`/history/${id}`, { replace: true }); return; }
			setGame(g);
			if (g.mode === 'local' || g.status === 'active') { startLoading('Loading your game', g.mode === 'online' ? 'Connecting to the room…' : 'Fetching your game…'); setLoading(0.05); }
			if (g.mode === 'online') {
				joinById(id).catch((e) => setError(e.message));
			} else if (!g.snapshot) {
				setError('This game has no saved position yet.');
			} else {
				setLoading(0.2, 'Setting up the board');
				onLive(true); // show the board first, then load the position into it
			}
		}).catch((e) => !stale && setError(e.message));
		return () => { stale = true; };
	}, [id]);

	// 2a. local game: put the saved position into the engine (once the board is visible)
	useEffect(() => {
		if (!live || !game || game.mode !== 'local' || resumed.current) return;
		resumed.current = true;
		const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60))); // lets the bar draw between the steps
		(async () => {
			try {
				setLoading(0.45, 'Restoring players and properties');
				await paint();
				resumeGame(game);
				setLoading(0.9, 'Drawing the board');
				await paint();
				finishLoading();
			} catch (e) { setError(e.message); onLive(false); finishLoading(0); }
		})();
	}, [live, game]);

	// 2b. online game that has started: show the board, then start the engine in sync
	const active = room && room.status === 'active';
	useEffect(() => {
		if (active) { setLoading(0.1, 'Joined the room'); onLive(true); }
	}, [active]);
	useEffect(() => {
		if (active && live && online.you) startOnlineGame(room, online.you);
	}, [active, live]);

	useEffect(() => { if (error || online.error) finishLoading(0); }, [error, online.error]); // never leave the loading screen over an error

	// Leaving the lobby any other way than the Leave button (e.g. the Back button) frees the seat.
	const roomRef = useRef(null);
	roomRef.current = room;
	useEffect(() => () => {
		if (roomRef.current && roomRef.current.status === 'waiting') leaveRoom().catch(() => {});
	}, []);

	if (live) return null;

	const message = error || online.error;
	if (message && !room) {
		return (
			<Shell user={user} screen="home" title="Game">
				<div className="page-head"><h2>Cannot open this game</h2></div>
				<p className="auth-error" role="alert">{message}</p>
				<button className="btn-ghost" onClick={() => navigate('/play')}>Back to Play</button>
			</Shell>
		);
	}
	if (room && room.status === 'waiting') {
		return (
			<Shell user={user} screen="home" title="Online room">
				<Lobby room={room} you={online.you} error={online.error} />
			</Shell>
		);
	}
	return (
		<Shell user={user} screen="home" title="Game">
			<p className="muted">Loading game…</p>
		</Shell>
	);
}
