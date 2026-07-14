// roomManager.js - State Management for Game Rooms, Players, and Turn Timers
const {
  createDeck,
  shuffle,
  validateDeclare,
  calculateHandScore,
  isJoker,
  getCardPoints
} = require('./gameLogic');

// Map of roomCode -> roomState
const rooms = new Map();

// Map of socketId -> roomCode (to find rooms quickly on disconnect)
const socketToRoom = new Map();

// Turn timer duration in seconds
const TURN_TIMEOUT_SECONDS = 60;
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
    deckCount: room.deck ? room.deck.length : 0,
    discardPile: room.discardPile,
    winner: room.winner,
    scoringActive: room.scoringActive || false,
    scoringWinner: room.scoringWinner || null,
    scoringTimeLeft: room.scoringTimeLeft || 0,
    matchFinished: room.matchFinished || false,
    matchWinner: room.matchWinner || null,
    
    // Toss Phase Sync
    tossActive: room.tossActive || false,
    tossTimeout: room.tossTimeout || 0,

    players: room.players.map(p => ({
      id: p.id,
      username: p.username,
      isAdmin: p.isAdmin,
      connected: p.connected,
      isBot: p.isBot || false,
      score: p.score,
      lastRoundPoints: p.lastRoundPoints,
      declareStatus: p.declareStatus,
      eliminated: p.eliminated || false,
      
      // Toss Card is always public to everyone during the seating round
      tossCard: p.tossCard || null,

      // Only show card counts for other players, unless the round has ended
      cardCount: p.cards ? p.cards.length : 0,
      cards: (p.id === requestSocketId || room.roundEnded) ? p.cards : undefined,
      handGroups: (p.id === requestSocketId || room.roundEnded) ? p.handGroups : undefined
    }))
  };
}

/**
 * Advances the room's turnIndex to the next active (non-eliminated) player
 */
function moveToNextActivePlayer(room) {
  const startIdx = room.turnIndex;
  let nextIdx = startIdx;
  do {
    nextIdx = (nextIdx + 1) % room.players.length;
    const p = room.players[nextIdx];
    if (p && !p.eliminated) {
      room.turnIndex = nextIdx;
      return;
    }
  } while (nextIdx !== startIdx);
  room.turnIndex = nextIdx;
}

/**
 * Starts the turn timer for a room
 */
function startTurnTimer(room, io) {
  if (room.timerId) {
    clearInterval(room.timerId);
  }

  // If the active player is a bot, trigger its turn and return
  const activePlayer = room.players[room.turnIndex];
  if (activePlayer && activePlayer.isBot) {
    triggerBotTurn(room, activePlayer, io);
    return;
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
      moveToNextActivePlayer(room);
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
      moveToNextActivePlayer(room);
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
    if (player.connected && !player.isBot) {
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
      eliminated: false,
      handGroups: [],
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
    eliminated: false,
    handGroups: [],
    cards: []
  };

  room.players.push(newPlayer);
  socketToRoom.set(socketId, room.roomCode);
  return { room, reconnected: false };
}

function getTossCardPriority(card) {
  if (!card) return 0;
  // Ace is highest (14), King is 13, Q is 12, J is 11, etc.
  const valueWeight = card.value === 1 ? 14 : card.value;
  
  // Suit priority: Spades (4) > Hearts (3) > Diamonds (2) > Clubs (1)
  let suitWeight = 0;
  if (card.suit === 'S') suitWeight = 4;
  else if (card.suit === 'H') suitWeight = 3;
  else if (card.suit === 'D') suitWeight = 2;
  else if (card.suit === 'C') suitWeight = 1;

  return valueWeight * 10 + suitWeight;
}

function concludeTossAndDeal(room, io) {
  console.log(`[Toss Concluded] Sorting players based on card priorities in room ${room.roomCode}`);
  
  // Sort players descending based on their toss card priority
  room.players.sort((a, b) => getTossCardPriority(b.tossCard) - getTossCardPriority(a.tossCard));
  
  // End toss phase
  room.tossActive = false;
  room.tossTimeout = 0;

  // 1. Create and shuffle 108 cards
  const fullDeck = createDeck();
  room.deck = shuffle(fullDeck);

  // 2. Deal 13 cards to each player (who is not eliminated)
  for (let p of room.players) {
    p.cards = [];
    p.declareStatus = p.eliminated ? 'eliminated' : 'pending';
    p.lastRoundPoints = 0;
    p.handGroups = [];
    if (!p.eliminated) {
      for (let i = 0; i < 13; i++) {
        p.cards.push(room.deck.pop());
      }
    }
  }

  // 3. Draw a Wild Joker card
  room.wildJokerCard = room.deck.pop();
  if (room.wildJokerCard.isPrintedJoker || room.wildJokerCard.suit === 'J') {
    room.wildJokerValue = 1;
  } else {
    room.wildJokerValue = room.wildJokerCard.value;
  }

  // 4. Open Discard Pile
  room.discardPile = [room.deck.pop()];

  // Toss winner (player at index 0 after sorting) gets the first turn!
  room.turnIndex = 0;

  // Broadcast the fresh game start state to everyone and kick off the turn timer
  broadcastRoomState(room, io);
  startTurnTimer(room, io);
}

function startGame(roomCode, socketId, io, enableToss = false) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found.' };

  const player = room.players.find(p => p.id === socketId);
  if (!player || !player.isAdmin) {
    return { error: 'Only the host (admin) can start the game.' };
  }

  if (room.players.length < 2) {
    return { error: 'At least 2 players are required to start the game.' };
  }

  const wasGameNotStarted = !room.gameStarted;

  // Reset round settings
  room.gameStarted = true;
  room.roundEnded = false;
  room.winner = null;
  room.turnState = 'draw';

  // Reset tournament/match levels if match is finished or starting for the first time
  if (room.matchFinished || wasGameNotStarted) {
    room.matchFinished = false;
    room.matchWinner = null;
    for (let p of room.players) {
      p.score = 0;
      p.eliminated = false;
      p.handGroups = [];
    }
  }

  // Clear any existing intervals
  if (room.tossTimerId) {
    clearInterval(room.tossTimerId);
    room.tossTimerId = null;
  }

  // Handle Toss Phase (only on first match start)
  if (enableToss && wasGameNotStarted) {
    room.tossActive = true;
    room.tossTimeout = 6; // 6 seconds countdown

    // Create deck and shuffle
    const fullDeck = createDeck();
    room.deck = shuffle(fullDeck);

    // Deal 1 card for toss to each player
    for (let p of room.players) {
      p.tossCard = room.deck.pop();
      p.cards = [];
      p.handGroups = [];
      p.declareStatus = 'pending';
      p.lastRoundPoints = 0;
    }

    // Tick toss countdown
    room.tossTimerId = setInterval(() => {
      room.tossTimeout--;
      broadcastRoomState(room, io);

      if (room.tossTimeout <= 0) {
        clearInterval(room.tossTimerId);
        room.tossTimerId = null;
        concludeTossAndDeal(room, io);
      }
    }, 1000);

    return { room };
  }

  // Standard Game Start (directly deal 13 cards, clear toss cards)
  room.tossActive = false;
  room.tossTimeout = 0;

  // 1. Create and shuffle 108 cards (2 decks + 4 jokers)
  const fullDeck = createDeck();
  room.deck = shuffle(fullDeck);

  // 2. Deal 13 cards to each player (who is not eliminated)
  for (let p of room.players) {
    p.cards = [];
    p.tossCard = null; // Clear toss card
    p.declareStatus = p.eliminated ? 'eliminated' : 'pending';
    p.lastRoundPoints = 0;
    p.handGroups = []; // Reset groups for the round
    if (!p.eliminated) {
      for (let i = 0; i < 13; i++) {
        p.cards.push(room.deck.pop());
      }
    }
  }

  // 3. Draw a Wild Joker card
  room.wildJokerCard = room.deck.pop();
  if (room.wildJokerCard.isPrintedJoker || room.wildJokerCard.suit === 'J') {
    room.wildJokerValue = 1;
  } else {
    room.wildJokerValue = room.wildJokerCard.value;
  }

  // 4. Open Discard Pile
  room.discardPile = [room.deck.pop()];

  // Set first active player turnIndex (Randomized among active players)
  const activeIndices = [];
  for (let i = 0; i < room.players.length; i++) {
    if (!room.players[i].eliminated) {
      activeIndices.push(i);
    }
  }
  if (activeIndices.length > 0) {
    const randomIdx = Math.floor(Math.random() * activeIndices.length);
    room.turnIndex = activeIndices[randomIdx];
  } else {
    room.turnIndex = 0;
  }

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
  moveToNextActivePlayer(room);
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
    activePlayer.declareStatus = 'valid';
    activePlayer.lastRoundPoints = 0;
    activePlayer.handGroups = groups; // Save winner groups

    // Put declare card on top of discard pile
    room.discardPile.push(declareCard);

    // Stop normal turn timer
    if (room.timerId) {
      clearInterval(room.timerId);
      room.timerId = null;
    }

    // Start 30-second Scoring Phase
    room.scoringWinner = activePlayer.username;
    room.scoringActive = true;
    room.scoringTimeLeft = 30;

    // Initialize declareStatus for other players
    for (let p of room.players) {
      if (p.id !== socketId) {
        p.declareStatus = p.eliminated ? 'eliminated' : 'pending';
      }
    }

    room.scoringTimerId = setInterval(() => {
      room.scoringTimeLeft--;
      io.to(room.roomCode).emit('scoring_timer_tick', { timeLeft: room.scoringTimeLeft });

      if (room.scoringTimeLeft <= 0) {
        clearInterval(room.scoringTimerId);
        room.scoringTimerId = null;
        endScoringPhase(room, io);
      }
    }, 1000);

    // Trigger auto-submission for bots after a short delay
    for (let p of room.players) {
      if (p.isBot && p.username !== room.scoringWinner && !p.eliminated) {
        setTimeout(() => {
          if (room.scoringActive) {
            const botGroups = arrangeHandIntoGroups(p.cards, room.wildJokerValue);
            submitLosingHand(room.roomCode, p.id, botGroups, io);
          }
        }, 1000);
      }
    }

    // Check if everyone has already submitted (e.g., in bot-only lobbies or small lobbies)
    if (checkAllLosingHandsSubmitted(room)) {
      if (room.scoringTimerId) {
        clearInterval(room.scoringTimerId);
        room.scoringTimerId = null;
      }
      setTimeout(() => {
        if (room.scoringActive) {
          endScoringPhase(room, io);
        }
      }, 1000);
    }

    // Update room state
    broadcastRoomState(room, io);
    return { success: true, valid: true };
  } else {
    // FAILED DECLARE - Wrong Show (80 points penalty)
    console.log(`[Invalid Declare] Player ${activePlayer.username} failed declare: ${validation.reason}`);
    room.winner = null;
    room.roundEnded = true;
    activePlayer.declareStatus = 'invalid';
    activePlayer.lastRoundPoints = 80;
    activePlayer.score += 80;
    activePlayer.handGroups = groups; // Save wrong show groups

    // Refund the declare card back to the hand so we can show their cards correctly
    activePlayer.cards.push(declareCard);

    // Put declare card on top of discard pile
    room.discardPile.push(declareCard);

    // Calculate score points for other players (they get points for their current hands, but auto-grouped for fairness)
    for (let p of room.players) {
      if (p.id !== socketId) {
        if (p.eliminated) {
          p.lastRoundPoints = 0;
          p.handGroups = [];
          p.declareStatus = 'eliminated';
        } else {
          const bestGroups = arrangeHandIntoGroups(p.cards, room.wildJokerValue);
          const points = calculateHandScore(bestGroups, room.wildJokerValue);
          p.lastRoundPoints = points;
          p.score += points;
          p.declareStatus = 'pending';
          p.handGroups = bestGroups;
        }
      }
    }

    // Stop turn timer
    if (room.timerId) {
      clearInterval(room.timerId);
      room.timerId = null;
    }

    // Run tournament level elimination checking
    checkMatchEliminations(room);

    // Update room state
    broadcastRoomState(room, io);

    return { success: true, valid: false, reason: validation.reason };
  }
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

  // If game is active and in scoring phase, check if this disconnect allows scoring phase to end
  if (room.scoringActive) {
    if (checkAllLosingHandsSubmitted(room)) {
      if (room.scoringTimerId) {
        clearInterval(room.scoringTimerId);
        room.scoringTimerId = null;
      }
      endScoringPhase(room, io);
    }
  }

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

    // If it was their turn, skip it or adjust active index
    if (room.gameStarted && !room.roundEnded && (room.turnIndex >= room.players.length || room.players[room.turnIndex].eliminated)) {
      let firstActiveIdx = room.players.findIndex(p => !p.eliminated);
      room.turnIndex = firstActiveIdx !== -1 ? firstActiveIdx : 0;
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

/**
 * Spawns a virtual player (bot) inside the room
 */
function addBot(roomCode) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    return { error: 'Room not found.' };
  }

  if (room.gameStarted) {
    return { error: 'The game has already started in this room.' };
  }

  if (room.players.length >= 6) {
    return { error: 'Room is full (max 6 players).' };
  }

  const botNames = ['AlphaBot', 'BetaBot', 'GammaBot', 'DeltaBot', 'OmegaBot', 'ZetaBot', 'SigmaBot', 'KappaBot'];
  let botName = '';
  for (let name of botNames) {
    if (!room.players.some(p => p.username === name)) {
      botName = name;
      break;
    }
  }
  if (!botName) {
    botName = `Bot_${Math.floor(Math.random() * 1000)}`;
  }

  const botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
  const botPlayer = {
    id: botId,
    username: botName,
    isAdmin: false,
    connected: true,
    isBot: true,
    score: 0,
    lastRoundPoints: 0,
    declareStatus: 'pending',
    eliminated: false,
    handGroups: [],
    cards: []
  };

  room.players.push(botPlayer);
  return { success: true, room };
}

/**
 * Heuristic to determine if a discard card is useful to draw
 */
function isDiscardCardUseful(discardCard, hand, wildJokerValue) {
  if (isJoker(discardCard, wildJokerValue)) return true;

  for (let card of hand) {
    if (isJoker(card, wildJokerValue)) continue;
    // Set candidate
    if (card.value === discardCard.value) return true;
    // Sequence candidate (same suit, difference in value <= 2)
    if (card.suit === discardCard.suit && Math.abs(card.value - discardCard.value) <= 2) {
      return true;
    }
  }
  return false;
}

/**
 * Groups a hand of cards greedily into sequences and sets
 */
function arrangeHandIntoGroups(cards, wildJokerValue) {
  const jokers = [];
  const normalCards = [];
  for (let card of cards) {
    if (isJoker(card, wildJokerValue)) {
      jokers.push(card);
    } else {
      normalCards.push(card);
    }
  }

  const suitGroups = { H: [], D: [], C: [], S: [] };
  for (let card of normalCards) {
    if (suitGroups[card.suit]) {
      suitGroups[card.suit].push(card);
    }
  }

  for (let suit in suitGroups) {
    suitGroups[suit].sort((a, b) => a.value - b.value);
  }

  const finalGroups = [];
  const remainingCards = [];

  // Find pure sequences
  for (let suit in suitGroups) {
    const list = suitGroups[suit];
    if (list.length === 0) continue;

    let i = 0;
    while (i < list.length) {
      let run = [list[i]];
      let j = i + 1;
      while (j < list.length) {
        const lastVal = run[run.length - 1].value;
        const nextVal = list[j].value;
        if (nextVal === lastVal + 1) {
          run.push(list[j]);
          j++;
        } else if (nextVal === lastVal) {
          remainingCards.push(list[j]);
          j++;
        } else {
          break;
        }
      }

      if (run.length >= 3) {
        finalGroups.push(run);
        i = j;
      } else {
        for (let c of run) {
          remainingCards.push(c);
        }
        i = j;
      }
    }
  }

  // Find sets
  const valueGroups = {};
  for (let card of remainingCards) {
    if (!valueGroups[card.value]) {
      valueGroups[card.value] = [];
    }
    valueGroups[card.value].push(card);
  }

  const stillRemaining = [];
  for (let val in valueGroups) {
    const list = valueGroups[val];
    const uniqueSuitCards = [];
    const suitsSeen = new Set();
    const duplicates = [];
    for (let card of list) {
      if (!suitsSeen.has(card.suit)) {
        suitsSeen.add(card.suit);
        uniqueSuitCards.push(card);
      } else {
        duplicates.push(card);
      }
    }

    if (uniqueSuitCards.length >= 3) {
      finalGroups.push(uniqueSuitCards);
      stillRemaining.push(...duplicates);
    } else {
      stillRemaining.push(...list);
    }
  }

  // Match impure sequences using jokers
  stillRemaining.sort((a, b) => {
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.value - b.value;
  });

  let rIdx = 0;
  while (rIdx < stillRemaining.length - 1 && jokers.length > 0) {
    const c1 = stillRemaining[rIdx];
    const c2 = stillRemaining[rIdx + 1];
    if (c1.suit === c2.suit && (c2.value - c1.value === 1 || c2.value - c1.value === 2)) {
      const jok = jokers.pop();
      finalGroups.push([c1, c2, jok]);
      stillRemaining.splice(rIdx, 2);
    } else {
      rIdx++;
    }
  }

  // Match impure sets using jokers
  const valGroupsRemaining = {};
  for (let card of stillRemaining) {
    if (!valGroupsRemaining[card.value]) {
      valGroupsRemaining[card.value] = [];
    }
    valGroupsRemaining[card.value].push(card);
  }

  for (let val in valGroupsRemaining) {
    const list = valGroupsRemaining[val];
    const uniqueSuitCards = [];
    const suitsSeen = new Set();
    for (let card of list) {
      if (!suitsSeen.has(card.suit)) {
        suitsSeen.add(card.suit);
        uniqueSuitCards.push(card);
      }
    }
    if (uniqueSuitCards.length === 2 && jokers.length > 0) {
      const jok = jokers.pop();
      finalGroups.push([...uniqueSuitCards, jok]);
      for (let uc of uniqueSuitCards) {
        const idx = stillRemaining.findIndex(c => c.id === uc.id);
        if (idx !== -1) {
          stillRemaining.splice(idx, 1);
        }
      }
    }
  }

  // Distribute leftover jokers
  while (jokers.length > 0) {
    const jok = jokers.pop();
    let appended = false;
    for (let g of finalGroups) {
      if (g.length < 4) {
        g.push(jok);
        appended = true;
        break;
      }
    }
    if (!appended) {
      stillRemaining.push(jok);
    }
  }

  // Package leftovers
  if (stillRemaining.length > 0) {
    finalGroups.push(stillRemaining);
  }

  return finalGroups;
}

/**
 * Checks if a bot can declare by discarding exactly 1 card
 */
function checkBotCanDeclare(cards, wildJokerValue) {
  for (let i = 0; i < cards.length; i++) {
    const discardCard = cards[i];
    const remainingCards = cards.filter((_, idx) => idx !== i);
    const groups = arrangeHandIntoGroups(remainingCards, wildJokerValue);
    const validation = validateDeclare(groups, wildJokerValue);
    if (validation.valid) {
      return { canDeclare: true, discardCardId: discardCard.id, groups };
    }
  }
  return { canDeclare: false };
}

/**
 * Heuristically picks the best card to discard for the bot
 */
function botChooseDiscard(cards, wildJokerValue) {
  let bestCard = null;
  let minScore = Infinity;
  let maxDiscardPoints = -1;

  for (let i = 0; i < cards.length; i++) {
    const candidate = cards[i];
    const candidateIsJoker = isJoker(candidate, wildJokerValue);

    const remaining = cards.filter((_, idx) => idx !== i);
    const groups = arrangeHandIntoGroups(remaining, wildJokerValue);
    const score = calculateHandScore(groups, wildJokerValue);

    const discardPoints = getCardPoints(candidate, wildJokerValue);

    let isBetter = false;
    if (score < minScore) {
      isBetter = true;
    } else if (score === minScore) {
      if (bestCard) {
        const bestIsJoker = isJoker(bestCard, wildJokerValue);
        if (bestIsJoker && !candidateIsJoker) {
          isBetter = true;
        } else if (!bestIsJoker && candidateIsJoker) {
          isBetter = false;
        } else {
          if (discardPoints > maxDiscardPoints) {
            isBetter = true;
          }
        }
      } else {
        isBetter = true;
      }
    }

    if (isBetter) {
      minScore = score;
      maxDiscardPoints = discardPoints;
      bestCard = candidate;
    }
  }

  return bestCard;
}

/**
 * Simulates a bot player's turn (async delay, drawing, and discard/declaring)
 */
function triggerBotTurn(room, botPlayer, io) {
  const activePlayer = room.players[room.turnIndex];
  if (!activePlayer || activePlayer.id !== botPlayer.id || !room.gameStarted || room.roundEnded || room.scoringActive) {
    return;
  }

  console.log(`[Bot Turn] Starting turn for ${botPlayer.username} in room ${room.roomCode}`);

  // Step 1: Draw Card after delay
  setTimeout(() => {
    if (!room.gameStarted || room.roundEnded || room.scoringActive || room.players[room.turnIndex].id !== botPlayer.id) return;
    if (room.turnState !== 'draw') return;

    const topDiscardCard = room.discardPile[room.discardPile.length - 1];
    let drawSource = 'deck';

    if (topDiscardCard && isDiscardCardUseful(topDiscardCard, botPlayer.cards, room.wildJokerValue)) {
      drawSource = 'discard';
    }

    console.log(`[Bot Turn] ${botPlayer.username} drawing from ${drawSource}`);
    drawCard(room.roomCode, botPlayer.id, drawSource, io);

    // Step 2: Discard or Declare after delay
    setTimeout(() => {
      if (!room.gameStarted || room.roundEnded || room.scoringActive || room.players[room.turnIndex].id !== botPlayer.id) return;
      if (room.turnState !== 'discard') return;

      const declareCheck = checkBotCanDeclare(botPlayer.cards, room.wildJokerValue);
      if (declareCheck.canDeclare) {
        console.log(`[Bot Turn] ${botPlayer.username} declaring!`);
        declareHand(room.roomCode, botPlayer.id, declareCheck.groups, declareCheck.discardCardId, io);
      } else {
        const cardToDiscard = botChooseDiscard(botPlayer.cards, room.wildJokerValue);
        if (cardToDiscard) {
          console.log(`[Bot Turn] ${botPlayer.username} discarding card: ${cardToDiscard.suit}-${cardToDiscard.value}`);
          discardCard(room.roomCode, botPlayer.id, cardToDiscard.id, io);
        } else {
          const fallbackCard = botPlayer.cards[botPlayer.cards.length - 1];
          discardCard(room.roomCode, botPlayer.id, fallbackCard.id, io);
        }
      }
    }, 1500);

  }, 1500);
}

/**
 * Submits the losing player's grouped cards during the scoring phase
 */
function submitLosingHand(roomCode, playerId, groups, io) {
  const room = rooms.get(roomCode);
  if (!room || !room.scoringActive) {
    return { error: 'Scoring phase is not active.' };
  }

  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return { error: 'Player not found.' };
  }

  if (player.username === room.scoringWinner) {
    return { error: 'Winner does not need to submit hand.' };
  }

  if (player.declareStatus === 'submitted') {
    return { error: 'Hand already submitted.' };
  }

  const points = calculateHandScore(groups, room.wildJokerValue);
  player.lastRoundPoints = points;
  player.score += points;
  player.declareStatus = 'submitted';
  player.handGroups = groups; // Save losing grouped cards

  console.log(`[Hand Submitted] Player ${player.username} scored ${points} points.`);

  if (checkAllLosingHandsSubmitted(room)) {
    if (room.scoringTimerId) {
      clearInterval(room.scoringTimerId);
      room.scoringTimerId = null;
    }
    endScoringPhase(room, io);
  } else {
    broadcastRoomState(room, io);
  }

  return { success: true };
}

/**
 * Checks if all connected players in the lobby have submitted their losing hands
 */
function checkAllLosingHandsSubmitted(room) {
  for (let player of room.players) {
    if (player.username !== room.scoringWinner && player.connected && !player.eliminated && player.declareStatus === 'pending') {
      return false;
    }
  }
  return true;
}

/**
 * Concludes the scoring phase and transitions room to roundEnded state
 */
function endScoringPhase(room, io) {
  room.scoringActive = false;
  room.roundEnded = true;

  for (let p of room.players) {
    if (p.username !== room.scoringWinner && p.declareStatus !== 'submitted' && p.declareStatus !== 'valid') {
      if (p.eliminated) {
        p.lastRoundPoints = 0;
        p.handGroups = [];
        p.declareStatus = 'eliminated';
      } else {
        const bestGroups = arrangeHandIntoGroups(p.cards, room.wildJokerValue);
        const points = calculateHandScore(bestGroups, room.wildJokerValue);
        p.lastRoundPoints = points;
        p.score += points;
        p.declareStatus = 'timeout';
        p.handGroups = bestGroups;
      }
    }
  }

  if (room.scoringTimerId) {
    clearInterval(room.scoringTimerId);
    room.scoringTimerId = null;
  }

  // Run tournament level elimination checking
  checkMatchEliminations(room);

  console.log(`[Scoring Phase Ended] Round ended for room ${room.roomCode}.`);
  broadcastRoomState(room, io);
}

/**
 * Checks players' total scores and runs tournament elimination rules
 */
function checkMatchEliminations(room) {
  for (let p of room.players) {
    if (!p.eliminated && p.score >= 240) {
      p.eliminated = true;
      console.log(`[Elimination] Player ${p.username} eliminated with score ${p.score}`);
    }
  }

  const activePlayers = room.players.filter(p => !p.eliminated);

  if (activePlayers.length === 1) {
    room.matchFinished = true;
    room.matchWinner = activePlayers[0].username;
    console.log(`[Match Finished] Winner is ${room.matchWinner}`);
  } else if (activePlayers.length === 0) {
    // Edge case: all active players crossed 240 in the same round
    // Winner is the player with the lowest score
    let bestPlayer = null;
    let lowestScore = Infinity;
    for (let p of room.players) {
      if (p.score < lowestScore) {
        lowestScore = p.score;
        bestPlayer = p;
      }
    }
    room.matchFinished = true;
    room.matchWinner = bestPlayer ? bestPlayer.username : null;
    console.log(`[Match Finished] (All eliminated) Winner is ${room.matchWinner} with score ${lowestScore}`);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  drawCard,
  discardCard,
  declareHand,
  restartGame,
  handleDisconnect,
  addBot,
  submitLosingHand,
  broadcastRoomState
};
