import { useEffect } from 'react';

// 3D dice animation.
//
// The engine still decides the numbers (game.rollDice() in public/engine/monopoly.js).
// Here we only *show* that roll: two 3D dice are thrown over the board and land
// on exactly those numbers ("2dpips@3,5" is the library's way of fixing the result; "dpips" is a d6 with round pips).
// When they have settled, the engine carries on and moves the player.
//
// The engine calls window.animateDice(die1, die2), which returns a promise. If
// the 3D part is not available (still loading, no WebGL, an error), that function
// does not exist and the engine rolls instantly, exactly like before.
//
// Library: src/vendor/dice-box-threejs (MIT). It is loaded lazily so the page
// itself does not wait for Three.js.

const HOLD_MS = 800; // how long the landed dice stay on screen
const TIMEOUT_MS = 6000; // never keep the game waiting longer than this

export default function Dice3D() {
	useEffect(() => {
		const scene = document.getElementById('dice-scene');
		let box = null;
		let busy = false;
		let cancelled = false;

		// Put the dice area over the middle of the board (clamped to the screen),
		// so the dice land on the board whatever the screen size or scroll position.
		const placeOverBoard = () => {
			const board = document.getElementById('board');
			const r = scene.getBoundingClientRect();
			const b = board.getBoundingClientRect();
			let cx = b.left + b.width / 2;
			let cy = b.top + b.height / 2;
			cx = Math.min(Math.max(cx, r.width / 2), window.innerWidth - r.width / 2);
			cy = Math.min(Math.max(cy, r.height / 2), window.innerHeight - r.height / 2);
			scene.style.left = `${cx}px`;
			scene.style.top = `${cy}px`;
		};

		const animateDice = (die1, die2) => {
			if (busy) return Promise.resolve();
			busy = true;
			placeOverBoard();
			box.clearDice();
			scene.classList.add('visible');

			const landed = box.roll(`2dpips@${die1},${die2}`);
			const tooLong = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));

			return Promise.race([landed, tooLong])
				.then(() => new Promise((resolve) => setTimeout(resolve, HOLD_MS)))
				.catch(() => {})
				.then(() => {
					scene.classList.remove('visible');
					busy = false;
				});
		};

		(async () => {
			try {
				const { default: DiceBox } = await import('../vendor/dice-box-threejs/index.js');
				if (cancelled) return;
				box = new DiceBox('#dice-scene', {
					sounds: false,
					shadows: true,
					theme_colorset: 'white', // white dice, black numbers
					theme_material: 'plastic',
					light_intensity: 0.9,
					gravity_multiplier: 400,
					strength: 1,
				});
				await box.initialize();
				if (cancelled) return;
				window.animateDice = animateDice;
			} catch (err) {
				// Most likely WebGL is not available. The game works without the animation.
				console.warn('3D dice are not available, rolling without animation.', err);
			}
		})();

		return () => {
			cancelled = true;
			delete window.animateDice;
		};
	}, []);

	return <div id="dice-scene" aria-hidden="true" />;
}
