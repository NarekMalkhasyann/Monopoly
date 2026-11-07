// Regenerates src/portal/boardData.js from public/engine/classicedition.js (run: node scripts/gen-board.mjs).
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('public/engine/classicedition.js', 'utf8');
const ctx = vm.createContext({ document: {}, $: () => ({}) });
vm.runInContext(src + '\n;this.__square = square; this.__categories = categories;', ctx);
const sq = ctx.__square;
const kindAt = { 0: 'go', 10: 'jail', 20: 'park', 30: 'gojail', 4: 'tax', 38: 'tax', 2: 'card', 7: 'card', 17: 'card', 22: 'card', 33: 'card', 36: 'card' };
const rows = sq.map((s, i) => ({
	n: s.name, c: s.groupNumber >= 3 ? s.color : null, p: s.price, g: s.groupNumber, h: s.houseprice,
	k: kindAt[i] || (s.groupNumber === 1 ? 'rail' : s.groupNumber === 2 ? 'util' : 'prop'),
	...(s.category ? { cat: s.category.en, hy: s.category.hy } : {}),
}));
// names the squares had before the Armenian board, so replays of old games still find their squares
const old = ['GO', 'Mediterranean Avenue', 'Community Chest', 'Baltic Avenue', 'City Tax', 'Reading Railroad', 'Oriental Avenue', 'Chance', 'Vermont Avenue', 'Connecticut Avenue', 'Just Visiting', 'St. Charles Place', 'Electric Company', 'States Avenue', 'Virginia Avenue', 'Pennsylvania Railroad', 'St. James Place', 'Community Chest', 'Tennessee Avenue', 'New York Avenue', 'Free Parking', 'Kentucky Avenue', 'Chance', 'Indiana Avenue', 'Illinois Avenue', 'B&O Railroad', 'Atlantic Avenue', 'Ventnor Avenue', 'Water Works', 'Marvin Gardens', 'Go to Jail', 'Pacific Avenue', 'North Carolina Avenue', 'Community Chest', 'Pennsylvania Avenue', 'Short Line', 'Chance', 'Park Place', 'LUXURY TAX', 'Boardwalk'];
const out = `// The board, in the order of the squares (0 = GO ... 39 = last bank). Generated from public/engine/classicedition.js by scripts/gen-board.mjs.
// n name, c colour band (null = none), p price, g group number in the engine, h house price, k kind, cat/hy category (English/Armenian).
export const SQUARES = ${JSON.stringify(rows)};

/** The names of the same squares in games played before the Armenian board (same positions). */
export const OLD_NAMES = ${JSON.stringify(old)};
`;
fs.writeFileSync('src/portal/boardData.js', out);
console.log(rows.filter((r) => r.k === 'prop').length, 'properties');
