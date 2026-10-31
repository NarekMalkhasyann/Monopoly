// The centre panel on the board: Buy / Manage / Trade tabs, the message box,
// the current player's cash, the dice and the Roll / Resign buttons.
// Tab switching and button wiring (#nextbutton, #buyhousebutton, ...) are done
// by the engine, which looks the elements up by id.

const TABS = [
	{ id: 'buy-menu-item', label: 'Buy', title: 'View alerts and buy the property you landed on.' },
	{ id: 'manage-menu-item', label: 'Manage', title: 'View, mortgage, and improve your property. ' },
	{ id: 'trade-menu-item', label: 'Trade', title: 'Exchange property with other players.' },
];

export default function ControlPanel() {
	return (
		<div id="control">
			<table>
				<tbody>
					<tr>
						<td style={{ textAlign: 'left', verticalAlign: 'top', border: 'none' }}>
							<div id="menu">
								<table id="menutable" cellSpacing="0">
									<tbody>
										<tr>
											{TABS.map((tab) => (
												<td key={tab.id} className="menu-item" id={tab.id}>
													<a
														role="button"
														tabIndex={0}
														title={tab.title}
														onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
													>
														{tab.label}
													</a>
												</td>
											))}
										</tr>
									</tbody>
								</table>
							</div>

							<div id="buy">
								<div id="alert" />
								<div id="landed" />
							</div>

							<div id="manage">
								<div id="option">
									<div id="buildings" title="Available buildings" />
									<input type="button" value="Buy house" id="buyhousebutton" />
									<input type="button" value="Mortgage" id="mortgagebutton" />
									<input type="button" value="Sell house" id="sellhousebutton" />
								</div>
								<div id="owned" />
							</div>
						</td>

						<td style={{ verticalAlign: 'top', border: 'none' }}>
							<div id="quickstats">
								<div><span id="pname">Player 1</span>:</div>
								<div><span id="pmoney">$1500</span></div>
							</div>
							<div>
								<div id="die0" title="Die" className="die die-no-img" />
								<div id="die1" title="Die" className="die die-no-img" />
							</div>
						</td>
					</tr>
					<tr>
						<td colSpan={2} style={{ border: 'none' }}>
							<div style={{ paddingTop: 8 }}>
								<input type="button" id="nextbutton" title="Roll the dice and move your token accordingly." value="Roll Dice" />
								<input
									type="button"
									id="resignbutton"
									title="If you cannot pay your debt then you must resign from the game."
									value="Resign"
									onClick={() => window.game.resign()}
								/>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	);
}
