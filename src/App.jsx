import Popups from './components/Popups.jsx';
import Deed from './components/Deed.jsx';
import Board from './components/Board.jsx';
import MoneyBar from './components/MoneyBar.jsx';
import Setup from './components/Setup.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import TradePanel from './components/TradePanel.jsx';
import useFitBoard from './hooks/useFitBoard.js';

// The order matches the original page: overlays, deed, board, side panel,
// setup screen, control panel, trade window.
//
// The board sits in #stage > #stage-inner so useFitBoard can shrink it on small
// screens. The control panel and money bar stay outside, at normal size: on
// wide screens they overlay / sit beside the board (see styles.css), on narrow
// screens they stack below it.
export default function App() {
	useFitBoard();

	return (
		<>
			<Popups />
			<Deed />
			<div id="stage">
				<div id="stage-inner">
					<Board />
				</div>
			</div>
			<MoneyBar />
			<Setup />
			<ControlPanel />
			<TradePanel />
		</>
	);
}
