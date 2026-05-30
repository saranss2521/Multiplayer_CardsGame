// testValidator.js - Unit Tests for Indian Rummy Rule Validation and Scoring
const {
  isValidSequencePure,
  isValidSequenceImpure,
  isValidSet,
  validateDeclare,
  calculateHandScore
} = require('./gameLogic');

// Mock Wild Joker value (e.g., 8 is the Wild Joker)
const WILD_JOKER_VALUE = 8;

// Test helper to log results
function assert(name, condition, expected = true) {
  if (condition === expected) {
    console.log(`✅ [PASS] ${name}`);
    return true;
  } else {
    console.error(`❌ [FAIL] ${name} (Expected: ${expected}, Got: ${condition})`);
    return false;
  }
}

console.log('--- RUNNING RUMMY RULES TESTS ---');
let testsPassed = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    const success = fn();
    if (success) testsPassed++;
  } catch (err) {
    console.error(`❌ [ERROR] ${name}:`, err.message);
  }
}

// 1. Pure Sequence Tests
runTest('Pure Sequence - Valid Standard sequence (3H-4H-5H)', () => {
  const group = [
    { suit: 'H', value: 3, isPrintedJoker: false },
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'H', value: 5, isPrintedJoker: false }
  ];
  return assert('3H-4H-5H is pure', isValidSequencePure(group), true);
});

runTest('Pure Sequence - Invalid with Printed Joker', () => {
  const group = [
    { suit: 'H', value: 3, isPrintedJoker: false },
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'J', value: 0, isPrintedJoker: true }
  ];
  return assert('3H-4H-PJ is not pure', isValidSequencePure(group), false);
});

runTest('Pure Sequence - Invalid with Wild Joker of different suit', () => {
  const group = [
    { suit: 'H', value: 7, isPrintedJoker: false },
    { suit: 'S', value: 8, isPrintedJoker: false }, // Wild Joker (8 of Spades) representing 8 of Hearts
    { suit: 'H', value: 9, isPrintedJoker: false }
  ];
  return assert('7H-8S-9H is not pure', isValidSequencePure(group), false);
});

runTest('Pure Sequence - Valid with Wild Joker in its natural suit position', () => {
  const group = [
    { suit: 'H', value: 7, isPrintedJoker: false },
    { suit: 'H', value: 8, isPrintedJoker: false }, // 8 of Hearts is Wild Joker, but in natural position
    { suit: 'H', value: 9, isPrintedJoker: false }
  ];
  return assert('7H-8H-9H is pure (natural wild joker)', isValidSequencePure(group), true);
});

runTest('Pure Sequence - Valid Ace-high sequence (10H-JH-QH-KH-AH)', () => {
  const group = [
    { suit: 'H', value: 10, isPrintedJoker: false },
    { suit: 'H', value: 11, isPrintedJoker: false }, // J
    { suit: 'H', value: 12, isPrintedJoker: false }, // Q
    { suit: 'H', value: 13, isPrintedJoker: false }, // K
    { suit: 'H', value: 1,  isPrintedJoker: false }  // A
  ];
  return assert('10-J-Q-K-A is pure', isValidSequencePure(group), true);
});

runTest('Pure Sequence - Invalid looped Ace (KH-AH-2H)', () => {
  const group = [
    { suit: 'H', value: 13, isPrintedJoker: false },
    { suit: 'H', value: 1,  isPrintedJoker: false },
    { suit: 'H', value: 2,  isPrintedJoker: false }
  ];
  return assert('K-A-2 is not pure', isValidSequencePure(group), false);
});


// 2. Impure Sequence Tests
runTest('Impure Sequence - Valid with Printed Joker (3H-4H-PJ)', () => {
  const group = [
    { suit: 'H', value: 3, isPrintedJoker: false },
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'J', value: 0, isPrintedJoker: true }
  ];
  return assert('3H-4H-PJ is valid impure', isValidSequenceImpure(group, WILD_JOKER_VALUE), true);
});

runTest('Impure Sequence - Valid with Wild Joker (7H-8S-9H)', () => {
  const group = [
    { suit: 'H', value: 7, isPrintedJoker: false },
    { suit: 'S', value: 8, isPrintedJoker: false }, // Wild Joker
    { suit: 'H', value: 9, isPrintedJoker: false }
  ];
  return assert('7H-8S-9H is valid impure', isValidSequenceImpure(group, WILD_JOKER_VALUE), true);
});

runTest('Impure Sequence - Invalid with duplicate non-jokers (7H-7H-PJ)', () => {
  const group = [
    { suit: 'H', value: 7, isPrintedJoker: false },
    { suit: 'H', value: 7, isPrintedJoker: false },
    { suit: 'J', value: 0, isPrintedJoker: true }
  ];
  return assert('7H-7H-PJ is invalid impure (duplicate)', isValidSequenceImpure(group, WILD_JOKER_VALUE), false);
});


// 3. Set Tests
runTest('Set - Valid standard set of different suits (4H-4D-4S)', () => {
  const group = [
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'D', value: 4, isPrintedJoker: false },
    { suit: 'S', value: 4, isPrintedJoker: false }
  ];
  return assert('4H-4D-4S is a valid set', isValidSet(group, WILD_JOKER_VALUE), true);
});

runTest('Set - Invalid set with duplicate suits (4H-4D-4D)', () => {
  const group = [
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'D', value: 4, isPrintedJoker: false },
    { suit: 'D', value: 4, isPrintedJoker: false }
  ];
  return assert('4H-4D-4D is an invalid set (duplicate suit)', isValidSet(group, WILD_JOKER_VALUE), false);
});

runTest('Set - Valid set with Printed Joker (4H-4D-PJ)', () => {
  const group = [
    { suit: 'H', value: 4, isPrintedJoker: false },
    { suit: 'D', value: 4, isPrintedJoker: false },
    { suit: 'J', value: 0, isPrintedJoker: true }
  ];
  return assert('4H-4D-PJ is a valid set', isValidSet(group, WILD_JOKER_VALUE), true);
});


// 4. Declaring Validation Tests
runTest('Declare - Valid winning hand (1 Pure Seq, 1 Impure Seq, 2 Sets)', () => {
  const groups = [
    // 1. Pure Seq: 3H-4H-5H (3 cards)
    [
      { suit: 'H', value: 3, isPrintedJoker: false },
      { suit: 'H', value: 4, isPrintedJoker: false },
      { suit: 'H', value: 5, isPrintedJoker: false }
    ],
    // 2. Impure Seq: 10S-JS-PJ (3 cards)
    [
      { suit: 'S', value: 10, isPrintedJoker: false },
      { suit: 'S', value: 11, isPrintedJoker: false },
      { suit: 'J', value: 0, isPrintedJoker: true }
    ],
    // 3. Set: 3D-3C-3S (3 cards)
    [
      { suit: 'D', value: 3, isPrintedJoker: false },
      { suit: 'C', value: 3, isPrintedJoker: false },
      { suit: 'S', value: 3, isPrintedJoker: false }
    ],
    // 4. Set: 6H-6D-6C-8S (4 cards, 8S is wild joker)
    [
      { suit: 'H', value: 6, isPrintedJoker: false },
      { suit: 'D', value: 6, isPrintedJoker: false },
      { suit: 'C', value: 6, isPrintedJoker: false },
      { suit: 'S', value: 8, isPrintedJoker: false } // Wild Joker
    ]
  ];
  const result = validateDeclare(groups, WILD_JOKER_VALUE);
  return assert('Valid 13-card hand declaration', result.valid, true);
});

runTest('Declare - Invalid hand: No pure sequence (Only Impure & Sets)', () => {
  const groups = [
    // 1. Impure Seq: 3H-4H-PJ
    [
      { suit: 'H', value: 3, isPrintedJoker: false },
      { suit: 'H', value: 4, isPrintedJoker: false },
      { suit: 'J', value: 0, isPrintedJoker: true }
    ],
    // 2. Impure Seq: 10S-JS-8S (8S is wild joker)
    [
      { suit: 'S', value: 10, isPrintedJoker: false },
      { suit: 'S', value: 11, isPrintedJoker: false },
      { suit: 'S', value: 8, isPrintedJoker: false }
    ],
    // 3. Set: 3D-3C-3S
    [
      { suit: 'D', value: 3, isPrintedJoker: false },
      { suit: 'C', value: 3, isPrintedJoker: false },
      { suit: 'S', value: 3, isPrintedJoker: false }
    ],
    // 4. Set: 6H-6D-6C-6S
    [
      { suit: 'H', value: 6, isPrintedJoker: false },
      { suit: 'D', value: 6, isPrintedJoker: false },
      { suit: 'C', value: 6, isPrintedJoker: false },
      { suit: 'S', value: 6, isPrintedJoker: false }
    ]
  ];
  const result = validateDeclare(groups, WILD_JOKER_VALUE);
  return assert('Declare fails without pure sequence', result.valid, false);
});


// 5. Scoring Tests
runTest('Scoring - Losing hand with NO sequences (Score = 80 points)', () => {
  const groups = [
    [
      { suit: 'H', value: 3, isPrintedJoker: false },
      { suit: 'S', value: 3, isPrintedJoker: false },
      { suit: 'D', value: 3, isPrintedJoker: false }
    ],
    [
      { suit: 'H', value: 10, isPrintedJoker: false }, // 10
      { suit: 'H', value: 12, isPrintedJoker: false }, // Q (10 points)
      { suit: 'H', value: 13, isPrintedJoker: false }  // K (10 points)
    ],
    [
      { suit: 'C', value: 1, isPrintedJoker: false },  // A (10 points)
      { suit: 'C', value: 2, isPrintedJoker: false },  // 2 points
      { suit: 'C', value: 3, isPrintedJoker: false }   // 3 points
    ],
    [
      { suit: 'D', value: 5, isPrintedJoker: false },
      { suit: 'D', value: 6, isPrintedJoker: false },
      { suit: 'D', value: 7, isPrintedJoker: false },
      { suit: 'D', value: 9, isPrintedJoker: false }
    ]
  ];
  const score = calculateHandScore(groups, WILD_JOKER_VALUE);
  return assert('No sequence hand score = 80', score === 80, true);
});

runTest('Scoring - Losing hand with 1 Pure Seq + 1 Impure Seq, but some unmatched cards', () => {
  const groups = [
    // 1. Pure Seq: 3H-4H-5H (0 points)
    [
      { suit: 'H', value: 3, isPrintedJoker: false },
      { suit: 'H', value: 4, isPrintedJoker: false },
      { suit: 'H', value: 5, isPrintedJoker: false }
    ],
    // 2. Impure Seq: 10S-JS-PJ (0 points)
    [
      { suit: 'S', value: 10, isPrintedJoker: false },
      { suit: 'S', value: 11, isPrintedJoker: false },
      { suit: 'J', value: 0, isPrintedJoker: true }
    ],
    // 3. Unmatched Group: Ace of Hearts (10) + Jack of Diamonds (10) + 5 of Clubs (5)
    [
      { suit: 'H', value: 1, isPrintedJoker: false },  // A = 10 pts
      { suit: 'D', value: 11, isPrintedJoker: false }, // J = 10 pts
      { suit: 'C', value: 5, isPrintedJoker: false }   // 5 = 5 pts
    ],
    // 4. Set: 6H-6D-6C-8S (0 points, 8S is wild joker)
    [
      { suit: 'H', value: 6, isPrintedJoker: false },
      { suit: 'D', value: 6, isPrintedJoker: false },
      { suit: 'C', value: 6, isPrintedJoker: false },
      { suit: 'S', value: 8, isPrintedJoker: false } // Wild Joker
    ]
  ];
  // Total unmatched points: 10 (A) + 10 (J) + 5 = 25 points.
  const score = calculateHandScore(groups, WILD_JOKER_VALUE);
  return assert('Scoring partial unmatched hand (Expected: 25)', score === 25, true);
});

console.log(`\n--- TEST SUMMARY: Passed ${testsPassed}/${totalTests} tests ---`);
if (testsPassed === totalTests) {
  console.log('🎉 ALL RUMMY RULE VALIDATION TESTS PASSED!');
} else {
  console.error('⚠️ SOME TESTS FAILED. CHECK LOGS.');
}
