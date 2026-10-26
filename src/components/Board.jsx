// The 40-square board. Squares are table cells with ids cell0..cell39 (0 = GO,
// numbered anticlockwise). The engine fills each cell with its name, colour bar
// and player tokens at start-up, so here we only lay out the empty grid.

const range = (from, to) => {
	// inclusive, works in both directions
	const out = [];
	if (from <= to) for (let i = from; i <= to; i++) out.push(i);
	else for (let i = from; i >= to; i--) out.push(i);
	return out;
};

function Cell({ id, kind }) {
	return <td className={`cell board-${kind}`} id={`cell${id}`} />;
}

export default function Board() {
	const topRow = range(21, 29); // left to right along the top
	const leftSide = range(19, 11); // top to bottom on the left
	const rightSide = range(31, 39); // top to bottom on the right
	const bottomRow = range(9, 1); // left to right along the bottom

	return (
		<table id="board">
			<tbody>
				<tr>
					<Cell id={20} kind="corner" />
					{topRow.map((i) => <Cell key={i} id={i} kind="top" />)}
					<Cell id={30} kind="corner" />
				</tr>

				{leftSide.map((left, row) => (
					<tr key={left}>
						<Cell id={left} kind="left" />
						<td colSpan={9} className="board-center">
							{/* the jail box sits in the row of squares 11 / 39 */}
							{left === 11 && <div id="jail" />}
						</td>
						<Cell id={rightSide[row]} kind="right" />
					</tr>
				))}

				<tr>
					<Cell id={10} kind="corner" />
					{bottomRow.map((i) => <Cell key={i} id={i} kind="bottom" />)}
					<Cell id={0} kind="corner" />
				</tr>
			</tbody>
		</table>
	);
}
