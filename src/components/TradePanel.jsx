// Trade pop-up: two columns (one per player) with a cash field and a list of
// properties. The engine fills in the names and property lists and shows / hides
// #trade (the dimmed overlay); .trade-modal is the panel itself.

import { useEffect } from 'react';

// Recipient chips and the summary line are built from what the engine puts in
// the modal, so the engine and the online relay keep working unchanged.
function decorate() {
	const win = window;
	const modal = document.querySelector('.trade-modal');
	if (!modal) return;
	const holder = document.getElementById('trade-rightp-name');
	const chips = document.getElementById('trade-chips');
	const select = holder && holder.querySelector('select');
	if (chips) {
		chips.innerHTML = '';
		chips.style.display = select ? '' : 'none';
		if (select) {
			const label = document.createElement('span');
			label.className = 'trade-with';
			label.textContent = 'TRADE WITH';
			chips.appendChild(label);
			Array.from(select.options).forEach((o) => {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'trade-chip' + (o.selected ? ' on' : '');
				const dot = document.createElement('i');
				dot.style.background = o.style.color || '#888';
				b.appendChild(dot);
				b.appendChild(document.createTextNode(o.textContent));
				b.onclick = () => { select.value = o.value; if (select.onchange) select.onchange.call(select); };
				chips.appendChild(b);
			});
		}
	}
	const side = (prefix) => {
		const out = [];
		for (let i = 0; i < 42; i++) {
			const c = document.getElementById('trade' + prefix + 'checkbox' + i);
			if (c && c.checked) out.push(i >= 40 ? 'Jail-free card' : (win.square && win.square[i] ? win.square[i].name : '#' + i));
		}
		const m = parseInt((document.getElementById('trade-' + prefix + 'p-money') || {}).value, 10);
		if (m > 0) out.push('$' + m);
		return out.length ? out.join(' + ') : 'nothing';
	};
	[['left', 'trade-leftp-name'], ['right', null]].forEach(([k]) => {
		const nameEl = document.getElementById('trade-' + k + 'p-name');
		let nm = '';
		if (nameEl) {
			const sel = nameEl.querySelector('select');
			nm = sel ? sel.options[sel.selectedIndex]?.textContent : nameEl.textContent;
		}
		const pl = (win.player || []).find((x) => x && x.name === nm);
		const av = document.getElementById('trade-' + k + 'p-avatar');
		if (av) { av.textContent = (nm || '?').trim().charAt(0).toUpperCase(); av.style.background = pl ? pl.color : '#888'; }
		const of = document.getElementById('trade-' + k + 'p-of');
		if (of) of.textContent = pl ? 'of $' + pl.money : '';
	});
	const sum = document.getElementById('trade-summary');
	if (sum) {
		const n1 = (document.getElementById('trade-leftp-name') || {}).textContent || '';
		const n2 = (holder && (select ? select.options[select.selectedIndex]?.textContent : holder.textContent)) || '';
		sum.innerHTML = '';
		[[n1 + ' gives', side('left')], [n2 + ' gives', side('right')]].forEach(([k, v], idx) => {
			const d = document.createElement('div');
			const b = document.createElement('b');
			b.textContent = k;
			d.appendChild(b);
			d.appendChild(document.createTextNode(' ' + v));
			sum.appendChild(d);
		});
	}
}

export default function TradePanel() {
	useEffect(() => {
		const root = document.getElementById('trade');
		if (!root) return;
		let queued = false;
		const run = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; decorate(); }, 0); };
		const mo = new MutationObserver((recs) => {
			if (recs.every((r) => r.target.closest && r.target.closest('#trade-chips, #trade-summary'))) return;
			run();
		});
		mo.observe(root, { childList: true, subtree: true });
		root.addEventListener('change', run);
		root.addEventListener('input', run);
		root.addEventListener('click', run);
		return () => { mo.disconnect(); root.removeEventListener('change', run); root.removeEventListener('input', run); root.removeEventListener('click', run); };
	}, []);
	return (
		<div id="trade">
			<div className="trade-modal" role="dialog" aria-modal="true" aria-label="Trade">
			<div className="trade-head">
				<div className="trade-titles"><h3>Trade</h3><span>Swap properties, cash and Get Out of Jail Free cards. Nothing changes until the other player accepts.</span></div>
				<button type="button" className="trade-close" aria-label="Close trade" title="Cancel the trade." onClick={() => window.game.cancelTrade()}>✕</button>
			</div>
			<div id="trade-chips" />
			<table className="trade-grid">
				<tbody>
					<tr>
						<td className="trade-cell"><span className="trade-avatar" id="trade-leftp-avatar" /><div className="trade-who"><div className="trade-title">Gives</div><div id="trade-leftp-name" /></div></td>
						<td className="trade-cell"><span className="trade-avatar" id="trade-rightp-avatar" /><div className="trade-who"><div className="trade-title">Gets</div><div id="trade-rightp-name" /></div></td>
					</tr>
					<tr>
						<td className="trade-cell trade-cash">
							<span className="trade-cashlabel">Cash</span><span className="trade-money"><b>$</b><input id="trade-leftp-money" defaultValue="0" title="Enter amount to exchange with the other player." /></span><span className="trade-of" id="trade-leftp-of" />
						</td>
						<td className="trade-cell trade-cash">
							<span className="trade-cashlabel">Cash</span><span className="trade-money"><b>$</b><input id="trade-rightp-money" defaultValue="0" title="Enter amount to exchange with the other player." /></span><span className="trade-of" id="trade-rightp-of" />
						</td>
					</tr>
					<tr>
						<td id="trade-leftp-property" className="trade-cell" />
						<td id="trade-rightp-property" className="trade-cell" />
					</tr>
				</tbody>
			</table>
			<div className="trade-foot">
				<div className="trade-footinfo">
					<div id="trade-summary" />
					<span className="trade-rules">Mortgaged properties: the new owner pays 10% at once, or can pay off the mortgage later. Sets with houses cannot be traded until the houses are sold.</span>
				</div>
				<div className="trade-actions">
					<input type="button" id="proposetradebutton" value="Propose trade" onClick={() => window.game.proposeTrade()} title="Exchange the money and properties that are checked above." />
					<input type="button" id="canceltradebutton" value="Cancel" onClick={() => window.game.cancelTrade()} title="Cancel the trade." />
					<input type="button" id="accepttradebutton" value="Accept trade" onClick={() => window.game.acceptTrade()} title="Accept the proposed trade." />
					<input type="button" id="rejecttradebutton" value="Reject" onClick={() => window.game.cancelTrade()} title="Reject the proposed trade." />
				</div>
			</div>
			</div>
		</div>
	);
}
