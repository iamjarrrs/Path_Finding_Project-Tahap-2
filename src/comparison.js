// Algorithm Benchmark & Comparison Tool
// Compares UCS, A* (Manhattan, Euclidean, Chebyshev), and Greedy Best-First Search

import { findPath } from './pathfinding.js';
import { ALGORITHM, HEURISTIC } from './constants.js';

export function runComparisonBenchmark(map, start, goal) {
  const configs = [
    {
      id: 'ucs',
      name: 'Uniform Cost Search (UCS)',
      algorithm: ALGORITHM.UCS,
      heuristic: HEURISTIC.ZERO,
      formula: 'priority = g(n), h(n) = 0',
      description: 'Optimal & Complete. Expands uniformly like a wave in all directions.',
    },
    {
      id: 'astar_manhattan',
      name: 'A* (Manhattan Distance)',
      algorithm: ALGORITHM.ASTAR,
      heuristic: HEURISTIC.MANHATTAN,
      formula: 'f(n) = g(n) + (|dx| + |dy|)',
      description: 'Admissible & Consistent for 4-way grid. Dominates Euclidean heuristic.',
    },
    {
      id: 'astar_euclidean',
      name: 'A* (Euclidean Distance)',
      algorithm: ALGORITHM.ASTAR,
      heuristic: HEURISTIC.EUCLIDEAN,
      formula: 'f(n) = g(n) + √(dx² + dy²)',
      description: 'Admissible straight-line distance. Prunes less than Manhattan because h_e <= h_m.',
    },
    {
      id: 'astar_chebyshev',
      name: 'A* (Chebyshev Distance)',
      algorithm: ALGORITHM.ASTAR,
      heuristic: HEURISTIC.CHEBYSHEV,
      formula: 'f(n) = g(n) + max(|dx|, |dy|)',
      description: 'Admissible relaxation. Prunes well in diagonal-like spaces.',
    },
    {
      id: 'greedy',
      name: 'Greedy Best-First Search',
      algorithm: ALGORITHM.GREEDY,
      heuristic: HEURISTIC.MANHATTAN,
      formula: 'priority = h(n)',
      description: 'Very fast, but suboptimal and easily trapped in concave/U-shaped obstacles.',
    },
  ];

  const results = configs.map((cfg) => {
    const res = findPath({
      map,
      start,
      goal,
      algorithm: cfg.algorithm,
      heuristic: cfg.heuristic,
    });

    return {
      ...cfg,
      found: res.found,
      nodesExpanded: res.nodesExpanded,
      pathLength: res.path.length,
      pathCost: res.pathCost,
      timeMs: parseFloat(res.executionTimeMs.toFixed(3)),
    };
  });

  // Calculate efficiency relative to UCS baseline
  const ucsResult = results.find((r) => r.id === 'ucs');
  const ucsNodes = ucsResult ? ucsResult.nodesExpanded : 1;

  for (const r of results) {
    if (r.nodesExpanded <= ucsNodes && ucsNodes > 0) {
      r.reductionPercent = Math.round(((ucsNodes - r.nodesExpanded) / ucsNodes) * 100);
      r.ratioVsUcs = (ucsNodes / Math.max(r.nodesExpanded, 1)).toFixed(1);
    } else {
      r.reductionPercent = 0;
      r.ratioVsUcs = '1.0';
    }
  }

  return results;
}
