// gameLogic.js - Core Indian Rummy Card Logic and Hand Validation

/**
 * Creates 2 standard decks of 52 cards each, plus 4 printed jokers (2 per deck).
 * Total cards = 108.
 * Card structure:
 * {
 *   id: string,          // Unique ID: suit-value-deckNum-copy
 *   suit: 'H'|'D'|'C'|'S'|'J', // Hearts, Diamonds, Clubs, Spades, Joker
 *   value: number,       // 1 (Ace) to 13 (King). 0 for Printed Joker
 *   isPrintedJoker: boolean
 * }
 */
function createDeck() {
  const suits = ['H', 'D', 'C', 'S'];
  const deck = [];

  // Add 2 decks of 52 cards
  for (let deckNum = 1; deckNum <= 2; deckNum++) {
    for (let suit of suits) {
      for (let value = 1; value <= 13; value++) {
        deck.push({
          id: `${suit}-${value}-${deckNum}`,
          suit,
          value,
          isPrintedJoker: false
        });
      }
    }
    // Add 2 printed jokers per deck
    for (let jokerNum = 1; jokerNum <= 2; jokerNum++) {
      deck.push({
        id: `J-0-${deckNum}-${jokerNum}`,
        suit: 'J',
        value: 0,
        isPrintedJoker: true
      });
    }
  }

  return deck;
}

/**
 * Shuffles deck using Fisher-Yates algorithm
 */
function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Checks if a specific card acts as a Joker.
 * A card is a joker if:
 * 1. It is a Printed Joker (suit is 'J').
 * 2. It has the same rank/value as the Wild Joker rank.
 */
function isJoker(card, wildJokerValue) {
  if (card.isPrintedJoker || card.suit === 'J') return true;
  if (card.value === wildJokerValue) return true;
  return false;
}

/**
 * Calculates point value of a single card.
 * In Rummy:
 * - Jokers (wild and printed) = 0 points.
 * - Aces (value 1) = 10 points.
 * - Face cards (J=11, Q=12, K=13) = 10 points.
 * - Number cards (2 to 10) = face value points.
 */
function getCardPoints(card, wildJokerValue) {
  if (isJoker(card, wildJokerValue)) return 0;
  if (card.value === 1) return 10; // Ace
  if (card.value >= 10) return 10; // 10, J, Q, K
  return card.value;
}

/**
 * Validates whether a group of cards forms a PURE SEQUENCE.
 * Rules:
 * - At least 3 cards.
 * - All cards must have the same suit (which cannot be 'J').
 * - No printed jokers.
 * - No wild jokers of a different suit.
 * - Wild jokers of the same suit are allowed, but only in their natural rank position.
 * - Ranks must be consecutive (Ace can be 1 or 14, i.e., A-2-3 or Q-K-A).
 */
function isValidSequencePure(group) {
  if (group.length < 3) return false;

  const suit = group[0].suit;
  if (suit === 'J') return false;

  // All must be of the same suit and no printed jokers
  for (let card of group) {
    if (card.suit !== suit) return false;
    if (card.isPrintedJoker || card.suit === 'J') return false;
  }

  const ranks = group.map(c => c.value);

  // Helper to check if values are consecutive
  const isConsecutive = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] !== sorted[i] + 1) return false;
    }
    return true;
  };

  // Check Ace as 1
  if (isConsecutive(ranks)) return true;

  // Check Ace as 14 if Ace is present
  if (ranks.includes(1)) {
    const ranksAceHigh = ranks.map(v => v === 1 ? 14 : v);
    if (isConsecutive(ranksAceHigh)) return true;
  }

  return false;
}

/**
 * Validates whether a group of cards forms an IMPURE SEQUENCE.
 * Rules:
 * - At least 3 cards.
 * - Can contain printed and wild jokers.
 * - Must have at least 1 non-joker to determine the suit.
 * - All non-joker cards must have the same suit.
 * - After replacing jokers with appropriate cards, ranks must be consecutive.
 * - No duplicate ranks among non-jokers (after resolving Aces).
 */
function isValidSequenceImpure(group, wildJokerValue) {
  if (group.length < 3) return false;

  const jokers = [];
  const nonJokers = [];

  for (let card of group) {
    if (isJoker(card, wildJokerValue)) {
      jokers.push(card);
    } else {
      nonJokers.push(card);
    }
  }

  // If no non-jokers, we cannot establish a suit, so not a sequence.
  if (nonJokers.length === 0) return false;

  const suit = nonJokers[0].suit;
  if (suit === 'J') return false;

  // All non-jokers must share the same suit
  for (let card of nonJokers) {
    if (card.suit !== suit) return false;
  }

  const numJokers = jokers.length;

  const checkConsecutiveWithAce = (aceVal) => {
    const ranks = nonJokers.map(c => c.value === 1 ? aceVal : c.value);

    // Check duplicate ranks (e.g. 7H-7H-Joker is invalid)
    const uniqueRanks = new Set(ranks);
    if (uniqueRanks.size !== ranks.length) return false;

    const sorted = [...ranks].sort((a, b) => a - b);
    const k = sorted.length;

    // Calculate sum of gaps between consecutive ranks
    let gaps = 0;
    for (let i = 0; i < k - 1; i++) {
      gaps += (sorted[i + 1] - sorted[i] - 1);
    }

    // Do we have enough jokers to fill the gaps?
    if (numJokers < gaps) return false;

    const total = k + numJokers;
    if (total > 13) return false; // Max sequence size is 13 (A to K)

    const minLimit = aceVal === 1 ? 1 : 2;
    const maxLimit = aceVal === 1 ? 13 : 14;

    const s1 = sorted[0];
    const sk = sorted[k - 1];

    // Check if the sequence of length 'total' covering [s1, sk] fits in boundaries
    const minStart = Math.max(minLimit, sk - total + 1);
    const maxStart = Math.min(s1, maxLimit - total + 1);

    return minStart <= maxStart;
  };

  // Try Ace as 1
  if (checkConsecutiveWithAce(1)) return true;

  // Try Ace as 14 (if Ace is in non-jokers)
  if (nonJokers.some(c => c.value === 1)) {
    if (checkConsecutiveWithAce(14)) return true;
  }

  return false;
}

/**
 * Validates whether a group forms a valid SET.
 * Rules:
 * - At least 3 cards (normally 3 or 4 cards).
 * - Can contain jokers.
 * - If non-jokers exist, they must all have the same rank/value.
 * - Non-jokers must have unique suits (no duplicate suits, e.g. 7H-7H-7D is invalid).
 */
function isValidSet(group, wildJokerValue) {
  if (group.length < 3) return false;

  const jokers = [];
  const nonJokers = [];

  for (let card of group) {
    if (isJoker(card, wildJokerValue)) {
      jokers.push(card);
    } else {
      nonJokers.push(card);
    }
  }

  // All jokers is a valid set
  if (nonJokers.length === 0) return true;

  const value = nonJokers[0].value;
  const suits = new Set();

  for (let card of nonJokers) {
    if (card.value !== value) return false;
    if (suits.has(card.suit)) return false; // Duplicate suit not allowed in a set
    suits.add(card.suit);
  }

  // A set can have at most 4 suits (H, D, C, S)
  if (nonJokers.length > 4) return false;

  return true;
}

/**
 * Validates a complete hand declare.
 * A hand must have exactly 13 cards grouped in sets/sequences.
 * Minimum requirements:
 * 1. At least one Pure Sequence.
 * 2. At least two sequences in total (pure or impure).
 * 3. All groups must be valid (either pure sequence, impure sequence, or set).
 */
function validateDeclare(groups, wildJokerValue) {
  // 1. Check total number of cards is 13
  let totalCards = 0;
  for (let g of groups) {
    totalCards += g.length;
  }

  if (totalCards !== 13) {
    return { valid: false, reason: `Invalid card count. A declared hand must have exactly 13 cards. Found ${totalCards}.` };
  }

  let pureSeqCount = 0;
  let seqCount = 0;

  // 2. Validate each group and tally sequences
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.length < 3) {
      return { valid: false, reason: `Group ${i + 1} has only ${g.length} cards. Every group must have at least 3 cards.` };
    }

    const isPure = isValidSequencePure(g);
    const isImpure = isValidSequenceImpure(g, wildJokerValue);
    const isSet = isValidSet(g, wildJokerValue);

    if (isPure) {
      pureSeqCount++;
      seqCount++;
    } else if (isImpure) {
      seqCount++;
    } else if (!isSet) {
      return { valid: false, reason: `Group ${i + 1} is invalid. It is not a valid sequence or set.` };
    }
  }

  // 3. Check sequence count constraints
  if (pureSeqCount < 1) {
    return { valid: false, reason: "Declaration invalid. You must have at least one Pure Sequence (no jokers)." };
  }

  if (seqCount < 2) {
    return { valid: false, reason: "Declaration invalid. You must have at least two sequences (one pure, plus one other sequence)." };
  }

  return { valid: true };
}

/**
 * Calculates score for a player's hand.
 * Rules:
 * - If the declaration is valid, the score is 0.
 * - If the player does not have at least one pure sequence AND at least one other sequence (pure or impure):
 *   - The player gets the maximum penalty of 80 points.
 * - If they do meet the minimum requirement:
 *   - Any valid group (pure seq, impure seq, or set) counts as 0 points.
 *   - Any invalid group counts as the sum of its card point values.
 *   - The total score is capped at 80 points.
 */
function calculateHandScore(groups, wildJokerValue) {
  // Check minimum requirement: 1 pure sequence + 1 other sequence (pure or impure)
  let pureSeqCount = 0;
  let seqCount = 0;

  for (let g of groups) {
    if (g.length >= 3) {
      if (isValidSequencePure(g)) {
        pureSeqCount++;
        seqCount++;
      } else if (isValidSequenceImpure(g, wildJokerValue)) {
        seqCount++;
      }
    }
  }

  // If minimum requirements not met, maximum penalty of 80 points.
  if (pureSeqCount < 1 || seqCount < 2) {
    return 80;
  }

  let totalScore = 0;

  for (let g of groups) {
    const isPure = g.length >= 3 && isValidSequencePure(g);
    const isImpure = g.length >= 3 && isValidSequenceImpure(g, wildJokerValue);
    const isSet = g.length >= 3 && isValidSet(g, wildJokerValue);

    // If it's a valid group, it scores 0. Otherwise, count points of all cards in it.
    if (isPure || isImpure || isSet) {
      continue;
    } else {
      for (let card of g) {
        totalScore += getCardPoints(card, wildJokerValue);
      }
    }
  }

  return Math.min(80, totalScore);
}

module.exports = {
  createDeck,
  shuffle,
  isJoker,
  getCardPoints,
  isValidSequencePure,
  isValidSequenceImpure,
  isValidSet,
  validateDeclare,
  calculateHandScore
};
