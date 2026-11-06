import { useState } from 'react';
import { leaveRoom, startRoom, chooseColor, clearError, setVisibility, joinByCode, kickPlayer } from '../online.js';
import { navigate } from '../router.jsx';
import RoomsSidebar from './RoomsSidebar.jsx';
import Lock from './Lock.jsx';

const PALETTE = ['yellow', 'blue', 'red', 'lime', 'green', 'aqua', 'orange', 'purple',
	'fuchsia', 'teal', 'maroon', 'navy', 'olive', 'silver', 'gray', 'black'];

// Waiting room of an online game: share the code, pick a colour, the host starts.
export default function Lobby({ room, you, error }) {
	const [copied, setCopied] = useState('');
	const [pw, setPw] = useState('');
	const [askPw, setAskPw] = useState(false);
	const [kickId, setKickId] = useState(null); // the player the host is about to remove
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

	// Joining another waiting room from here: the server takes this player out of the current room once the join is accepted.
	const switchTo = (code, password) => joinByCode(code, password);

	return (
		<div className="lobby-layout">
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

			<section className="card lobby-vis">
				<div className="vis-head">
					<span className={`badge ${room.isPrivate ? 'badge-pending' : 'badge-done'}`}>{room.isPrivate ? 'Private' : 'Public'}</span>
					<span className="muted">{room.isPrivate ? 'Not in the open-rooms list. Joining needs the password.' : 'Listed in Open rooms. Anyone can join.'}</span>
				</div>
				{isHost && !room.isPrivate && !askPw && <button className="btn-ghost" onClick={() => { clearError(); setAskPw(true); }}><Lock open /> Make private…</button>}
				{isHost && !room.isPrivate && askPw && (
					<form className="vis-form" onSubmit={(e) => { e.preventDefault(); if (pw.length >= 4) { setVisibility(true, pw).catch(() => {}); setAskPw(false); setPw(''); } }}>
						<input className="code-input" type="text" autoFocus autoComplete="off" placeholder="Choose a password (4+ characters)" aria-label="Room password" value={pw} maxLength={40} onChange={(e) => setPw(e.target.value)} />
						<button className="btn-primary btn-sm" type="submit" disabled={pw.length < 4}>Set password</button>
						<button className="btn-ghost btn-sm" type="button" onClick={() => { setAskPw(false); setPw(''); }}>Cancel</button>
					</form>
				)}
				{isHost && room.isPrivate && <button className="btn-ghost" onClick={() => { clearError(); setVisibility(false).catch(() => {}); }}><Lock /> Make public</button>}
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
							{isHost && !p.host && (kickId === p.userId
								? <span className="kick-confirm">Remove {p.name}? <button className="btn-danger btn-sm" onClick={() => { kickPlayer(p.userId); setKickId(null); }}>Remove</button><button className="btn-ghost btn-sm" onClick={() => setKickId(null)}>Cancel</button></span>
								: <button className="btn-ghost btn-sm kick-btn" onClick={() => setKickId(p.userId)} aria-label={`Remove ${p.name} from the room`}>Kick</button>)}
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
		<RoomsSidebar excludeId={room.id} onJoin={switchTo} />
		</div>
	);
}
