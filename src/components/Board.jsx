// The 40-square board: an 11 x 11 CSS grid. Squares are cells with ids cell0..cell39 (0 = GO,
// numbered anticlockwise). The engine fills each cell with its name, colour bar and logo
// at start-up, so here we only place the empty cells on the grid.
// (#board is the element the engine shows and hides, #board-grid is the grid itself.)

// [row, column] on the grid, 1-based.
function place(id) {
	if (id === 20) return [1, 1];
	if (id === 30) return [1, 11];
	if (id === 10) return [11, 1];
	if (id === 0) return [11, 11];
	if (id > 20 && id < 30) return [1, id - 19]; // top, left to right
	if (id > 10 && id < 20) return [20 - id + 1, 1]; // left, top to bottom
	if (id > 30) return [id - 30 + 1, 11]; // right, top to bottom
	return [11, 11 - id]; // bottom, left to right
}

function kind(id) {
	if (id % 10 === 0) return 'corner';
	if (id < 10) return 'bottom';
	if (id < 20) return 'left';
	if (id < 30) return 'top';
	return 'right';
}

export default function Board() {
	const cells = [];
	for (let id = 0; id < 40; id++) {
		const [row, col] = place(id);
		cells.push(<div key={id} className={`cell board-${kind(id)}`} id={`cell${id}`} style={{ gridRow: row, gridColumn: col }} />);
	}

	return (
		<div id="board">
			<div id="board-grid">
				{cells}
				<div className="board-center" />
				{/* the jail box sits over the top right of the "Just Visiting" corner */}
				<div id="jail" />
			</div>
		</div>
	);
}
