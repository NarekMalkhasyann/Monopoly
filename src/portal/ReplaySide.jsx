import { SQUARES } from './boardData.js';
import { hex } from './colors.js';

// Right-hand column of Replay and the admin Live view: one card per player (cash, turn, jail) and everybody's properties.
export function PlayerCards({ state, list }) {
	return (
		<div className="replay-side">
			<div className="rp-players">
				{list.map((p, i) => {
					const props = state.owner.filter((o) => o === i).length;
					const on = state.turn === i && !state.out[i];
					return (
						<div key={p.seat} className={`rp${on ? ' rp-on' : ''}${state.out[i] ? ' rp-out' : ''}`}>
							<span className="rp-av" style={{ background: hex(p.color) }}>{i + 1}</span>
							<span className="rp-who">
								<span className="rp-name">{p.name}{on && <em className="rp-turn">TURN</em>}</span>
								<span className="rp-sub">{props} propert{props === 1 ? 'y' : 'ies'}{state.jail[i] ? ' · in jail' : ''}{state.cards[i] > 0 ? ' · jail card' : ''}</span>
							</span>
							<span className="rp-money">{state.out[i] ? 'Bankrupt' : `$${state.money[i]}`}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// Everybody's properties, one column per player: colour, name, houses (green) or hotel (red); mortgaged ones are struck through.
export function OwnedProps({ state, list }) {
	return (
		<div className="op-grid">
			{list.map((p, i) => {
				const mine = SQUARES.map((sq, k) => k).filter((k) => state.owner[k] === i);
				const houses = mine.reduce((n, k) => n + (state.houses[k] === 5 ? 0 : state.houses[k]), 0);
				const hotels = mine.filter((k) => state.houses[k] === 5).length;
				return (
					<div key={p.seat} className={`op${state.out[i] ? ' rp-out' : ''}`} style={{ '--pc': hex(p.color) }}>
						<div className="op-head">
							<i style={{ background: hex(p.color) }} />
							<b>{p.name}</b>
							<span>{mine.length} {mine.length === 1 ? 'property' : 'properties'}{houses ? ` · ${houses} 🏠` : ''}{hotels ? ` · ${hotels} 🏨` : ''}</span>
						</div>
						{mine.length === 0 && <div className="op-none">No properties</div>}
						{mine.map((k) => {
							const h = state.houses[k];
							return (
								<div key={k} className={`op-row${state.mort[k] ? ' op-mort' : ''}`} title={state.mort[k] ? 'Mortgaged' : undefined}>
									<i style={{ background: SQUARES[k].c || '#d9d9d9' }} />
									<span className="op-name">{SQUARES[k].n}</span>
									<span className="op-b">
										{state.mort[k] ? <em>mortgaged</em> : h === 5 ? <u className="op-hotel" /> : Array.from({ length: h }, (_, n) => <u key={n} className="op-house" />)}
									</span>
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}
