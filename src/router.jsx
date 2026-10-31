// A tiny client-side router (no library): real URLs via the History API.
//
//   /                  -> redirects to /play
//   /login, /register
//   /play              home: start a game, continue, join with a code
//   /play/local        a new game on this device
//   /play/:id          a saved game: resumes a local game, or opens the online lobby / game
//   /join/:code        join an online room by its code, then goes to /play/:id
//   /history           all games;  /history/:id  one game's details
//
// The node server answers every non-API path with index.html, so each of these also
// works when typed in or reloaded.
import { useSyncExternalStore } from 'react';

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
window.addEventListener('popstate', emit);

const here = () => window.location.pathname + window.location.search;

export function navigate(path, { replace = false } = {}) {
	if (path === here()) return;
	window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
	emit();
}

export function useLocation() {
	return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, here);
}

const ROUTES = [
	[/^\/$/, 'root'],
	[/^\/login\/?$/, 'login'],
	[/^\/register\/?$/, 'register'],
	[/^\/play\/?$/, 'home'],
	[/^\/play\/online\/?$/, 'home'],
	[/^\/play\/local\/?$/, 'local'],
	[/^\/play\/(\d+)\/?$/, 'game', ['id']],
	[/^\/join\/([A-Za-z0-9]{3,10})\/?$/, 'join', ['code']],
	[/^\/history\/?$/, 'history'],
	[/^\/history\/(\d+)\/?$/, 'historyDetail', ['id']],
];

// "/play/12?x=1" -> { name: 'game', params: { id: '12' }, search: URLSearchParams }
export function matchRoute(location) {
	const [path, query = ''] = location.split('?');
	for (const [re, name, keys = []] of ROUTES) {
		const m = re.exec(path);
		if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])), search: new URLSearchParams(query) };
	}
	return { name: 'notfound', params: {}, search: new URLSearchParams(query) };
}

// The engine (public/engine) keeps its state in page-wide variables, so one page load
// can host one game. This key says which game a URL belongs to ('local' = a new one).
export function gameKey(location) {
	const r = matchRoute(location);
	if (r.name === 'local') return 'local';
	if (r.name === 'game') return r.params.id;
	return null;
}

export function Link({ to, children, onClick, ...rest }) {
	return (
		<a
			href={to}
			{...rest}
			onClick={(e) => {
				if (onClick) onClick(e);
				if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
				e.preventDefault();
				navigate(to);
			}}
		>
			{children}
		</a>
	);
}
