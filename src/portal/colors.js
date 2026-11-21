// Player colours are stored by name (yellow, maroon...). These are the shades drawn on the board and everywhere in the portal;
// the same table is PLAYER_COLORS in public/engine/monopoly.js.
const HEX = {
	yellow: '#facc15', blue: '#3b82f6', red: '#ef4444', lime: '#22c55e', green: '#16a34a', aqua: '#22d3ee', orange: '#fb923c', purple: '#a855f7',
	fuchsia: '#ec4899', teal: '#14b8a6', navy: '#1e40af', maroon: '#9f1239', coral: '#ff7a59', sky: '#7dd3fc', indigo: '#818cf8', mint: '#6ee7b7', rose: '#fb7185',
	// no longer offered, but old games may still use them
	olive: '#a3a32a', gray: '#9ca3af', silver: '#d1d5db', black: '#52525b',
};
export const hex = (name) => HEX[String(name || '').toLowerCase()] || name || '#888';
