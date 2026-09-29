// Automated Unit Tests for Large 56x40 Grid, Organic Lakes, and Heuristic Dominance

import { GameMap } from '../src/map.js';
import { findPath } from '../src/pathfinding.js';
import { ALGORITHM, HEURISTIC } from '../src/constants.js';

console.log('=== Running AI Search Tests on Large 56x40 World ===\n');

// Test 1: Great Lake & River Valley (56x40)
console.log('--- Test 1: Great Lake & River Valley (56x40) ---');
const map1 = new GameMap();
const coords1 = map1.loadPreset('river_village');
const start1 = coords1.npcStart; // (5, 20)
const goal1 = coords1.mcStart;   // (49, 20)

console.log(`Start NPC: (${start1.x}, ${start1.y}) -> Goal MC: (${goal1.x}, ${goal1.y})`);

const resUcs1 = findPath({
  map: map1,
  start: start1,
  goal: goal1,
  algorithm: ALGORITHM.UCS,
  heuristic: HEURISTIC.ZERO,
});

const resManhattan1 = findPath({
  map: map1,
  start: start1,
  goal: goal1,
  algorithm: ALGORITHM.ASTAR,
  heuristic: HEURISTIC.MANHATTAN,
});

const resEuclidean1 = findPath({
  map: map1,
  start: start1,
  goal: goal1,
  algorithm: ALGORITHM.ASTAR,
  heuristic: HEURISTIC.EUCLIDEAN,
});

const resGreedy1 = findPath({
  map: map1,
  start: start1,
  goal: goal1,
  algorithm: ALGORITHM.GREEDY,
  heuristic: HEURISTIC.MANHATTAN,
});

console.log(`UCS:            PathFound=${resUcs1.found}, Cost=${resUcs1.pathCost}, NodesExpanded=${resUcs1.nodesExpanded}`);
console.log(`A* (Manhattan): PathFound=${resManhattan1.found}, Cost=${resManhattan1.pathCost}, NodesExpanded=${resManhattan1.nodesExpanded}`);
console.log(`A* (Euclidean): PathFound=${resEuclidean1.found}, Cost=${resEuclidean1.pathCost}, NodesExpanded=${resEuclidean1.nodesExpanded}`);
console.log(`Greedy BFS:     PathFound=${resGreedy1.found}, Cost=${resGreedy1.pathCost}, NodesExpanded=${resGreedy1.nodesExpanded}`);

if (!resUcs1.found || !resManhattan1.found) {
  throw new Error('Path should be found across Great Lake bridges!');
}
if (resUcs1.pathCost !== resManhattan1.pathCost) {
  throw new Error(`A* Manhattan cost (${resManhattan1.pathCost}) should match optimal UCS cost (${resUcs1.pathCost})!`);
}
if (resManhattan1.nodesExpanded >= resUcs1.nodesExpanded) {
  throw new Error(`A* Manhattan must expand fewer nodes than UCS!`);
}
console.log('✓ Test 1 Passed: Dramatic pruning on large map verified!\n');

// Test 2: Random World Generation
console.log('--- Test 2: Procedural Random World Generator ---');
const mapRandom = new GameMap();
const randCoords = mapRandom.generateRandomMap();
console.log(`Random Start NPC: (${randCoords.npcStart.x}, ${randCoords.npcStart.y}) -> Goal MC: (${randCoords.mcStart.x}, ${randCoords.mcStart.y})`);

const resRandomAStar = findPath({
  map: mapRandom,
  start: randCoords.npcStart,
  goal: randCoords.mcStart,
  algorithm: ALGORITHM.ASTAR,
  heuristic: HEURISTIC.MANHATTAN,
});

console.log(`Random Map A*: PathFound=${resRandomAStar.found}, Cost=${resRandomAStar.pathCost}, NodesExpanded=${resRandomAStar.nodesExpanded}`);
if (!resRandomAStar.found) {
  throw new Error('Random world must guarantee a connected, solvable path!');
}
console.log('✓ Test 2 Passed: Procedural random map is guaranteed connected and solvable!\n');

console.log('=== All 56x40 World Pathfinding Tests Passed Successfully! ===');
