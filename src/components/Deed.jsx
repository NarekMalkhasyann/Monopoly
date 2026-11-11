// Title-deed card shown when hovering a property: a colour header with the brand logo, who owns it and the
// price, the rent table (the row that applies right now is lit), then house cost and mortgage value.
// The engine (showdeed in monopoly.js) writes the content; this is only the empty frame.

export default function Deed() {
	return (
		<div id="deed">
			<div id="deed-head">
				<span id="deed-logo"><img id="deed-logo-img" alt="" /></span>
				<div id="deed-kind">TITLE DEED</div>
				<div id="deed-name" />
				<div id="deed-category" />
			</div>
			<div id="deed-meta">
				<span id="deed-owner" />
				<span>Price <b id="deed-price" /></span>
			</div>
			<div id="deed-rows" />
			<div id="deed-foot"><span id="deed-foot-left" /><span id="deed-foot-right" /></div>
			<div id="deed-banner">MORTGAGED · no rent is collected</div>
		</div>
	);
}
