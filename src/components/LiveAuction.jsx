import { useEffect, useState, useSyncExternalStore } from 'react';
import { getLiveAuction, subscribeLiveAuction, placeBid, showHint } from '../liveAuction.js';
import { onAuctionMessage } from '../online.js';
import { myPlayerIndex } from '../onlineGame.js';

// The live auction of an online game: anyone bids at any time; the highest bid that stays on top for 5 seconds wins.
// The server keeps the clock (see src/liveAuction.js); this only draws it. Local games keep the old turn-based pop-up.
const STEPS = [2, 10, 100];
const DEFAULT_HINT = 'Anyone can bid at any time. A new bid restarts the 5 seconds.';

function Deed({ sq }) {
	const property = sq.groupNumber >= 3;
	const rows = property
		? [['Rent', sq.baserent], ['1 house', sq.rent1], ['2 houses', sq.rent2], ['3 houses', sq.rent3], ['4 houses', sq.rent4], ['Hotel', sq.rent5]].map(([k, v]) => [k, `$${v}`])
		: sq.groupNumber === 1 ? [['1 station', '$25'], ['2 stations', '$50'], ['3 stations', '$100'], ['4 stations', '$200']] : [['1 utility', '4 × dice'], ['2 utilities', '10 × dice']];
	return (
		<div className="la-deed">
			<div className="la-deed-head" style={{ background: sq.color || '#9ca3af' }}>
				{sq.logo && <span className="la-deed-logo"><img src={`images/card-logos/${sq.logo}.png`} alt="" /></span>}
				<div className="la-deed-kind">{property ? 'TITLE DEED' : sq.groupNumber === 1 ? 'STATION' : 'UTILITY'}</div>
				<div className="la-deed-name">{sq.name}</div>
				{sq.category && <div className="la-deed-cat">{sq.category.en} · {sq.category.hy}</div>}
			</div>
			<div className="la-deed-price">Price <b>${sq.price}</b></div>
			<div className="la-deed-rows">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
			<div className="la-deed-foot"><span>{property ? `House $${sq.houseprice} each` : sq.groupNumber === 1 ? 'No houses' : 'Rent follows the dice'}</span><span>Mortgage ${sq.price / 2}</span></div>
		</div>
	);
}

const Avatar = ({ who, big }) => <i className={`la-avatar${big ? ' la-avatar-big' : ''}`} style={{ background: who ? who.color : '#444' }}>{who ? who.name.slice(0, 1).toUpperCase() : '?'}</i>;

export default function LiveAuction() {
	const la = useSyncExternalStore(subscribeLiveAuction, getLiveAuction);
	const [now, setNow] = useState(Date.now());
	useEffect(() => onAuctionMessage(() => showHint('Someone bid higher. Try again.')), []);
	useEffect(() => {
		if (!la.open) return undefined;
		const id = setInterval(() => setNow(Date.now()), 100);
		return () => clearInterval(id);
	}, [la.open]);
	// the "Someone bid higher" notice goes away by itself
	useEffect(() => {
		if (!la.hint) return undefined;
		const id = setTimeout(() => showHint(''), 2500);
		return () => clearTimeout(id);
	}, [la.hint]);
	if (!la.open) return <div id="live-auction-slot" />;
	const sq = window.square && window.square[la.index];
	if (!sq) return null;
	const me = window.player && window.player[myPlayerIndex()];
	const cash = me ? me.money : 0;
	const started = la.deadlineAt > 0;
	const leftMs = started ? Math.max(0, la.deadlineAt - now) : 0;
	const frac = started && la.totalMs ? Math.min(1, leftMs / la.totalMs) : 1;
	const secs = Math.ceil(leftMs / 1000);
	const label = !started ? 'Starting…' : la.high > 0 ? `Sold in ${secs}…` : `No bids yet · closes in ${secs}…`;
	const urgent = la.high > 0 && secs <= 2;
	return (
		<div id="live-auction" role="dialog" aria-label={`Auction for ${sq.name}`}>
			<div className="la-card">
				<div className="la-head">
					<span className="la-gavel"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 13-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10" /><path d="m16 16 6-6" /><path d="m8 8 6-6" /><path d="m9 7 8 8" /><path d="m21 11-8-8" /></svg></span>
					<div className="la-title"><h3>Auction</h3><p>{DEFAULT_HINT}</p></div>
					<span className="la-count">{window.pcount} players in</span>
				</div>
				<div className="la-body">
					<div className="la-main">
						<div className={`la-high${la.high > 0 ? '' : ' la-none'}`}>
							<Avatar who={la.bidder} big />
							<div className="la-high-mid">
								<small>HIGHEST BID</small>
								{la.high > 0 ? <><b>${la.high}</b><span>by <strong>{la.bidder && la.bidder.name}</strong></span></> : <><b>No bids yet</b><span>Be the first to bid</span></>}
							</div>
							<div className="la-bank"><span>Bank price</span><b>${sq.price}</b></div>
						</div>
						<div className={`la-timer${urgent ? ' la-urgent' : ''}${la.high > 0 ? '' : ' la-idle'}`}>
							<div className="la-bar"><i style={{ width: `${frac * 100}%` }} /></div>
							<div className="la-timer-text"><span>{label}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 13-8.5 8.5a2.1 2.1 0 0 1-3-3L11 10" /><path d="m16 16 6-6" /><path d="m8 8 6-6" /><path d="m9 7 8 8" /><path d="m21 11-8-8" /></svg></div>
						</div>
						<div className="la-bidlabel">I'M BIDDING…</div>
						<div className="la-buttons">
							{STEPS.map((step) => {
								const total = la.high + step;
								return <button key={step} type="button" disabled={!started || total > cash} onClick={() => placeBid(total)}><small>+${step}</small><b>${total}</b></button>;
							})}
						</div>
						<div className={`la-hint${la.hint ? ' la-warn' : ''}`}><span>{la.hint}</span><b>Your cash ${cash}</b></div>
						<div className="la-history-wrap"><div className="la-history">
							{la.history.length === 0 && <div className="la-empty">The bids will appear here.</div>}
							{la.history.slice(0, 12).map((h, i) => (
								<div key={`${h.at}-${i}`} className="la-hrow" style={{ opacity: Math.max(0.35, 1 - i * 0.12) }}>
									<Avatar who={h.bidder} /><span>{h.bidder.name}</span><b>${h.amount}</b>
								</div>
							))}
						</div></div>
					</div>
					<Deed sq={sq} />
				</div>
			</div>
		</div>
	);
}
