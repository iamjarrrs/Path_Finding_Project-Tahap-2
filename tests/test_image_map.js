import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameMap } from '../src/map.js';
import { findPath } from '../src/pathfinding.js';
import { ALGORITHM, HEURISTIC, TILE_TYPE } from '../src/constants.js';

const collisionData = JSON.parse(
  await readFile(new URL('../assets/map/map_40x30.json', import.meta.url), 'utf8')
);
const map = new GameMap();
const starts = map.loadImageMap(collisionData);
const result = findPath({
  map,
  start: starts.npcs[0],
  goal: starts.mcStart,
  algorithm: ALGORITHM.ASTAR,
  heuristic: HEURISTIC.MANHATTAN,
});

assert.equal(map.cols, 40);
assert.equal(map.rows, 30);
assert.equal(map.isImageMap, true);
assert.deepEqual(starts.mcStart, { x: 3, y: 3 });
assert.equal(map.getRegionAt(starts.mcStart.x, starts.mcStart.y).id, 'upper_left');
assert.equal(map.getRegionAt(34, 3).id, 'upper_right');
assert.equal(map.getRegionAt(20, 16).id, 'center');
assert.equal(map.getRegionAt(3, 23).id, 'lower_left');
assert.equal(map.getRegionAt(37, 24).id, 'lower_right');
assert.equal(map.isWalkable(starts.mcStart.x, starts.mcStart.y), true);
assert.deepEqual(
  starts.npcs.map(({ character, territory, x, y }) => [character, territory, x, y]),
  [
    ['evil_knight', 'center', 20, 16],
    ['goblin_archer', 'lower_left', 3, 23],
    ['barbarian', 'lower_right', 37, 24],
  ]
);
assert.ok(
  starts.npcs.every(({ x, y }) => map.isWalkable(x, y)),
  'each additional NPC should spawn on walkable terrain'
);
assert.ok(
  starts.npcs.every(({ territory, x, y }) => map.getRegionAt(x, y).id === territory),
  'each NPC should spawn in its assigned territory'
);
assert.equal(starts.npcs.some(({ character }) => character === 'necromancer'), false);
assert.equal(result.found, true, 'the two spawn points should be connected');
assert.ok(result.path.every(({ x, y }) => map.getTile(x, y) === TILE_TYPE.PATH));

map.loadPreset('river_village');
assert.equal(map.cols, 56, 'loading an old preset should restore its original width');
assert.equal(map.rows, 40, 'loading an old preset should restore its original height');
assert.equal(map.isImageMap, false);

console.log('Image map collision grid and connectivity tests passed.');
