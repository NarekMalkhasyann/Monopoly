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
├── index.html              # Vite entry: loads jQuery, the engine scripts and src/main.jsx
├── package.json            # React 19 + Vite
├── vite.config.js
├── src/
│   ├── main.jsx            # Mounts <App /> (synchronously, so the engine finds its elements)
│   ├── App.jsx
│   ├── styles.css          # Design system (lime on charcoal, Montserrat)
│   └── components/         # Board, ControlPanel, MoneyBar, Setup, TradePanel, Deed, Popups (.jsx)
└── public/
    ├── engine/             # Game engine (plain JS, unchanged): monopoly.js, ai.js,
    │                       #   classicedition.js, newyorkcityedition.js
    └── images/             # Board icons, cards, and UI graphics
```

The page markup is now React (JSX). The game rules and state still live in
`public/engine/*.js`, which reads and updates the elements by their `id`s, so
those ids must not be renamed.

---

## 🚀 Getting Started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

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

- **HTML5 & CSS3** – Board layout, styling, and typography.
- **JavaScript (ES5/Vanilla)** – Game state management and business logic.
- **jQuery (1.11.1)** – DOM interactions, drag-and-drop modals, and event handling.
