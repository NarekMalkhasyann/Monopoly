import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './board.css';
import './sound.js';
import './fx.js'; // board animations when a property is bought (sets window.fxBought)

// The game engine (public/engine/*.js) looks up its elements by id when the
// page finishes loading (window.onload), so the markup must already be in the
// DOM by then. flushSync makes React render synchronously instead of on the
// next tick.
//
// StrictMode is deliberately not used: the engine edits these elements
// directly, and React must not re-render over those edits.
flushSync(() => {
	createRoot(document.getElementById('root')).render(<App />);
});
