// Padlock: open (green) = anyone can join, closed (orange) = private room.
export default function Lock({ open }) {
	return (
		<svg className={`lock ${open ? 'lock-open' : 'lock-shut'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={open ? 'Open room' : 'Private room'}>
			<rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fillOpacity=".15" />
			<path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
		</svg>
	);
}
