<div align="center">

# 🎲 ACT Monopoly

**A multiplayer Monopoly for the browser: play on one device, against the computer, or online with friends.**
Live auctions, trading, spectating, full-screen replays, accounts and game history.

[**Play it online →**](https://actmonopoly.vercel.app/)

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-%E2%89%A5%2022.13-339933?logo=node.js&logoColor=white)
![Database](https://img.shields.io/badge/SQLite%20%7C%20PostgreSQL-003b57?logo=postgresql&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-RFC%206455-black)

</div>

> The rules engine started from [intrepidcoder/monopoly](https://github.com/intrepidcoder/monopoly). The accounts, server, online play, live auctions, spectating, replay and the whole interface were added on top of it as a university course project.

---

## Contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [How it works](#how-it-works)
4. [Online play](#online-play)
5. [Spectating and replays](#spectating-and-replays)
6. [Admin panel](#admin-panel)
7. [Pages (URLs)](#pages-urls)
8. [API reference](#api-reference)
9. [Configuration](#configuration)
10. [Deployment](#deployment)
11. [Project structure](#project-structure)
12. [Testing](#testing)
13. [Built with](#built-with)

---

## Features

| | |
| :--- | :--- |
| **Classic rules** | 40-square board, rent with colour sets, houses and hotels, mortgages, Chance and Community Chest, jail, taxes, bankruptcy. |
| **Three ways to play** | On one device (2–8 players), against computer opponents, or online, each player on their own device. |
| **Live auctions** | Online, anyone bids at any time. The highest bid that holds for 5 seconds wins. Two-player online games skip auctions (see [Rule sets](#rule-sets)). |
| **Trading** | Properties, cash and Get Out of Jail Free cards. Offers can be answered at any time while the game goes on, and expire after 60 s. |
| **Spectating** | A *Live games* page lists public games. Watch on the real game screen, read only. Private rooms are listed but cannot be watched. |
| **Replays** | A finished online game plays again on the real board, with play / pause, 1x / 2x / 4x, turn buttons and a slider. |
| **Accounts and history** | Sign in, resume unfinished games, browse past games with ranking and log, filter and search. |
| **Admin panel** | Approve accounts, manage users and games, see statistics, switch *Live games* on or off. |
| **Polish** | Animated 3D dice, sound effects, responsive layout for phones and tablets, "who is online" indicators, automatic reconnect. |

---

## Quick start

Requires **Node.js 22.13 or newer**.

```bash
npm install
npm run dev:all        # API + WebSocket on :3001, site on http://localhost:5173
```

```bash
npm run build && npm start   # production: one server for site, API and WebSocket on :3001
npm run test:server          # REST + WebSocket tests
npm run test:e2e             # real-browser tests (needs Playwright)
```

Without any setting the database is the SQLite file `server/data/monopoly.db`. Set `DATABASE_URL` to use PostgreSQL instead. Outside development, set `JWT_SECRET` to a long random string.

To get the **Admin** panel, set `ADMIN_EMAILS` (for example `ADMIN_EMAILS=me@example.am`), restart the server and sign in again with that account.

---

## How it works

The game rules and state live in a plain-JavaScript engine (`public/engine/`) that reads and updates the page by element `id`s, so those ids must not be renamed. React draws everything around it: sign-in, lobby, side panels, trade window, auction, history, admin.

**Relay model (online games).** The engine runs, unchanged, in every browser. Only the buttons that change the game are shared (*Roll, End turn, Buy, Pay $50, Use card, pop-up OK / Yes / No, Resign, Build / Sell, Mortgage, trade Propose / Accept / Reject / Cancel*, auction events). The player whose turn it is clicks one, the click goes to the server over a WebSocket, the server numbers it and sends it to everybody, and every browser presses the same button in the same order. All randomness (dice, card decks, turn order) comes from one seed handed out when the game starts, so everybody sees the same dice.

The ordered clicks are stored in `game_actions`. That one idea gives rejoin, reconnect, spectating and replay for free: all of them just play the stored clicks again.

```
 player's browser ──click──▶ server (numbers it, stores it) ──▶ every browser, incl. spectators
                                                                 └─ presses the same button
```

The server checks membership and turns but cannot check the rules (the engine lives in the browsers), so online games are meant for friends.

### Rule sets

A game keeps the rule set it started with (`games.rules`), so old games replay exactly as they were played.

| Version | Change |
| :---: | :--- |
| 2 | Cheaper houses, halved rents, $300 for passing GO |
| 3 | No auctions in online games that began with exactly 2 players (the property just stays with the bank) |

---

## Online play

**Home → Create room** gives a 5-letter code and a link `/join/CODE`. Friends enter it under *Join*. In the lobby everybody picks a colour and the host presses **Start game** (2–8 players).

- **Public and private rooms.** The *Rooms* list shows rooms waiting for players, live. A private room asks for a password (4–40 characters, stored as a scrypt hash; 5 wrong tries lock that account out of password rooms for 30 s). The host can switch a waiting room between public and private and can *Kick* a player.
- **One room per account.** The same account cannot be in two waiting rooms at once.
- **Live auction.** When a player ends the turn without buying, the property goes to auction. Bid with *+$2 / +$10 / +$100* (each button shows the new total). Every new bid restarts the 5 seconds; if nobody bids within 20 seconds the property stays with the bank. The server keeps the only clock and accepts a bid up to 0.3 s after the shown time, for slow connections.
- **Trading.** Drafting is private; the offer appears for everybody when proposed. The two players answer it whenever they like; everybody else keeps playing. When it is answered, the engine checks the offer again and cancels it if something offered changed hands, got buildings, or a player went bankrupt. One offer is open at a time, and an unanswered offer is withdrawn after 60 s.
- **Turn timer.** 30 s after *End turn* appears the turn ends by itself. Only the browser of the player concerned sends it, so it happens once for everybody.
- **Who is online.** A green dot shows a connected player. The server pings every connection every 7 s, so a dead connection (closed laptop, lost signal) turns grey after 7–14 s.
- **Away players.** If the player whose turn it is stays away for a minute, the others see a *Remove* button (host first). The player goes bankrupt to the bank and the game continues. The host can also *Abandon game*. A running game nobody opened for 30 minutes is marked *abandoned*.
- **Reconnect and rejoin.** A lost connection reconnects by itself and asks for the clicks it missed. Refreshing or opening the game from History replays the stored clicks and ends in exactly the same position.
- **Out of sync.** If browsers ever disagree, the bar shows a red *Out of sync – reload* button; reloading replays the game from the stored clicks.

---

## Spectating and replays

### Live games

The **Live games** page (sidebar) lists running online games with their players, turn count and how many people are watching. **Watch** opens the real game screen for a public game: the same board, tokens, cards and effects the players see, with all controls disabled. The players see an eye icon with the number of watchers. When a watched game ends, spectators get the same *Game over* recap as the players.

Private rooms are listed (marked *Private*) but cannot be watched; administrators can watch any game from **Admin → Live**. Administrators can switch the whole feature off for everybody with the *Live games* switch there.

### Replays

**History → Details → Replay** on a finished online game opens `/replay/:id`: the real board playing the stored game again.

- Play / pause, previous / next turn, speed 1x / 2x / 4x, and a slider over every move. The label shows the turn and the latest log line.
- Going forward runs the moves in between behind the loading screen. Going back loads the page again at that point (the engine only runs forward).
- At 4x the dice animation and sounds are skipped.

Local games and games without stored clicks still open the older step-by-step replay from the log (`/history/:id/replay`).

---

## Admin panel

Only administrators see **Admin** in the sidebar; the server checks the role on every request.

| Tab | What it does |
| :--- | :--- |
| **Overview** | Totals (users, games, in progress, finished, turns, open connections) and the last 14 days of games and sign-ups. |
| **New users req.** | Accounts waiting for approval. *Approve* makes the account a player, *Reject* deletes it. |
| **Users** | Search, role filter and sorting; a user page shows their games and lets you make them admin or player, or delete the account. |
| **Games** | Every game of every player, same filters as History plus creator search. Open any game, end a running online one, or delete a finished one. |
| **Live** | All running online games, watchable even if private, and the *Live games* switch. |

A new account has the role `not-approved` until an administrator approves it. It can open *Play* and *History* but cannot start a game or join a room (the server answers `403`). Accounts made from `ADMIN_EMAILS` are administrators immediately. You cannot change or delete your own account in the panel.

---

## Pages (URLs)

| Path | Page |
| :--- | :--- |
| `/login`, `/register` | Sign in / create account (signed-out visitors are redirected here) |
| `/play` | Home: new local game, create / join a room, continue playing |
| `/play/local` | A new game on this device |
| `/play/:id` | A saved game: resumes a local game, or opens the online lobby / game |
| `/join/:code` | Join an online room by its code |
| `/live`, `/live/:id` | Running games; watch one |
| `/history`, `/history/:id` | All games; details of one game |
| `/replay/:id` | A finished online game on the real board |
| `/history/:id/replay` | Step-by-step replay from the log |
| `/admin`, `/admin/requests`, `/admin/users`, `/admin/users/:id`, `/admin/games`, `/admin/live` | Admin panel |

The router is a small History-API module (`src/router.jsx`). After `npm run build`, `npm start` answers every non-API path with `index.html`, so these addresses also work when typed in or reloaded.

---

## API reference

All paths are under `/api` and need `Authorization: Bearer <token>` except register, login and health.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| POST | `/auth/register`, `/auth/login` | Create account / sign in, returns a token |
| GET | `/me` | Current user |
| GET | `/features` | Feature switches (for example whether Live games is on) |
| POST | `/games` | Create a game record |
| GET | `/games?status=&mode=&q=&from=&to=&sort=&dir=&limit=&offset=` | History, paged (`status`: active / finished / abandoned; `q` searches players, winner and room code) |
| GET / DELETE | `/games/:id` | Game with checkpoint and log / delete. A public running online game is also readable by spectators (`you: null`) |
| GET | `/games/:id/replay` | Settings, every stored click and the log of a finished online game (its players and admins) |
| PUT | `/games/:id/checkpoint` | Save checkpoint and log lines |
| POST | `/games/:id/finish` | Save result and final ranking |
| POST | `/games/:id/resume` | Bring an abandoned online game back to *active* |
| GET | `/rooms` | Online rooms waiting for players |
| GET | `/live` | Running public and private games (private ones without code) |
| GET / PATCH | `/admin/settings` | Admin: read / change feature switches |
| GET | `/health` | `{ ok, db }` |

Admin routes (`/admin/users`, `/admin/games`, `/admin/stats` and so on) are listed in `server/app.js`.

### WebSocket (`/ws?token=JWT`)

| Message | Direction | Purpose |
| :--- | :--- | :--- |
| `create`, `join {code \| gameId, after, password?}`, `leave` | client → server | Open / enter / leave a room |
| `watch {gameId, after}` | client → server | Spectate a running game (read only) |
| `visibility {private, password}`, `kick {userId}`, `color`, `start` | client → server | Lobby controls (host) |
| `act {a:{id, turn, v?, check?}}` | client → server | A shared button click (members only) |
| `auction-open`, `auction-bid` | client → server | Live auction input |
| `forfeit {seat}`, `abandon`, `log`, `end` | client → server | Remove an away player / end without winner / log lines / result |
| `joined`, `room`, `started`, `act {seq}`, `ended`, `left`, `kicked`, `rooms-changed`, `error` | server → client | State and the numbered action stream |

The numbered stream also carries the server's auction events `aucopen`, `aucbid`, `aucend`.

---

## Configuration

Environment variables of the server:

| Variable | Default | Meaning |
| :--- | :--- | :--- |
| `PORT` | `3001` | HTTP / WebSocket port |
| `DATABASE_URL` | – | PostgreSQL connection string; without it SQLite is used |
| `DB_FILE` | `server/data/monopoly.db` | SQLite file |
| `JWT_SECRET` | dev value | Secret for sign-in tokens, **set it in production** |
| `ALLOWED_ORIGIN` | – | Website address(es) allowed by CORS, comma separated |
| `ADMIN_EMAILS` | – | Accounts that become administrators, comma separated |
| `AUCTION_FIRST_MS` / `AUCTION_BID_MS` / `AUCTION_GRACE_MS` | 20000 / 5000 / 300 | Live auction clock |
| `TRADE_EXPIRE_MS` | 60000 | Unanswered trade offers are withdrawn after this |
| `HEARTBEAT_MS` | 7000 | How often connections are checked |
| `FORFEIT_AFTER_MS` | 60000 | How long a player is away before the *Remove* button appears |
| `ABANDON_AFTER_MS`, `SWEEP_EVERY_MS` | 30 min, – | When idle running games are marked abandoned, and how often the server looks |

Build time (Vercel): `VITE_API_URL` is the backend address (no trailing slash; WebSockets use the same host).

### Board editions

Switch between the **Classic** and **New York City** boards by editing the engine `<script>` tags in `index.html`:

```html
<script src="/engine/classicedition.js"></script>
<!-- <script src="/engine/newyorkcityedition.js"></script> -->
```

---

## Deployment

Vercel runs the **website** only. The game server needs a long-lived process (WebSocket rooms), so it runs on a small Node host and the site talks to it.

| Part | Where | Notes |
| :--- | :--- | :--- |
| Website (`dist/`) | Vercel | `vercel.json`: Vite build, every path falls back to `index.html` |
| API + WebSocket | Render / Railway / Fly (Node ≥ 22.13) | `render.yaml` is a ready blueprint; start command `node server/index.js`; use a plan that does not sleep, or running games are interrupted |
| Database | Neon (PostgreSQL, free plan) | The tables are created on first start; the host needs no disk |

1. **Database.** Create a project at neon.tech and copy its connection string.
2. **Backend.** Deploy the repo to the Node host with `DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGIN` (your Vercel address) and optionally `ADMIN_EMAILS`. Check `https://<backend>/api/health`: it should answer `{"ok":true,"db":"pg"}`.
3. **Vercel.** Set `VITE_API_URL` to the backend address and redeploy (Vite bakes it in at build time).
4. **Domain.** Add your domain to the Vercel project; give the backend its own sub-domain if you like and use it in `VITE_API_URL`.

Accounts and history live in PostgreSQL, so restarting the backend loses nothing. (Without `DATABASE_URL` the backend uses a SQLite file, which a host without a persistent disk resets on every deploy.)

---

## Project structure

```text
├── index.html               # Vite entry: jQuery, the engine scripts, src/main.jsx
├── server/                  # Backend (plain Node, no framework)
│   ├── index.js             # Starts the API
│   ├── app.js               # REST routes, static files, WebSocket upgrade
│   ├── ws.js                # WebSocket protocol (RFC 6455) on node:http, heartbeat
│   ├── rooms.js             # Rooms: lobby, seats, ordered action relay, auctions, watchers, replay data
│   ├── auth.js              # scrypt password hashing, JWT
│   ├── db.js                # SQLite (local) or PostgreSQL (DATABASE_URL), same SQL
│   └── test.js, test-ws.js  # REST and WebSocket tests
├── src/
│   ├── App.jsx, router.jsx  # Pages by URL, tiny History-API router
│   ├── online.js            # WebSocket connection and room state
│   ├── onlineGame.js        # Runs an online game on the engine: seeded start, shared clicks, spectating, replay
│   ├── liveAuction.js       # Live auction state
│   ├── session.js           # Checkpoints, log lines, resume
│   ├── portal/              # Sign-in, Home, Lobby, Live games, History, Replay, Admin, shell
│   ├── components/          # Board, ControlPanel, TradePanel, LiveAuction, Dice3D, TurnTimer, …
│   ├── sound.js, fx.js      # Sound effects and board effects
│   └── vendor/              # 3D dice library (MIT)
├── public/
│   ├── engine/              # Game engine: monopoly.js, ai.js, classicedition.js, newyorkcityedition.js
│   └── images/              # Board icons, cards and UI graphics
└── scripts/                 # dev.mjs (API + Vite), e2e.mjs (browser tests)
```

Beyond the original code, the engine has a few small additions: the 3D dice hook in `roll()`, save hooks (`onTurnStart`, `onGameEvent`, `onPlayerEliminated`, `onGameEnd`), `gameRandom()` (seedable randomness), ids on shared buttons, the rule sets, and the offer re-check when a trade is accepted.

---

## Testing

```bash
npm run test:server   # REST + WebSocket / room tests (in-memory SQLite)
npm run test:e2e      # real browsers: two and four online players, rules, live games
```

Set `TEST_DATABASE_URL` to an empty PostgreSQL database to run the server tests on PostgreSQL as well.

---

## Built with

- **React 19 + Vite 7**: interface and tooling
- **Node.js 22** (`node:http`, `node:crypto`, `node:sqlite`): API, WebSocket, password hashing, JWT
- **SQLite / PostgreSQL (`pg`)**: storage; Neon when deployed
- **three.js + cannon-es**: 3D dice (via the vendored dice-box-threejs)
- **jQuery 1.11 + vanilla JavaScript**: the game engine
- **Montserrat**, lime on charcoal: the design system in `src/styles.css`
