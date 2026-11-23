// Trade pop-up: two columns (one per player) with a cash field and a list of
// properties. The engine fills in the names and property lists and shows / hides
// #trade (the dimmed overlay); .trade-modal is the panel itself.

import { useEffect } from 'react';
import { myPlayerIndex } from '../onlineGame.js';

// Recipient chips and the summary line are built from what the engine puts in
// the modal, so the engine and the online relay keep working unchanged.
// Only touch the page when something really changed: every change wakes the observer below, which runs decorate() again.
const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
const setAttr = (el, name, value) => { if (el && el.getAttribute(name) !== value) el.setAttribute(name, value); };

function decorate() {
	const win = window;
	const modal = document.querySelector('.trade-modal');
	if (!modal) return;
	const holder = document.getElementById('trade-rightp-name');
	const chips = document.getElementById('trade-chips');
	const select = holder && holder.querySelector('select');
	if (chips) {
		const sig = select ? Array.from(select.options).map((o) => `${o.value}|${o.textContent}|${o.style.color}|${o.selected ? 1 : 0}`).join(';') : '';
		chips.style.display = select ? '' : 'none';
		if (chips.dataset.sig !== sig) {
			chips.dataset.sig = sig;
			chips.innerHTML = '';
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
	}
	// what one side gives: { items: [{ text, color }], value } (value = cash + the price of the properties)
	const side = (prefix) => {
		const items = [];
		let value = 0;
		for (let i = 0; i < 42; i++) {
			const c = document.getElementById('trade' + prefix + 'checkbox' + i);
			if (c && c.checked) {
				const sq = win.square && win.square[i];
				items.push({ text: i >= 40 ? 'Jail-free card' : (sq ? sq.name : '#' + i), color: i >= 40 ? '#ffffff80' : (sq && sq.color) || '#888' });
				value += i >= 40 ? 50 : (sq && sq.price) || 0;
			}
		}
		const m = parseInt((document.getElementById('trade-' + prefix + 'p-money') || {}).value, 10);
		if (m > 0) { items.unshift({ text: '$' + m, color: '#acfa00', cash: true }); value += m; }
		return { items, value };
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
		if (av) { setText(av, /^Player \d+$/.test(nm) ? nm.replace('Player ', '') : (nm || '?').trim().charAt(0).toUpperCase()); av.style.background = pl ? pl.color : '#888'; }
		if (nameEl) setAttr(nameEl, 'data-label', (nm || '') + (pl ? ' \u00b7 $' + pl.money : ''));
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
		setText(of, pl ? 'of $' + pl.money : '');
	});
	// Who gives what is told by the player's name, not by the side: an offer that is shown to its recipient has the
	// recipient on the left, the one who is reading it can be on either side.
	const nameOf = (k) => { const el = document.getElementById('trade-' + k + 'p-name'); return el ? (el.querySelector('select') ? el.querySelector('select').options[el.querySelector('select').selectedIndex]?.textContent : el.textContent) : ''; };
	const meP = win.player && myPlayerIndex() > 0 ? win.player[myPlayerIndex()] : null;
	let meSide = 'left'; // a draft is always written from my side (left); local games too
	if (!select && !meP) meSide = 'right'; // local game: unchanged
	if (!select && meP) meSide = nameOf('left') === meP.name ? 'left' : nameOf('right') === meP.name ? 'right' : null;
	const otherSide = meSide === 'left' ? 'right' : 'left';
	const tl = document.getElementById('trade-leftp-title');
	const tr = document.getElementById('trade-rightp-title');
	const youGive = 'You give';
	if (meSide) {
		setText(document.getElementById('trade-' + meSide + 'p-title'), youGive);
		setText(document.getElementById('trade-' + otherSide + 'p-title'), select ? 'You get' : 'They give');
	} else { setText(tl, `${nameOf('left')} gives`); setText(tr, `${nameOf('right')} gives`); }
	const sum = document.getElementById('trade-summary');
	if (sum) {
		const mine = side(meSide || 'left'), theirs = side(meSide ? otherSide : 'right');
		const rows = meSide
			? [[youGive, mine], ['You get', theirs]]
			: [[`${nameOf('left')} gives`, side('left')], [`${nameOf('right')} gives`, side('right')]];
		const sig = JSON.stringify([rows, meSide]);
		if (sum.dataset.sig !== sig) {
			sum.dataset.sig = sig;
			sum.innerHTML = '';
			rows.forEach(([k, v], idx) => {
				const d = document.createElement('div');
				d.className = 'ts-row ' + (idx === 0 ? 'give' : 'get');
				const b = document.createElement('b');
				b.textContent = k;
				d.appendChild(b);
				const list = document.createElement('span');
				list.className = 'ts-items';
				if (!v.items.length) { const n = document.createElement('em'); n.textContent = 'nothing'; list.appendChild(n); }
				v.items.forEach((it) => {
					const chip = document.createElement('span');
					chip.className = 'ts-chip' + (it.cash ? ' cash' : '');
					const dot = document.createElement('i');
					dot.style.background = it.color;
					chip.appendChild(dot);
					chip.appendChild(document.createTextNode(it.text));
					list.appendChild(chip);
				});
				d.appendChild(list);
				sum.appendChild(d);
			});
			if (meSide && (mine.items.length || theirs.items.length)) { // is the deal fair? (cash + printed prices)
				const diff = theirs.value - mine.value;
				const bal = document.createElement('div');
				bal.className = 'ts-bal ' + (diff > 0 ? 'plus' : diff < 0 ? 'minus' : 'even');
				bal.textContent = diff === 0 ? `Even deal · both sides $${mine.value}` : (diff > 0 ? `You get $${diff} more in value than you give` : `You give $${-diff} more in value than you get`) + ` ($${mine.value} for $${theirs.value})`;
				sum.appendChild(bal);
			}
		}
	}
	// "Swap cash": only while the offer is being written (the cash fields can be edited)
	const swap = document.getElementById('trade-swapcash');
	if (swap) {
		const l = document.getElementById('trade-leftp-money'), r = document.getElementById('trade-rightp-money');
		const editing = !!(l && r && !l.readOnly && !r.readOnly && !l.disabled && !r.disabled);
		swap.style.display = editing ? '' : 'none';
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
							<span className="trade-cashlabel">Cash</span><span className="trade-money"><b>$</b><input id="trade-leftp-money" defaultValue="0" inputMode="numeric" onFocus={(e) => e.target.select()} title="Enter amount to exchange with the other player." /></span><span className="trade-of" id="trade-leftp-of" />
						</td>
						<td className="trade-cell trade-cash">
							<span className="trade-cashlabel">Cash</span><span className="trade-money"><b>$</b><input id="trade-rightp-money" defaultValue="0" inputMode="numeric" onFocus={(e) => e.target.select()} title="Enter amount to exchange with the other player." /></span><span className="trade-of" id="trade-rightp-of" />
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
					<button type="button" id="trade-swapcash" className="trade-swap" title="Swap the two cash amounts: what you offered is asked from them and the other way round." onClick={() => {
						const l = document.getElementById('trade-leftp-money'), r = document.getElementById('trade-rightp-money');
						if (!l || !r) return;
						const a = l.value, b = r.value; l.value = b; r.value = a;
						[l, r].forEach((el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
					}}>⇄ Swap cash</button>
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
