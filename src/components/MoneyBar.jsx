// Side panel with every player's name and cash (up to 8).
// The engine updates the numbers in place (p1money, p1moneyname, ...) and
// shows / hides rows and the arrow that marks whose turn it is.

import MyProperties from './MyProperties.jsx';

// Opens the Trade window for the player whose turn it is, with this player already chosen.
function quickTrade(n) {
	const tab = document.getElementById('trade-menu-item');
	if (!tab) return;
	tab.click();
	let tries = 0;
	const pick = () => {
		const sel = document.querySelector('#trade-rightp-name select');
		if (sel) {
			if (sel.value !== String(n) && Array.from(sel.options).some((o) => o.value === String(n))) {
				sel.value = String(n);
				if (sel.onchange) sel.onchange.call(sel);
			}
		} else if (++tries < 15) {
			setTimeout(pick, 100);
		}
	};
	setTimeout(pick, 50);
}

export default function MoneyBar() {
	return (
		<div id="moneybarwrap">
			<div id="moneybar">
				<table>
					<tbody>
						{[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
							<tr key={n} id={`moneybarrow${n}`} className="money-bar-row">
								<td className="moneybararrowcell">
									<img src="images/Monopoly-base-images/arrow.png" id={`p${n}arrow`} className="money-bar-arrow" alt=">" />
								</td>
								<td id={`p${n}moneybar`} className="moneybarcell">
									<div><span id={`p${n}moneyname`}>Player {n}</span><span className="mb-turn">TURN</span></div>
									<div>$<span id={`p${n}money`}>1500</span></div>
									<div className="mb-chips" id={`p${n}chips`} />
									<button type="button" className="mb-trade" aria-label={`Trade with player ${n}`} title="Trade with this player" onClick={() => quickTrade(n)}>
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8h13l-3-3M17 16H4l3 3" /></svg>
									</button>
									<span className="mb-letter" id={`p${n}letter`} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<MyProperties />
		</div>
	);
}
