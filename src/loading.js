// The "Loading your game" screen: a tiny shared state (like online.js) that the pages update and
// <LoadingScreen /> shows. value runs from 0 to 1 and never goes backwards.
import { useSyncExternalStore } from 'react';

let state = { active: false, closing: false, title: '', detail: '', value: 0, since: 0 };
const listeners = new Set();
let closeTimer = null;
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };

export const getLoading = () => state;
export const useLoading = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getLoading);

export function startLoading(title, detail = '') {
	clearTimeout(closeTimer);
	set({ active: true, closing: false, title, detail, value: 0, since: Date.now() });
}

export function setLoading(value, detail) {
	if (!state.active) return;
	set({ value: Math.max(state.value, Math.min(1, value)), ...(detail !== undefined && { detail }) });
}

// Shows 100%, keeps the screen for at least minMs in total (so it never just flashes), then fades it away.
export function finishLoading(minMs = 700) {
	if (!state.active || state.closing) return;
	set({ value: 1 });
	const wait = Math.max(0, state.since + minMs - Date.now());
	closeTimer = setTimeout(() => {
		set({ closing: true });
		closeTimer = setTimeout(() => set({ active: false, closing: false }), 260);
	}, wait + (minMs ? 250 : 0));
}
