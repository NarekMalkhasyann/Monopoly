// The end-of-game summary, worked out from the saved log (so old games get one too).
import { SQUARES } from './boardData.js';
import { buildFrames, START_MONEY } from './replayModel.js';

const RENT = /^paid \$(\d+) rent to (.+)\.$/;
const BOUGHT = /^bought (.+) for \$(\d+)\.$/;
const JAILED = /^was sent directly to jail\.$/;

const netWorth = (s, i) => {
	if (s.out[i]) return 0;
	let w = s.money[i];
	for (let k = 0; k < 40; k++) {
		if (s.owner[k] !== i) continue;
		w += s.mort[k] ? SQUARES[k].p / 2 : SQUARES[k].p;
		w += (s.houses[k] || 0) * (SQUARES[k].h || 0);
	}
	return Math.round(w);
};

const minutes = (a, b) => {
	if (!a || !b) return 0;
	const t = (s) => new Date(String(s).replace(' ', 'T') + 'Z').getTime();
	return Math.max(0, Math.round((t(b) - t(a)) / 60000));
};
export const fmtDuration = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

/** game: { events, players, winner_name, turn_count, created_at, finished_at }. Returns null when there is nothing to show. */
export function buildRecap(game) {
	const events = game.events || [];
	const players = [...(game.players || [])].sort((a, b) => a.seat - b.seat);
	const win = players.findIndex((p) => p.name === game.winner_name);
	if (!events.length || win < 0) return null;
	const { frames, fx, names } = buildFrames(events, players);
	const n = players.length;
	const last = frames[frames.length - 1];

	// net worth after the last line of every turn
	const turns = [0];
	const series = [Array(n).fill(START_MONEY)];
	events.forEach((e, k) => {
		const t = Number(e.turn) || 0;
		const row = players.map((_, i) => netWorth(frames[k + 1], i));
		if (t === turns[turns.length - 1]) series[series.length - 1] = row;
		else if (t > turns[turns.length - 1]) { turns.push(t); series.push(row); }
	});
	const lastTurn = turns[turns.length - 1] || 1;

	// who went bankrupt when (in order)
	const out = [];
	fx.forEach((f, k) => { if (f.kind === 'bankrupt') out.push({ i: f.player, turn: Number(events[k].turn) || lastTurn }); });

	// standings: the winner, then the bankrupt ones from the last to go to the first
	const rows = [{ i: win, note: 'Winner', worth: netWorth(last, win) }];
	[...out].reverse().forEach((o) => { if (o.i !== win && !rows.some((r) => r.i === o.i)) rows.push({ i: o.i, note: `Bankrupt on turn ${o.turn}`, worth: 0 }); });
	players.forEach((_, i) => { if (!rows.some((r) => r.i === i)) rows.push({ i, note: 'Still in the game', worth: netWorth(last, i) }); });
	const standings = rows.map((r, k) => ({ rank: k + 1, name: names[r.i], color: players[r.i].color, note: r.note, worth: r.worth, win: k === 0 }));

	// counts for the awards
	const rent = Array(n).fill(0), jail = Array(n).fill(0), visits = Array(40).fill(0);
	let best = null;
	events.forEach((e, k) => {
		const text = String(e.text || '');
		let who = -1, rest = text;
		for (let i = 0; i < n; i++) if (text.startsWith(names[i] + ' ') && (who < 0 || names[i].length > names[who].length)) { who = i; rest = text.slice(names[i].length + 1); }
		let m;
		if (who >= 0 && (m = RENT.exec(rest))) { const to = names.indexOf(m[2]); if (to >= 0) rent[to] += Number(m[1]); }
		if (who >= 0 && JAILED.test(rest)) jail[who] += 1;
		if (who >= 0 && (m = BOUGHT.exec(rest))) { const price = Number(m[2]); if (!best || price > best.price) best = { price, who, square: m[1] }; }
		if (fx[k].kind === 'move' && !fx[k].jailed) visits[fx[k].to] += 1;
	});
	const awards = [];
	const top = (arr) => arr.reduce((b, v, i) => (v > arr[b] ? i : b), 0);
	const r = top(rent);
	if (rent[r] > 0) awards.push({ kind: 'rent', title: 'RENT KING', value: names[r], sub: `Collected $${rent[r].toLocaleString('en-US')} in rent`, color: '#facc15' });
	let v = -1;
	visits.forEach((c, k) => { if (['prop', 'rail', 'util'].includes(SQUARES[k].k) && (v < 0 || c > visits[v])) v = k; });
	if (v >= 0 && visits[v] >= 2) awards.push({ kind: 'visit', title: 'MOST VISITED', value: SQUARES[v].n, sub: `Landed on ${visits[v]} times`, color: '#38bdf8' });
	if (best) awards.push({ kind: 'buy', title: 'BIGGEST BUY', value: `$${best.price}`, sub: `${names[best.who]} bought ${best.square}`, color: '#a855f7' });
	const j = top(jail);
	if (jail[j] > 0) awards.push({ kind: 'jail', title: 'JAIL REGULAR', value: names[j], sub: `Sent to jail ${jail[j]} time${jail[j] === 1 ? '' : 's'}`, color: '#ef4444' });

	let props = 0, buildings = 0;
	for (let k = 0; k < 40; k++) if (last.owner[k] === win) { props += 1; buildings += last.houses[k] > 0 ? (last.houses[k] === 5 ? 1 : last.houses[k]) : 0; }

	return {
		winner: { name: names[win], color: players[win].color, worth: rows[0].worth, props, buildings },
		turns: game.turn_count || lastTurn, minutes: minutes(game.created_at, game.finished_at),
		standings, awards,
		chart: { lastTurn, points: turns.map((t, k) => ({ t, v: series[k] })), players: players.map((p, i) => ({ name: names[i], color: p.color, out: out.find((o) => o.i === i) || null })) },
	};
}
