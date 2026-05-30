// server.js - Socket.IO Real-time Multiplayer Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

const server = http.createServer(app);

// Initialize Socket.IO with relaxed CORS for local testing
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Create Room
  socket.on('create_room', ({ username }, callback) => {
    if (!username) {
      return callback({ error: 'Username is required.' });
    }
    try {
      const room = roomManager.createRoom(username, socket.id);
      socket.join(room.roomCode);
      console.log(`[Room Created] Code: ${room.roomCode} by ${username}`);
      
      // Return details to creator
      callback({
        success: true,
        roomCode: room.roomCode,
        username,
        isAdmin: true
      });
      
      // Update room state for creator
      io.to(socket.id).emit('game_state_update', {
        roomCode: room.roomCode,
        gameStarted: false,
        roundEnded: false,
        players: room.players.map(p => ({
          id: p.id,
          username: p.username,
          isAdmin: p.isAdmin,
          connected: p.connected,
          score: p.score,
          lastRoundPoints: p.lastRoundPoints,
          declareStatus: p.declareStatus,
          cardCount: 0,
          cards: p.cards
        }))
      });
    } catch (err) {
      console.error('Error creating room:', err);
      callback({ error: 'Server error creating room.' });
    }
  });

  // Join Room
  socket.on('join_room', ({ roomCode, username }, callback) => {
    if (!roomCode || !username) {
      return callback({ error: 'Room code and username are required.' });
    }
    try {
      const result = roomManager.joinRoom(roomCode, username, socket.id);
      if (result.error) {
        return callback({ error: result.error });
      }

      const { room, reconnected } = result;
      socket.join(room.roomCode);

      console.log(`[Room Joined] Code: ${room.roomCode}, User: ${username}, Reconnected: ${reconnected}`);

      callback({
        success: true,
        roomCode: room.roomCode,
        username,
        isAdmin: room.players.find(p => p.username === username).isAdmin
      });

      // Broadcast update to others
      if (reconnected) {
        socket.to(room.roomCode).emit('player_reconnected_status', { username });
      } else {
        socket.to(room.roomCode).emit('player_joined', { username });
      }

      // Send current state to all players
      // For all players, we need to send their customized state
      for (let player of room.players) {
        if (player.connected) {
          io.to(player.id).emit('game_state_update', {
            roomCode: room.roomCode,
            gameStarted: room.gameStarted,
            roundEnded: room.roundEnded,
            turnIndex: room.turnIndex,
            turnState: room.turnState,
            timeLeft: room.timeLeft,
            wildJokerCard: room.wildJokerCard,
            wildJokerValue: room.wildJokerValue,
            deckCount: room.deck.length,
            discardPile: room.discardPile,
            winner: room.winner,
            players: room.players.map(p => ({
              id: p.id,
              username: p.username,
              isAdmin: p.isAdmin,
              connected: p.connected,
              score: p.score,
              lastRoundPoints: p.lastRoundPoints,
              declareStatus: p.declareStatus,
              cardCount: p.cards ? p.cards.length : 0,
              cards: p.id === player.id ? p.cards : undefined
            }))
          });
        }
      }

    } catch (err) {
      console.error('Error joining room:', err);
      callback({ error: 'Server error joining room.' });
    }
  });

  // Start Game
  socket.on('start_game', ({ roomCode }, callback) => {
    try {
      const result = roomManager.startGame(roomCode, socket.id, io);
      if (result.error) {
        return callback({ error: result.error });
      }

      console.log(`[Game Started] Room: ${roomCode}`);
      callback({ success: true });

      // Update room state for everyone (distributed through gameLogic dealing)
      const room = result.room;
      for (let player of room.players) {
        if (player.connected) {
          io.to(player.id).emit('game_state_update', {
            roomCode: room.roomCode,
            gameStarted: true,
            roundEnded: false,
            turnIndex: room.turnIndex,
            turnState: room.turnState,
            timeLeft: room.timeLeft,
            wildJokerCard: room.wildJokerCard,
            wildJokerValue: room.wildJokerValue,
            deckCount: room.deck.length,
            discardPile: room.discardPile,
            winner: null,
            players: room.players.map(p => ({
              id: p.id,
              username: p.username,
              isAdmin: p.isAdmin,
              connected: p.connected,
              score: p.score,
              lastRoundPoints: p.lastRoundPoints,
              declareStatus: p.declareStatus,
              cardCount: p.cards.length,
              cards: p.id === player.id ? p.cards : undefined
            }))
          });
        }
      }
    } catch (err) {
      console.error('Error starting game:', err);
      callback({ error: 'Server error starting game.' });
    }
  });

  // Draw Card
  socket.on('draw_card', ({ roomCode, source }, callback) => {
    try {
      const result = roomManager.drawCard(roomCode, socket.id, source, io);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true });
    } catch (err) {
      console.error('Error drawing card:', err);
      callback({ error: 'Server error drawing card.' });
    }
  });

  // Discard Card
  socket.on('discard_card', ({ roomCode, cardId }, callback) => {
    try {
      const result = roomManager.discardCard(roomCode, socket.id, cardId, io);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true });
    } catch (err) {
      console.error('Error discarding card:', err);
      callback({ error: 'Server error discarding card.' });
    }
  });

  // Declare Hand
  socket.on('declare_game', ({ roomCode, groups, discardCardId }, callback) => {
    try {
      const result = roomManager.declareHand(roomCode, socket.id, groups, discardCardId, io);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true, valid: result.valid, reason: result.reason });
    } catch (err) {
      console.error('Error declaring game:', err);
      callback({ error: 'Server error declaring game.' });
    }
  });

  // Restart Game
  socket.on('restart_game', ({ roomCode }, callback) => {
    try {
      const result = roomManager.restartGame(roomCode, socket.id, io);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true });

      // Broadcast update
      const room = result.room;
      for (let player of room.players) {
        if (player.connected) {
          io.to(player.id).emit('game_state_update', {
            roomCode: room.roomCode,
            gameStarted: true,
            roundEnded: false,
            turnIndex: room.turnIndex,
            turnState: room.turnState,
            timeLeft: room.timeLeft,
            wildJokerCard: room.wildJokerCard,
            wildJokerValue: room.wildJokerValue,
            deckCount: room.deck.length,
            discardPile: room.discardPile,
            winner: null,
            players: room.players.map(p => ({
              id: p.id,
              username: p.username,
              isAdmin: p.isAdmin,
              connected: p.connected,
              score: p.score,
              lastRoundPoints: p.lastRoundPoints,
              declareStatus: p.declareStatus,
              cardCount: p.cards.length,
              cards: p.id === player.id ? p.cards : undefined
            }))
          });
        }
      }
    } catch (err) {
      console.error('Error restarting game:', err);
      callback({ error: 'Server error restarting game.' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    try {
      roomManager.handleDisconnect(socket.id, io);
    } catch (err) {
      console.error('Error during disconnect cleanup:', err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Rummy Backend Server] Running on port ${PORT}`);
});
