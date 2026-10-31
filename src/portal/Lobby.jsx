import { useState } from 'react';
import { leaveRoom, startRoom, chooseColor, clearError } from '../online.js';
import { navigate } from '../router.jsx';

const PALETTE = ['yellow', 'blue', 'red', 'lime', 'green', 'aqua', 'orange', 'purple',
	'fuchsia', 'teal', 'maroon', 'navy', 'olive', 'silver', 'gray', 'black'];

// Waiting room of an online game: share the code, pick a colour, the host starts.
export default function Lobby({ room, you, error }) {
	const [copied, setCopied] = useState('');
	const isHost = you.userId === room.hostId;
	const link = `${window.location.origin}/join/${room.code}`;
	const me = room.players.find((p) => p.userId === you.userId);
	const taken = new Set(room.players.filter((p) => p.userId !== you.userId).map((p) => p.color));

	const copy = async (text, what) => {
		try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800); } catch { /* clipboard blocked */ }
	};
	const leave = async () => {
		try { await leaveRoom(); } catch { /* connection already gone */ }
		navigate('/play');
	};

	return (
		<div className="lobby">
			<div className="page-head"><h2>Online room</h2></div>

			<section className="card lobby-code">
				<p className="muted">Share this code, or the link, with your friends:</p>
				<div className="code" aria-label={`Room code ${room.code.split('').join(' ')}`}>{room.code}</div>
				<div className="row-actions">
					<button className="btn-ghost" onClick={() => copy(room.code, 'code')}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
					<button className="btn-ghost" onClick={() => copy(link, 'link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
				</div>
			</section>

			<h2 className="h2-sm">Players <span className="muted count">{room.players.length} / 8</span></h2>
			<div className="rows">
				{room.players.map((p) => (
					<div className="row" key={p.userId}>
						<div className="row-main">
							<span className="player-chip"><i style={{ background: p.color }} />{p.name}{p.userId === you.userId ? ' (you)' : ''}</span>
						</div>
						<div className="row-tags">
							{p.host && <span className="tag">Host</span>}
							<span className={`badge ${p.online ? 'badge-done' : 'badge-pending'}`}>{p.online ? 'Online' : 'Away'}</span>
						</div>
					</div>
				))}
			</div>

			<h2 className="h2-sm">Your colour</h2>
			<div className="swatches" role="radiogroup" aria-label="Your colour">
				{PALETTE.map((c) => (
					<button
						key={c}
						role="radio"
						aria-checked={me && me.color === c}
						aria-label={c}
						title={taken.has(c) ? `${c} (taken)` : c}
						className={`swatch${me && me.color === c ? ' on' : ''}`}
						style={{ background: c }}
						disabled={taken.has(c)}
						onClick={() => { clearError(); chooseColor(c).catch(() => {}); }}
					/>
				))}
			</div>

			{error && <p className="auth-error" role="alert">{error}</p>}

			<div className="lobby-actions">
				{isHost ? (
					<button className="btn-primary" disabled={room.players.length < 2} onClick={() => { clearError(); startRoom().catch(() => {}); }}>
						{room.players.length < 2 ? 'Waiting for players…' : 'Start game'}
					</button>
				) : (
					<p className="muted">Waiting for the host to start the game…</p>
				)}
				<button className="btn-ghost" onClick={leave}>Leave room</button>
			</div>
		</div>
	);
}
