// Game setup screen: number of players, then name / colour / human-or-AI for each.
// The engine (public/engine/monopoly.js) reads these fields by id in setup(),
// so the ids below must stay exactly as they are.

const COLORS = [
	'Aqua', 'Black', 'Blue', 'Fuchsia', 'Gray', 'Green', 'Lime', 'Maroon',
	'Navy', 'Olive', 'Orange', 'Purple', 'Red', 'Silver', 'Teal', 'Yellow',
];

// Default colour of players 1..8
const DEFAULT_COLORS = ['Yellow', 'Blue', 'Red', 'Lime', 'Green', 'Aqua', 'Orange', 'Purple'];

function PlayerRow({ n }) {
	// Choosing "AI" locks the name field (the AI names itself).
	const onTypeChange = (e) => {
		document.getElementById(`player${n}name`).disabled = e.target.value !== '0';
	};

	return (
		<div id={`player${n}input`} className="player-input">
			Player {n}:{' '}
			<input type="text" id={`player${n}name`} title="Player name" maxLength={16} defaultValue={`Player ${n}`} />
			<select id={`player${n}color`} title="Player color" defaultValue={DEFAULT_COLORS[n - 1]}>
				{COLORS.map((c) => (
					<option key={c} style={{ color: c.toLowerCase() }}>{c}</option>
				))}
			</select>
			<select
				id={`player${n}ai`}
				title="Choose whether this player is controled by a human or by the computer."
				defaultValue="0"
				onChange={onTypeChange}
				onClick={onTypeChange}
			>
				<option value="0">Human</option>
				<option value="1">AI (Test)</option>
			</select>
		</div>
	);
}

export default function Setup() {
	return (
		<div id="setup">
			<div className="setup-header">
				<h1 className="game-title">MONOPOLY</h1>
				<p className="game-subtitle">Classic Property Trading Game</p>
			</div>

			<div style={{ marginBottom: 20 }}>
				<label htmlFor="playernumber" style={{ fontWeight: 600, marginRight: 8 }}>Select number of players:</label>
				<select id="playernumber" title="Select the number of players for the game." defaultValue="4">
					{[2, 3, 4, 5, 6, 7, 8].map((n) => (
						<option key={n}>{n}</option>
					))}
				</select>
			</div>

			{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
				<PlayerRow key={n} n={n} />
			))}

			<div style={{ margin: '20px 0px' }}>
				<input type="button" value="Start Game" onClick={() => window.setup()} title="Begin playing." />
			</div>

			<div id="noF5">Note: Refreshing this page or navigating away from it may end your game without warning.</div>
		</div>
	);
}
