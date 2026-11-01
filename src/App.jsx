import { useEffect, useState } from 'react';
import Popups from './components/Popups.jsx';
import Deed from './components/Deed.jsx';
import Board from './components/Board.jsx';
import MoneyBar from './components/MoneyBar.jsx';
import Setup from './components/Setup.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import TradePanel from './components/TradePanel.jsx';
import Dice3D from './components/Dice3D.jsx';
import TurnTimer from './components/TurnTimer.jsx';
import useFitBoard from './hooks/useFitBoard.js';
import AuthScreen from './portal/AuthScreen.jsx';
import Shell from './portal/Shell.jsx';
import Home from './portal/Home.jsx';
import History from './portal/History.jsx';
import GameBar from './portal/GameBar.jsx';
import GamePage from './portal/GamePage.jsx';
import JoinPage from './portal/JoinPage.jsx';
import NotFound from './portal/NotFound.jsx';
import { api, getToken, setToken } from './api.js';
import { getRunningKey } from './session.js';
import { useLocation, matchRoute, navigate, gameKey } from './router.jsx';
import './portal/portal.css';

const TITLES = { home: 'Play', history: 'History', historyDetail: 'History', historyReplay: 'History', join: 'Join a game', notfound: 'Not found' };

// Every page has its own address (see router.jsx):
//   /login  /register  /play  /play/local  /play/:id  /join/:code  /history  /history/:id
//
// The game markup is always mounted: the engine (public/engine/monopoly.js) wires up
// its elements by id when the page loads, so it cannot be created later. It is simply
// hidden while a portal page is showing.
//
// The board sits in #stage > #stage-inner so useFitBoard can shrink it on small
// screens. The control panel and money bar stay outside, at normal size: on wide
// screens they overlay / sit beside the board (see styles.css), on narrow screens
// they stack below it (Roll Dice first, then the players).
export default function App() {
	useFitBoard();

	const location = useLocation();
	const route = matchRoute(location);
	const [user, setUser] = useState(getToken() ? undefined : null); // undefined = checking the saved login
	const [gameLive, setGameLive] = useState(false); // /play/:id is showing the board

	useEffect(() => {
		if (user !== undefined) return;
		api('GET', '/me').then((r) => setUser(r.user)).catch(() => { setToken(null); setUser(null); });
	}, [user]);

	// Redirects: / -> /play, signed out -> /login, signed in on /login -> where you were going.
	useEffect(() => {
		if (user === undefined) return;
		const isAuthPage = route.name === 'login' || route.name === 'register';
		if (route.name === 'root') navigate(user ? '/play' : '/login', { replace: true });
		else if (!user && !isAuthPage) navigate(`/login?next=${encodeURIComponent(location)}`, { replace: true });
		else if (user && isAuthPage) {
			const next = route.search.get('next');
			navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/play', { replace: true });
		}
	}, [user, location]);

	// One page load can play one game (the engine keeps its state in page-wide variables):
	// moving to another game, or away from this one, reloads the page on the new address.
	useEffect(() => {
		const running = getRunningKey();
		if (running && gameKey(location) !== running) window.location.reload();
	}, [location]);

	useEffect(() => {
		document.title = `${TITLES[route.name] || (route.name === 'login' ? 'Sign in' : route.name === 'register' ? 'Create account' : 'Game')} · YerevanPoly`;
	}, [route.name]);

	// The game already running on this page (e.g. a new local game just got its number: /play/local -> /play/12)
	const running = getRunningKey();
	const showGame = !!user && (route.name === 'local' || (route.name === 'game' && (gameLive || running === route.params.id)));

	let page = null;
	if (user === undefined) {
		page = <div className="boot">Loading…</div>;
	} else if (user === null) {
		if (route.name === 'login' || route.name === 'register') {
			page = <AuthScreen mode={route.name} onLogin={(u) => setUser(u)} />;
		}
	} else if (route.name === 'game') {
		if (running !== route.params.id) page = <GamePage id={route.params.id} user={user} live={gameLive} onLive={setGameLive} />;
	} else if (route.name === 'join') {
		page = <JoinPage code={route.params.code} user={user} />;
	} else if (route.name === 'home' || route.name === 'history' || route.name === 'historyDetail' || route.name === 'historyReplay' || route.name === 'notfound') {
		page = (
			<Shell user={user} screen={route.name === 'home' ? 'home' : route.name === 'notfound' ? '' : 'history'} title={TITLES[route.name]}>
				{route.name === 'home' && <Home user={user} />}
				{(route.name === 'history' || route.name === 'historyDetail' || route.name === 'historyReplay') && <History detailId={route.params.id} replay={route.name === 'historyReplay'} />}
				{route.name === 'notfound' && <NotFound />}
			</Shell>
		);
	}

	return (
		<>
			<div id="game-root" style={showGame ? undefined : { display: 'none' }}>
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
				<Dice3D active={showGame} />
				{showGame && <TurnTimer />}
				{showGame && <GameBar />}
			</div>
			{page}
		</>
	);
}
