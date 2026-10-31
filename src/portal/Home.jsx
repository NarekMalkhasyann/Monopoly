import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { createRoom } from '../online.js';
import { navigate } from '../router.jsx';
import { fmtDate } from './format.js';
import PlayerDots from './PlayerDots.jsx';

export default function Home({ user }) {
	const [active, setActive] = useState(null);
	const [counts, setCounts] = useState({ active: 0, finished: 0 });
	const [error, setError] = useState('');
	const [code, setCode] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		Promise.all([
			api('GET', '/games?status=active&limit=3'),
			api('GET', '/games?status=finished&limit=1'),
		]).then(([a, f]) => {
			setActive(a.games);
			setCounts({ active: a.total, finished: f.total });
		}).catch((e) => setError(e.message));
	}, []);

	const create = async () => {
		setBusy(true);
		setError('');
		try {
			const room = await createRoom();
			navigate(`/play/${room.id}`);
		} catch (e) {
			setError(e.message);
			setBusy(false);
		}
	};
	const join = (e) => {
		e.preventDefault();
		const c = code.trim();
		if (c) navigate(`/join/${encodeURIComponent(c.toUpperCase())}`);
	};

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
			{error && <p className="auth-error" role="alert">{error}</p>}
			<section className="mode-grid">
				<div className="card">
					<h3>On this device</h3>
					<p className="muted">2 to 8 players share one screen. Mix humans and computer players.</p>
					<button className="btn-primary" onClick={() => navigate('/play/local')}>New local game</button>
				</div>
				<div className="card">
					<h3>Online</h3>
					<p className="muted">Each player joins from their own device with a room code.</p>
					<button className="btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create room'}</button>
					<form className="join-form" onSubmit={join}>
						<input
							className="code-input"
							type="text"
							placeholder="Room code"
							aria-label="Room code"
							value={code}
							maxLength={10}
							autoCapitalize="characters"
							autoComplete="off"
							spellCheck={false}
							onChange={(e) => setCode(e.target.value)}
						/>
						<button className="btn-ghost" type="submit" disabled={!code.trim()}>Join</button>
					</form>
				</div>
			</section>

			<h2 className="h2-sm">Continue playing</h2>
			{active && active.length === 0 && <p className="muted">No unfinished games.</p>}
			<div className="rows">
				{(active || []).map((g) => (
					<div className="row" key={g.id}>
						<div className="row-main">
							<div className="row-tags"><span className="tag">{g.mode === 'local' ? 'This device' : `Online · ${g.room_code}`}</span></div>
							<PlayerDots players={g.players} />
							<span className="meta">Turn {g.turn_count} · {fmtDate(g.updated_at)}</span>
						</div>
						<button className="btn-primary btn-sm" onClick={() => navigate(`/play/${g.id}`)}>{g.mode === 'online' ? 'Rejoin' : 'Resume'}</button>
					</div>
				))}
			</div>
			{counts.active > 3 && <button className="btn-ghost" onClick={() => navigate('/history')}>See all games →</button>}
		</>
	);
}
