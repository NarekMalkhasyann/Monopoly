// Side panel with every player's name and cash (up to 8) and the "View stats" button.
// The engine updates the numbers in place (p1money, p1moneyname, ...) and
// shows / hides rows and the arrow that marks whose turn it is.

export default function MoneyBar() {
	return (
		<div id="moneybarwrap">
			<div id="moneybar">
				<table>
					<tbody>
						{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
							<tr key={n} id={`moneybarrow${n}`} className="money-bar-row">
								<td className="moneybararrowcell">
									<img src="images/arrow.png" id={`p${n}arrow`} className="money-bar-arrow" alt=">" />
								</td>
								<td id={`p${n}moneybar`} className="moneybarcell">
									<div><span id={`p${n}moneyname`}>Player {n}</span>:</div>
									<div>$<span id={`p${n}money`}>1500</span></div>
								</td>
							</tr>
						))}
						<tr id="moneybarrowbutton">
							<td className="moneybararrowcell">{' '}</td>
							<td style={{ border: 'none' }}>
								<input
									type="button"
									id="viewstats"
									value="View stats"
									title="View a pop-up window that shows a list of each player's properties."
								/>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}
