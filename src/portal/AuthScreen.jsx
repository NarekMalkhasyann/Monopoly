import { useState } from 'react';
import { api, setToken } from '../api.js';

// Split layout from the design system: form on the left, brand panel on the right
// (hidden below 1200px). Underline inputs, white submit button.
export default function AuthScreen({ onLogin }) {
	const [mode, setMode] = useState('login'); // login | register
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	const submit = async (e) => {
		e.preventDefault();
		setError('');
		setBusy(true);
		try {
			const body = mode === 'register' ? { name, email, password } : { email, password };
			const { token, user } = await api('POST', `/auth/${mode}`, body);
			setToken(token);
			onLogin(user);
		} catch (err) {
			setError(err.message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="auth">
			<div className="auth-form-side">
				<h3>{mode === 'login' ? 'Sign in' : 'Create account'}</h3>
				<p>{mode === 'login' ? 'Welcome back. Your games are waiting.' : 'Save every game you play and continue it any time.'}</p>
				<form onSubmit={submit}>
					{mode === 'register' && (
						<input type="text" placeholder="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
					)}
					<input type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
					<input type="password" placeholder="Password (min 8 characters)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === 'register' ? 8 : undefined} required />
					{error && <div className="auth-error" role="alert">{error}</div>}
					<button type="submit" className="btn-white" disabled={busy}>
						{busy && <span className="spinner" />}
						{mode === 'login' ? 'Sign in' : 'Create account'}
					</button>
					<button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
						{mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
					</button>
				</form>
			</div>
			<div className="auth-art">
				<h2>Yerevan<span>Poly</span></h2>
				<p>Buy, trade and bankrupt your friends. Play on one screen or, soon, across devices.</p>
			</div>
		</div>
	);
}
