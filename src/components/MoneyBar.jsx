// Side panel with every player's name and cash (up to 8) and the "View stats" button.
// The engine updates the numbers in place (p1money, p1moneyname, ...) and
// shows / hides rows and the arrow that marks whose turn it is.

import { useOnline } from '../online.js';

// Online games only: who is connected right now. A glowing green circle = online, a dim grey one = away.
// (If this browser itself lost the connection everybody is shown grey, because the list is out of date.)
function Presence() {
	const { room, conn } = useOnline();
	if (!room || room.status !== 'active' || !room.players || room.players.length < 2) return null;
	const live = conn === 'open';
	const on = room.players.filter((p) => live && p.online).length;
	return (
		<div className="presence" role="list" aria-label="Who is online">
			<div className="presence-head">{live ? `${on} of ${room.players.length} online` : 'Reconnecting…'}</div>
			{room.players.map((p) => {
				const up = live && p.online;
				const away = p.awayMs > 0 ? ` (away ${Math.max(1, Math.round(p.awayMs / 60000))} min)` : '';
				return (
					<div key={p.seat} className={`presence-row${up ? '' : ' off'}`} role="listitem" title={`${p.name}: ${up ? 'online' : 'offline'}${up ? '' : away}`}>
						<i className={`presence-dot ${up ? 'on' : 'off'}`} aria-hidden="true" />
						<span className="presence-name">{p.name}</span>
						<span className="sr-only">{up ? 'online' : 'offline'}</span>
					</div>
				);
			})}
		</div>
	);
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
								<Presence />
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
