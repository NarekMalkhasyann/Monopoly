import { useSyncExternalStore } from 'react';
import { getTradeOffer, subscribeTradeOffer, clickTradeOffer } from '../tradeOffer.js';

// Online games: the open trade offer, between the players list and "My properties". Everybody sees who offers whom;
// only the two players it is about can open it (the window with the details and the Accept / Reject buttons).
const Dot = ({ p }) => <i className="to-avatar" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</i>;

export default function TradeOfferCard() {
	const o = useSyncExternalStore(subscribeTradeOffer, getTradeOffer);
	if (!o) return null;
	const body = (
		<>
			<span className="to-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 8h13l-3-3M17 16H4l3 3" /></svg></span>
			<span className="to-text">
				<small>TRADE OFFER</small>
				<b><Dot p={o.from} />{o.from.name}<em>→</em><Dot p={o.to} />{o.to.name}</b>
			</span>
			{o.involved && <span className="to-open">{o.expanded ? 'Hide' : o.forMe ? 'Answer' : 'View'}</span>}
		</>
	);
	return o.involved
		? <button type="button" id="trade-offer-card" className={`to-card to-involved${o.forMe ? ' to-me' : ''}`} onClick={clickTradeOffer}>{body}</button>
		: <div id="trade-offer-card" className="to-card">{body}</div>;
}
