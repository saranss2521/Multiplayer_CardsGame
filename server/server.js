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

  // Catch-all packet logger for connection troubleshooting
  socket.onAny((eventName, ...args) => {
    console.log(`[Socket Event] ID: ${socket.id}, Event: ${eventName}, Args:`, JSON.stringify(args));
  });

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
      roomManager.broadcastRoomState(room, io);
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
      roomManager.broadcastRoomState(room, io);

    } catch (err) {
      console.error('Error joining room:', err);
      callback({ error: 'Server error joining room.' });
    }
  });

  // Start Game
  socket.on('start_game', ({ roomCode, enableToss }, callback) => {
    try {
      const result = roomManager.startGame(roomCode, socket.id, io, enableToss);
      if (result.error) {
        return callback({ error: result.error });
      }

      console.log(`[Game Started] Room: ${roomCode}, Toss: ${enableToss}`);
      callback({ success: true });

      // Update room state for everyone
      const room = result.room;
      roomManager.broadcastRoomState(room, io);
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
      roomManager.broadcastRoomState(room, io);
    } catch (err) {
      console.error('Error restarting game:', err);
      callback({ error: 'Server error restarting game.' });
    }
  });

  // Add Bot
  socket.on('add_bot', ({ roomCode }, callback) => {
    try {
      const result = roomManager.addBot(roomCode);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true });

      // Broadcast player joined status to other players
      socket.to(result.room.roomCode).emit('player_joined', {
        username: result.room.players[result.room.players.length - 1].username
      });

      // Broadcast updated room state
      roomManager.broadcastRoomState(result.room, io);
    } catch (err) {
      console.error('Error adding bot:', err);
      callback({ error: 'Server error adding bot.' });
    }
  });

  // Submit Losing Hand (in scoring phase)
  socket.on('submit_losing_hand', ({ roomCode, groups }, callback) => {
    try {
      const result = roomManager.submitLosingHand(roomCode, socket.id, groups, io);
      if (result.error) {
        return callback({ error: result.error });
      }
      callback({ success: true });
    } catch (err) {
      console.error('Error submitting losing hand:', err);
      callback({ error: 'Server error submitting losing hand.' });
    }
  });

  // Play with Computer (Instant Game with Bots)
  socket.on('play_with_computer', ({ username }, callback) => {
    if (!username) {
      return callback({ error: 'Username is required.' });
    }
    try {
      // 1. Create Room
      const room = roomManager.createRoom(username, socket.id);
      socket.join(room.roomCode);
      console.log(`[Play with Computer] Room Created: ${room.roomCode} by ${username}`);

      // 2. Add 2 Bots
      roomManager.addBot(room.roomCode);
      roomManager.addBot(room.roomCode);
      console.log(`[Play with Computer] Added 2 bots to Room: ${room.roomCode}`);

      // 3. Start Game
      const result = roomManager.startGame(room.roomCode, socket.id, io);
      if (result.error) {
        return callback({ error: result.error });
      }

      console.log(`[Play with Computer] Game Started: Room ${room.roomCode}`);
      
      // Respond to client
      callback({
        success: true,
        roomCode: room.roomCode,
        username,
        isAdmin: true
      });

      // Broadcast room state to creator (starts the game UI directly on client)
      roomManager.broadcastRoomState(room, io);
    } catch (err) {
      console.error('Error in play_with_computer:', err);
      callback({ error: 'Server error starting computer game.' });
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
const HOST = '0.0.0.0'; // Listen on all network interfaces (required for LAN/mobile access)

server.listen(PORT, HOST, () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let lanIP = 'unknown';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIP = net.address;
      }
    }
  }
  console.log(`[Rummy Backend Server] Running on port ${PORT}`);
  console.log(`[Rummy Backend Server] Local:   http://localhost:${PORT}`);
  console.log(`[Rummy Backend Server] Network: http://${lanIP}:${PORT}  ← Use this on your phone`);
});
