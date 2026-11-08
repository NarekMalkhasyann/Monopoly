import { useLayoutEffect, useRef, useState } from 'react';
import { navigate, useLocation } from '../router.jsx';
import { setToken } from '../api.js';

// Signing out reloads the page on /login, which also gives the next player a clean engine.
const signOut = () => { setToken(null); window.location.assign('/login'); };

const Icon = ({ d }) => (
	<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
	home: <Icon d={<><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>} />,
	history: <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />,
	out: <Icon d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>} />,
	admin: <Icon d={<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>} />,
	menu: <Icon d={<><path d="M4 6h16M4 12h16M4 18h16" /></>} />,
	close: <Icon d={<><path d="M6 6l12 12M18 6L6 18" /></>} />,
};

export const APP_NAME = 'ACT Monopoly';

// App shell: a bar across the top (brand, Play / History / Admin, who is signed in, Log out)
// above the scrolling page. Below 800px the links fold into a menu opened from the bar.
export default function Shell({ user, screen, onLogout = signOut, children }) {
	const [open, setOpen] = useState(false);
	const path = useLocation().split('?')[0];
	// the underline under the current tab slides to the new tab instead of jumping
	const navRef = useRef(null);
	const [bar, setBar] = useState(null);
	useLayoutEffect(() => {
		const place = () => {
			const el = navRef.current && navRef.current.querySelector('.nav-link.active');
			setBar(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
		};
		place();
		window.addEventListener('resize', place);
		return () => window.removeEventListener('resize', place);
	}, [screen, user.role]);
	const PATHS = { home: '/play', history: '/history', admin: '/admin' };
	const go = (s) => { setOpen(false); navigate(PATHS[s]); };
	const item = (id, label, icon) => (
		<button className={`nav-link${screen === id ? ' active' : ''}`} aria-current={screen === id ? 'page' : undefined} onClick={() => go(id)}>
			{icon}<span>{label}</span>
		</button>
	);
	const links = (
		<>
			{item('home', 'Play', ICONS.home)}
			{item('history', 'History', ICONS.history)}
			{user.role === 'admin' && item('admin', 'Admin', ICONS.admin)}
		</>
	);

	return (
		<div className="layout">
			<header className="top-nav">
				<button className="brand" onClick={() => go('home')} aria-label={`${APP_NAME}, home`}>
					<span className="brand-mark" aria-hidden="true">A</span>
					<span className="brand-name">{APP_NAME}</span>
				</button>
				<nav className="top-links" aria-label="Main" ref={navRef}>
					{links}
					{bar && <span className="nav-underline" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} aria-hidden="true" />}
				</nav>
				<div className="top-user">
					<span className="avatar sm-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
					<div className="top-user-text">
						<span className="top-user-name">{user.name}</span>
						<span className="top-user-sub">{user.role === 'admin' ? 'admin' : user.email}</span>
					</div>
					<button className="btn-ghost top-logout" onClick={onLogout}>Log out</button>
				</div>
				<button className="icon-btn top-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? ICONS.close : ICONS.menu}</button>
				{open && (
					<div className="top-drawer">
						<nav aria-label="Main (menu)">{links}</nav>
						<div className="top-drawer-user">
							<span className="avatar sm-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
							<span className="top-user-name">{user.name}</span>
							<button className="btn-ghost" onClick={onLogout}>Log out</button>
						</div>
					</div>
				)}
			</header>
			<main className="page" key={path}>{children}</main>
		</div>
	);
}
