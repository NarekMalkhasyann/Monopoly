// Sound effects, made with the browser's Web Audio: every sound is calculated from simple tones and noise when it is
// played. There are no audio files, so there is nothing to download and no licence to worry about.
//
// How the game uses it:
//   * the engine (public/engine/monopoly.js) calls window.onGameSound(kind, text) for every log line and
//     window.sfx(name) for a few moments (dice, cards, winner); both are set up at the bottom of this file;
//   * src/liveAuction.js plays the auction sounds;
//   * src/onlineGame.js calls setReplaying(true) while old moves are replayed (rejoining a game), which keeps it silent;
//   * the speaker button in the game bar (src/portal/GameBar.jsx) turns everything on and off.

const KEY = 'yerevanpoly.sound';
const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };

let enabled = read();
let replaying = false;
let ctx = null;
let out = null;
const listeners = new Set();
const lastPlayed = {};

export const soundOn = () => enabled;
export const subscribeSound = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setSoundOn(on) {
	enabled = !!on;
	try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* private mode */ }
	if (enabled) { unlock(); play('on'); }
	listeners.forEach((fn) => fn());
}
// true while moves of the past are replayed (rejoining a game): they must stay silent
export const setReplaying = (v) => { replaying = !!v; };

// Browsers keep sound off until the person has clicked or pressed a key on the page.
function unlock() {
	if (!ctx) {
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) return;
		try {
			ctx = new AC();
			const comp = ctx.createDynamicsCompressor(); // keeps loud overlaps from clipping
			out = ctx.createGain();
			out.gain.value = 0.55;
			out.connect(comp);
			comp.connect(ctx.destination);
		} catch { ctx = null; return; }
	}
	if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}
if (typeof document !== 'undefined') {
	for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, unlock, { capture: true });
}

// ---- building blocks -------------------------------------------------------------------------------------------

// one note: frequency (Hz), optionally gliding to `to`; t = start delay in seconds
function tone(freq, { t = 0, dur = 0.2, type = 'sine', vol = 0.3, to = null, attack = 0.004 } = {}) {
	const t0 = ctx.currentTime + t;
	const o = ctx.createOscillator();
	const g = ctx.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, t0);
	if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
	g.gain.setValueAtTime(0.0001, t0);
	g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	o.connect(g); g.connect(out);
	o.start(t0); o.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noiseBuffer() {
	if (!noiseBuf) {
		noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const d = noiseBuf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
	}
	return noiseBuf;
}
// a burst of filtered noise: clicks, rattles, paper, swishes
function noise({ t = 0, dur = 0.05, vol = 0.3, freq = 2000, q = 1, kind = 'bandpass', to = null } = {}) {
	const t0 = ctx.currentTime + t;
	const s = ctx.createBufferSource();
	s.buffer = noiseBuffer();
	const f = ctx.createBiquadFilter();
	f.type = kind;
	f.frequency.setValueAtTime(freq, t0);
	if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
	f.Q.value = q;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t0);
	g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
	s.connect(f); f.connect(g); g.connect(out);
	s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
}

const knock = (t = 0, vol = 0.4) => { tone(190, { t, dur: 0.09, type: 'sine', vol, to: 80 }); noise({ t, dur: 0.04, vol: vol * 0.7, freq: 900, q: 0.8 }); };
const coin = (t = 0, f = 1568, vol = 0.22) => { tone(f, { t, dur: 0.32, type: 'triangle', vol }); tone(f * 2.01, { t, dur: 0.18, type: 'sine', vol: vol * 0.35 }); };

// ---- the sounds ------------------------------------------------------------------------------------------------

const SOUNDS = {
	on: () => { tone(660, { dur: 0.12, vol: 0.2 }); tone(880, { t: 0.09, dur: 0.16, vol: 0.2 }); },
	// two dice rattling on a table and settling
	dice: () => {
		for (let i = 0; i < 9; i++) noise({ t: i * 0.075 + Math.random() * 0.03, dur: 0.035, vol: 0.28 - i * 0.015, freq: 1500 + Math.random() * 2200, q: 2.5 });
		knock(0.72, 0.3);
		knock(0.82, 0.18);
	},
	card: () => noise({ dur: 0.28, vol: 0.22, kind: 'bandpass', freq: 400, to: 3500, q: 0.9 }),
	buy: () => { coin(0, 1318); coin(0.1, 1760); noise({ t: 0.2, dur: 0.1, vol: 0.06, freq: 6000, q: 1 }); },
	rent: () => { coin(0, 988, 0.18); coin(0.11, 784, 0.18); coin(0.22, 622, 0.18); },
	gain: () => { [523, 659, 784].forEach((f, i) => tone(f, { t: i * 0.07, dur: 0.22, type: 'triangle', vol: 0.2 })); },
	loss: () => { [392, 311, 262].forEach((f, i) => tone(f, { t: i * 0.09, dur: 0.26, type: 'triangle', vol: 0.2 })); },
	jail: () => { noise({ dur: 0.35, vol: 0.4, freq: 500, q: 0.6 }); tone(196, { dur: 0.7, type: 'square', vol: 0.12, to: 150 }); tone(293, { dur: 0.6, type: 'square', vol: 0.08 }); tone(60, { dur: 0.4, vol: 0.45 }); },
	unlock: () => { noise({ dur: 0.03, vol: 0.35, freq: 3500, q: 3 }); noise({ t: 0.08, dur: 0.03, vol: 0.3, freq: 2800, q: 3 }); tone(784, { t: 0.15, dur: 0.3, type: 'triangle', vol: 0.2 }); tone(1175, { t: 0.2, dur: 0.35, type: 'triangle', vol: 0.15 }); },
	build: () => { knock(0, 0.4); knock(0.13, 0.4); knock(0.26, 0.45); },
	unbuild: () => { knock(0, 0.28); tone(260, { t: 0.1, dur: 0.18, type: 'triangle', vol: 0.12, to: 130 }); },
	mortgage: () => { noise({ dur: 0.12, vol: 0.35, kind: 'lowpass', freq: 1400, q: 0.5 }); tone(110, { t: 0.02, dur: 0.15, vol: 0.4, to: 55 }); },
	offer: () => { tone(659, { dur: 0.16, type: 'triangle', vol: 0.22 }); tone(880, { t: 0.14, dur: 0.3, type: 'triangle', vol: 0.22 }); },
	dealt: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { t: i * 0.09, dur: 0.3, type: 'triangle', vol: 0.2 })); },
	declined: () => { tone(220, { dur: 0.22, type: 'sawtooth', vol: 0.12, to: 165 }); },
	bankrupt: () => { [233, 175, 147].forEach((f, i) => tone(f, { t: i * 0.28, dur: 0.55, type: 'sawtooth', vol: 0.13, to: f * 0.94 })); },
	turn: () => { tone(880, { dur: 0.6, vol: 0.2 }); tone(1760, { dur: 0.4, vol: 0.07 }); },
	aucopen: () => { knock(0, 0.45); },
	bid: () => { tone(1250, { dur: 0.07, type: 'triangle', vol: 0.22, to: 1500 }); },
	unsold: () => { tone(196, { dur: 0.3, type: 'triangle', vol: 0.18, to: 130 }); },
	win: () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, { t: i * 0.13, dur: i === 6 ? 0.9 : 0.25, type: 'triangle', vol: 0.22 })); tone(262, { t: 0.78, dur: 0.9, type: 'sine', vol: 0.18 }); },
	over: () => { [440, 330].forEach((f, i) => tone(f, { t: i * 0.2, dur: 0.5, type: 'triangle', vol: 0.18 })); },
};

// Plays a sound by name. Returns true when it was played.
export function play(name) {
	if (!enabled || replaying || !SOUNDS[name]) return false;
	if (typeof document !== 'undefined' && document.hidden) return false;
	if (!ctx || ctx.state !== 'running') return false; // the person has not clicked anywhere yet
	const now = performance.now();
	if (now - (lastPlayed[name] || 0) < 70) return false; // the same sound twice in a blink is one sound
	lastPlayed[name] = now;
	if (typeof window !== 'undefined' && window.__sfxLog) window.__sfxLog.push(name); // (used by the tests)
	try { SOUNDS[name](); } catch { /* sound must never break the game */ }
	return true;
}

// The engine writes a log line for nearly everything that happens (kind = buy, rent, money, jail, build...).
// Works out which sound the line deserves.
function soundForEvent(kind, text) {
	const t = String(text || '');
	switch (kind) {
		case 'buy': return 'buy';
		case 'rent': return 'rent';
		case 'money':
			if (/ to the bank for /.test(t) || /\b(received|collected)\b/.test(t)) return 'gain';
			return 'loss';
		case 'jail':
			if (/sent directly|three times/.test(t)) return 'jail';
			if (/paid the|used a|to get out/.test(t)) return 'unlock';
			return null;
		case 'build': return /\bsold\b/.test(t) ? 'unbuild' : 'build';
		case 'mortgage': return 'mortgage';
		case 'trade':
			if (/initiated a trade/.test(t)) return 'offer';
			if (/agreed on a trade/.test(t)) return 'dealt';
			return 'declined';
		case 'bankrupt': return / is bankrupt\./.test(t) ? 'bankrupt' : null;
		case 'info': return / was not sold\.$/.test(t) ? 'unsold' : null;
		default: return null;
	}
}

if (typeof window !== 'undefined') {
	window.sfx = (name, who) => {
		if (name === 'win') { play(window.sfxMine ? (window.sfxMine(who) ? 'win' : 'over') : 'win'); return; }
		play(name);
	};
	window.onGameSound = (kind, text) => {
		if (!kind) {
			// "It is <name>'s turn.": a bell for the person who has to play (online: only me; local: human players)
			const m = /^It is (.+)'s turn\.$/.exec(String(text));
			if (m) {
				const mine = window.sfxMine ? window.sfxMine(m[1]) : (window.player || []).some((p) => p && p.name === m[1] && p.human);
				if (mine) play('turn');
			}
			return;
		}
		const name = soundForEvent(kind, text);
		if (name) play(name);
	};
}
