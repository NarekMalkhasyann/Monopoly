// The trade offer that is open in an online game (who offers whom), for the card above "My properties".
let offer = null;
const listeners = new Set();
let clickHandler = () => {};
export const getTradeOffer = () => offer;
export const subscribeTradeOffer = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setTradeOffer(next) {
	const same = JSON.stringify(next) === JSON.stringify(offer);
	if (same) return;
	offer = next;
	listeners.forEach((fn) => fn());
}
export const onTradeOfferClick = (fn) => { clickHandler = fn; };
export const clickTradeOffer = () => clickHandler();
