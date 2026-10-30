// Tiny fetch wrapper for the REST API (server/app.js).
// The login token lives in localStorage; every call adds it as "Authorization: Bearer".

const KEY = 'yerevanpoly.token';

export function getToken() {
	try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(token) {
	try { token ? localStorage.setItem(KEY, token) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export class ApiError extends Error {
	constructor(status, message) { super(message); this.status = status; }
}

export async function api(method, path, body) {
	const token = getToken();
	let res;
	try {
		res = await fetch(`/api${path}`, {
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
	return data;
}
