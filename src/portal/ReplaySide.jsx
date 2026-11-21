import { SQUARES } from './boardData.js';

// Right-hand column of Replay and the admin Live view: one card per player (cash, turn, jail) and everybody's properties.
export default function ReplaySide({ state, list }) {
	return (
		<div className="replay-side">
			<div className="rp-players">
				{list.map((p, i) => {
					const props = state.owner.filter((o) => o === i).length;
					const on = state.turn === i && !state.out[i];
					return (
						<div key={p.seat} className={`rp${on ? ' rp-on' : ''}${state.out[i] ? ' rp-out' : ''}`}>
							<span className="rp-av" style={{ background: p.color }}>{i + 1}</span>
							<span className="rp-who">
								<span className="rp-name">{p.name}{on && <em className="rp-turn">TURN</em>}</span>
								<span className="rp-sub">{props} propert{props === 1 ? 'y' : 'ies'}{state.jail[i] ? ' · in jail' : ''}{state.cards[i] > 0 ? ' · jail card' : ''}</span>
							</span>
							<span className="rp-money">{state.out[i] ? 'Bankrupt' : `$${state.money[i]}`}</span>
						</div>
					);
				})}
			</div>
			<div className="rp-props">
				{list.map((p, i) => {
					const mine = SQUARES.map((sq, k) => k).filter((k) => state.owner[k] === i);
					return (
						<div key={p.seat} className={`rp-props-row${state.out[i] ? ' rp-out' : ''}`}>
							<span className="rp-props-head"><i style={{ background: p.color }} />{p.name}<span>{mine.length}</span></span>
							<span className="rp-props-list">
								{mine.length === 0 && <span className="muted">no properties</span>}
								{mine.map((k) => {
									const h = state.houses[k];
									return (
										<span key={k} className={`rp-prop${state.mort[k] ? ' rp-prop-mort' : ''}`} title={`${SQUARES[k].n}${state.mort[k] ? ' (mortgaged)' : ''}`}>
											<i style={{ background: SQUARES[k].c || '#d9d9d9' }} />{SQUARES[k].n}
											{h > 0 && <b>{h === 5 ? ' 🏨' : ` ${'🏠'.repeat(h)}`}</b>}
										</span>
									);
								})}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
