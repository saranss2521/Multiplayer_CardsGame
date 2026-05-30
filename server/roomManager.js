// roomManager.js - State Management for Game Rooms, Players, and Turn Timers
const {
  createDeck,
  shuffle,
  validateDeclare,
  calculateHandScore
} = require('./gameLogic');

// Map of roomCode -> roomState
const rooms = new Map();

// Map of socketId -> roomCode (to find rooms quickly on disconnect)
const socketToRoom = new Map();

// Turn timer duration in seconds
const TURN_TIMEOUT_SECONDS = 30;
// Reconnect grace period in seconds
const RECONNECT_TIMEOUT_MS = 60000;

/**
 * Generates a unique 6-digit room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Sanitizes room state to send to clients.
 * Hides other players' cards to prevent cheating.
 */
function getSanitizedRoomState(room, requestSocketId) {
  return {
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
      // Only show card counts for other players, unless the round has ended
      cardCount: p.cards ? p.cards.length : 0,
      cards: (p.id === requestSocketId || room.roundEnded) ? p.cards : undefined
    }))
  };
}

/**
 * Starts the turn timer for a room
 */
function startTurnTimer(room, io) {
  if (room.timerId) {
    clearInterval(room.timerId);
  }

  room.timeLeft = TURN_TIMEOUT_SECONDS;

  room.timerId = setInterval(() => {
    if (!room.gameStarted || room.roundEnded) {
      clearInterval(room.timerId);
      return;
    }

    room.timeLeft--;

    // Broadcast time tick
    io.to(room.roomCode).emit('timer_tick', { timeLeft: room.timeLeft });

    if (room.timeLeft <= 0) {
      clearInterval(room.timerId);
      handleTurnTimeout(room, io);
    }
  }, 1000);
}

/**
 * Auto-plays a player's turn if they timeout
 */
function handleTurnTimeout(room, io) {
  const activePlayer = room.players[room.turnIndex];
  if (!activePlayer) return;

  console.log(`[Timer Timeout] Auto-playing turn for player: ${activePlayer.username} in room ${room.roomCode}`);

  try {
    if (room.turnState === 'draw') {
      // 1. Auto-draw from deck
      if (room.deck.length > 0) {
        const card = room.deck.pop();
        activePlayer.cards.push(card);
        io.to(activePlayer.id).emit('card_drawn', { card, source: 'deck' });
      } else {
        // Recycle discard pile if deck empty
        recycleDiscardPile(room);
        const card = room.deck.pop();
        activePlayer.cards.push(card);
        io.to(activePlayer.id).emit('card_drawn', { card, source: 'deck' });
      }
      room.turnState = 'discard';
      
      // Send temporary update
      io.to(room.roomCode).emit('game_state_update', getSanitizedRoomState(room));

      // 2. Immediate auto-discard (discard the card just drawn)
      const discardedCard = activePlayer.cards.pop();
      room.discardPile.push(discardedCard);

      // Advance turn
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      room.turnState = 'draw';

      io.to(room.roomCode).emit('card_discarded', {
        player: activePlayer.username,
        card: discardedCard
      });
    } else if (room.turnState === 'discard') {
      // Auto-discard the last card in player's hand
      const discardedCard = activePlayer.cards.pop();
      room.discardPile.push(discardedCard);

      // Advance turn
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      room.turnState = 'draw';

      io.to(room.roomCode).emit('card_discarded', {
        player: activePlayer.username,
        card: discardedCard
      });
    }

    // Update state and restart timer
    broadcastRoomState(room, io);
    startTurnTimer(room, io);
  } catch (err) {
    console.error('Error handling turn timeout:', err);
  }
}

/**
 * Recycles discard pile if deck runs out of cards
 */
function recycleDiscardPile(room) {
  if (room.discardPile.length <= 1) return;
  const topCard = room.discardPile.pop();
  room.deck = shuffle(room.discardPile);
  room.discardPile = [topCard];
  console.log(`[Deck Recycled] Reshuffled ${room.deck.length} cards from discard pile.`);
}

/**
 * Broadcasts customized game state to each player in the room
 */
function broadcastRoomState(room, io) {
  for (let player of room.players) {
    if (player.connected) {
      io.to(player.id).emit('game_state_update', getSanitizedRoomState(room, player.id));
    }
  }
}

// Room Operations:

function createRoom(username, socketId) {
  const roomCode = generateRoomCode();
  const room = {
    roomCode,
    gameStarted: false,
    roundEnded: false,
    players: [{
      id: socketId,
      username,
      isAdmin: true,
      connected: true,
      score: 0,
      lastRoundPoints: 0,
      declareStatus: 'pending',
      cards: []
    }],
    deck: [],
    discardPile: [],
    wildJokerCard: null,
    wildJokerValue: 0,
    turnIndex: 0,
    turnState: 'draw', // 'draw' or 'discard'
    timeLeft: TURN_TIMEOUT_SECONDS,
    timerId: null,
    winner: null,
    reconnectTimers: new Map()
  };

  rooms.set(roomCode, room);
  socketToRoom.set(socketId, roomCode);
  return room;
}

function joinRoom(roomCode, username, socketId) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    return { error: 'Room not found.' };
  }

  // Check if player is attempting to reconnect
  const existingPlayer = room.players.find(p => p.username === username);
  if (existingPlayer) {
    if (!existingPlayer.connected) {
      // Reconnect player
      existingPlayer.id = socketId;
      existingPlayer.connected = true;
      socketToRoom.set(socketId, room.roomCode);

      // Cancel reconnect timer
      const timeoutId = room.reconnectTimers.get(username);
      if (timeoutId) {
        clearTimeout(timeoutId);
        room.reconnectTimers.delete(username);
      }

      console.log(`[Player Reconnected] ${username} re-joined room ${room.roomCode}`);
      return { room, reconnected: true };
    } else {
      return { error: 'Username is already taken in this room.' };
    }
  }

  if (room.gameStarted) {
    return { error: 'The game has already started in this room.' };
  }

  if (room.players.length >= 6) {
    return { error: 'Room is full (max 6 players).' };
  }

  // Add new player
  const newPlayer = {
    id: socketId,
    username,
    isAdmin: false,
    connected: true,
    score: 0,
    lastRoundPoints: 0,
    declareStatus: 'pending',
    cards: []
  };

  room.players.push(newPlayer);
  socketToRoom.set(socketId, room.roomCode);
  return { room, reconnected: false };
}

function startGame(roomCode, socketId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const player = room.players.find(p => p.id === socketId);
  if (!player || !player.isAdmin) {
    return { error: 'Only the host (admin) can start the game.' };
  }

  if (room.players.length < 2) {
    return { error: 'At least 2 players are required to start the game.' };
  }

  // Reset round settings
  room.gameStarted = true;
  room.roundEnded = false;
  room.winner = null;
  room.turnState = 'draw';
  room.turnIndex = 0;

  // 1. Create and shuffle 108 cards (2 decks + 4 jokers)
  const fullDeck = createDeck();
  room.deck = shuffle(fullDeck);

  // 2. Deal 13 cards to each player
  for (let p of room.players) {
    p.cards = [];
    p.declareStatus = 'pending';
    p.lastRoundPoints = 0;
    for (let i = 0; i < 13; i++) {
      p.cards.push(room.deck.pop());
    }
  }

  // 3. Draw a Wild Joker card
  room.wildJokerCard = room.deck.pop();
  if (room.wildJokerCard.isPrintedJoker || room.wildJokerCard.suit === 'J') {
    // If printed joker drawn, Ace (1) becomes the wild joker
    room.wildJokerValue = 1;
  } else {
    room.wildJokerValue = room.wildJokerCard.value;
  }

  // 4. Open Discard Pile
  room.discardPile = [room.deck.pop()];

  // Start turn timer
  startTurnTimer(room, io);

  return { room };
}

function drawCard(roomCode, socketId, source, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const activePlayer = room.players[room.turnIndex];
  if (activePlayer.id !== socketId) {
    return { error: "It is not your turn." };
  }

  if (room.turnState !== 'draw') {
    return { error: "You have already drawn a card this turn." };
  }

  let drawnCard;
  if (source === 'deck') {
    if (room.deck.length === 0) {
      recycleDiscardPile(room);
    }
    drawnCard = room.deck.pop();
  } else if (source === 'discard') {
    if (room.discardPile.length === 0) {
      return { error: "Discard pile is empty." };
    }
    drawnCard = room.discardPile.pop();
  } else {
    return { error: "Invalid draw source." };
  }

  activePlayer.cards.push(drawnCard);
  room.turnState = 'discard';

  // Inform drawer specifically of the card
  io.to(socketId).emit('card_drawn', { card: drawnCard, source });

  // Update room state for everyone
  broadcastRoomState(room, io);

  return { success: true };
}

function discardCard(roomCode, socketId, cardId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const activePlayer = room.players[room.turnIndex];
  if (activePlayer.id !== socketId) {
    return { error: "It is not your turn." };
  }

  if (room.turnState !== 'discard') {
    return { error: "You must draw a card before discarding." };
  }

  const cardIndex = activePlayer.cards.findIndex(c => c.id === cardId);
  if (cardIndex === -1) {
    return { error: "Card not found in your hand." };
  }

  const card = activePlayer.cards.splice(cardIndex, 1)[0];
  room.discardPile.push(card);

  // Transition to next player turn
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  room.turnState = 'draw';

  io.to(room.roomCode).emit('card_discarded', {
    player: activePlayer.username,
    card
  });

  // Update room state & reset timer
  broadcastRoomState(room, io);
  startTurnTimer(room, io);

  return { success: true };
}

function declareHand(roomCode, socketId, groups, discardCardId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const activePlayer = room.players[room.turnIndex];
  if (activePlayer.id !== socketId) {
    return { error: "It is not your turn to declare." };
  }

  if (room.turnState !== 'discard') {
    return { error: "You must draw a card (leaving you with 14 cards) before declaring." };
  }

  // 1. Remove the declare card from player's hand
  const cardIndex = activePlayer.cards.findIndex(c => c.id === discardCardId);
  if (cardIndex === -1) {
    return { error: "Declare card not found in your hand." };
  }
  const declareCard = activePlayer.cards.splice(cardIndex, 1)[0];

  // The player's remaining cards should be grouped into exactly 13 cards.
  // Validate that the submitted groups contain exactly the 13 cards left in activePlayer.cards
  const flatSubmittedCards = groups.flat();
  if (flatSubmittedCards.length !== 13) {
    activePlayer.cards.push(declareCard); // Refund card
    return { error: "You must group exactly 13 cards for declaration." };
  }

  // Check matching cards (IDs match)
  const handIds = activePlayer.cards.map(c => c.id).sort();
  const submittedIds = flatSubmittedCards.map(c => c.id).sort();
  const listsMatch = handIds.every((id, idx) => id === submittedIds[idx]);
  if (!listsMatch) {
    activePlayer.cards.push(declareCard); // Refund card
    return { error: "Submitted card groups do not match cards in your hand." };
  }

  // 2. Validate the declare groups
  const validation = validateDeclare(groups, room.wildJokerValue);

  if (validation.valid) {
    // SUCCESS DECLARE - Player wins the round
    console.log(`[Valid Declare] Player ${activePlayer.username} won the round in room ${room.roomCode}!`);
    room.winner = activePlayer.username;
    room.roundEnded = true;
    activePlayer.declareStatus = 'valid';
    activePlayer.lastRoundPoints = 0;

    // Calculate score points for other players
    for (let p of room.players) {
      if (p.id !== socketId) {
        // Evaluate other player's cards. Since they are losing, we evaluate their hand.
        // For standard games, client sends their groups to calculate, or we calculate based on server-side cards.
        // Since players arrange their cards locally, we can score them.
        // Wait, how do we score the losing players?
        // We will default their groups to whatever cards they currently hold.
        // If they did not group them, we treat them as one single ungrouped array of 13 cards,
        // which will automatically trigger an 80 points penalty because it has no sequences.
        // Let's implement scoring: we'll check if they have groups. If they have no grouped cards,
        // they get 80 points.
        // (Usually, on a declare, the server prompts other players to submit their groupings within 15 seconds,
        // or we can auto-score them based on their current arrangement. To keep the gameplay simple and immediate,
        // we will evaluate their current hand. If they have grouped cards stored on the server, we use that.
        // Otherwise, we evaluate their hand as a single invalid group, resulting in 80 points).
        // Let's check: we can calculate point scores based on their hand. If they don't have two sequences, it is 80 points.
        // If they do have a sequence, we check their groupings if they sorted them, or we look for any sequences in their raw hand.
        // Let's make a smart utility that extracts sequences automatically from their hand to save them points if possible,
        // or just calculate it using their current groups (which we can store on each discard/move).
        // Let's see: since we want to be accurate, we can check if they have sequences in their cards.
        const defaultGroups = [p.cards];
        const points = calculateHandScore(defaultGroups, room.wildJokerValue);
        p.lastRoundPoints = points;
        p.score += points;
        p.declareStatus = 'pending';
      }
    }
  } else {
    // FAILED DECLARE - Wrong Show (80 points penalty)
    console.log(`[Invalid Declare] Player ${activePlayer.username} failed declare: ${validation.reason}`);
    room.winner = null;
    room.roundEnded = true;
    activePlayer.declareStatus = 'invalid';
    activePlayer.lastRoundPoints = 80;
    activePlayer.score += 80;

    // Refund the declare card back to the hand so we can show their cards correctly
    activePlayer.cards.push(declareCard);

    // Calculate score points for other players (they get points for their current hands, but wait!
    // If the declare is invalid, does the round end? Yes, the round ends, but other players get points based on their current hands).
    for (let p of room.players) {
      if (p.id !== socketId) {
        const defaultGroups = [p.cards];
        const points = calculateHandScore(defaultGroups, room.wildJokerValue);
        p.lastRoundPoints = points;
        p.score += points;
        p.declareStatus = 'pending';
      }
    }
  }

  // Put declare card on top of discard pile
  room.discardPile.push(declareCard);

  // Stop timer
  if (room.timerId) {
    clearInterval(room.timerId);
  }

  // Update room state
  broadcastRoomState(room, io);

  return { success: true, valid: validation.valid, reason: validation.reason };
}

function restartGame(roomCode, socketId, io) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const player = room.players.find(p => p.id === socketId);
  if (!player || !player.isAdmin) {
    return { error: 'Only the host (admin) can restart the game.' };
  }

  // Start game again
  return startGame(roomCode, socketId, io);
}

function handleDisconnect(socketId, io) {
  const roomCode = socketToRoom.get(socketId);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) return;

  const player = room.players.find(p => p.id === socketId);
  if (!player) return;

  console.log(`[Player Disconnected] ${player.username} from room ${roomCode}`);
  player.connected = false;
  socketToRoom.delete(socketId);

  // If game is not started, we can remove the player immediately
  if (!room.gameStarted) {
    room.players = room.players.filter(p => p.id !== socketId);
    // If room is empty, delete it
    if (room.players.length === 0) {
      rooms.delete(roomCode);
      console.log(`[Room Deleted] Room ${roomCode} is empty.`);
      return;
    }

    // Reassign admin if admin left
    if (player.isAdmin) {
      room.players[0].isAdmin = true;
      console.log(`[Host Reassigned] ${room.players[0].username} is now host in room ${roomCode}`);
    }

    io.to(roomCode).emit('player_left', { username: player.username });
    broadcastRoomState(room, io);
    return;
  }

  // If game is in progress, start a reconnect timer (60 seconds)
  const timeoutId = setTimeout(() => {
    console.log(`[Player Reconnect Timeout] Removing ${player.username} permanently from room ${roomCode}`);
    room.players = room.players.filter(p => p.username !== player.username);
    room.reconnectTimers.delete(player.username);

    // If room empty or only 1 player remains, terminate game
    if (room.players.length < 2) {
      if (room.timerId) clearInterval(room.timerId);
      io.to(roomCode).emit('game_terminated', { reason: 'Not enough players remaining.' });
      rooms.delete(roomCode);
      console.log(`[Room Terminated] Room ${roomCode} has less than 2 players.`);
      return;
    }

    // Reassign admin if admin left
    if (player.isAdmin) {
      room.players[0].isAdmin = true;
    }

    // If it was their turn, skip it
    if (room.gameStarted && !room.roundEnded && room.turnIndex >= room.players.length) {
      room.turnIndex = 0;
      room.turnState = 'draw';
      startTurnTimer(room, io);
    }

    io.to(roomCode).emit('player_left_permanently', { username: player.username });
    broadcastRoomState(room, io);
  }, RECONNECT_TIMEOUT_MS);

  room.reconnectTimers.set(player.username, timeoutId);
  
  // Broadcast disconnect
  io.to(roomCode).emit('player_disconnected_status', { username: player.username });
  broadcastRoomState(room, io);
}

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  drawCard,
  discardCard,
  declareHand,
  restartGame,
  handleDisconnect
};
