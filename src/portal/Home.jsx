import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from './format.js';
import PlayerDots from './PlayerDots.jsx';

export default function Home({ user, onNewLocal, onResume, onHistory }) {
	const [active, setActive] = useState(null);
	const [counts, setCounts] = useState({ active: 0, finished: 0 });
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([
			api('GET', '/games?status=active&limit=3'),
			api('GET', '/games?status=finished&limit=1'),
		]).then(([a, f]) => {
			setActive(a.games);
			setCounts({ active: a.total, finished: f.total });
		}).catch((e) => setError(e.message));
	}, []);

	const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

	return (
		<>
			<section className="welcome">
				<p className="muted">{today}</p>
				<h2>Welcome back, {user.name}!</h2>
				<p className="muted">Start a new game or pick up where you left off. Every game is saved to your history.</p>
			</section>

			<section className="stats">
				<div className="stat-card"><h3>In progress</h3><p className="num">{counts.active}</p></div>
				<div className="stat-card"><h3>Finished</h3><p className="num">{counts.finished}</p></div>
				<div className="stat-card"><h3>Total games</h3><p className="num">{counts.active + counts.finished}</p></div>
			</section>

			<h2 className="h2-sm">Start a game</h2>
			<section className="mode-grid">
				<div className="card">
					<h3>On this device</h3>
					<p className="muted">2 to 8 players share one screen. Mix humans and computer players.</p>
					<button className="btn-primary" onClick={onNewLocal}>New local game</button>
				</div>
				<div className="card card-off">
					<h3>Online <span className="badge badge-pending">Soon</span></h3>
					<p className="muted">Each player joins from their own device with a room code.</p>
					<button className="btn-primary" disabled>Create room</button>
				</div>
			</section>

			<h2 className="h2-sm">Continue playing</h2>
			{error && <p className="auth-error">{error}</p>}
			{active && active.length === 0 && <p className="muted">No unfinished games.</p>}
			<div className="rows">
				{(active || []).map((g) => (
					<div className="row" key={g.id}>
						<div className="row-main">
							<PlayerDots players={g.players} />
							<span className="meta">Turn {g.turn_count} · {fmtDate(g.updated_at)}</span>
						</div>
						<button className="btn-primary btn-sm" onClick={() => onResume(g.id)}>Resume</button>
					</div>
				))}
			</div>
			{counts.active > 3 && <button className="btn-ghost" onClick={onHistory}>See all games →</button>}
		</>
	);
}
