# Monopoly Web Game

An interactive, browser-based implementation of the classic **Monopoly** board game written in HTML, CSS, JavaScript, and jQuery. Play against other human players on one device or challenge AI opponents with full trading, mortgaging, and auction capabilities. Players sign in, and every game is saved to a history they can resume from. Friends can also play together online, each on their own device.

(original project cloned from https://github.com/intrepidcoder/monopoly.git )

---

## 🎮 Features

- **Classic Monopoly Rules**:
  - Full 40-tile board (Properties, Railroads, Utilities, Chance, Community Chest, Tax, Jail, and Go).
  - Accurate rent calculations including color set monopoly bonuses, houses, and hotel upgrades.
  - Property mortgaging and unmortgaging mechanism.
  - Property auctioning when a player chooses not to buy an unowned square.
  - Trading system allowing players to exchange properties, cash, and "Get Out of Jail Free" cards.
  - Bankruptcy processing and asset liquidation/transfer.
- **AI Opponents**:
  - Built-in AI test logic (`ai.js`) that automates purchasing decisions, trade evaluation, mortgage management, and debt handling.
- **Multiple Board Editions**:
  - **Classic Edition** (`classicedition.js`): The traditional Atlantic City property set.
  - **New York City Edition** (`newyorkcityedition.js`): Alternate board theme featuring iconic NYC landmarks and locations.
- **Accounts & History**:
  - Register / sign in, play on this device, resume unfinished games, browse past games with ranking and game log.
- **Interactive UI**:
  - Interactive board deeds popup with detailed rent tiers and mortgage values.
  - Player statistics, live bank balance, log view, and draggable modal dialogues.
  - Responsive layout for phones and tablets, animated 3D dice, styled control panels.

---

## 📂 Project Structure

```text
├── index.html              # Vite entry: loads jQuery, the engine scripts and src/main.jsx
├── package.json            # React 19 + Vite; scripts for the API and tests
├── vite.config.js          # Proxies /api to the API server in development
├── server/                 # Backend (plain Node, no extra packages)
│   ├── index.js            # Starts the API (port 3001)
│   ├── app.js              # REST routes, static files, WebSocket upgrade
│   ├── ws.js               # WebSocket protocol (RFC 6455) on node:http
│   ├── rooms.js            # Online rooms: lobby, seats, ordered action relay
│   ├── auth.js             # scrypt password hashing, JWT
│   ├── db.js               # SQLite schema
│   ├── test.js             # REST tests
│   └── test-ws.js          # WebSocket / room tests
├── scripts/dev.mjs         # Runs API + Vite together (npm run dev:all)
├── src/
│   ├── main.jsx            # Mounts <App /> (synchronously, so the engine finds its elements)
│   ├── App.jsx             # Pages by URL: sign in, Play, History, game, lobby
│   ├── router.jsx          # Tiny History-API router
│   ├── online.js           # WebSocket connection + room state (useOnline)
│   ├── onlineGame.js       # Runs an online game on the engine: seeded start, shared clicks, replay
│   ├── api.js              # fetch wrapper with the login token
│   ├── session.js          # Saves checkpoints and log lines, resumes a game
│   ├── portal/             # Sign in, Home, Lobby, History, sidebar shell (+ portal.css)
│   ├── hooks/useFitBoard.js # Shrinks the board to fit narrow screens
│   ├── vendor/dice-box-threejs/ # 3D dice library (MIT), copied as is
│   ├── styles.css          # Design system (lime on charcoal, Montserrat)
│   └── components/         # Board, ControlPanel, MoneyBar, Setup, TradePanel, Deed, Popups, Dice3D (.jsx)
└── public/
    ├── engine/             # Game engine (plain JS): monopoly.js, ai.js,
    │                       #   classicedition.js, newyorkcityedition.js
    └── images/             # Board icons, cards, and UI graphics
```

The page markup is React (JSX). The game rules and state still live in
`public/engine/*.js`, which reads and updates the elements by their `id`s, so
those ids must not be renamed. Beyond the original code, the engine has a few
small additions: the 3D dice hook in `roll()`, the save hooks (`onTurnStart`,
`onGameEvent`, `onPlayerEliminated`, `onGameEnd`) used by `src/session.js`,
`gameRandom()` (seedable randomness for online games), ids on the Buy / jail buttons so
they can be shared, and Trade shown as a pop-up instead of replacing the board.

---

## 📱 Responsive Design

| Screen width | Layout |
| :--- | :--- |
| 1130px and wider | Full-size board, control panel over the board centre, player list on the right |
| Below 1130px (tablet, phone) | The board shrinks to fit the width; the control panel (Roll Dice, tabs) and the player list stack below it at normal size; the player list becomes a horizontal strip with an arrow over the current player |
| Below 560px (phone) | Setup form fields wrap; pop-ups, stats and trade window fit the screen |

Touch screens get larger buttons and form fields. The shrinking is done by
`src/hooks/useFitBoard.js`; the rest is CSS media queries at the end of
`src/styles.css`. On a phone the board labels are small, so pinch to zoom in.

---

## 🎲 3D Dice

When a player rolls, two 3D dice tumble over the board and land on the numbers
the game has already drawn; the token moves once they have settled.

- `public/engine/monopoly.js` still picks the numbers (`game.rollDice()`). `roll()` then
  calls `window.animateDice(die1, die2)` if it exists and applies the roll when the
  returned promise resolves (`applyRoll()`). Without the hook the roll is instant, as in
  the original game.
- `src/components/Dice3D.jsx` creates that hook with
  [dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) (MIT, in
  `src/vendor/dice-box-threejs/`). The library is loaded lazily and the dice are thrown
  with its fixed-result notation (`2dpips@3,5`: two dice drawn with pips). If WebGL is not available, the game simply
  rolls without animation.
- Dependencies: `three` (pinned to 0.143.0, the version the library was written for) and
  `cannon-es`. Run `npm install` after pulling.
- To turn the animation off, remove `<Dice3D />` from `src/App.jsx`.

The dice library has not been updated since 2022, so it is copied into the project
instead of being installed from npm. One small addition was made to it: dice faces with
round pips (see `src/vendor/dice-box-threejs/README.md`).

---

## 👤 Accounts & Game History (Milestone 1)

Players sign in (register / login), and every local game is saved to their account.

- **Sign in / Create account** – email + password. Passwords are hashed with scrypt, the session is a signed JWT kept in `localStorage`.
- **Play** – start a new game on this device (2–8 players, humans and AI) or resume an unfinished one.
- **History** – every game with its mode, players, winner, turns and date; filter by mode and status; open *Details* for the final ranking and the full game log; delete a game.
- **Saving** – the engine calls small hooks (`onTurnStart`, `onGameEvent`, `onPlayerEliminated`, `onGameEnd`). At the start of every turn the browser uploads a checkpoint (players, properties, card decks) plus the new log lines (`src/session.js`). Resume copies the checkpoint back into the engine and continues.
- **Backend** – `server/` is plain Node (`node:http`, `node:sqlite`, `node:crypto`), so there is nothing extra to install. SQLite for now; the tables (`users`, `games`, `game_players`, `game_actions`) map directly to PostgreSQL for deployment.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | create account / sign in, returns a token |
| GET | `/api/me` | current user |
| POST | `/api/games` | create a game record |
| GET | `/api/games?status=&mode=&limit=&offset=` | history (paged, filtered) |
| GET / DELETE | `/api/games/:id` | game with checkpoint and log / delete |
| PUT | `/api/games/:id/checkpoint` | save checkpoint + log lines |
| POST | `/api/games/:id/finish` | save result and final ranking |

## 🌐 Online Play (Milestones 2 and 3)

Each player opens the game on their own device. **Home → Create room** gives a 5-letter code (and a link `/join/CODE`); friends enter it under **Join**. In the lobby everyone picks a colour, and the host presses **Start game**.

**How it stays in sync ("relay" model).** The game engine runs unchanged in every browser. Only the buttons that change the game are shared: *Roll / End turn, Buy, Pay $50, Use card, pop-up OK / Yes / No, Resign, auction Bid / Pass / Exit, Buy / Sell house, Mortgage, trade Propose / Accept / Reject / Cancel*. The player whose turn it is clicks one, the click goes to the server over a WebSocket, the server numbers it and sends it to everybody, and every browser presses the same button in that order. All randomness (dice, card decks, turn order) comes from one seed that the server hands out when the game starts (`window.seededRandom`), so everyone sees the same dice. The ordered click list is stored in `game_actions`: refreshing or rejoining replays the game from the start.

| Message (JSON over `/ws?token=JWT`) | Direction | Purpose |
|---|---|---|
| `create`, `join {code \| gameId, after}`, `leave` | client → server | open / enter / leave a room |
| `color`, `start` | client → server | lobby: pick colour; host starts (2–8 players) |
| `act {a:{id, turn, v?, check?}}` | client → server | a shared button click (members only); `v` = bid amount or trade offer, `check` = selected property |
| `forfeit {seat}` | client → server | remove a player who has been away for `forfeitAfterMs` (default 60 s) |
| `abandon` | host → server | end a running game without a winner |
| `log`, `end` | host → server | readable game log for History; final result |
| `joined`, `room`, `started`, `act {seq}`, `ended`, `left`, `error` | server → client | state and the numbered action stream |

**Who may press what.** The browsers apply the same rule: the player whose turn it is acts, except in an auction (the current bidder) and in a trade (the player named on the left of the trade window, so the other side can accept, reject or counter-offer). Everything is checked before a click is sent (bid too low, not enough money, nothing selected), so mistakes stay on your own screen. Drawing up a trade is private; the offer appears for everybody when it is proposed.

**Reconnect and rejoin.** A lost connection reconnects by itself and asks for the clicks it missed. Refreshing the page, or opening the game from History, replays the stored clicks, including auctions, trades and building, and ends in exactly the same position.

**Away and abandoned games.** If the player whose turn it is leaves, the others see a countdown and then a *Remove* button: the player is declared bankrupt to the bank (their properties are auctioned) and the game goes on, or ends if one player is left. The host can also *Abandon game* for everybody. A running game that nobody has opened for 30 minutes is marked *abandoned* by the server (`ABANDON_AFTER_MS`; `FORFEIT_AFTER_MS` and `SWEEP_EVERY_MS` can be set too). Abandoned games stay in History with their own badge.

**Limits.** The server checks membership but cannot check the rules (the engine lives in the browsers), so online games are meant for friends. A player who goes away in the middle of an auction or trade (and whose turn it is not) can only be removed on their own turn, or the host can abandon the game.

---

## 🧭 Pages (URLs)

| Path | Page |
|---|---|
| `/login`, `/register` | Sign in / create account (signed-out visitors are redirected here) |
| `/play` | Home: new local game, create / join an online room, continue playing |
| `/play/local` | A new game on this device (it gets its own address after the first turn) |
| `/play/:id` | A saved game: resumes a local game, or opens the online lobby / game |
| `/join/:code` | Join an online room by its code, then continues at `/play/:id` |
| `/history`, `/history/:id` | All games; details of one game |
| anything else | Page not found |

The router is a small module (`src/router.jsx`, History API, no library). After `npm run build`, `npm start` serves the site from `dist/` and answers every non-API path with `index.html`, so these addresses also work when typed in or reloaded.

---

---

## 🚀 Getting Started

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev:all  # API + WebSocket on :3001, site on http://localhost:5173
npm run build    # production build in dist/
npm run test:server   # REST + WebSocket tests
npm run build && npm start   # production: one server for site, API and WebSocket (http://localhost:3001)
```

`JWT_SECRET` (environment variable) should be set to a long random string outside development. The database file is `server/data/monopoly.db` (override with `DB_FILE`).

---

## ⚙️ Customization & Editions

To switch between the **Classic Edition** and the **New York City Edition**, edit the engine `<script>` tags in `index.html`:

```html
<!-- For Classic Edition: -->
<script src="/engine/classicedition.js"></script>
<!-- <script src="/engine/newyorkcityedition.js"></script> -->

<!-- For New York City Edition: -->
<!-- <script src="/engine/classicedition.js"></script> -->
<script src="/engine/newyorkcityedition.js"></script>
```

---

## 🛠️ Built With

- **React 19 + Vite** – Page markup and dev/build tooling.
- **Node.js 22 (`node:http`, `node:sqlite`, `node:crypto`)** – API, SQLite storage, password hashing and JWT.
- **three.js + cannon-es** – 3D dice.
- **HTML5 & CSS3** – Board layout, styling, and typography.
- **JavaScript (ES5/Vanilla)** – Game state management and business logic.
- **jQuery (1.11.1)** – DOM interactions, drag-and-drop modals, and event handling.
