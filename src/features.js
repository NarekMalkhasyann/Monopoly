import { useEffect, useState } from 'react';
import { api, getToken } from './api.js';

// Site switches that admins can change (Admin > Live). Kept in one place so the menu and the Live games page agree.
let features = { liveGames: true };
const listeners = new Set();
const set = (next) => { features = { ...features, ...next }; listeners.forEach((fn) => fn(features)); };
export const refreshFeatures = () => (getToken() ? api('GET', '/features').then(set).catch(() => {}) : Promise.resolve());
export const setFeatures = set;

export function useFeatures() {
	const [f, setF] = useState(features);
	useEffect(() => {
		listeners.add(setF);
		refreshFeatures();
		const iv = setInterval(() => { if (!document.hidden) refreshFeatures(); }, 30000); // players see a change within 30 s
		return () => { listeners.delete(setF); clearInterval(iv); };
	}, []);
	return f;
}
