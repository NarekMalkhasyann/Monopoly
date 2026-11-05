import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from './format.js';
import Replay from './Replay.jsx';

export function Modal({ onClose, children, wide = false }) {
	return (
		<div className="overlay" onClick={onClose}>
			<div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
		</div>
	);
}

// One game: players, the written log, and Replay. Used by History (your own games) and by the admin
// panel (any game; `admin` adds who made it and the "end game" / "delete" buttons).
//   onReplay(true | false) switches between the details and the replay
//   onOpen   Resume / Rejoin (not shown to admins looking at somebody else's game)
//   onChanged is called after an admin ended or deleted the game
export function Details({ id, replay, onClose, onReplay, onOpen, admin = false, onChanged }) {
	const [game, setGame] = useState(null);
	const [error, setError] = useState('');
	const [ask, setAsk] = useState(''); // '' | 'abandon' | 'delete': waiting for the admin to confirm
	const [busy, setBusy] = useState(false);

	const load = () => api('GET', `/games/${id}`).then((r) => setGame(r.game)).catch((e) => setError(e.message));
	useEffect(() => { load(); }, [id]);

	const act = async () => {
		setBusy(true);
		try {
			if (ask === 'abandon') { await api('POST', `/admin/games/${id}/abandon`); await load(); setAsk(''); }
			else { await api('DELETE', `/admin/games/${id}`); onChanged && onChanged(); onClose(); return; }
			onChanged && onChanged();
		} catch (e) { setError(e.message); setAsk(''); }
		setBusy(false);
	};

	if (replay && game) {
		return (
			<Modal onClose={onClose} wide>
				<Replay events={game.events} players={game.players} onClose={() => onReplay(false)} />
			</Modal>
		);
	}

	const running = game && game.mode === 'online' && game.status === 'active';
	return (
		<Modal onClose={onClose}>
			<h3 className="modal-title">Game #{id}</h3>
			{error && <p className="auth-error">{error}</p>}
			{!game && !error && <p className="muted">Loading…</p>}
			{game && (
				<>
					<p className="muted">
						{game.mode === 'local' ? 'On this device' : `Online (room ${game.room_code})`} · {game.status === 'finished' ? `finished ${fmtDate(game.finished_at)}` : game.status === 'abandoned' ? 'abandoned' : 'in progress'} · {game.turn_count} turns
					</p>
					{admin && game.owner && <p className="muted">Created by <strong>{game.owner.name}</strong> ({game.owner.email}) · {fmtDate(game.created_at)}</p>}
					<table className="table">
						<thead><tr><th>#</th><th>Player</th><th>Money</th></tr></thead>
						<tbody>
							{[...game.players].sort((a, b) => (a.final_rank || 99) - (b.final_rank || 99) || a.seat - b.seat).map((p) => (
								<tr key={p.seat}>
									<td>{p.final_rank || '–'}</td>
									<td><span className="player-chip"><i style={{ background: p.color }} />{p.name}{p.is_ai ? ' (AI)' : ''}</span></td>
									<td>{p.final_money == null ? '–' : `$${p.final_money}`}</td>
								</tr>
							))}
						</tbody>
					</table>
					<h4 className="log-title">Game log</h4>
					<div className="log">
						{game.events.length === 0 && <p className="muted">Nothing recorded yet.</p>}
						{game.events.map((e) => <div key={e.seq}><span className="log-turn">T{e.turn}</span>{e.text}</div>)}
					</div>
					{ask && (
						<p className="notice">
							{ask === 'abandon' ? 'End this running game for everybody? The players are told it was abandoned.' : 'Delete this game and its log for good? This cannot be undone.'}
						</p>
					)}
				</>
			)}
			<div className="modal-actions">
				{ask ? (
					<>
						<button className="btn-ghost" onClick={() => setAsk('')} disabled={busy}>Cancel</button>
						<button className="btn-danger" onClick={act} disabled={busy}>{ask === 'abandon' ? 'End game' : 'Delete'}</button>
					</>
				) : (
					<>
						{game && onOpen && !admin && game.status === 'active' && <button className="btn-primary btn-sm" onClick={onOpen}>{game.mode === 'online' ? 'Rejoin' : 'Resume'}</button>}
						{game && game.events.length > 0 && <button className="btn-ghost btn-sm" onClick={() => onReplay(true)}>Replay</button>}
						{game && admin && running && <button className="btn-ghost danger btn-sm" onClick={() => setAsk('abandon')}>End game</button>}
						{game && admin && !running && <button className="btn-ghost danger btn-sm" onClick={() => setAsk('delete')}>Delete</button>}
						<button className="btn-ghost" onClick={onClose}>Close</button>
					</>
				)}
			</div>
		</Modal>
	);
}
