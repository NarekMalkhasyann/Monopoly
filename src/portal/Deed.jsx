import { SQUARES } from './boardData.js';

// The title deed of a square, like the card in the real game: rents, house price, mortgage value, and who owns it now.
// rules: 1 = original rents and house prices, 2 = halved house rents and cheaper houses (same formula as applyRules() in the engine).
const HOUSE_V2 = { 3: 25, 4: 50, 5: 75, 6: 100, 7: 125, 8: 150, 9: 175, 10: 200 };

export function rentsOf(s, rules) {
	const [base, ...rest] = s.r;
	if (rules < 2) return [base, ...rest];
	const cheap = s.g <= 4;
	let prev = base;
	return [base, ...rest.map((r) => (prev = Math.max(cheap ? Math.round(r * 0.55) : Math.round((r * 0.5) / 5) * 5, prev + 1)))];
}

export default function Deed({ square: i, rules = 2, houses = 0, owner, mortgaged }) {
	const s = SQUARES[i];
	if (!s || !['prop', 'rail', 'util'].includes(s.k)) return null;
	let rows;
	let lit = -1;
	if (s.k === 'prop') {
		const r = rentsOf(s, rules);
		rows = [['Rent', r[0]], ['1 house', r[1]], ['2 houses', r[2]], ['3 houses', r[3]], ['4 houses', r[4]], ['Hotel', r[5]]].map(([a, b]) => [a, '$' + b]);
		if (owner) lit = houses;
	} else if (s.k === 'rail') {
		rows = [['1 station', '$25'], ['2 stations', '$50'], ['3 stations', '$100'], ['4 stations', '$200']];
	} else {
		rows = [['1 utility', '4 × dice'], ['2 utilities', '10 × dice']];
	}
	const house = s.k === 'prop' ? (rules >= 2 ? HOUSE_V2[s.g] : s.h) : 0;
	return (
		<div className="rb-deed" role="tooltip">
			<div className="rb-deed-band" style={{ background: s.c || '#e5e7eb' }}>
				{s.cat && <small>{s.cat}</small>}
				<b>{s.n}</b>
			</div>
			<div className="rb-deed-rows">
				{rows.map(([a, b], k) => <div key={a} className={k === lit ? 'on' : ''}><span>{a}</span><b>{b}</b></div>)}
			</div>
			<div className="rb-deed-foot">
				<span>Price ${s.p}</span>
				<span>Mortgage ${s.p / 2}</span>
				{house > 0 && <span>House ${house}</span>}
			</div>
			<div className="rb-deed-own">
				{owner ? <><i style={{ background: owner.color || '#888' }} />{owner.name}{mortgaged ? ' · mortgaged' : ''}</> : 'Unowned'}
			</div>
		</div>
	);
}
