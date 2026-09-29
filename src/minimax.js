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
function evaluate(state) {
  if (state.playerHP <= 0) return 100; // NPC wins
  if (state.npcHP <= 0) return -100; // Player wins
  return state.npcHP - state.playerHP;
}

/**
 * Simulates an action to get a new state
 * @param {Object} state - current state { playerHP, npcHP, playerDefending, npcDefending }
 * @param {string} action - action taken
 * @param {boolean} isNpcTurn - whether it's NPC taking the action
 * @returns {Object} cloned new state
 */
function simulateAction(state, action, isNpcTurn) {
  // Clone state
  const nextState = { ...state };
  
  const baseDamage = 20;
  const healAmount = 25;
  const maxHP = 100;

  if (isNpcTurn) {
    nextState.npcDefending = false; // Reset defend status
    if (action === ACTIONS.ATTACK) {
      let damage = baseDamage;
      if (nextState.playerDefending) {
        damage = Math.floor(damage * 0.5);
      }
      nextState.playerHP -= damage;
    } else if (action === ACTIONS.DEFEND) {
      nextState.npcDefending = true;
    } else if (action === ACTIONS.POTION) {
      nextState.npcHP = Math.min(maxHP, nextState.npcHP + healAmount);
    }
  } else {
    nextState.playerDefending = false; // Reset defend status
    if (action === ACTIONS.ATTACK) {
      let damage = baseDamage;
      if (nextState.npcDefending) {
        damage = Math.floor(damage * 0.5);
      }
      nextState.npcHP -= damage;
    } else if (action === ACTIONS.DEFEND) {
      nextState.playerDefending = true;
    } else if (action === ACTIONS.POTION) {
      nextState.playerHP = Math.min(maxHP, nextState.playerHP + healAmount);
    }
  }

  return nextState;
}

/**
 * Minimax algorithm with Alpha-Beta Pruning
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

  // Terminal conditions
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
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const action of possibleActions) {
      const nextState = simulateAction(state, action, false);
      const evalScore = minimax(nextState, depth + 1, true, alpha, beta, stats);
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return minEval;
  }
}

/**
 * Determines the best action for the NPC using Minimax
 * @param {Object} state - { playerHP, npcHP, playerDefending, npcDefending }
 * @returns {Object} { bestAction, evaluations, nodeCount }
 */
export function getBestNPCAction(state) {
  const possibleActions = [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.POTION];
  let bestAction = ACTIONS.ATTACK;
  let maxEval = -Infinity;
  const evaluations = {};
  const stats = { nodeCount: 0 };

  for (const action of possibleActions) {
    const nextState = simulateAction(state, action, true);
    // After NPC action, it's player's turn (minimizing)
    const evalScore = minimax(nextState, 1, false, -Infinity, Infinity, stats);
    evaluations[action] = evalScore;
    
    if (evalScore > maxEval) {
      maxEval = evalScore;
      bestAction = action;
    }
  }

  return { bestAction, evaluations, nodeCount: stats.nodeCount };
}

export { ACTIONS };
