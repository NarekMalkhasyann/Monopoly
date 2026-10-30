import { useState } from 'react';

const Icon = ({ d }) => (
	<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
	home: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>} />,
	history: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
	out: <Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} />,
	menu: <Icon d={<><path d="M4 6h16M4 12h16M4 18h16" /></>} />,
	close: <Icon d={<><path d="M6 6l12 12M18 6L6 18" /></>} />,
};

// App shell from the design system: 280px sidebar + scrolling page. Below 800px
// the sidebar becomes a full-screen drawer opened from a sticky glass header.
export default function Shell({ user, screen, onNavigate, onLogout, title, children }) {
	const [open, setOpen] = useState(false);
	const go = (s) => { setOpen(false); onNavigate(s); };
	const item = (id, label, icon) => (
		<button className={`nav-link${screen === id ? ' green' : ''}`} onClick={() => go(id)}>
			{icon}<span>{label}</span>
		</button>
	);

	return (
		<div className="layout">
			<header className="m-header">
				<h3>{title}</h3>
				<button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}>{ICONS.menu}</button>
			</header>
			<aside className={`menu${open ? ' active' : ''}`}>
				<button className="icon-btn menu-close" aria-label="Close menu" onClick={() => setOpen(false)}>{ICONS.close}</button>
				<div className="profile">
					<div className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</div>
					<h3>{user.name}</h3>
					<p>{user.email}</p>
				</div>
				<nav>
					{item('home', 'Play', ICONS.home)}
					{item('history', 'History', ICONS.history)}
					<button className="nav-link" onClick={onLogout}>{ICONS.out}<span>Log out</span></button>
				</nav>
			</aside>
			<main className="page">{children}</main>
		</div>
	);
}
