import { useEffect, useState } from 'react';
import { joinByCode } from '../online.js';
import { navigate } from '../router.jsx';
import Shell from './Shell.jsx';

// /join/:code - joins the room with this code, then continues at /play/:id.
export default function JoinPage({ code, user }) {
	const [error, setError] = useState('');
	useEffect(() => {
		let stale = false;
		joinByCode(code).then((room) => { if (!stale) navigate(`/play/${room.id}`, { replace: true }); })
			.catch((e) => !stale && setError(e.message));
		return () => { stale = true; };
	}, [code]);

	return (
		<Shell user={user} screen="home" title="Join a game">
			<div className="page-head"><h2>Join a game</h2></div>
			{!error && <p className="muted">Joining room {code.toUpperCase()}…</p>}
			{error && (
				<>
					<p className="auth-error" role="alert">{error}</p>
					<button className="btn-ghost" onClick={() => navigate('/play')}>Back to Play</button>
				</>
			)}
		</Shell>
	);
}
