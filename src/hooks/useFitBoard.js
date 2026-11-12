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
const SIDEBAR_MIN = 340; // narrowest the player list may get
const GAP = 28; // grid gap between board and list
const BOARD_MARGIN = 15; // #board has margin: 15px in styles.css

export default function useFitBoard() {
	useEffect(() => {
		const stage = document.getElementById('stage');
		const inner = document.getElementById('stage-inner');
		const board = document.getElementById('board');
		const layout = document.getElementById('game-layout');
		if (!stage || !inner || !board || !layout) return undefined;

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
			const wide = window.innerWidth >= WIDE;
			let scale;
			if (wide) {
				// Board and player list sit side by side (CSS grid): the board takes what is left after
				// the list's minimum width, and is also shrunk until its whole height is on screen.
				const room = layout.clientWidth - SIDEBAR_MIN - GAP;
				const top = stage.getBoundingClientRect().top + window.scrollY;
				scale = Math.min(1, room / naturalW, (window.innerHeight - top - 12) / naturalH);
				scale = Math.max(0.55, scale);
				stage.style.width = `${Math.ceil(naturalW * scale)}px`;
			} else {
				stage.style.width = '';
				scale = Math.min(1, stage.clientWidth / naturalW);
			}
			// The centre panel is laid over the board by the grid; it shrinks with it.
			layout.style.setProperty('--fit', wide ? String(scale) : '1');

			inner.style.transform = scale < 1 ? `scale(${scale})` : '';
			// Centre a shrunken board; leave the full-size board where it always was.
			inner.style.marginLeft = scale < 1 && !wide ? `${(stage.clientWidth - naturalW * scale) / 2}px` : '';
			// A transform does not change layout size, so set the height ourselves.
			stage.style.height = `${Math.ceil(naturalH * scale)}px`;
		};

		const observer = new ResizeObserver(fit);
		observer.observe(board);
		observer.observe(stage);
		observer.observe(layout);
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
