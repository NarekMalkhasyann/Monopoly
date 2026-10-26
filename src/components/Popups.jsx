// Full-screen overlays used by the engine: the general popup (cards, auctions,
// messages) and the "View stats" window, plus the no-JavaScript notice and the
// "refresh to start a new game" message.

export default function Popups() {
	return (
		<>
			<div id="popupbackground" />
			<div id="popupwrap">
				<div id="popup">
					<div style={{ position: 'relative' }}>
						<div id="popuptext" />
						<div id="popupdrag" />
					</div>
				</div>
			</div>

			<div id="statsbackground" />
			<div id="statswrap">
				<div id="stats">
					<div style={{ position: 'relative' }}>
						<img id="statsclose" src="images/close.png" title="Close" alt="x" />
						<div id="statstext" />
						<div id="statsdrag" />
					</div>
				</div>
			</div>

			<p id="noscript">Note: This page will not function without JavaScript.</p>

			<div id="refresh">Refresh this page to start a new game.</div>
		</>
	);
}
