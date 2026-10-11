# Monopoly Web Game

An interactive, browser-based implementation of the classic **Monopoly** board game written in HTML, CSS, JavaScript, and jQuery. Play against other human players locally or challenge AI opponents with full trading, mortgaging, and auction capabilities.

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
- **Interactive UI**:
  - Interactive board deeds popup with detailed rent tiers and mortgage values.
  - Player statistics, live bank balance, log view, and draggable modal dialogues.
  - Responsive visual tokens and styled control panels.

---

## 📂 Project Structure

```text
├── index.html            # Main HTML document and board layout
├── styles.css            # Stylesheet for board, tokens, deeds, and UI
├── monopoly.js           # Core game engine (rules, turns, auctions, trades, state)
├── ai.js                 # AI player decision-making logic
├── classicedition.js     # Atlantic City board definitions, cards, and square data
├── newyorkcityedition.js # NYC edition board definitions, cards, and square data
└── images/               # Board icons, cards, and UI graphics
```

---

## 🚀 Getting Started

No build step or external dependencies installation is required.

### 1. Run Directly in Browser
Simply open `index.html` in any modern web browser:
- Double-click `index.html`, or
- Right-click and choose **Open With > Google Chrome / Safari / Firefox / Edge**.

### 2. Run with a Local Server (Optional)
If you prefer serving the files over HTTP:

Using Python 3:
```bash
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your web browser.

Using Node.js (`npx serve` or `live-server`):
```bash
npx serve .
```

---

## ⚙️ Customization & Editions

To switch between the **Classic Edition** and the **New York City Edition**, edit `index.html` (lines 13–15):

```html
<!-- For Classic Edition: -->
<script type="text/javascript" src="classicedition.js"></script>
<!-- <script type="text/javascript" src="newyorkcityedition.js"></script> -->

<!-- For New York City Edition: -->
<!-- <script type="text/javascript" src="classicedition.js"></script> -->
<script type="text/javascript" src="newyorkcityedition.js"></script>
```

---

## 🛠️ Built With

- **HTML5 & CSS3** – Board layout, styling, and typography.
- **JavaScript (ES5/Vanilla)** – Game state management and business logic.
- **jQuery (1.11.1)** – DOM interactions, drag-and-drop modals, and event handling.
