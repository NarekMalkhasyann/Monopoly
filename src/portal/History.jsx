import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.jsx';
import { fmtDate } from './format.js';
import PlayerDots from './PlayerDots.jsx';
import { Modal, Details } from './GameDetails.jsx';
import { AdvancedToggle, AdvancedPanel, NO_ADVANCED, countAdvanced, applyAdvanced, useDebounced } from './AdvancedFilters.jsx';

const PAGE = 10;

// /history shows the list; /history/:id also opens that game's details.
export default function History({ detailId, replay }) {
	const [status, setStatus] = useState('');
	const [mode, setMode] = useState('');
	const [text, setText] = useState('');
	const [search, setSearch] = useState('');   // `text` after the typing pause
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [sort, setSort] = useState('updated:desc');
	const [advOpen, setAdvOpen] = useState(false);
	const [adv, setAdv] = useState(NO_ADVANCED);
	const advQ = useDebounced(adv);          // `adv` after the typing pause
	const [games, setGames] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [toDelete, setToDelete] = useState(null);

	const query = useCallback((offset) => {
		const qs = new URLSearchParams({ limit: PAGE, offset });
		if (status) qs.set('status', status);
		if (mode) qs.set('mode', mode);
		if (search.trim()) qs.set('q', search.trim());
		if (from) qs.set('from', from);
		if (to) qs.set('to', to);
		applyAdvanced(qs, advQ);
		const [by, dir] = sort.split(':');
		qs.set('sort', by); qs.set('dir', dir);
		return api('GET', `/games?${qs}`);
	}, [status, mode, search, from, to, sort, advQ]);

	useEffect(() => { // wait a moment after typing before asking the server
		const t = setTimeout(() => setSearch(text), 300);
		return () => clearTimeout(t);
	}, [text]);
	const advCount = countAdvanced(adv);
	const filtered = !!(status || mode || search || from || to || advCount || sort !== 'updated:desc');
	const clear = () => { setStatus(''); setMode(''); setText(''); setSearch(''); setFrom(''); setTo(''); setSort('updated:desc'); setAdv(NO_ADVANCED); };

	useEffect(() => {
		let stale = false;
		setLoading(true);
		query(0).then((r) => { if (!stale) { setGames(r.games); setTotal(r.total); setError(''); } })
			.catch((e) => !stale && setError(e.message))
			.finally(() => !stale && setLoading(false));
		return () => { stale = true; };
	}, [query]);

	const more = async () => {
		try {
			const r = await query(games.length);
			setGames((g) => [...g, ...r.games]);
			setTotal(r.total);
		} catch (e) { setError(e.message); }
	};

	const remove = async () => {
		try {
			await api('DELETE', `/games/${toDelete}`);
			setGames((g) => g.filter((x) => x.id !== toDelete));
			setTotal((t) => t - 1);
		} catch (e) { setError(e.message); }
		setToDelete(null);
	};

	const pill = (value, current, set, label) => (
		<button className={`pill${current === value ? ' active' : ''}`} onClick={() => set(value)}>{label}</button>
	);

	return (
		<>
			<div className="page-head">
				<h2>History</h2>
				<div className="toggles">
					{pill('', mode, setMode, 'All modes')}
					{pill('local', mode, setMode, 'This device')}
					{pill('online', mode, setMode, 'Online')}
				</div>
			</div>
			<div className="pills">
				{pill('', status, setStatus, 'All')}
				{pill('active', status, setStatus, 'In progress')}
				{pill('finished', status, setStatus, 'Finished')}
				{pill('abandoned', status, setStatus, 'Abandoned')}
				<AdvancedToggle open={advOpen} onToggle={() => setAdvOpen((o) => !o)} count={advCount} />
			</div>
			{advOpen && <AdvancedPanel value={adv} onChange={setAdv} />}

			<div className="filters">
				<input className="filter-search" type="search" placeholder="Search player, winner or room code" value={text}
					onChange={(e) => setText(e.target.value)} aria-label="Search games" maxLength={40} />
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
			{!loading && games.length === 0 && <p className="muted">{filtered ? 'No games match these filters.' : 'No games here yet. Play one and it will show up.'}</p>}
			{!loading && games.length > 0 && <p className="muted">{total} game{total === 1 ? '' : 's'}</p>}

			<div className="rows">
				{games.map((g) => (
					<div className="row row-history" key={g.id}>
						<div className="row-main">
							<div className="row-tags">
								<span className="tag">{g.mode === 'local' ? 'This device' : `Online · ${g.room_code}`}</span>
								<span className={`badge ${g.status === 'finished' ? 'badge-done' : 'badge-pending'}`}>{g.status === 'finished' ? 'Finished' : g.status === 'abandoned' ? 'Abandoned' : 'In progress'}</span>
							</div>
							<PlayerDots players={g.players} winner={g.winner_name} />
							<span className="meta">
								{g.status === 'finished' && g.winner_name ? `Winner: ${g.winner_name} · ` : ''}{g.turn_count} turns · {fmtDate(g.status === 'finished' ? g.finished_at : g.updated_at)}
							</span>
						</div>
						<div className="row-actions">
							{g.status === 'active' && <button className="btn-primary btn-sm" onClick={() => navigate(`/play/${g.id}`)}>{g.mode === 'online' ? 'Rejoin' : 'Resume'}</button>}
							<button className="btn-ghost" onClick={() => navigate(`/history/${g.id}`)}>Details</button>
							<button className="btn-ghost danger" onClick={() => setToDelete(g.id)} aria-label={`Delete game ${g.id}`}>Delete</button>
						</div>
					</div>
				))}
			</div>
			{games.length < total && <button className="btn-ghost" onClick={more}>Load more ({total - games.length})</button>}

			{detailId && <Details id={detailId} replay={replay} onClose={() => navigate('/history')} onReplay={(on) => navigate(on ? `/history/${detailId}/replay` : `/history/${detailId}`)} onOpen={() => navigate(`/play/${detailId}`)} />}
			{toDelete && (
				<Modal onClose={() => setToDelete(null)}>
					<h3 className="modal-title">Delete this game?</h3>
					<p className="muted">The game and its log will be removed from your history. This cannot be undone.</p>
					<div className="modal-actions">
						<button className="btn-ghost" onClick={() => setToDelete(null)}>Cancel</button>
						<button className="btn-danger" onClick={remove}>Delete</button>
					</div>
				</Modal>
			)}
		</>
	);
}
