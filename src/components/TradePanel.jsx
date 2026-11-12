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
		return out.length ? out.join(' and ') : 'nothing';
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
		if (av) { av.textContent = /^Player \d+$/.test(nm) ? nm.replace('Player ', '') : (nm || '?').trim().charAt(0).toUpperCase(); av.style.background = pl ? pl.color : '#888'; }
		if (nameEl) nameEl.setAttribute('data-label', (nm || '') + (pl ? ' \u00b7 $' + pl.money : ''));
		const prop = document.getElementById('trade-' + k + 'p-property');
		if (prop) {
			const has = prop.querySelector('input[id$="checkbox40"], input[id$="checkbox41"]');
			const old = prop.querySelector('.trade-nojail');
			if (has && old) old.remove();
			if (!has && !old) {
				const d = document.createElement('div');
				d.className = 'trade-nojail';
				d.innerHTML = '<i></i><span>Get Out of Jail Free card</span><em>' + (k === 'left' ? 'none' : 'none') + '</em>';
				prop.appendChild(d);
			}
		}
		const of = document.getElementById('trade-' + k + 'p-of');
		if (of) of.textContent = pl ? 'of $' + pl.money : '';
	});
	const incoming = !select;
	const tl = document.getElementById('trade-leftp-title');
	const tr = document.getElementById('trade-rightp-title');
	if (tl) tl.textContent = incoming ? 'They give' : 'You give';
	if (tr) tr.textContent = incoming ? 'You give' : 'You get';
	const sum = document.getElementById('trade-summary');
	if (sum) {
		sum.innerHTML = '';
		const l = side('left'), r = side('right');
		const rows = incoming ? [['You get', l], ['You give', r]] : [['You give', l], ['You get', r]];
		rows.forEach(([k, v]) => {
			const d = document.createElement('div');
			const b = document.createElement('b');
			b.textContent = k;
			d.appendChild(b);
			d.appendChild(document.createTextNode(' ' + v));
			sum.appendChild(d);
		});
	}
	['left', 'right'].forEach((k) => {
		const m = document.getElementById('trade-' + k + 'p-money');
		if (m && m.parentElement) m.parentElement.classList.toggle('has-cash', parseInt(m.value, 10) > 0);
	});
}

export default function TradePanel() {
	useEffect(() => {
		const root = document.getElementById('trade');
		if (!root) return;
		let queued = false;
		const run = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; decorate(); }, 0); };
		const mo = new MutationObserver((recs) => {
			if (recs.every((r) => (r.target.closest && r.target.closest('#trade-chips, #trade-summary')) || [...r.addedNodes, ...r.removedNodes].every((n) => n.classList && n.classList.contains('trade-nojail')))) return;
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
						<td className="trade-cell"><span className="trade-avatar" id="trade-leftp-avatar" /><div className="trade-who"><div className="trade-title" id="trade-leftp-title">You give</div><div id="trade-leftp-name" /></div></td>
						<td className="trade-cell"><span className="trade-avatar" id="trade-rightp-avatar" /><div className="trade-who"><div className="trade-title" id="trade-rightp-title">You get</div><div id="trade-rightp-name" /></div></td>
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
