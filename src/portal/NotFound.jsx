import { navigate } from '../router.jsx';

export default function NotFound() {
	return (
		<>
			<div className="page-head"><h2>Page not found</h2></div>
			<p className="muted">There is nothing at this address.</p>
			<button className="btn-primary" onClick={() => navigate('/play')}>Go to Play</button>
		</>
	);
}
