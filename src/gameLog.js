// What the in-game log field (#alert) shows. The engine writes EVERY event through addAlert(): all of them are
// still saved to the server for History (window.onGameEvent in session.js), but only these reach the screen:
//   1. buying and selling: properties (also auction wins), houses and hotels, and what changes hands in a trade
//   2. jail: sent to jail, each turn in jail, paying the $50 fine, using the card, doubles to get out
//   3. the $200 salary for passing GO
// Plus one line the engine adds just for the screen (see game.auction): "<player> landed on <square> and didn't buy it".
// Everything else (whose turn it is, rolls, where someone landed, rent, mortgages, cards ...) stays out of the field.
// The engine calls window.showInGameLog(text); true = show.

const SHOW = [
	/^.+ bought .+ for .+\.$/,                                   // "X bought Y for $60." (also won in an auction)
	/^.+ placed a (house|hotel) on .+\.$/,
	/^.+ sold (the hotel|a house) on .+\.$/,
	/ was sent directly to jail\.$/,
	/^This is .+'s (first|second|third) turn in jail\.$/,
	/ paid the \$50 fine to get out of jail\.$/,
	/ used a "Get Out of Jail Free" card\.$/,
	/ rolled doubles to get out of jail\.$/,
	/ rolled doubles three times in a row\.$/,
	/ collected a \$200 salary for passing GO\.$/,
];

const playerNames = () => {
	const p = window.player || [];
	return new Set(p.filter(Boolean).map((x) => x.name));
};

// "A received <property / card / $money> from B." where B is a player = a trade. (Chance, Community Chest and
// taxes use the same wording, but there B is not a player.)
function isTradeTransfer(text) {
	const m = /^(.+?) received (.+) from (.+)\.$/.exec(text);
	if (!m) return false;
	const names = playerNames();
	return names.has(m[1]) && names.has(m[3]);
}

export function showInGameLog(text) {
	const t = String(text);
	return SHOW.some((re) => re.test(t)) || isTradeTransfer(t);
}

window.showInGameLog = showInGameLog;
