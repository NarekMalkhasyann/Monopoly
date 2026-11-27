import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { useFeatures } from '../features.js';

// "Live games": the online games being played right now. Anybody can watch a PUBLIC room (read only, the board
// follows the game log). Private rooms are listed too, with a lock, but they cannot be watched (only an admin can,
// from Admin > Live).
function ago(ms) {
	const s = Math.max(0, Math.round(ms / 1000));
	return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function LiveGames({ user }) {
	const features = useFeatures();
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [at, setAt] = useState(Date.now());
	const [, tick] = useState(0);
	useEffect(() => {
		let stop = false;
		const load = () => api('GET', '/live').then((r) => { if (!stop) { setData(r); setAt(Date.now()); setError(''); } }).catch((e) => !stop && setError(e.message));
		load();
		const a = setInterval(() => { if (!document.hidden) load(); }, 3000);
		const b = setInterval(() => tick((n) => n + 1), 1000);
		return () => { stop = true; clearInterval(a); clearInterval(b); };
	}, []);
	if (!features.liveGames && !(user && user.role === 'admin')) return <><div className="page-head"><h2>Live games</h2></div><p className="muted">Live games are switched off at the moment. Please check back later.</p></>;
	const games = data ? data.games : [];
	const drift = Date.now() - at;
	return (
		<>
			<div className="page-head"><h2>Live games</h2></div>
			{!features.liveGames && <p className="muted">Switched off for players. Only you, as an admin, can see this page.</p>}
			<p className="muted live-head"><span className="live-dot on" /> {games.length} online game{games.length === 1 ? '' : 's'} being played right now. Public games can be watched; private ones are only listed.</p>
			{error && <p className="auth-error">{error}</p>}
			{!data && !error && <p className="muted">Loading…</p>}
			{data && games.length === 0 && <p className="muted">No online game is being played right now.</p>}
			<div className="rows">
				{games.map((g) => (
					<div className="row row-history" key={g.id}>
						<div className="row-main">
							<div className="row-tags">
								<span className="tag">#{g.id} · Online</span>
								<span className="badge badge-pending">In progress</span>
								{g.isPrivate ? <span className="badge badge-private" title="Private room: it can not be watched">🔒 Private</span> : <span className="badge badge-public">Public</span>}
								{g.mine && <span className="tag">You are playing</span>}
							</div>
							<span className="players">
								{g.players.map((p) => (
									<span key={p.seat} className="player-chip" title={p.online ? 'connected' : `away ${ago(p.awayMs + drift)}`}>
										<i style={{ background: p.color }} />
										{p.name}
										<span className={`live-dot${p.online ? ' on' : ''}`} />
									</span>
								))}
							</span>
							<span className="meta">{g.turns} turns · {g.idleMs == null ? 'no move yet' : `last move ${ago(g.idleMs + drift)} ago`}</span>
						</div>
						<div className="row-actions">
							{g.mine ? <button className="btn-ghost" onClick={() => navigate(`/play/${g.id}`)}>Open your game</button>
								: g.isPrivate ? <button className="btn-ghost" disabled title="Spectating is off for private rooms">Watching is off</button>
								: <button className="btn-primary btn-sm" onClick={() => navigate(`/live/${g.id}`)}>Watch</button>}
						</div>
					</div>
				))}
			</div>
		</>
	);
}
