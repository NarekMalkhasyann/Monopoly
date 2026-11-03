import { useEffect, useState } from 'react';
import { useOnline } from '../online.js';

// The circle in front of the name in the "whose turn" box (next to the dice), online games only:
// glowing green = this player is connected, grey ring = away. While this browser is reconnecting the circle is grey too,
// because what it knows about the others is out of date.
// It also copies the player's colour (the engine paints it as the border of #quickstats) into --pc for the soft glow.
export default function TurnPresence() {
	const { room, conn } = useOnline();
	const [name, setName] = useState('');

	useEffect(() => {
		const box = document.getElementById('quickstats');
		const label = document.getElementById('pname');
		if (!box || !label) return undefined;
		const read = () => {
			setName(label.textContent.trim());
			const color = box.style.borderColor;
			if (color && box.style.getPropertyValue('--pc') !== color) box.style.setProperty('--pc', color);
		};
		read();
		const watch = new MutationObserver(read);
		watch.observe(box, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] });
		return () => watch.disconnect();
	}, []);

	if (!room || room.status !== 'active') return null;
	const p = room.players.find((x) => x.name === name);
	if (!p) return null;
	const up = conn === 'open' && p.online;
	const away = !up && p.awayMs > 0 ? ` (away ${Math.max(1, Math.round(p.awayMs / 60000))} min)` : '';
	return (
		<>
			<i className={`presence-dot ${up ? 'on' : 'off'}`} role="img" aria-label={up ? 'online' : 'offline'} title={`${p.name} is ${up ? 'online' : `offline${away}`}`} />
		</>
	);
}
