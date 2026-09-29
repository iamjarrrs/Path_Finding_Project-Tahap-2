// Pathfinding Module: UCS, Greedy Best-First, and A* Search
// Designed according to AI Search principles (Russell & Norvig, Lecture Slides)

import { PriorityQueue } from './priority_queue.js';
import { ALGORITHM, HEURISTIC } from './constants.js';

// ==========================================
// 1. DEKLARASI FUNGSI HEURISTIK h(n) EKSPLISIT
// ==========================================

/**
 * Heuristik Manhattan Distance: |dx| + |dy|
 * Rumus sesuai slide kuliah: h(n) = |x - goal.x| + |y - goal.y|
 * Admissible dan Consistent untuk grid pergerakan 4-arah (Up, Down, Left, Right).
 */
export function hitungManhattan(x, y, goalX, goalY) {
  const dx = Math.abs(x - goalX);
  const dy = Math.abs(y - goalY);
  return dx + dy;
}

/**
 * Heuristik Euclidean Distance: √(dx² + dy²)
 * Rumus sesuai slide kuliah (Slide 16): jarak garis lurus (Pythagoras).
 * Admissible (tidak pernah overestimate), tetapi nilainya selalu <= Manhattan,
 * sehingga mengekspansi lebih banyak simpul (Teorema Dominansi di Slide 31-32).
 */
export function hitungEuclidean(x, y, goalX, goalY) {
  const dx = x - goalX;
  const dy = y - goalY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Heuristik Chebyshev Distance: max(|dx|, |dy|)
 * Relaksasi pergerakan ortogonal untuk perkiraan diagonal.
 */
export function hitungChebyshev(x, y, goalX, goalY) {
  const dx = Math.abs(x - goalX);
  const dy = Math.abs(y - goalY);
  return Math.max(dx, dy);
}

/**
 * Heuristik Nol untuk UCS (Uniform Cost Search): h(n) = 0
 * Sesuai slide kuliah: UCS adalah kasus khusus A* dengan h(n) = 0.
 * Prioritas pencarian murni f(n) = g(n).
 */
export function hitungUCS(x, y, goalX, goalY) {
  return 0;
}

// Pemetaan fungsi heuristik agar mudah dipanggil berdasarkan nama
export const Heuristics = {
  [HEURISTIC.MANHATTAN]: hitungManhattan,
  [HEURISTIC.EUCLIDEAN]: hitungEuclidean,
  [HEURISTIC.CHEBYSHEV]: hitungChebyshev,
  [HEURISTIC.ZERO]: hitungUCS,
  'manhattan': hitungManhattan,
  'euclidean': hitungEuclidean,
  'chebyshev': hitungChebyshev,
  'zero': hitungUCS,
};

/**
 * Executes a pathfinding search.
 * @param {Object} options
 * @param {Object} options.map - Grid map instance with getCost(x, y) and isWalkable(x, y)
 * @param {{x: number, y: number}} options.start - Start coordinate (NPC)
 * @param {{x: number, y: number}} options.goal - Goal coordinate (Player/MC)
 * @param {string} options.algorithm - ALGORITHM.ASTAR | ALGORITHM.UCS | ALGORITHM.GREEDY
 * @param {string} options.heuristic - HEURISTIC.MANHATTAN | EUCLIDEAN | etc.
 * @param {number} [options.weight=1.0] - Heuristic weight (for Weighted A*, default 1.0)
 * @param {boolean} [options.allowDiagonal=false] - 4-way or 8-way movement
 * @returns {Object} Search result containing path, metrics, explored nodes, and frontier.
 */
export function findPath({
  map,
  start,
  goal,
  algorithm = ALGORITHM.ASTAR,
  heuristic = HEURISTIC.MANHATTAN,
  weight = 1.0,
  allowDiagonal = false,
}) {
  const startTime = performance.now();

  // Validate start and goal
  if (!map.isWalkable(start.x, start.y) || !map.isWalkable(goal.x, goal.y)) {
    // If goal itself is solid, try finding nearest walkable adjacent cell
    if (!map.isWalkable(goal.x, goal.y)) {
      const adj = getWalkableNeighbors(map, goal.x, goal.y, false);
      if (adj.length > 0) {
        goal = adj[0];
      } else {
        return createEmptyResult(algorithm, heuristic, startTime);
      }
    }
  }

  // If start is already goal
  if (start.x === goal.x && start.y === goal.y) {
    return {
      found: true,
      path: [{ x: start.x, y: start.y }],
      pathCost: 0,
      nodesExpanded: 0,
      explored: [{ x: start.x, y: start.y, g: 0, h: 0, f: 0, step: 1 }],
      frontier: [],
      executionTimeMs: performance.now() - startTime,
      algorithm,
      heuristic,
    };
  }

  // Select heuristic function
  const hFunc = algorithm === ALGORITHM.UCS
    ? Heuristics[HEURISTIC.ZERO]
    : (Heuristics[heuristic] || Heuristics[HEURISTIC.MANHATTAN]);

  // Priority function:
  // UCS: priority = g(n)
  // Greedy: priority = h(n)
  // A*: priority = g(n) + weight * h(n)
  const calcPriority = (g, h) => {
    if (algorithm === ALGORITHM.UCS) return g;
    if (algorithm === ALGORITHM.GREEDY) return h;
    // Tie-breaking: slightly favor higher g (or lower h) for equal f to reduce search plateaus
    return g + weight * h;
  };

  // Min-Heap Priority Queue:
  // Primary key: priority
  // Secondary key: lower h (closer to goal)
  const pq = new PriorityQueue((a, b) => {
    if (Math.abs(a.priority - b.priority) > 0.00001) {
      return a.priority - b.priority;
    }
    return a.h - b.h;
  });

  const startH = hFunc(start.x, start.y, goal.x, goal.y);
  const startPriority = calcPriority(0, startH);

  // Key format: "x,y"
  const keyOf = (x, y) => `${x},${y}`;

  // Data structures for Graph Search
  const gScore = new Map();
  const parentMap = new Map();
  const closedSet = new Set();
  const inFrontier = new Map(); // key -> current priority in queue

  const startKey = keyOf(start.x, start.y);
  gScore.set(startKey, 0);

  pq.push({
    x: start.x,
    y: start.y,
    g: 0,
    h: startH,
    priority: startPriority,
  });
  inFrontier.set(startKey, startPriority);

  const exploredNodes = []; // Tracks expansion order for visual debugging
  let nodesExpandedCount = 0;
  let goalReached = false;
  let finalGoalNode = null;

  // Directions: 4-connected (orthogonal)
  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 1, dy: 0 },  // Right
    { dx: 0, dy: 1 },  // Down
    { dx: -1, dy: 0 }, // Left
  ];

  // Optional 8-connected diagonals
  if (allowDiagonal) {
    directions.push(
      { dx: 1, dy: -1, costMult: Math.SQRT2 },
      { dx: 1, dy: 1, costMult: Math.SQRT2 },
      { dx: -1, dy: 1, costMult: Math.SQRT2 },
      { dx: -1, dy: -1, costMult: Math.SQRT2 }
    );
  }

  while (!pq.isEmpty()) {
    const current = pq.pop();
    const currentKey = keyOf(current.x, current.y);

    // If already expanded in closedSet (due to duplicates with worse priority), skip
    if (closedSet.has(currentKey)) {
      continue;
    }

    inFrontier.delete(currentKey);
    closedSet.add(currentKey);
    nodesExpandedCount++;

    exploredNodes.push({
      x: current.x,
      y: current.y,
      g: current.g,
      h: current.h,
      f: current.priority,
      step: nodesExpandedCount,
    });

    // Goal Test: Evaluated when node is EXPANDED (required for optimal graph search!)
    if (current.x === goal.x && current.y === goal.y) {
      goalReached = true;
      finalGoalNode = current;
      break;
    }

    // Expand Neighbors
    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      // Check bounds and obstacle collision
      if (!map.isWalkable(nx, ny)) continue;

      // Diagonal corner cutting check if diagonal is active
      if (allowDiagonal && dir.dx !== 0 && dir.dy !== 0) {
        if (!map.isWalkable(current.x + dir.dx, current.y) || !map.isWalkable(current.x, current.y + dir.dy)) {
          continue;
        }
      }

      const neighborKey = keyOf(nx, ny);
      if (closedSet.has(neighborKey)) continue;

      // Calculate step cost c(current, neighbor)
      const terrainCost = map.getCost(nx, ny);
      const stepCost = (dir.costMult || 1) * terrainCost;
      const tentativeG = current.g + stepCost;

      const existingG = gScore.has(neighborKey) ? gScore.get(neighborKey) : Infinity;

      if (tentativeG < existingG) {
        gScore.set(neighborKey, tentativeG);
        parentMap.set(neighborKey, { x: current.x, y: current.y });

        const h = hFunc(nx, ny, goal.x, goal.y);
        const priority = calcPriority(tentativeG, h);

        pq.push({
          x: nx,
          y: ny,
          g: tentativeG,
          h,
          priority,
        });
        inFrontier.set(neighborKey, priority);
      }
    }
  }

  const executionTimeMs = performance.now() - startTime;

  if (!goalReached || !finalGoalNode) {
    return {
      found: false,
      path: [],
      pathCost: 0,
      nodesExpanded: nodesExpandedCount,
      explored: exploredNodes,
      frontier: Array.from(inFrontier.entries()).map(([k, prio]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, priority: prio };
      }),
      executionTimeMs,
      algorithm,
      heuristic,
    };
  }

  // Reconstruct path from goal back to start
  const path = [];
  let curr = { x: finalGoalNode.x, y: finalGoalNode.y };
  while (curr) {
    path.push(curr);
    const pKey = keyOf(curr.x, curr.y);
    curr = parentMap.get(pKey);
  }
  path.reverse();

  // Extract remaining frontier nodes for debug visualization
  const frontierNodes = Array.from(inFrontier.entries()).map(([k, prio]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, priority: prio };
  });

  return {
    found: true,
    path,
    pathCost: finalGoalNode.g,
    nodesExpanded: nodesExpandedCount,
    explored: exploredNodes,
    frontier: frontierNodes,
    executionTimeMs,
    algorithm,
    heuristic,
  };
}

function getWalkableNeighbors(map, x, y, allowDiagonal = false) {
  const neighbors = [];
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];
  for (const d of dirs) {
    const nx = x + d.dx;
    const ny = y + d.dy;
    if (map.isWalkable(nx, ny)) {
      neighbors.push({ x: nx, y: ny });
    }
  }
  return neighbors;
}

function createEmptyResult(algorithm, heuristic, startTime) {
  return {
    found: false,
    path: [],
    pathCost: 0,
    nodesExpanded: 0,
    explored: [],
    frontier: [],
    executionTimeMs: performance.now() - startTime,
    algorithm,
    heuristic,
  };
}
