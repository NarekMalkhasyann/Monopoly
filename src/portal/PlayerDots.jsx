// Coloured dot + name for every player of a game.
export default function PlayerDots({ players, winner }) {
	return (
		<span className="players">
			{players.map((p) => (
				<span key={p.seat} className={`player-chip${winner && p.name === winner ? ' win' : ''}`}>
					<i style={{ background: p.color }} />
					{p.name}{p.is_ai ? ' (AI)' : ''}
				</span>
			))}
		</span>
	);
}
