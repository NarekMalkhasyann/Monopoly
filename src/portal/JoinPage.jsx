import { useEffect, useState } from 'react';
import { joinByCode, clearError } from '../online.js';
import { navigate } from '../router.jsx';
import Shell from './Shell.jsx';

// /join/:code - joins the room with this code, then continues at /play/:id.
// A private room asks for its password first.
export default function JoinPage({ code, user }) {
	const [error, setError] = useState('');
	const [needPassword, setNeedPassword] = useState(false);
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(true);

	const attempt = (pw) => {
		setBusy(true); setError('');
		return joinByCode(code, pw)
			.then((room) => navigate(`/play/${room.id}`, { replace: true }))
			.catch((e) => {
				if (e.code === 'password') { setNeedPassword(true); setError(pw ? e.message : ''); } else { setNeedPassword(false); setError(e.message); }
				if (e.code === 'locked') setNeedPassword(true);
				setBusy(false);
			});
	};
	useEffect(() => { clearError(); attempt(''); }, [code]);

	return (
		<Shell user={user} screen="home" title="Join a game">
			<div className="page-head"><h2>Join a game</h2></div>
			{busy && !error && <p className="muted">Joining room {code.toUpperCase()}…</p>}
			{needPassword && (
				<form className="card join-pass" onSubmit={(e) => { e.preventDefault(); if (password) attempt(password); }}>
					<h3>Room {code.toUpperCase()} is private</h3>
					<p className="muted">Enter the password the host gave you.</p>
					<input className="code-input secret-input" type="text" autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" placeholder="Room password" aria-label="Room password" value={password} maxLength={40} onChange={(e) => setPassword(e.target.value)} />
					{error && <p className="auth-error" role="alert">{error}</p>}
					<div className="row-actions">
						<button className="btn-primary" type="submit" disabled={busy || !password}>{busy ? 'Joining…' : 'Join'}</button>
						<button className="btn-ghost" type="button" onClick={() => navigate('/play')}>Back to Play</button>
					</div>
				</form>
			)}
			{error && !needPassword && (
				<>
					<p className="auth-error" role="alert">{error}</p>
					<button className="btn-ghost" onClick={() => navigate('/play')}>Back to Play</button>
				</>
			)}
		</Shell>
	);
}
