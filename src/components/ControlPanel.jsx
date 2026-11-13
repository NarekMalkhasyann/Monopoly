import { useEffect } from 'react';
import TurnPresence from './TurnPresence.jsx';

// The centre panel on the board: Buy / Manage / Trade tabs, the message box,
// the current player's cash, the dice and the Roll / Resign buttons.
// Tab switching and button wiring (#nextbutton, #buyhousebutton, ...) are done
// by the engine, which looks the elements up by id.

const ICON = {
	'manage-menu-item': <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" />,
	'trade-menu-item': <path d="M7 8h13l-3-3M17 16H4l3 3" />,
};
const TABS = [
	{ id: 'buy-menu-item', label: 'Buy', title: 'View alerts and buy the property you landed on.' },
	{ id: 'manage-menu-item', label: 'Manage', title: 'View, mortgage, and improve your property. ' },
	{ id: 'trade-menu-item', label: 'Trade', title: 'Exchange property with other players.' },
];

// "Buy Aparan · $80" beside End turn. The engine draws its own Buy button inside #landed (hidden by CSS);
// this one only mirrors it and presses it, so the engine and the online relay still see the real button.
function useBuyProxy() {
	useEffect(() => {
		const sync = () => {
			const proxy = document.getElementById('buyproxy');
			if (!proxy) return;
			const real = document.getElementById('buybutton');
			const landed = document.getElementById('landed');
			const show = !!(real && landed && landed.style.display !== 'none' && !real.disabled);
			proxy.hidden = !show;
			if (show) {
				const link = landed.querySelector('a');
				const price = (real.value.match(/\$[\d,]+/) || [''])[0];
				const label = `Buy ${link ? link.textContent : ''} \u00b7 ${price}`;
				if (proxy.textContent !== label) proxy.textContent = label;
			}
		};
		const t = setInterval(sync, 200);
		return () => clearInterval(t);
	}, []);
}

export default function ControlPanel() {
	useBuyProxy();
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
														{ICON[tab.id] && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[tab.id]}</svg>}
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
								<div className="manage-head">
									<div className="manage-titles"><span className="manage-title">Manage<span className="manage-more"> properties</span></span><span className="manage-sub">Build, sell and mortgage. Houses go up evenly across a complete colour set.</span></div>
									<div className="manage-cashbox"><span>Your cash</span><b id="manage-cash">$0</b></div>
									<button type="button" className="trade-close" aria-label="Close manage" onClick={() => document.getElementById('buy-menu-item').click()}>✕</button>
								</div>
								<div id="option">
									<div id="buildings" title="Available buildings" />
									<input type="button" value="Buy house" id="buyhousebutton" />
									<input type="button" value="Mortgage" id="mortgagebutton" />
									<input type="button" value="Sell house" id="sellhousebutton" />
								</div>
								<div id="owned" />
								<button type="button" className="manage-done" onClick={() => document.getElementById('buy-menu-item').click()}>Done</button>
							</div>
						</td>

						<td style={{ verticalAlign: 'top', border: 'none' }}>
							<div id="quickstats">
								<div className="qs-name"><TurnPresence /><span id="pname">Player 1</span><span>:</span></div>
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
								<button type="button" id="buyproxy" hidden onClick={() => { const b = document.getElementById('buybutton'); if (b) b.click(); }} />
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
