// Board animations (the drawing is in board.css, classes fx-breathe / fx-wave).
//   * a property is bought: its square "breathes" in the owner's colour;
//   * the buy completes a set: the squares of the set pop one after another, in board order, in the owner's colour
//     (the order follows the squares, so a set that turns a corner of the board works too).
// Nothing plays while old moves are replayed (rejoining a game) or while the tab is hidden.
import { isReplaying } from './sound.js';

const DURATION = 1500; // ms, longer than the CSS animations

function run(index, cls, color, delay = 0) {
	const cell = document.getElementById(`cell${index}`);
	if (!cell) return;
	cell.classList.remove('fx-breathe', 'fx-wave');
	void cell.offsetWidth; // lets the animation start again if it is already running
	cell.style.setProperty('--fx', color);
	cell.style.setProperty('--fx-delay', `${delay}ms`);
	cell.classList.add(cls);
	setTimeout(() => { cell.classList.remove(cls); cell.style.removeProperty('--fx'); cell.style.removeProperty('--fx-delay'); }, DURATION + delay);
}

window.fxBought = (index, color, set) => {
	if (isReplaying() || document.hidden) return;
	try {
		if (set && set.length >= 2) set.forEach((sq, k) => run(sq, 'fx-wave', color, k * 180));
		else run(index, 'fx-breathe', color);
	} catch { /* animation must never break the game */ }
};
