import { useEffect } from 'react';

// The board is a fixed-size table (about 885px wide). On narrower screens we
// shrink it with a CSS transform so the whole board stays visible, instead of
// forcing horizontal scrolling. Everything else (control panel, player list,
// pop-ups) is laid out with normal responsive CSS, see styles.css.
//
// The engine never reads the board's on-screen size, so scaling is safe.
// Pop-ups and the hover preview are positioned from mouse coordinates and live
// outside #stage, so they are not affected either.

const WIDE = 1130; // same breakpoint as the desktop layout in styles.css
const BOARD_MARGIN = 15; // #board has margin: 15px in styles.css

export default function useFitBoard() {
	useEffect(() => {
		const stage = document.getElementById('stage');
		const inner = document.getElementById('stage-inner');
		const board = document.getElementById('board');
		if (!stage || !inner || !board) return undefined;

		const fit = () => {
			// offsetWidth / offsetHeight ignore transforms, so this is the natural size.
			const w = board.offsetWidth;
			const h = board.offsetHeight;
			if (!w) {
				// Board is hidden (setup screen, trade window): take no space.
				stage.style.height = '0px';
				return;
			}
			const naturalW = w + BOARD_MARGIN * 2;
			const naturalH = h + BOARD_MARGIN * 2;
			let scale = Math.min(1, stage.clientWidth / naturalW);
			// Wide screens: also fit the height, so the whole board is on screen without scrolling.
			const wide = window.innerWidth >= WIDE;
			const ctrl = document.getElementById('control');
			if (ctrl) { ctrl.style.transform = ''; ctrl.style.transformOrigin = ''; }
			if (wide) {
				const top = stage.getBoundingClientRect().top + window.scrollY;
				scale = Math.min(scale, Math.max(0.6, (window.innerHeight - top - 12) / naturalH));
				if (ctrl && scale < 1) {
					// Shrink the centre panel with the board, around the board's top-left corner.
					const r = ctrl.getBoundingClientRect();
					const sr = stage.getBoundingClientRect();
					ctrl.style.transformOrigin = `${sr.left - r.left}px ${sr.top - r.top}px`;
					ctrl.style.transform = `scale(${scale})`;
				}
			}

			inner.style.transform = scale < 1 ? `scale(${scale})` : '';
			// Centre a shrunken board; leave the full-size board where it always was.
			inner.style.marginLeft = scale < 1 && !wide ? `${(stage.clientWidth - naturalW * scale) / 2}px` : '';
			// A transform does not change layout size, so set the height ourselves.
			stage.style.height = `${Math.ceil(naturalH * scale)}px`;
			// Where the player list starts on wide screens: just right of the (possibly shrunken) board.
			document.documentElement.style.setProperty('--board-right', `${Math.round(stage.getBoundingClientRect().left + window.scrollX + naturalW * scale)}px`);
		};

		const observer = new ResizeObserver(fit);
		observer.observe(board);
		observer.observe(stage);
		const ctrlEl = document.getElementById('control');
		if (ctrlEl) observer.observe(ctrlEl); // it appears when the game starts
		const classWatch = new MutationObserver(fit);
		classWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		window.addEventListener('resize', fit);
		fit();

		return () => {
			observer.disconnect();
			classWatch.disconnect();
			window.removeEventListener('resize', fit);
		};
	}, []);
}
