import Popups from './components/Popups.jsx';
import Deed from './components/Deed.jsx';
import Board from './components/Board.jsx';
import MoneyBar from './components/MoneyBar.jsx';
import Setup from './components/Setup.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import TradePanel from './components/TradePanel.jsx';

// The order matches the original page: overlays, deed, board, side panel,
// setup screen, control panel, trade window.
export default function App() {
	return (
		<>
			<Popups />
			<Deed />
			<Board />
			<MoneyBar />
			<Setup />
			<ControlPanel />
			<TradePanel />
		</>
	);
}
