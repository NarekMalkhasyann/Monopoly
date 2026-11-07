// Rebuilds a game from its saved log: after every log line, where each player stands, how much money they
// have, who owns which property, how many houses there are, who is in jail...
//
// The log is the list of readable lines the engine wrote ("Anna rolled 7.", "Anna landed on Chance.",
// "Anna bought Park Place for $350."). Two things are not in it and are filled in sensibly:
//   * the log has the SUM of the two dice, not each die: the faces are chosen from the sum (doubles are kept),
//   * Chance / Community Chest squares have the same name three times: the one the player can have reached is used.
// Everything else (money, positions, owners, houses, mortgages, jail) follows the lines exactly like the engine did.
import { SQUARES, OLD_NAMES } from './boardData.js';

export const START_MONEY = 1500;
const JAIL = 10;

const byName = new Map();
SQUARES.forEach((s, i) => { const a = byName.get(s.n) || []; a.push(i); byName.set(s.n, a); });
OLD_NAMES.forEach((n, i) => { const a = byName.get(n) || []; if (!a.includes(i)) a.push(i); byName.set(n, a); }); // games saved before the Armenian board

const dist = (a, b) => { const d = Math.abs(a - b) % 40; return Math.min(d, 40 - d); };

/** Two dice faces for a total (the log only stores the total). Deterministic, so a replay always looks the same. */
export function splitDice(sum, doubles, seed = 0) {
	if (doubles) return [sum / 2, sum / 2];
	const pairs = [];
	for (let a = 1; a <= 6; a++) { const b = sum - a; if (b >= 1 && b <= 6 && a !== b) pairs.push([a, b]); }
	if (!pairs.length) return [Math.max(1, Math.min(6, Math.floor(sum / 2))), Math.max(1, sum - Math.max(1, Math.min(6, Math.floor(sum / 2))))];
	const [a, b] = pairs[(seed * 7 + 3) % pairs.length];
	return (seed % 2) ? [b, a] : [a, b];
}

const clone = (s) => ({
	pos: [...s.pos], money: [...s.money], jail: [...s.jail], out: [...s.out], cards: [...s.cards],
	owner: [...s.owner], houses: [...s.houses], mort: [...s.mort], dice: s.dice, turn: s.turn,
});

/**
 * events: [{ seq, turn, type, text }] in order; players: [{ seat, name, color }].
 * Returns { frames, fx }: frames[0] is the start, frames[i + 1] the state after events[i];
 * fx[i] describes what happened in events[i] for the animation:
 *   { kind: 'roll', player, sum, doubles, dice } | { kind: 'move', player, from, to, forward } | { kind: 'other' }
 */
export function buildFrames(events, players) {
	const list = [...players].sort((a, b) => a.seat - b.seat);
	const n = list.length;
	const names = list.map((p) => p.name);
	const order = names.map((name, i) => [name, i]).sort((a, b) => b[0].length - a[0].length); // longest name first

	const lead = (text) => { // "Anna rolled 7." -> [0, "rolled 7."]
		for (const [name, i] of order) if (text.startsWith(`${name} `)) return [i, text.slice(name.length + 1)];
		return [-1, text];
	};
	const idxOf = (name) => names.indexOf(name);

	let s = {
		pos: Array(n).fill(0), money: Array(n).fill(START_MONEY), jail: Array(n).fill(false), out: Array(n).fill(false),
		cards: Array(n).fill(0), owner: Array(40).fill(-1), houses: Array(40).fill(0), mort: Array(40).fill(false),
		dice: null, turn: 0,
	};
	const frames = [clone(s)];
	const fx = [];
	const lastSum = Array(n).fill(undefined);
	const lastRentTo = Array(n).fill(-1); // who was paid last: the creditor if the player goes bankrupt right after

	const others = (p) => s.out.filter((o, q) => q !== p && !o).length;
	const square = (name, near, step) => {
		const c = byName.get(name);
		if (!c) return -1;
		if (c.length === 1 || near === undefined) return c[0];
		const exact = step === undefined ? -1 : c.find((x) => x === (near + step) % 40);
		if (exact !== undefined && exact >= 0) return exact; // the dice say exactly which one
		return c.reduce((best, x) => (dist(x, near) < dist(best, near) ? x : best), c[0]);
	};

	events.forEach((e, k) => {
		const text = String(e.text || '');
		let effect = { kind: 'other' };
		let m;

		if ((m = /^It is (.+)'s turn\.$/.exec(text))) {
			const p = idxOf(m[1]);
			if (p >= 0) s.turn = p;
		} else {
			const [p, rest] = lead(text);
			if (p >= 0) {
				if ((m = /^rolled (\d+)( - doubles)?\.$/.exec(rest))) {
					const sum = Number(m[1]);
					const dice = splitDice(sum, !!m[2], k);
					s.dice = dice; lastSum[p] = sum;
					s.turn = p;
					effect = { kind: 'roll', player: p, sum, doubles: !!m[2], dice };
				} else if ((m = /^landed on (.+)\.$/.exec(rest))) {
					const to = square(m[1], s.pos[p], lastSum[p]);
					if (to >= 0) {
						const from = s.pos[p];
						s.pos[p] = to;
						effect = { kind: 'move', player: p, from, to, forward: (to - from + 40) % 40 };
						lastSum[p] = undefined;
					}
				} else if ((m = /^bought (.+) for \$(\d+)\.$/.exec(rest))) {
					const sq = square(m[1]);
					if (sq >= 0) { s.owner[sq] = p; s.money[p] -= Number(m[2]); effect = { kind: 'deal', player: p, square: sq }; }
				} else if ((m = /^paid \$(\d+) rent to (.+)\.$/.exec(rest))) {
					const to = idxOf(m[2]);
					s.money[p] -= Number(m[1]);
					if (to >= 0) { s.money[to] += Number(m[1]); lastRentTo[p] = to; }
				} else if ((m = /^paid \$(\d+) for landing on (.+)\.$/.exec(rest))) {
					s.money[p] -= Number(m[1]); // City Tax / Luxury Tax go to the bank
				} else if (/^collected a \$200 salary for passing GO\.$/.test(rest)) {
					s.money[p] += 200;
				} else if ((m = /^lost \$(\d+) (?:from|to) (.+)\.$/.exec(rest))) {
					s.money[p] -= Number(m[1]);
					const to = idxOf(m[2]);
					if (to >= 0) s.money[to] += Number(m[1]);
					else if (m[2] === 'Chance' && Number(m[1]) === 50 * others(p)) s.money.forEach((_, q) => { if (q !== p && !s.out[q]) s.money[q] += 50; }); // chairman card
				} else if ((m = /^received \$(\d+) from (.+)\.$/.exec(rest))) {
					s.money[p] += Number(m[1]);
					const from = idxOf(m[2]);
					if (from >= 0) s.money[from] -= Number(m[1]); // a trade; otherwise it came from the bank
						else if (m[2] === 'Community Chest' && Number(m[1]) === 10 * others(p)) s.money.forEach((_, q) => { if (q !== p && !s.out[q]) s.money[q] -= 10; }); // birthday card
				} else if ((m = /^received a "Get Out of Jail Free" card from (.+)\.$/.exec(rest))) {
					s.cards[p] += 1;
					const from = idxOf(m[1]);
					if (from >= 0) s.cards[from] -= 1;
				} else if ((m = /^received (.+) from (.+)\.$/.exec(rest)) && idxOf(m[2]) >= 0) {
					const sq = square(m[1]);
					if (sq >= 0) s.owner[sq] = p; // a trade
				} else if (/^paid the \$50 fine to get out of jail\.$/.test(rest)) {
					s.money[p] -= 50; s.jail[p] = false;
				} else if (/^used a "Get Out of Jail Free" card\.$/.test(rest)) {
					s.jail[p] = false; s.cards[p] = Math.max(0, s.cards[p] - 1);
				} else if (/^rolled doubles to get out of jail\.$/.test(rest)) {
					s.jail[p] = false;
				} else if (/^was sent directly to jail\.$/.test(rest)) {
					const from = s.pos[p];
					s.pos[p] = JAIL; s.jail[p] = true;
					effect = { kind: 'move', player: p, from, to: JAIL, forward: -1, jailed: true };
				} else if ((m = /^placed a (house|hotel) on (.+)\.$/.exec(rest))) {
					const sq = square(m[2]);
					if (sq >= 0) { s.money[p] -= SQUARES[sq].h; s.houses[sq] = m[1] === 'hotel' ? 5 : s.houses[sq] + 1; effect = { kind: 'deal', player: p, square: sq }; }
				} else if ((m = /^sold (the hotel|a house) on (.+)\.$/.exec(rest))) {
					const sq = square(m[2]);
					if (sq >= 0) { s.money[p] += SQUARES[sq].h / 2; s.houses[sq] = m[1] === 'a house' ? Math.max(0, s.houses[sq] - 1) : 4; effect = { kind: 'deal', player: p, square: sq }; }
				} else if ((m = /^mortgaged (.+) for \$(\d+)\.$/.exec(rest))) {
					const sq = square(m[1]);
					if (sq >= 0) { s.money[p] += Number(m[2]); s.mort[sq] = true; }
				} else if ((m = /^unmortgaged (.+) for \$(\d+)\.$/.exec(rest))) {
					const sq = square(m[1]);
					if (sq >= 0) { s.money[p] -= Number(m[2]); s.mort[sq] = false; }
				} else if ((m = /^paid \$(\d+) interest on the mortgaged properties received from (.+)\.$/.exec(rest))) {
					s.money[p] -= Number(m[1]);
					const from = idxOf(m[2]);
					for (let i = 0; i < 40; i++) if (from >= 0 && s.owner[i] === from) s.owner[i] = p; // the mortgaged ones were still the loser's
				} else if (rest === 'is bankrupt.') {
					const creditor = lastRentTo[p];
					const fromRent = creditor >= 0 && s.money[p] < 0;
					if (fromRent) s.money[creditor] += s.money[p]; // the creditor only gets what the player really had
					for (let i = 0; i < 40; i++) {
						if (s.owner[i] !== p) continue;
						if (fromRent && !s.mort[i]) s.owner[i] = creditor; // mortgaged ones follow the "interest" line
						else if (!fromRent) { s.owner[i] = -1; s.mort[i] = false; } // to the bank (they are auctioned next)
						if (s.houses[i] > 0) { if (fromRent) s.money[creditor] += SQUARES[i].h * 0.5 * s.houses[i]; s.houses[i] = 0; }
					}
					if (fromRent) s.cards[creditor] += s.cards[p];
					s.cards[p] = 0;
					s.money[p] = 0; s.out[p] = true;
					effect = { kind: 'bankrupt', player: p };
				}
			}
		}
		if (e.type !== 'alert' && e.type !== 'event' && e.type !== undefined) { /* only readable lines are in the list */ }
		fx.push(effect);
		frames.push(clone(s));
	});
	return { frames, fx, names };
}
