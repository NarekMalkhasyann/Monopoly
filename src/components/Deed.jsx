// Title-deed card shown when hovering a property. Three faces: a normal deed
// (rent table), a mortgaged deed and a special card (railroads / utilities).
// The engine shows one face and writes the numbers into the spans.

export default function Deed() {
	return (
		<div id="deed">
			<div id="deed-normal" style={{ display: 'none' }}>
				<div id="deed-header">
					<div style={{ margin: 5, fontSize: 11 }}>T I T L E{'  '}D E E D</div>
					<div id="deed-name" />
				</div>
				<table id="deed-table">
					<tbody>
						<tr>
							<td colSpan={2}>RENT{' '}$<span id="deed-baserent">12</span>.</td>
						</tr>
						<tr>
							<td style={{ textAlign: 'left' }}>With 1 House</td>
							<td style={{ textAlign: 'right' }}>${'   '}<span id="deed-rent1">60</span>.</td>
						</tr>
						<tr>
							<td style={{ textAlign: 'left' }}>With 2 Houses</td>
							<td style={{ textAlign: 'right' }}><span id="deed-rent2">180</span>.</td>
						</tr>
						<tr>
							<td style={{ textAlign: 'left' }}>With 3 Houses</td>
							<td style={{ textAlign: 'right' }}><span id="deed-rent3">500</span>.</td>
						</tr>
						<tr>
							<td style={{ textAlign: 'left' }}>With 4 Houses</td>
							<td style={{ textAlign: 'right' }}><span id="deed-rent4">700</span>.</td>
						</tr>
						<tr>
							<td colSpan={2}>
								<div style={{ marginBottom: 8 }}>With HOTEL $<span id="deed-rent5">900</span>.</div>
								<div>Mortgage Value $<span id="deed-mortgage">80</span>.</div>
								<div>Houses cost $<span id="deed-houseprice">100</span>. each</div>
								<div>Hotels, $<span id="deed-hotelprice">100</span>. plus 4 houses</div>
								<div style={{ fontSize: 9, fontStyle: 'italic', marginTop: 5 }}>
									If a player owns ALL the Lots of any Color-Group, the rent is Doubled on Unimproved Lots in that group.
								</div>
							</td>
						</tr>
					</tbody>
				</table>
			</div>

			<div id="deed-mortgaged">
				<div id="deed-mortgaged-name" />
				<p>&bull;</p>
				<div>MORTGAGED</div>
				<div> for $<span id="deed-mortgaged-mortgage">80</span></div>
				<p>&bull;</p>
				<div style={{ fontStyle: 'italic', fontSize: 13, margin: 10 }}>
					Card must be turned this side up if property is mortgaged
				</div>
			</div>

			<div id="deed-special">
				<div id="deed-special-name" />
				<div id="deed-special-text" />
				<div id="deed-special-footer">
					Mortgage Value
					<span style={{ float: 'right' }}>$<span id="deed-special-mortgage">100</span>.</span>
				</div>
			</div>
		</div>
	);
}
