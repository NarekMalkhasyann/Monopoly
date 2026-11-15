// State of the live auction (online games only). The server keeps the clock; this store only mirrors what the
// numbered events "aucopen", "aucbid" and "aucend" say (they are applied in order by src/onlineGame.js).
import { send } from './online.js';

const CLOSED = { open: false, n: 0, index: 0, high: 0, bidder: null, history: [], startedAt: 0, totalMs: 0, deadlineAt: 0, hint: '' };
let state = CLOSED;
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()); };

export const getLiveAuction = () => state;
export const subscribeLiveAuction = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// The engine reached the start of auction number n (every browser does, at the same point of the game).
export function engineOpened({ index, n, turn }, quiet) {
	set({ ...CLOSED, open: true, n, index, hint: '' });
	if (!quiet) send({ t: 'auction-open', n, turn }).catch(() => {});
}
// The server says it is open: the clock starts, remMs is what is left.
export function serverOpened(remMs) { set({ startedAt: Date.now(), totalMs: remMs, deadlineAt: Date.now() + remMs, hint: '' }); }
export function serverBid({ bidder, amount, remMs }) {
	set({ high: amount, bidder, history: [{ bidder, amount, at: Date.now() }, ...state.history], startedAt: Date.now(), totalMs: remMs, deadlineAt: Date.now() + remMs, hint: '' });
}
// A browser that joined in the middle of an auction: what the server still has left.
export function serverSnapshot({ remMs }) { set({ startedAt: Date.now(), totalMs: Math.max(remMs, state.high ? 5000 : 20000), deadlineAt: Date.now() + remMs }); }
export const close = () => set(CLOSED);
export const showHint = (hint) => set({ hint });

// The player pressed a bid button: amount is the new total (not the step).
export function placeBid(amount) {
	if (!state.open) return;
	send({ t: 'auction-bid', n: state.n, amount }).catch(() => {});
}
