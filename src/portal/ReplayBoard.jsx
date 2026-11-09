import { SQUARES } from './boardData.js';

// Where square i sits on the 11 x 11 grid: GO bottom-right, then left along the bottom, up the left side,
// right along the top and down the right side (like the real board).
export function cell(i) {
	if (i <= 10) return { row: 10, col: 10 - i };
	if (i <= 20) return { row: 20 - i, col: 0 };
	if (i <= 30) return { row: 0, col: i - 20 };
	return { row: i - 30, col: 10 };
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Die({ value, rolling }) {
	return (
		<div className={`rdie${rolling ? ' rdie-rolling' : ''}`} aria-label={`Die showing ${value}`}>
			{Array.from({ length: 9 }, (_, k) => <span key={k} className={(PIPS[value] || []).includes(k) ? 'rpip on' : 'rpip'} />)}
		</div>
	);
}

// The real board is 852 units wide: two 102-unit corners and nine 72-unit squares between them. The replay board
// uses the same proportions, so squares are tall on the top / bottom rows and wide on the sides, like the original.
const UNITS = 852;
const edge = (c) => (c === 0 ? 0 : c === 10 ? UNITS - 102 : 102 + 72 * (c - 1)); // left edge of column / row c
const mid = (c) => (c === 0 || c === 10 ? edge(c) + 51 : edge(c) + 36);
const LOGOS = 'images/card-logos/'; // resolves from the site root (index.html has <base href="/">)

export default function ReplayBoard({ state, players, hop, rolling, shownDice, caption }) {
	const where = (p) => (hop && hop.player === p ? hop.square : state.pos[p]);
	const atSquare = (i) => players.map((_, p) => p).filter((p) => !state.out[p] && where(p) === i);
	const colorOf = (p) => players[p].color || '#888';

	return (
		<div className="rb" role="img" aria-label="The board during the replay">
			{SQUARES.map((s, i) => {
				const { row, col } = cell(i);
				const h = state.houses[i];
				const o = state.owner[i];
				const side = i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r';
				return (
					<div key={i} className={`rb-sq rb-${side}${state.mort[i] ? ' rb-mort' : ''}${i % 10 === 0 ? ' rb-corner' : ''}`}
						style={{ gridRow: row + 1, gridColumn: col + 1 }} title={s.n}>
						{s.c && <span className="rb-band" style={{ background: s.c }}>
							{h > 0 && (h === 5 ? <b className="rb-hotel" /> : Array.from({ length: h }, (_, k) => <b key={k} className="rb-house" />))}
						</span>}
						{s.l ? <img className="rb-logo-img" src={`${LOGOS}${s.l}.png`} alt="" draggable="false" /> : <span className="rb-name">{s.n}</span>}
						{o >= 0 && <span className="rb-owner" style={{ background: colorOf(o) }} />}
					</div>
				);
			})}
			{players.map((pl, p) => {
				if (state.out[p]) return null;
				const sq = where(p);
				const { row, col } = cell(sq);
				const mates = atSquare(sq);
				const k = mates.indexOf(p);
				const dx = (k % 2 ? 1 : -1) * (mates.length > 1 ? 40 : 0);
				const dy = (k > 1 ? 1 : -1) * (mates.length > 2 ? 40 : 0);
				const inJail = state.jail[p] && sq === 10;
				return (
					<div key={p} className={`rb-token${state.turn === p ? ' rb-active' : ''}`}
						style={{ left: `${(mid(col) / UNITS) * 100}%`, top: `${(mid(row) / UNITS) * 100}%`, background: colorOf(p), transform: `translate(calc(-50% + ${dx}%), calc(-50% + ${dy}% + ${inJail ? 6 : 0}px))`, zIndex: 5 + (state.turn === p ? 1 : 0) }}
						title={pl.name}>
						{p + 1}
					</div>
				);
			})}
			<div className="rb-center">
				<div className="rb-logo">ACT Monopoly</div>
				<div className="rb-dice">
					{shownDice ? <><Die value={shownDice[0]} rolling={rolling} /><Die value={shownDice[1]} rolling={rolling} /></> : <span className="muted">Press Play</span>}
				</div>
				<div className="rb-caption" aria-live="polite">{caption}</div>
			</div>
		</div>
	);
}
