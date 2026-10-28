import Popups from './components/Popups.jsx';
import Deed from './components/Deed.jsx';
import Board from './components/Board.jsx';
import MoneyBar from './components/MoneyBar.jsx';
import Setup from './components/Setup.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import TradePanel from './components/TradePanel.jsx';
import Dice3D from './components/Dice3D.jsx';
import useFitBoard from './hooks/useFitBoard.js';

// Order: overlays, deed, board, control panel, player list, setup screen, trade
// window. On wide screens the control panel and player list are positioned over
// / beside the board, so their place in the markup only matters on narrow
// screens, where they stack in this order (Roll Dice first, then the players).
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
			<ControlPanel />
			<MoneyBar />
			<Setup />
			<TradePanel />
			<Dice3D />
		</>
	);
}
