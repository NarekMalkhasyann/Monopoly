import { useEffect } from 'react';

// The board is a fixed-size table (about 885px wide). On narrower screens we
// shrink it with a CSS transform so the whole board stays visible, instead of
// forcing horizontal scrolling. Everything else (control panel, player list,
// pop-ups) is laid out with normal responsive CSS, see styles.css.
//
// The engine never reads the board's on-screen size, so scaling is safe.
// Pop-ups and the hover preview are positioned from mouse coordinates and live
// outside #stage, so they are not affected either.

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
			const scale = Math.min(1, stage.clientWidth / naturalW);

			inner.style.transform = scale < 1 ? `scale(${scale})` : '';
			// Centre a shrunken board; leave the full-size board where it always was.
			inner.style.marginLeft = scale < 1 ? `${(stage.clientWidth - naturalW * scale) / 2}px` : '';
			// A transform does not change layout size, so set the height ourselves.
			stage.style.height = `${Math.ceil(naturalH * scale)}px`;
		};

		const observer = new ResizeObserver(fit);
		observer.observe(board);
		observer.observe(stage);
		window.addEventListener('resize', fit);
		fit();

		return () => {
			observer.disconnect();
			window.removeEventListener('resize', fit);
		};
	}, []);
}
