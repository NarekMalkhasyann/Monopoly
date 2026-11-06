import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { watchRooms } from '../online.js';
import { navigate } from '../router.jsx';

// The open rooms: public online games that are still waiting for players. Started games and private rooms
// are not listed. The server says when the list may have changed; it is also re-read every 15 seconds.
export default function RoomsSidebar({ excludeId, onJoin = (code) => navigate(`/join/${code}`) }) {
	const [rooms, setRooms] = useState(null);
	const [error, setError] = useState('');

	const load = useCallback(() => {
		api('GET', '/rooms').then((r) => { setRooms(r.rooms); setError(''); }).catch((e) => setError(e.message));
	}, []);
	useEffect(() => {
		load();
		const off = watchRooms(load);
		const t = setInterval(load, 15000);
		return () => { off(); clearInterval(t); };
	}, [load]);

	const shown = rooms && rooms.filter((r) => r.id !== excludeId); // not the room you are already in

	return (
		<aside className="rooms-side" aria-label="Open rooms">
			<h3>Open rooms {shown && <span className="muted count">{shown.length}</span>}</h3>
			<p className="muted rooms-hint">Public games waiting for players. Click one to join.</p>
			{error && <p className="auth-error" role="alert">{error}</p>}
			{shown && shown.length === 0 && <p className="muted rooms-empty">No other open rooms right now.</p>}
			<ul>
				{(shown || []).map((r) => (
					<li key={r.id}>
						<button className="room-item" onClick={() => onJoin(r.code)} title={`Join ${r.host}'s room`}>
							<span className="room-top"><b>{r.host}</b><span className="room-code">{r.code}</span></span>
							<span className="room-bottom">
								<span className="room-dots">{r.colors.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
								<span className="muted">{r.players} / {r.max} players</span>
							</span>
						</button>
					</li>
				))}
			</ul>
		</aside>
	);
}
