import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { watchRooms, clearError } from '../online.js';
import { navigate } from '../router.jsx';

const Lock = ({ open }) => (
	<svg className={`lock ${open ? 'lock-open' : 'lock-shut'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={open ? 'Open room' : 'Private room'}>
		<rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fillOpacity=".15" />
		<path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
	</svg>
);

// Online rooms that are still waiting for players. An open lock = anybody can join; a closed lock = private,
// the Join button asks for the password. Started games are not listed. The server says when the list may have
// changed; it is also re-read every 15 seconds.
export default function RoomsSidebar({ excludeId, onJoin }) {
	const [rooms, setRooms] = useState(null);
	const [error, setError] = useState('');
	const [asking, setAsking] = useState(null); // id of the private room whose password is being typed
	const [pw, setPw] = useState('');
	const [busy, setBusy] = useState(0);
	const [fail, setFail] = useState({}); // room id -> message

	const load = useCallback(() => {
		api('GET', '/rooms').then((r) => { setRooms(r.rooms); setError(''); }).catch((e) => setError(e.message));
	}, []);
	useEffect(() => {
		load();
		const off = watchRooms(load);
		const t = setInterval(load, 15000);
		return () => { off(); clearInterval(t); };
	}, [load]);

	const join = async (r, password) => {
		setBusy(r.id); setFail((f) => ({ ...f, [r.id]: '' }));
		try {
			const room = await onJoin(r.code, password);
			navigate(`/play/${room.id}`);
		} catch (e) {
			setFail((f) => ({ ...f, [r.id]: e.message }));
			if (e.code === 'password') setPw('');
			clearError(); // the message belongs to this list item, not to the whole room page
			load();
		}
		setBusy(0);
	};
	const shown = rooms && rooms.filter((r) => r.id !== excludeId); // not the room you are already in

	return (
		<aside className="rooms-side" aria-label="Open rooms">
			<h3>Rooms {shown && <span className="muted count">{shown.length}</span>}</h3>
			{error && <p className="auth-error" role="alert">{error}</p>}
			{shown && shown.length === 0 && <p className="muted rooms-empty">No other rooms waiting right now.</p>}
			<ul>
				{(shown || []).map((r) => (
					<li key={r.id} className="room-item">
						<div className="room-top">
							<span className="room-who"><Lock open={!r.isPrivate} /><b>{r.host}</b></span>
							{!r.isPrivate && <span className="room-code">{r.code}</span>}
						</div>
						<div className="room-bottom">
							<span className="room-dots">{r.colors.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
							<span className="muted">{r.players} / {r.max}</span>
							{r.players >= r.max
								? <span className="badge badge-pending">Full</span>
								: <button className="btn-primary btn-sm" disabled={busy === r.id} onClick={() => (r.isPrivate ? (setAsking(asking === r.id ? null : r.id), setPw('')) : join(r))}>
									{r.isPrivate ? 'Join…' : 'Join'}
								</button>}
						</div>
						{r.isPrivate && asking === r.id && (
							<form className="room-pass" onSubmit={(e) => { e.preventDefault(); if (pw) join(r, pw); }}>
								<input className="code-input" type="password" autoFocus autoComplete="off" placeholder="Room password" aria-label={`Password of ${r.host}'s room`} value={pw} maxLength={40} onChange={(e) => setPw(e.target.value)} />
								<button className="btn-primary btn-sm" type="submit" disabled={!pw || busy === r.id}>Enter</button>
							</form>
						)}
						{fail[r.id] && <p className="auth-error room-err" role="alert">{fail[r.id]}</p>}
					</li>
				))}
			</ul>
		</aside>
	);
}
