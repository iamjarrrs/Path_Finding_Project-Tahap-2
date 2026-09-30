import { BATTLE_CONFIG } from './constants.js';

// Minimax with Alpha-Beta Pruning for Turn-Based Combat
// Pure functions, does not modify original state

const MAX_DEPTH = 4;
const ACTIONS = {
  ATTACK: 'Attack',
  DEFEND: 'Defend',
  POTION: 'Potion'
};

/**
 * Heuristic Evaluation Function
 * @param {Object} state - { npcHP, playerHP }
 * @returns {number} Score
 */

//netral evaluation
function evaluate(state) { // Menilai state 
  if (state.playerHP <= 0) return 1000; // NPC wins
  if (state.npcHP <= 0) return -1000;  // Player wins
  return state.npcHP - state.playerHP;
}

/*
 * Evaluasi Agresif:
 * NPC berfokus penuh untuk menghabisi HP Player secepat mungkin.
 */

// function evaluate(state) {
//   // 1. Terminal State: Kemenangan Mutlak (+1000) atau Kekalahan Mutlak (-1000)
//   if (state.playerHP <= 0) return 1000;
//   if (state.npcHP <= 0) return -1000;

//   // 2. Hitung berapa besar HP Player yang sudah hilang (Kerusakan/Damage)
//   const playerDamageTaken = BATTLE_CONFIG.MAX_HP - state.playerHP;

//   // 3. Formula Bobot Agresif:
//   // - Kerusakan Player dikali 2 (memberi dorongan tinggi pada aksi ATTACK)
//   // - HP NPC diberi bobot normal (1x)
//   const score = (playerDamageTaken * 2) + state.npcHP;

//   return score;
// }


/**
 * Evaluasi Defensif:
 * NPC berfokus menjaga HP milik sendiri dan gemar menggunakan perisai (DEFEND).
 */

// function evaluate(state) {
//   // 1. Terminal State: Kemenangan Mutlak (+1000) atau Kekalahan Mutlak (-1000)
//   if (state.playerHP <= 0) return 1000;
//   if (state.npcHP <= 0) return -1000;

//   // 2. Formula Bobot Defensif Dasar:
//   // - HP NPC dikali 2 (membuat AI merasa memulihkan HP/POTION sangat berharga)
//   // - Kurangi dengan HP Player yang tersisa
//   let score = (state.npcHP * 2) - state.playerHP;

//   // 3. Bonus Poin Pertahanan:
//   // Jika dalam simulasi ini NPC berada dalam posisi bertahan (Defend),
//   // berikan bonus skor +20 agar opsi DEFEND terlihat lebih menarik di mata Minimax.
//   if (state.npcDefending) {
//     score += 20;
//   }

//   return score;
// }

/**
 * Simulates an action to get a new state
 * @param {Object} state - current state { playerHP, npcHP, playerDefending, npcDefending }
 * @param {string} action - action taken
 * @param {boolean} isNpcTurn - whether it's NPC taking the action
 * @returns {Object} cloned new state
 */
function simulateAction(state, action, isNpcTurn) { // Mensimulasikan action (didalam otak NPC)
  // Clone state (membuat salinan)
  const nextState = { ...state };

  const baseDamage = BATTLE_CONFIG.BASE_DAMAGE;
  const healAmount = BATTLE_CONFIG.HEAL_AMOUNT;
  const maxHP = BATTLE_CONFIG.MAX_HP;

  if (isNpcTurn) {
    nextState.npcDefending = false; // Reset defend status
    if (action === ACTIONS.ATTACK) {
      let damage = baseDamage;
      if (nextState.playerDefending) { // Player defense mengurangi damage sebesar 50%
        damage = Math.floor(damage * 0.5);
      }
      nextState.playerHP -= damage;
    } else if (action === ACTIONS.DEFEND) { // NPC defense mengurangi damage sebesar 50%
      nextState.npcDefending = true;
    } else if (action === ACTIONS.POTION) { // NPC menggunakan potion memulihkan 25 HP
      nextState.npcHP = Math.min(maxHP, nextState.npcHP + healAmount);
    }
  } else { // Player's turn
    nextState.playerDefending = false; // Reset defend status
    if (action === ACTIONS.ATTACK) {
      let damage = baseDamage;
      if (nextState.npcDefending) { // NPC defense mengurangi damage sebesar 50%
        damage = Math.floor(damage * 0.5);
      }
      nextState.npcHP -= damage;
    } else if (action === ACTIONS.DEFEND) { // Player defense mengurangi damage sebesar 50%
      nextState.playerDefending = true;
    } else if (action === ACTIONS.POTION) { // Player menggunakan potion memulihkan 25 HP
      nextState.playerHP = Math.min(maxHP, nextState.playerHP + healAmount);
    }
  }

  return nextState;
}

/**
 * Mode A: Pure Minimax (NO Alpha-Beta Pruning) with Early Stop
 * Used for node count comparison baseline.
 * @param {Object} state - current state
 * @param {number} depth - current depth in tree
 * @param {boolean} isMaximizing - true if NPC turn (maximizing score)
 * @param {Object} stats - reference object to track node count
 * @returns {number} Utility score
 */
function minimaxPure(state, depth, isMaximizing, stats) {
  stats.nodeCount++;

  // Terminal conditions (Early Stop)
  if (state.playerHP <= 0 || state.npcHP <= 0 || depth === MAX_DEPTH) {
    return evaluate(state);
  }

  const possibleActions = [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.POTION];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const action of possibleActions) {
      const nextState = simulateAction(state, action, true);
      const evalScore = minimaxPure(nextState, depth + 1, false, stats);
      maxEval = Math.max(maxEval, evalScore);
      // NO pruning here — explore ALL branches
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const action of possibleActions) {
      const nextState = simulateAction(state, action, false);
      const evalScore = minimaxPure(nextState, depth + 1, true, stats);
      minEval = Math.min(minEval, evalScore);
      // NO pruning here — explore ALL branches
    }
    return minEval;
  }
}

/**
 * Mode B: Minimax with Alpha-Beta Pruning + Early Stop
 * @param {Object} state - current state
 * @param {number} depth - current depth in tree
 * @param {boolean} isMaximizing - true if NPC turn (maximizing score)
 * @param {number} alpha - alpha value
 * @param {number} beta - beta value
 * @param {Object} stats - reference object to track node count
 * @returns {number} Utility score
 */
export function minimax(state, depth, isMaximizing, alpha = -Infinity, beta = Infinity, stats = { nodeCount: 0 }) {
  stats.nodeCount++;

  // Terminal conditions (Early Stop)
  if (state.playerHP <= 0 || state.npcHP <= 0 || depth === MAX_DEPTH) {
    return evaluate(state);
  }

  const possibleActions = [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.POTION];

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const action of possibleActions) {
      const nextState = simulateAction(state, action, true);
      const evalScore = minimax(nextState, depth + 1, false, alpha, beta, stats);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Alpha-Beta Pruning
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const action of possibleActions) {
      const nextState = simulateAction(state, action, false);
      const evalScore = minimax(nextState, depth + 1, true, alpha, beta, stats);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha-Beta Pruning
    }
    return minEval;
  }
}

/**
 * Determines the best action for the NPC.
 * Runs BOTH pure Minimax and Alpha-Beta Pruning simultaneously
 * to allow comparison of node counts for academic reporting.
 *
 * @param {Object} state - { playerHP, npcHP, playerDefending, npcDefending }
 * @returns {Object} { bestAction, evaluations, nodesMinimax, nodesAlphaBeta, pruningReduction }
 */
export function getBestNPCAction(state) {
  const possibleActions = [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.POTION];

  // --- Mode A: Pure Minimax (no pruning) ---
  let bestActionMinimax = ACTIONS.ATTACK;
  let maxEvalMinimax = -Infinity;
  const statsMinimax = { nodeCount: 0 };

  for (const action of possibleActions) {
    const nextState = simulateAction(state, action, true);
    const evalScore = minimaxPure(nextState, 1, false, statsMinimax);
    if (evalScore > maxEvalMinimax) {
      maxEvalMinimax = evalScore;
      bestActionMinimax = action;
    }
  }
  // Count root nodes for pure minimax
  statsMinimax.nodeCount += possibleActions.length;

  // --- Mode B: Alpha-Beta Pruning ---
  let bestAction = ACTIONS.ATTACK;
  let maxEval = -Infinity;
  const evaluations = {};
  const statsAB = { nodeCount: 0 };

  for (const action of possibleActions) {
    const nextState = simulateAction(state, action, true);
    const evalScore = minimax(nextState, 1, false, -Infinity, Infinity, statsAB);
    evaluations[action] = evalScore;

    if (evalScore > maxEval) {
      maxEval = evalScore;
      bestAction = action;
    }
  }
  // Count root nodes for alpha-beta
  statsAB.nodeCount += possibleActions.length;

  // Pruning efficiency: how many fewer nodes Alpha-Beta expanded vs Pure Minimax
  const pruningReduction = statsMinimax.nodeCount > 0
    ? (((statsMinimax.nodeCount - statsAB.nodeCount) / statsMinimax.nodeCount) * 100).toFixed(1)
    : '0.0';

  return {
    bestAction,          // Final decision (from Alpha-Beta, same result as Minimax)
    evaluations,         // Scores per action (from Alpha-Beta root)
    nodesMinimax: statsMinimax.nodeCount,
    nodesAlphaBeta: statsAB.nodeCount,
    pruningReduction,    // % reduction in nodes thanks to pruning
    // Legacy field for backward compatibility
    nodeCount: statsAB.nodeCount,
  };
}

export { ACTIONS };
