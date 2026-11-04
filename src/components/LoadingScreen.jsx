import { useLoading } from '../loading.js';

// Full-screen "Loading your game" with a progress bar. It covers the board while a saved game is put back
// together (online games replay every stored move, which would otherwise flash by on the board).
export default function LoadingScreen() {
	const s = useLoading();
	if (!s.active) return null;
	const pct = Math.round(s.value * 100);
	return (
		<div className={`loading-screen${s.closing ? ' closing' : ''}`} role="status" aria-live="polite">
			<div className="loading-card">
				<div className="loading-die" aria-hidden="true">
					<i /><i /><i />
				</div>
				<h2>{s.title}</h2>
				<div className="loading-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={s.title}>
					<div className="loading-fill" style={{ width: `${pct}%` }} />
				</div>
				<div className="loading-meta">
					<span className="loading-detail">{s.detail}</span>
					<span className="loading-pct">{pct}%</span>
				</div>
			</div>
		</div>
	);
}
