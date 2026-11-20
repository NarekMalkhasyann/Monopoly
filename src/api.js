// Tiny fetch wrapper for the REST API (server/app.js).
// The login token lives in localStorage; every call adds it as "Authorization: Bearer".

const KEY = 'yerevanpoly.token';

export function getToken() {
	try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(token) {
	seen.clear(); // another account must never see the last one's remembered pages
	try { token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export class ApiError extends Error {
	constructor(status, message) { super(message); this.status = status; }
}

// Empty = same site (development, `npm start`). On Vercel the API lives on another host: set VITE_API_URL.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Answers of GET calls are remembered, so a page you come back to (Play -> History -> Play) shows its last
// content at once and refreshes it in the background, instead of a blank "Loading…" every time.
// Any change (POST / PATCH / DELETE) or sign-out forgets them.
const seen = new Map();
export const peek = (path) => seen.get(path);

export async function api(method, path, body) {
	const token = getToken();
	if (method !== 'GET') seen.clear();
	let res;
	try {
		res = await fetch(`${API_BASE}/api${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	} catch {
		throw new ApiError(0, 'Cannot reach the server. Is it running?');
	}
	let data = {};
	try { data = await res.json(); } catch { /* empty body */ }
	if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
	if (method === 'GET') seen.set(path, data);
	return data;
}
