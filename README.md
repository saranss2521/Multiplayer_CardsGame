---
title: Rummy Server
emoji: 🎴
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# Royal Rummy - Multiplayer Indian Rummy Game (13-Card)

Royal Rummy is a premium, real-time multiplayer 13-card Indian Rummy game built with **React Native (Expo)** on the frontend and **Node.js + Socket.IO** on the backend. 

Players can create or join rooms via a 6-digit room code, sort and group their hands, draw/discard cards in real time, and declare shows which are validated server-side.

---

## 📱 Features

- **No Authentication Required**: Create a room as a Host (Admin) or join instantly using a Room Code and Username.
- **Strict Indian Rummy Rules**: 
  - Shuffles 108 cards (2 full decks + 4 printed jokers).
  - Handles Wild Jokers (drawn at start; if printed joker is drawn, Ace becomes the wild joker).
  - Requires at least **one Pure Sequence** (consecutive cards of same suit, no jokers) and at least **one secondary sequence** (pure or impure) to declare.
  - Automatic calculation of scores: valid declare = 0 points, invalid declare = 80 points penalty. Others lose based on unmatched cards (Ace & face cards = 10 pts, numbers = face value, jokers = 0 pts). Capped at 80 points.
- **Turn Timer**: 30-second turn timer. If a player goes idle, the server automatically draws and discards the card to keep the game moving.
- **Reconnect Protection**: If a player disconnects, they have a 60-second window to reconnect using the same room code and username.
- **Casino Felt Aesthetics**: Dark felt green gradient table with glassmorphic cards, selected card lifting animations, turn indicator overlays, and visual card groupings.

---

## 📂 Project Structure

```text
gallant-franklin/
├── server/                    # Node.js + Socket.IO Backend
│   ├── package.json           # Backend dependency configuration
│   ├── server.js              # Socket server entry point
│   ├── gameLogic.js           # Rummy card rules, validators, & scoring
│   ├── roomManager.js         # Room state machine, turn queues, & timers
│   └── testValidator.js       # Automated rule validation testing suite
│
├── client/                    # React Native Expo Frontend
│   ├── package.json           # Frontend dependencies (Expo, Zustand, Socket.IO Client)
│   ├── App.js                 # App entry and state-based screen navigator
│   ├── store/
│   │   └── gameStore.js       # Zustand state management and sockets controller
│   ├── components/
│   │   └── Card.js            # Premium playing card component with elevations
│   └── screens/
│       ├── LobbyScreen.js     # Room creation and join credentials UI
│       ├── WaitingRoomScreen.js  # Joined player list and admin start UI
│       ├── GameScreen.js      # Casino felt game board, card piles, & groups UI
│       └── ResultsScreen.js   # Scorecard table and hands inspector UI
│
└── README.md                  # Installation and gameplay guide
```

---

## ⚙️ Setup & Installation

### Prerequisite
Make sure you have **Node.js** (v16+) and **npm** installed on your system.

---

### 1. Launch the Backend Server

```bash
# 1. Navigate to the server folder
cd server

# 2. Install dependencies
npm install

# 3. Start the dev server
npm start
```
The server will start listening on port **3000** (`http://localhost:3000`).

#### Run Server Tests
To run the automated rule validator and point calculator tests:
```bash
node testValidator.js
```
This executes 15+ mock hand structures to verify pure/impure sequences, sets, invalid shows, and scoring thresholds.

---

### 2. Launch the React Native Mobile Client

```bash
# 1. Navigate to the client folder
cd client

# 2. Install dependencies
npm install

# 3. Start the Expo builder
npm run web
```
This opens Expo Web inside your browser (usually `http://localhost:8081`). 

- **To run on an Android/iOS emulator**: Install Expo Go on the simulator and run `npm run android` or `npm run ios`.
- **To run on a physical phone**: 
  1. Open the application.
  2. Tap the **⚙ Server IP** button in the top right corner.
  3. Input your computer's local network IP address (e.g. `http://192.168.1.45:3000`) instead of `localhost` so the phone can reach the backend.

---

## 🎮 How to Play

1. **Host**: Enter your name, tap **Create New Room**. Share the 6-character room code.
2. **Players**: Enter name, paste the Room Code, tap **Join Room**.
3. **Start**: The Host taps **Start Game** once at least 2 players are present.
4. **Drawing**: On your turn, tap the **Closed Deck** or the face-up **Discard Pile** to draw your 14th card.
5. **Organizing**: 
   - Tap cards to select them, and tap **Group Selected** to bundle them into sequences/sets.
   - Tap **Sort Suits** to organize your hand automatically.
   - Use the micro buttons below each card (`←` / `→` / `New`) to shift them between groups.
6. **Discarding**: Select exactly 1 card and tap **Discard** to end your turn.
7. **Declaring**: When you have a winning hand, draw your 14th card, tap **Declare Show**, then tap the card you want to discard to the declare slot. Confirm the show to submit.
