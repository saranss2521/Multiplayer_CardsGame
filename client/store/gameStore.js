// gameStore.js - Zustand State Store with Socket.IO Integration for Rummy Frontend
import { create } from 'zustand';
import { io } from 'socket.io-client';

// Helper to group raw cards by Suit and sort them by value
function autoSortCards(cards) {
  const suits = { 'H': [], 'D': [], 'C': [], 'S': [], 'J': [] };
  
  // Distribute into suit buckets
  cards.forEach(card => {
    const suitKey = card.isPrintedJoker ? 'J' : card.suit;
    if (suits[suitKey]) {
      suits[suitKey].push(card);
    } else {
      suits['J'].push(card);
    }
  });

  // Sort each bucket by value (1 to 13, printed jokers = 0)
  Object.keys(suits).forEach(key => {
    suits[key].sort((a, b) => a.value - b.value);
  });

  // Filter out empty groups and return as array of arrays
  return Object.values(suits).filter(group => group.length > 0);
}

export const useGameStore = create((set, get) => ({
  // Socket.IO States
  socket: null,
  connected: false,
  username: null,
  roomCode: null,
  isAdmin: false,
  
  // Game Play States
  players: [],
  gameStarted: false,
  roundEnded: false,
  turnIndex: 0,
  turnState: 'draw', // 'draw' or 'discard'
  timeLeft: 60,
  wildJokerCard: null,
  wildJokerValue: 0,
  deckCount: 0,
  discardPile: [],
  winner: null,
  error: null,
  
  // Local UI States
  myHandGroups: [], // Array of Arrays of Cards: [[card1, card2], [card3, card4, card5], ...]
  selectedCardIds: [], // Currently selected card IDs in player's hand
  isDeclaring: false, // Whether the player is in declaring screen mode
  soundMuted: false, // Whether gameplay audio is muted
  
  // Scoring Phase States
  scoringActive: false,
  scoringWinner: null,
  scoringTimeLeft: 0,
  hasSubmittedLosingHand: false,

  // Tournament/Match States
  matchFinished: false,
  matchWinner: null,
  
  // Reset all states
  resetStore: () => {
    set({
      roomCode: null,
      isAdmin: false,
      players: [],
      gameStarted: false,
      roundEnded: false,
      turnIndex: 0,
      turnState: 'draw',
      timeLeft: 60,
      wildJokerCard: null,
      wildJokerValue: 0,
      deckCount: 0,
      discardPile: [],
      winner: null,
      myHandGroups: [],
      selectedCardIds: [],
      isDeclaring: false,
      scoringActive: false,
      scoringWinner: null,
      scoringTimeLeft: 0,
      hasSubmittedLosingHand: false,
      matchFinished: false,
      matchWinner: null
    });
  },

  // Connects socket and registers event listeners
  connectSocket: (serverUrl) => {
    const existingSocket = get().socket;
    if (existingSocket) {
      existingSocket.disconnect();
    }

    const socketInstance = io(serverUrl, {
      transports: ['polling', 'websocket'], // polling first for Android release build compatibility
      upgrade: true,                        // then upgrade to websocket once connected
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socketInstance.on('connect', () => {
      set({ socket: socketInstance, connected: true });
      console.log('Socket connected to backend:', serverUrl);
    });

    socketInstance.on('disconnect', () => {
      set({ connected: false });
    });

    // Real-Time Events
    
    // Timer seconds ticking
    socketInstance.on('timer_tick', ({ timeLeft }) => {
      set({ timeLeft });
    });

    // Receive updated state from server
    socketInstance.on('game_state_update', (state) => {
      const { myHandGroups, gameStarted: prevGameStarted, roundEnded: prevRoundEnded } = get();
      
      // Find current player cards from state
      const myState = state.players.find(p => p.id === socketInstance.id);
      let updatedHandGroups = [...myHandGroups];

      if (myState && myState.cards) {
        const newCards = myState.cards;
        
        // Flatten current client groups to check if card set changed
        const currentCardIds = myHandGroups.flat().map(c => c.id).sort().join(',');
        const newCardIds = newCards.map(c => c.id).sort().join(',');

        // Check if game or round just started/restarted
        const isNewGameOrRound = state.gameStarted && (!prevGameStarted || prevRoundEnded);

        if (isNewGameOrRound) {
          // Fresh start: Place all cards in a single group (no automatic grouping by suit)
          updatedHandGroups = [newCards];
        } else if (currentCardIds !== newCardIds) {
          // If the card list actually changed (e.g. card drawn/discarded)
          if (myHandGroups.length === 0) {
            updatedHandGroups = [newCards];
          } else if (state.roundEnded || !state.gameStarted) {
            // End of round / not started: Auto-sort cards into suit groups
            updatedHandGroups = autoSortCards(newCards);
          } else {
            // Update existing groupings incrementally to preserve player ordering
            const currentFlat = myHandGroups.flat();
            
            // 1. Remove cards that are no longer in our hand (discarded)
            updatedHandGroups = updatedHandGroups.map(group => 
              group.filter(card => newCards.some(nc => nc.id === card.id))
            ).filter(group => group.length > 0);

            // 2. Identify and add newly drawn cards
            const addedCards = newCards.filter(nc => !currentFlat.some(cc => cc.id === nc.id));
            if (addedCards.length > 0) {
              // Add new cards to a new group or append to the last group
              if (updatedHandGroups.length > 0) {
                updatedHandGroups[updatedHandGroups.length - 1] = [
                  ...updatedHandGroups[updatedHandGroups.length - 1],
                  ...addedCards
                ];
              } else {
                updatedHandGroups = [addedCards];
              }
            }
          }
        }
      }

      // Reset submission when a fresh round/game starts or is running normally without scoring active
      const isFreshRound = state.gameStarted && !state.roundEnded && !state.scoringActive;

      set({
        roomCode: state.roomCode,
        gameStarted: state.gameStarted,
        roundEnded: state.roundEnded,
        turnIndex: state.turnIndex,
        turnState: state.turnState,
        timeLeft: state.timeLeft !== undefined ? state.timeLeft : get().timeLeft,
        wildJokerCard: state.wildJokerCard,
        wildJokerValue: state.wildJokerValue,
        deckCount: state.deckCount,
        discardPile: state.discardPile,
        winner: state.winner,
        players: state.players,
        myHandGroups: updatedHandGroups,
        isDeclaring: state.roundEnded ? false : get().isDeclaring,
        
        // Scoring sync
        scoringActive: state.scoringActive || false,
        scoringWinner: state.scoringWinner || null,
        scoringTimeLeft: state.scoringTimeLeft || 0,
        hasSubmittedLosingHand: isFreshRound ? false : get().hasSubmittedLosingHand,

        // Match sync
        matchFinished: state.matchFinished || false,
        matchWinner: state.matchWinner || null
      });
    });

    socketInstance.on('card_drawn', ({ card, source }) => {
      // Opt-in animation trigger or quick update
      console.log(`Drawn card ${card.suit}-${card.value} from ${source}`);
    });

    socketInstance.on('card_discarded', ({ player, card }) => {
      console.log(`${player} discarded ${card.suit}-${card.value}`);
    });

    socketInstance.on('player_disconnected_status', ({ username }) => {
      set({ error: `${username} disconnected! Waiting 60s for reconnect...` });
      setTimeout(() => set({ error: null }), 4000);
    });

    socketInstance.on('player_reconnected_status', ({ username }) => {
      set({ error: `${username} reconnected!` });
      setTimeout(() => set({ error: null }), 4000);
    });

    socketInstance.on('player_joined', ({ username }) => {
      set({ error: `${username} joined the lobby!` });
      setTimeout(() => set({ error: null }), 3000);
    });

    socketInstance.on('player_left', ({ username }) => {
      set({ error: `${username} left the room.` });
      setTimeout(() => set({ error: null }), 3000);
    });

    socketInstance.on('game_terminated', ({ reason }) => {
      set({ error: `Game ended: ${reason}` });
      setTimeout(() => {
        set({ error: null });
        get().resetStore();
      }, 5000);
    });
  },

  // Room Senders

  createRoom: (username, callback) => {
    const { socket, connected } = get();
    if (!socket || !connected) {
      const errMsg = 'Not connected to server. Check your connection ribbon at the top.';
      set({ error: errMsg });
      setTimeout(() => set({ error: null }), 5000);
      if (callback) callback({ error: errMsg });
      return;
    }
    
    socket.emit('create_room', { username }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
        if (callback) callback(res);
      } else {
        set({
          roomCode: res.roomCode,
          username: res.username,
          isAdmin: res.isAdmin,
          error: null
        });
        if (callback) callback(res);
      }
    });
  },

  playWithComputer: (username, callback) => {
    const { socket, connected } = get();
    console.log('[gameStore] playWithComputer called. Connected:', connected);
    if (!socket || !connected) {
      const errMsg = 'Not connected to server. Check your connection ribbon at the top.';
      set({ error: errMsg });
      setTimeout(() => set({ error: null }), 5000);
      if (callback) callback({ error: errMsg });
      return;
    }
    
    console.log('[gameStore] Emitting play_with_computer event...');
    socket.emit('play_with_computer', { username }, (res) => {
      console.log('[gameStore] play_with_computer response:', res);
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
        if (callback) callback(res);
      } else {
        set({
          roomCode: res.roomCode,
          username: res.username,
          isAdmin: res.isAdmin,
          gameStarted: true,
          error: null
        });
        if (callback) callback(res);
      }
    });
  },

  joinRoom: (roomCode, username, callback) => {
    const { socket, connected } = get();
    if (!socket || !connected) {
      const errMsg = 'Not connected to server. Check your connection ribbon at the top.';
      set({ error: errMsg });
      setTimeout(() => set({ error: null }), 5000);
      if (callback) callback({ error: errMsg });
      return;
    }

    socket.emit('join_room', { roomCode, username }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
        if (callback) callback(res);
      } else {
        set({
          roomCode: res.roomCode,
          username: res.username,
          isAdmin: res.isAdmin,
          error: null
        });
        if (callback) callback(res);
      }
    });
  },

  startGame: () => {
    const { socket, roomCode } = get();
    if (!socket || !roomCode) return;

    socket.emit('start_game', { roomCode }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
      }
    });
  },

  drawCard: (source) => {
    const { socket, roomCode } = get();
    if (!socket || !roomCode) return;

    socket.emit('draw_card', { roomCode, source }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 3000);
      }
    });
  },

  discardCard: (cardId) => {
    const { socket, roomCode } = get();
    if (!socket || !roomCode) return;

    socket.emit('discard_card', { roomCode, cardId }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 3000);
      } else {
        // Clear selection on discard
        set({ selectedCardIds: [] });
      }
    });
  },

  declareGame: (discardCardId, callback) => {
    const { socket, roomCode, myHandGroups } = get();
    if (!socket || !roomCode) return;

    // Filter out the declare/discard card from our groups when validating
    const cleanedGroups = myHandGroups.map(group =>
      group.filter(card => card.id !== discardCardId)
    ).filter(group => group.length > 0);

    socket.emit('declare_game', {
      roomCode,
      groups: cleanedGroups,
      discardCardId
    }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
        if (callback) callback(res);
      } else {
        set({ selectedCardIds: [], isDeclaring: false });
        if (callback) callback(res);
      }
    });
  },

  submitLosingHand: (callback) => {
    const { socket, roomCode, myHandGroups } = get();
    if (!socket || !roomCode) return;

    socket.emit('submit_losing_hand', {
      roomCode,
      groups: myHandGroups
    }, (res) => {
      if (res.success) {
        set({ hasSubmittedLosingHand: true });
        if (callback) callback(res);
      } else {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
        if (callback) callback(res);
      }
    });
  },

  restartGame: () => {
    const { socket, roomCode } = get();
    if (!socket || !roomCode) return;

    socket.emit('restart_game', { roomCode }, (res) => {
      if (res.error) {
        set({ error: res.error });
        setTimeout(() => set({ error: null }), 4000);
      }
    });
  },

  // Local Actions

  // Toggles card selection
  selectCard: (cardId) => {
    const { selectedCardIds, isDeclaring } = get();
    
    // In declare mode, we select exactly 1 card to discard/declare
    if (isDeclaring) {
      set({ selectedCardIds: [cardId] });
      return;
    }

    if (selectedCardIds.includes(cardId)) {
      set({ selectedCardIds: selectedCardIds.filter(id => id !== cardId) });
    } else {
      set({ selectedCardIds: [...selectedCardIds, cardId] });
    }
  },

  clearSelection: () => {
    set({ selectedCardIds: [] });
  },

  // Groups selected cards together
  groupSelectedCards: () => {
    const { myHandGroups, selectedCardIds } = get();
    if (selectedCardIds.length === 0) return;

    // Gather selected cards
    const flatHand = myHandGroups.flat();
    const selectedCards = flatHand.filter(card => selectedCardIds.includes(card.id));

    // Remove selected cards from their old positions
    const updatedGroups = myHandGroups.map(group =>
      group.filter(card => !selectedCardIds.includes(card.id))
    ).filter(group => group.length > 0);

    // Append as a new group
    updatedGroups.push(selectedCards);

    set({
      myHandGroups: updatedGroups,
      selectedCardIds: []
    });
  },

  // Re-sorts hand by Suit automatically
  sortHand: () => {
    const { myHandGroups } = get();
    const flatCards = myHandGroups.flat();
    set({
      myHandGroups: autoSortCards(flatCards),
      selectedCardIds: []
    });
  },

  // Moves a card from one group index to another
  moveCard: (cardId, targetGroupIndex, targetCardIndex) => {
    const { myHandGroups } = get();
    
    // Find and extract card
    let targetCard = null;
    const cleanedGroups = myHandGroups.map(group => {
      const idx = group.findIndex(c => c.id === cardId);
      if (idx !== -1) {
        targetCard = group[idx];
        return group.filter(c => c.id !== cardId);
      }
      return group;
    }).filter(group => group.length > 0);

    if (!targetCard) return;

    // If targetGroupIndex is out of range, create a new group
    if (targetGroupIndex >= cleanedGroups.length) {
      cleanedGroups.push([targetCard]);
    } else {
      // Insert card into target group at targetCardIndex
      const group = [...cleanedGroups[targetGroupIndex]];
      group.splice(targetCardIndex, 0, targetCard);
      cleanedGroups[targetGroupIndex] = group;
    }

    set({ myHandGroups: cleanedGroups });
  },

  setDeclaringMode: (enabled) => {
    set({ isDeclaring: enabled, selectedCardIds: [] });
  },

  toggleSoundMute: () => {
    set({ soundMuted: !get().soundMuted });
  },

  clearError: () => set({ error: null })
}));
