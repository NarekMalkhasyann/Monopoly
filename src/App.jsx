import { useEffect, useState } from 'react';
import Popups from './components/Popups.jsx';
import Deed from './components/Deed.jsx';
import Board from './components/Board.jsx';
import MoneyBar from './components/MoneyBar.jsx';
import Setup from './components/Setup.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import TradePanel from './components/TradePanel.jsx';
import Dice3D from './components/Dice3D.jsx';
import useFitBoard from './hooks/useFitBoard.js';
import AuthScreen from './portal/AuthScreen.jsx';
import Shell from './portal/Shell.jsx';
import Home from './portal/Home.jsx';
import History from './portal/History.jsx';
import GameBar from './portal/GameBar.jsx';
import { api, getToken, setToken } from './api.js';
import { resumeGame } from './session.js';
import './portal/portal.css';

const TITLES = { home: 'Play', history: 'History' };

// Screens: login -> home / history (portal shell) -> game (the original engine UI).
//
// The game markup is always mounted: the engine (public/engine/monopoly.js)
// wires up its elements by id when the page loads, so it cannot be created
// later. It is simply hidden while a portal screen is showing.
//
// The board sits in #stage > #stage-inner so useFitBoard can shrink it on small
// screens. The control panel and money bar stay outside, at normal size: on
// wide screens they overlay / sit beside the board (see styles.css), on narrow
// screens they stack below it (Roll Dice first, then the players).
export default function App() {
	useFitBoard();

	const [user, setUser] = useState(getToken() ? undefined : null); // undefined = checking the saved login
	const [screen, setScreen] = useState('home');
	const [pending, setPending] = useState(null); // saved game waiting to be loaded into the engine
	const [notice, setNotice] = useState('');

	useEffect(() => {
		if (user !== undefined) return;
		api('GET', '/me').then((r) => setUser(r.user)).catch(() => { setToken(null); setUser(null); });
	}, [user]);

	useEffect(() => {
		if (screen !== 'game' || !pending) return;
		try {
			resumeGame(pending);
		} catch (e) {
			setNotice(e.message);
			setScreen('home');
		}
		setPending(null);
	}, [screen, pending]);

	const logout = () => { setToken(null); setUser(null); setScreen('home'); };

	const resume = async (id) => {
		setNotice('');
		try {
			const { game } = await api('GET', `/games/${id}`);
			if (!game.snapshot) throw new Error('This game has no saved position yet.');
			setPending(game);
			setScreen('game');
		} catch (e) {
			setNotice(e.message);
		}
	};

	const inGame = !!user && screen === 'game';

	return (
		<>
			<div id="game-root" style={inGame ? undefined : { display: 'none' }}>
				<Popups />
				<Deed />
				<div id="stage">
					<div id="stage-inner">
						<Board />
					</div>
				</div>
				<ControlPanel />
				<MoneyBar />
				<Setup />
				<TradePanel />
				<Dice3D />
				{inGame && <GameBar />}
			</div>

			{user === undefined && <div className="boot">Loading…</div>}
			{user === null && <AuthScreen onLogin={(u) => { setUser(u); setScreen('home'); }} />}
			{user && !inGame && (
				<Shell user={user} screen={screen} onNavigate={(s) => { setNotice(''); setScreen(s); }} onLogout={logout} title={TITLES[screen]}>
					{notice && <div className="notice" role="alert">{notice}</div>}
					{screen === 'home' && <Home user={user} onNewLocal={() => setScreen('game')} onResume={resume} onHistory={() => setScreen('history')} />}
					{screen === 'history' && <History onResume={resume} />}
				</Shell>
			)}
		</>
	);
}
