import { Modal } from './GameDetails.jsx';

// Closed padlock for the buttons a not-approved account cannot use.
export function Padlock({ size = 16 }) {
	return (
		<svg className="padlock" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fillOpacity=".2" />
			<path d="M8 11V7a4 4 0 0 1 8 0v4" />
		</svg>
	);
}

// Shown when an account that is waiting for approval tries to start or join a game.
export function NoAccess({ onClose }) {
	return (
		<Modal onClose={onClose}>
			<div className="noaccess">
				<span className="noaccess-icon"><Padlock size={34} /></span>
				<h3 className="modal-title">No access yet</h3>
				<p>You don't have access to start or join games.<br />Wait until your account is approved.</p>
				<p className="muted">You can still look around the Play and History pages. An administrator will review your account soon.</p>
				<button className="btn-primary" autoFocus onClick={onClose}>Got it</button>
			</div>
		</Modal>
	);
}
