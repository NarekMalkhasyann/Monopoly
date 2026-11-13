import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { fmtDate } from './format.js';
import PlayerDots from './PlayerDots.jsx';
import { Modal, Details } from './GameDetails.jsx';
import { AdvancedToggle, AdvancedPanel, NO_ADVANCED, countAdvanced, applyAdvanced } from './AdvancedFilters.jsx';

// Admin panel (administrators only; the server checks the role on every request, this page only hides things).
//   /admin             overview: totals and the last 14 days
//   /admin/users       every account, search and sort
//   /admin/users/:id   one account: role, delete, and all their games
//   /admin/games       every game of every player, filters like History

const PAGE = 15;
const TABS = [['/admin', 'Overview'], ['/admin/requests', 'New users req.'], ['/admin/users', 'Users'], ['/admin/games', 'Games']];

const useDebounced = (value, ms = 300) => {
	const [v, setV] = useState(value);
	useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
	return v;
};

function Tabs({ path, pending }) {
	return (
		<div className="pills admin-tabs" role="tablist">
			{TABS.map(([to, label]) => (
				<button key={to} role="tab" aria-selected={path === to} className={`pill${path === to ? ' active' : ''}`} onClick={() => navigate(to)}>{label}{to === '/admin/requests' && pending > 0 && <span className="tab-count">{pending}</span>}</button>
			))}
		</div>
	);
}

// ---------- overview ----------
function Stat({ label, value, note }) {
	return (
		<div className="stat-tile">
			<span className="stat-label">{label}</span>
			<span className="stat-value">{value}</span>
			{note && <span className="stat-note">{note}</span>}
		</div>
	);
}

function Bars({ title, data }) {
	const max = Math.max(1, ...data.map((d) => d.n));
	const total = data.reduce((a, d) => a + d.n, 0);
	return (
		<div className="chart-card">
			<h3>{title} <span className="muted">· {total} in 14 days</span></h3>
			<div className="bars" role="img" aria-label={`${title}: ${data.map((d) => `${d.day} ${d.n}`).join(', ')}`}>
				{data.map((d) => (
					<div className="bar-col" key={d.day} title={`${d.day}: ${d.n}`}>
						<span className="bar-n">{d.n || ''}</span>
						<i style={{ height: `${Math.max(d.n ? 6 : 2, (d.n / max) * 100)}%` }} className={d.n ? '' : 'zero'} />
					</div>
				))}
			</div>
			<div className="bar-axis"><span>{data[0].day.slice(5)}</span><span>{data[data.length - 1].day.slice(5)}</span></div>
		</div>
	);
}

function Overview() {
	const [s, setS] = useState(null);
	const [error, setError] = useState('');
	useEffect(() => { api('GET', '/admin/stats').then(setS).catch((e) => setError(e.message)); }, []);
	if (error) return <p className="auth-error">{error}</p>;
	if (!s) return <p className="muted">Loading…</p>;
	return (
		<>
			<div className="stat-grid">
				<Stat label="Users" value={s.users.total} note={`${s.users.new7} new this week · ${s.users.admins} admin${s.users.admins === 1 ? '' : 's'}`} />
				<Stat label="Games" value={s.games.total} note={`${s.games.local} on one device · ${s.games.online} online`} />
				<Stat label="In progress" value={s.games.active} note={`${s.games.waitingRooms} room${s.games.waitingRooms === 1 ? '' : 's'} waiting for players`} />
				<Stat label="Finished" value={s.games.finished} note={`${s.games.abandoned} abandoned`} />
				<Stat label="Turns played" value={s.games.turns.toLocaleString()} />
				<Stat label="Connected now" value={s.connected} note="open online-game connections" />
			</div>
			<div className="chart-grid">
				<Bars title="Games started per day" data={s.gamesPerDay} />
				<Bars title="Sign-ups per day" data={s.signupsPerDay} />
			</div>
		</>
	);
}

// ---------- games (all, or one user's) ----------
function AdminGames({ userId }) {
	const [status, setStatus] = useState('');
	const [mode, setMode] = useState('');
	const [text, setText] = useState('');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [sort, setSort] = useState('updated:desc');
	const [advOpen, setAdvOpen] = useState(false);
	const [adv, setAdv] = useState(NO_ADVANCED);
	const advQ = useDebounced(adv);
	const search = useDebounced(text);
	const [games, setGames] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [open, setOpen] = useState(null); // { id, replay }
	const [stamp, setStamp] = useState(0);   // bumped after an admin ended / deleted a game

	const query = useCallback((offset) => {
		const qs = new URLSearchParams({ limit: PAGE, offset });
		if (userId) qs.set('user', userId);
		if (status) qs.set('status', status);
		if (mode) qs.set('mode', mode);
		if (search.trim()) qs.set('q', search.trim());
		if (from) qs.set('from', from);
		if (to) qs.set('to', to);
		applyAdvanced(qs, advQ);
		const [by, dir] = sort.split(':');
		qs.set('sort', by); qs.set('dir', dir);
		return api('GET', `/admin/games?${qs}`);
	}, [userId, status, mode, search, from, to, sort, advQ]);

	useEffect(() => {
		let stale = false;
		setLoading(true);
		query(0).then((r) => { if (!stale) { setGames(r.games); setTotal(r.total); setError(''); } })
			.catch((e) => !stale && setError(e.message)).finally(() => !stale && setLoading(false));
		return () => { stale = true; };
	}, [query, stamp]);

	const more = async () => {
		try { const r = await query(games.length); setGames((g) => [...g, ...r.games]); setTotal(r.total); } catch (e) { setError(e.message); }
	};
	const advCount = countAdvanced(adv);
	const filtered = !!(status || mode || search || from || to || advCount || sort !== 'updated:desc');
	const clear = () => { setStatus(''); setMode(''); setText(''); setFrom(''); setTo(''); setSort('updated:desc'); setAdv(NO_ADVANCED); };
	const pill = (value, current, set, label) => <button className={`pill${current === value ? ' active' : ''}`} onClick={() => set(value)}>{label}</button>;

	return (
		<>
			<div className="pills">
				{pill('', status, setStatus, 'All')}{pill('active', status, setStatus, 'In progress')}{pill('finished', status, setStatus, 'Finished')}{pill('abandoned', status, setStatus, 'Abandoned')}
				<span className="pill-gap" />
				{pill('', mode, setMode, 'Any mode')}{pill('local', mode, setMode, 'This device')}{pill('online', mode, setMode, 'Online')}
				<span className="pill-gap" />
				<AdvancedToggle open={advOpen} onToggle={() => setAdvOpen((o) => !o)} count={advCount} />
			</div>
			{advOpen && <AdvancedPanel value={adv} onChange={setAdv} showResult={!!userId} />}
			<div className="filters">
				<input className="filter-search" type="search" placeholder="Search player, winner, room code, creator name or e-mail" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search games" maxLength={40} />
				<label>From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
				<label>To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
				<label>Sort
					<select value={sort} onChange={(e) => setSort(e.target.value)}>
						<option value="updated:desc">Latest activity</option>
						<option value="created:desc">Newest</option>
						<option value="created:asc">Oldest</option>
						<option value="turns:desc">Most turns</option>
						<option value="turns:asc">Fewest turns</option>
					</select>
				</label>
				{filtered && <button className="btn-ghost btn-sm" onClick={clear}>Clear filters</button>}
			</div>
			{error && <p className="auth-error">{error}</p>}
			{loading && <p className="muted">Loading…</p>}
			{!loading && games.length === 0 && <p className="muted">{filtered ? 'No games match these filters.' : 'No games yet.'}</p>}
			{!loading && games.length > 0 && <p className="muted">{total} game{total === 1 ? '' : 's'}</p>}
			<div className="rows">
				{games.map((g) => (
					<div className="row row-history" key={g.id}>
						<div className="row-main">
							<div className="row-tags">
								<span className="tag">#{g.id} · {g.mode === 'local' ? 'This device' : `Online · ${g.room_code}`}</span>
								<span className={`badge ${g.status === 'finished' ? 'badge-done' : 'badge-pending'}`}>{g.status === 'finished' ? 'Finished' : g.status === 'abandoned' ? 'Abandoned' : 'In progress'}</span>
							</div>
							<PlayerDots players={g.players} winner={g.winner_name} />
							<span className="meta">
								{g.owner ? <>by {g.owner.name} ({g.owner.email}) · </> : ''}{g.status === 'finished' && g.winner_name ? `winner ${g.winner_name} · ` : ''}{g.turn_count} turns · {fmtDate(g.status === 'finished' ? g.finished_at : g.updated_at)}
							</span>
						</div>
						<div className="row-actions"><button className="btn-ghost" onClick={() => setOpen({ id: g.id, replay: false })}>Details</button></div>
					</div>
				))}
			</div>
			{games.length < total && <button className="btn-ghost" onClick={more}>Load more ({total - games.length})</button>}
			{open && <Details id={open.id} replay={open.replay} admin onClose={() => setOpen(null)} onReplay={(on) => setOpen({ id: open.id, replay: on })} onChanged={() => setStamp((x) => x + 1)} />}
		</>
	);
}

// ---------- new users waiting for approval ----------
// Approve = the account becomes a normal player. Reject = the account is deleted (the person can register again).
function Requests({ onChanged }) {
	const [users, setUsers] = useState(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(0);
	const [ask, setAsk] = useState(null);
	const load = useCallback(() => api('GET', '/admin/users?role=not-approved&sort=created&dir=asc&limit=100').then((r) => { setUsers(r.users); setError(''); }).catch((e) => setError(e.message)), []);
	useEffect(() => { load(); }, [load]);
	const act = async (u, approve) => {
		setBusy(u.id);
		try {
			if (approve) await api('PUT', `/admin/users/${u.id}`, { role: 'player' });
			else await api('DELETE', `/admin/users/${u.id}`);
			setAsk(null);
			await load();
			onChanged();
		} catch (e) { setError(e.message); setAsk(null); }
		setBusy(0);
	};
	return (
		<>
			<p className="muted">New accounts can look around, but cannot start or join games until you approve them.</p>
			{error && <p className="auth-error">{error}</p>}
			{!users && !error && <p className="muted">Loading…</p>}
			{users && users.length === 0 && <p className="muted">No new requests. Everybody is approved.</p>}
			<div className="rows">
				{(users || []).map((u) => (
					<div className="row" key={u.id}>
						<div className="row-main">
							<div className="row-tags"><strong>{u.name}</strong> {roleBadge(u.role)}</div>
							<span className="meta">{u.email} · registered {fmtDate(u.created_at)}</span>
						</div>
						<div className="req-actions">
							<button className="btn-primary btn-sm" disabled={busy === u.id} onClick={() => act(u, true)}>Approve</button>
							<button className="btn-ghost danger btn-sm" disabled={busy === u.id} onClick={() => setAsk(u)}>Reject</button>
						</div>
					</div>
				))}
			</div>
			{ask && (
				<Modal onClose={() => setAsk(null)}>
					<h3 className="modal-title">Reject {ask.name}?</h3>
					<p className="muted">The account {ask.email} is deleted. The person can register again later.</p>
					<div className="modal-actions">
						<button className="btn-ghost" onClick={() => setAsk(null)}>Cancel</button>
						<button className="btn-danger" disabled={busy === ask.id} onClick={() => act(ask, false)}>Reject</button>
					</div>
				</Modal>
			)}
		</>
	);
}

// ---------- users ----------
const roleBadge = (role) => <span className={`badge ${role === 'admin' ? 'badge-done' : role === 'not-approved' ? 'badge-pending' : 'badge-plain'}`}>{role === 'admin' ? 'Admin' : role === 'not-approved' ? 'Not approved' : 'Player'}</span>;

function Users() {
	const [text, setText] = useState('');
	const [role, setRole] = useState('');
	const [sort, setSort] = useState('created:desc');
	const search = useDebounced(text);
	const [users, setUsers] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const query = useCallback((offset) => {
		const qs = new URLSearchParams({ limit: PAGE, offset });
		if (role) qs.set('role', role);
		if (search.trim()) qs.set('q', search.trim());
		const [by, dir] = sort.split(':');
		qs.set('sort', by); qs.set('dir', dir);
		return api('GET', `/admin/users?${qs}`);
	}, [role, search, sort]);

	useEffect(() => {
		let stale = false;
		setLoading(true);
		query(0).then((r) => { if (!stale) { setUsers(r.users); setTotal(r.total); setError(''); } })
			.catch((e) => !stale && setError(e.message)).finally(() => !stale && setLoading(false));
		return () => { stale = true; };
	}, [query]);
	const more = async () => { try { const r = await query(users.length); setUsers((u) => [...u, ...r.users]); setTotal(r.total); } catch (e) { setError(e.message); } };
	const pill = (value, label) => <button className={`pill${role === value ? ' active' : ''}`} onClick={() => setRole(value)}>{label}</button>;

	return (
		<>
			<div className="pills">{pill('', 'Everyone')}{pill('admin', 'Admins')}{pill('player', 'Players')}{pill('not-approved', 'Not approved')}</div>
			<div className="filters">
				<input className="filter-search" type="search" placeholder="Search name or e-mail" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search users" maxLength={40} />
				<label>Sort
					<select value={sort} onChange={(e) => setSort(e.target.value)}>
						<option value="created:desc">Newest</option>
						<option value="created:asc">Oldest</option>
						<option value="name:asc">Name A–Z</option>
						<option value="games:desc">Most games</option>
						<option value="active:desc">Recently active</option>
					</select>
				</label>
			</div>
			{error && <p className="auth-error">{error}</p>}
			{loading && <p className="muted">Loading…</p>}
			{!loading && users.length === 0 && <p className="muted">No users match.</p>}
			{!loading && users.length > 0 && <p className="muted">{total} user{total === 1 ? '' : 's'}</p>}
			{users.length > 0 && (
				<div className="table-wrap">
					<table className="admin-table">
						<thead><tr><th>User</th><th>Role</th><th className="num">Games</th><th className="num">Online wins</th><th>Joined</th><th>Last active</th></tr></thead>
						<tbody>
							{users.map((u) => (
								<tr key={u.id} tabIndex={0} onClick={() => navigate(`/admin/users/${u.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/users/${u.id}`)}>
									<td><strong>{u.name}</strong><br /><span className="muted">{u.email}</span></td>
									<td>{roleBadge(u.role)}</td>
									<td className="num">{u.games}</td>
									<td className="num">{u.wins}</td>
									<td>{fmtDate(u.created_at)}</td>
									<td>{u.last_active ? fmtDate(u.last_active) : '–'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{users.length < total && <button className="btn-ghost" onClick={more}>Load more ({total - users.length})</button>}
		</>
	);
}

function UserPage({ id, me }) {
	const [u, setU] = useState(null);
	const [error, setError] = useState('');
	const [ask, setAsk] = useState(false);
	const [busy, setBusy] = useState(false);
	useEffect(() => { api('GET', `/admin/users/${id}`).then((r) => setU(r.user)).catch((e) => setError(e.message)); }, [id]);
	const self = Number(id) === me.id;

	const setRole = async (role) => {
		setBusy(true);
		try { setU((await api('PUT', `/admin/users/${id}`, { role })).user); setError(''); } catch (e) { setError(e.message); }
		setBusy(false);
	};
	const remove = async () => {
		setBusy(true);
		try { await api('DELETE', `/admin/users/${id}`); navigate('/admin/users'); } catch (e) { setError(e.message); setAsk(false); setBusy(false); }
	};

	return (
		<>
			<button className="link-btn back" onClick={() => navigate('/admin/users')}>← All users</button>
			{error && <p className="auth-error">{error}</p>}
			{!u && !error && <p className="muted">Loading…</p>}
			{u && (
				<>
					<div className="user-head">
						<div className="avatar sm" aria-hidden="true">{u.name.trim().charAt(0).toUpperCase()}</div>
						<div className="user-head-main">
							<h3>{u.name} {roleBadge(u.role)}{self && <span className="muted"> (you)</span>}</h3>
							<p className="muted">{u.email}</p>
							<p className="meta">Joined {fmtDate(u.created_at)} · last active {u.last_active ? fmtDate(u.last_active) : 'never'} · {u.games} game{u.games === 1 ? '' : 's'} · {u.wins} online win{u.wins === 1 ? '' : 's'}</p>
						</div>
						<div className="row-actions">
							{!self && u.role === 'not-approved' && <button className="btn-primary" disabled={busy} onClick={() => setRole('player')}>Approve</button>}
							{!self && u.role !== 'not-approved' && <button className="btn-ghost" disabled={busy} onClick={() => setRole(u.role === 'admin' ? 'player' : 'admin')}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>}
							{!self && <button className="btn-ghost danger" disabled={busy} onClick={() => setAsk(true)}>Delete account</button>}
						</div>
					</div>
					<h3 className="h2-sm">Games</h3>
					<AdminGames userId={id} />
					{ask && (
						<Modal onClose={() => setAsk(false)}>
							<h3 className="modal-title">Delete {u.name}?</h3>
							<p className="muted">The account and every game it created are removed for good. Seats in other people's online games stay in their history, without a linked account. This cannot be undone.</p>
							<div className="modal-actions">
								<button className="btn-ghost" onClick={() => setAsk(false)}>Cancel</button>
								<button className="btn-danger" onClick={remove} disabled={busy}>Delete account</button>
							</div>
						</Modal>
					)}
				</>
			)}
		</>
	);
}

export default function Admin({ view, id, user }) {
	const [pending, setPending] = useState(0);
	const refresh = useCallback(() => { api('GET', '/admin/stats').then((s) => setPending(s.users.pending || 0)).catch(() => {}); }, []);
	useEffect(() => { if (user.role === 'admin') refresh(); }, [refresh, view]);
	if (user.role !== 'admin') {
		return <><div className="page-head"><h2>Admin</h2></div><p className="notice">This area is for administrators only.</p></>;
	}
	const path = view === 'adminRequests' ? '/admin/requests' : view === 'adminUsers' || view === 'adminUser' ? '/admin/users' : view === 'adminGames' ? '/admin/games' : '/admin';
	return (
		<>
			<div className="page-head"><h2>Admin</h2></div>
			<Tabs path={path} pending={pending} />
			{view === 'admin' && <Overview />}
			{view === 'adminRequests' && <Requests onChanged={refresh} />}
			{view === 'adminUsers' && <Users />}
			{view === 'adminUser' && <UserPage id={id} me={user} />}
			{view === 'adminGames' && <AdminGames />}
		</>
	);
}
