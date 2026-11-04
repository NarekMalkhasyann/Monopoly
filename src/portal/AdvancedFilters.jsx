import { useEffect, useState } from 'react';

// The "Advanced" filter of the History page (and of the admin games list): a button in the row of status
// buttons that opens a panel with more detailed questions. Every field is optional; the server combines them
// with the normal filters (see listGames in server/app.js).

export const NO_ADVANCED = { player: '', winner: '', room: '', minTurns: '', maxTurns: '', size: '', ai: '', result: '' };
export const countAdvanced = (a) => Object.values(a).filter((v) => String(v).trim() !== '').length;
export function applyAdvanced(qs, a) {
	for (const [k, v] of Object.entries(a)) if (String(v).trim() !== '') qs.set(k, String(v).trim());
}

// Waits a moment after typing before the value is used for a search.
export function useDebounced(value, ms = 300) {
	const [v, setV] = useState(value);
	useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
	return v;
}

const Sliders = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
		<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
	</svg>
);

export function AdvancedToggle({ open, onToggle, count }) {
	return (
		<button className={`pill pill-advanced${open || count ? ' active' : ''}`} onClick={onToggle} aria-expanded={open} aria-controls="advanced-panel">
			<Sliders />Advanced{count > 0 && <span className="pill-count" aria-label={`${count} advanced filter${count === 1 ? '' : 's'} on`}>{count}</span>}
		</button>
	);
}

export function AdvancedPanel({ value, onChange, showResult = true }) {
	const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
	const text = (k, label, ph, max = 30) => (
		<label>{label}<input type="text" value={value[k]} onChange={set(k)} placeholder={ph} maxLength={max} /></label>
	);
	const num = (k, label) => (
		<label>{label}<input type="number" min="0" max="100000" inputMode="numeric" value={value[k]} onChange={set(k)} placeholder="any" /></label>
	);
	const count = countAdvanced(value);
	return (
		<section className="adv-panel" id="advanced-panel" aria-label="Advanced filters">
			<div className="adv-head">
				<h3>Advanced filters</h3>
				<span className="muted">{count ? `${count} on` : 'All optional; they combine with the buttons above'}</span>
				{count > 0 && <button className="btn-ghost btn-sm" onClick={() => onChange(NO_ADVANCED)}>Reset advanced</button>}
			</div>
			<div className="adv-grid">
				<fieldset className="adv-group">
					<legend>People</legend>
					{text('player', 'Player name', 'any player in the game')}
					{text('winner', 'Winner', 'who won')}
					<label>Players in the game
						<select value={value.size} onChange={set('size')}>
							<option value="">Any number</option>
							{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n} players</option>)}
						</select>
					</label>
					<label>Computer players
						<select value={value.ai} onChange={set('ai')}>
							<option value="">Either</option>
							<option value="yes">With computer players</option>
							<option value="no">Humans only</option>
						</select>
					</label>
				</fieldset>
				<fieldset className="adv-group">
					<legend>Game</legend>
					{text('room', 'Room code', 'online games, e.g. Z39SZ', 8)}
					<div className="adv-pair">
						{num('minTurns', 'Turns from')}
						{num('maxTurns', 'Turns up to')}
					</div>
					{showResult && (
						<label>My result
							<select value={value.result} onChange={set('result')}>
								<option value="">Any</option>
								<option value="won">I won</option>
								<option value="lost">I lost</option>
							</select>
							<small className="muted">Online games, where your account had a seat</small>
						</label>
					)}
				</fieldset>
			</div>
		</section>
	);
}
