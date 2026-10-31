// Trade pop-up: two columns (one per player) with a cash field and a list of
// properties. The engine fills in the names and property lists and shows / hides
// #trade (the dimmed overlay); .trade-modal is the panel itself.

export default function TradePanel() {
	return (
		<div id="trade">
			<div className="trade-modal" role="dialog" aria-modal="true" aria-label="Trade">
			<div className="trade-head">
				<h3>Trade</h3>
				<button type="button" className="trade-close" aria-label="Close trade" title="Cancel the trade." onClick={() => window.game.cancelTrade()}>✕</button>
			</div>
			<table style={{ borderSpacing: 3 }}>
				<tbody>
					<tr>
						<td className="trade-cell"><div id="trade-leftp-name" /></td>
						<td className="trade-cell"><div id="trade-rightp-name" /></td>
					</tr>
					<tr>
						<td className="trade-cell">
							${' '}<input id="trade-leftp-money" defaultValue="0" title="Enter amount to exchange with the other player." />
						</td>
						<td className="trade-cell">
							${' '}<input id="trade-rightp-money" defaultValue="0" title="Enter amount to exchange with the other player." />
						</td>
					</tr>
					<tr>
						<td id="trade-leftp-property" className="trade-cell" />
						<td id="trade-rightp-property" className="trade-cell" />
					</tr>
					<tr>
						<td colSpan={2} className="trade-cell">
							<input type="button" id="proposetradebutton" value="Propose Trade" onClick={() => window.game.proposeTrade()} title="Exchange the money and properties that are checked above." />
							<input type="button" id="canceltradebutton" value="Cancel Trade" onClick={() => window.game.cancelTrade()} title="Cancel the trade." />
							<input type="button" id="accepttradebutton" value="Accept Trade" onClick={() => window.game.acceptTrade()} title="Accept the proposed trade." />
							<input type="button" id="rejecttradebutton" value="Reject Trade" onClick={() => window.game.cancelTrade()} title="Reject the proposed trade." />
						</td>
					</tr>
				</tbody>
			</table>
			</div>
		</div>
	);
}
