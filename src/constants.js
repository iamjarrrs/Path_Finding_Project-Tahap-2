// Game, World, and Camera Configuration Constants

export const TILE_SIZE = 32; // Screen display size in pixels (crisp 16x16 scaled 2x)

// Battle System Configuration Constants
export const BATTLE_CONFIG = {
  BASE_DAMAGE: 30,
  HEAL_AMOUNT: 25, // health potion
  MAX_HP: 100,
};

// Large World Grid Dimensions (56 cols x 40 rows = 2,240 tiles, 4x larger world)
export const GRID_COLS = 56;
export const GRID_ROWS = 40;

// World Dimensions in Pixels
export const WORLD_WIDTH = GRID_COLS * TILE_SIZE;   // 1792px
export const WORLD_HEIGHT = GRID_ROWS * TILE_SIZE; // 1280px

// Viewport / Screen Dimensions (Close-up, unzoomed view)
export const VIEWPORT_WIDTH = 960;  // 30 visible tiles wide
export const VIEWPORT_HEIGHT = 640; // 20 visible tiles high

// Minimap Dimensions
export const MINIMAP_WIDTH = 168;  // 3px per tile width
export const MINIMAP_HEIGHT = 120; // 3px per tile height

// Terrain / Tile Types
export const TILE_TYPE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2,       // Impassable without bridge
  BRIDGE: 3,      // Walkable over water
  WALL: 4,        // Solid obstacle (house wall)
  HOUSE_ROOF: 5,  // Solid obstacle (roof)
  TREE: 6,        // Solid obstacle
  MUD: 7,         // Walkable with higher cost (cost = 3) to test UCS vs A*
  FLOOR: 8,       // Interior floor
  FURNITURE: 9,   // Solid obstacle (furniture)
};

// Movement costs for walkable terrain
export const TERRAIN_COSTS = {
  [TILE_TYPE.GRASS]: 1,
  [TILE_TYPE.PATH]: 1,
  [TILE_TYPE.BRIDGE]: 1,
  [TILE_TYPE.FLOOR]: 1,
  [TILE_TYPE.MUD]: 3, // High movement cost
};

// Which tiles are solid/impassable
export const SOLID_TILES = new Set([
  TILE_TYPE.WATER,
  TILE_TYPE.WALL,
  TILE_TYPE.HOUSE_ROOF,
  TILE_TYPE.TREE,
  TILE_TYPE.FURNITURE,
]);

// Character Directions & Sprite Sheet Frame Offsets (from 24-frame 16x32 sheets)
export const DIRECTION = {
  RIGHT: 0,
  UP: 1,
  LEFT: 2,
  DOWN: 3,
};

export const DIR_OFFSETS = {
  [DIRECTION.RIGHT]: { x: 1, y: 0, frameStart: 0 },
  [DIRECTION.UP]: { x: 0, y: -1, frameStart: 6 },
  [DIRECTION.LEFT]: { x: -1, y: 0, frameStart: 12 },
  [DIRECTION.DOWN]: { x: 0, y: 1, frameStart: 18 },
};

// Pathfinding Algorithms
export const ALGORITHM = {
  ASTAR: 'astar',
  UCS: 'ucs',
  GREEDY: 'greedy',
};

// Heuristic functions for A*
export const HEURISTIC = {
  MANHATTAN: 'manhattan',
  EUCLIDEAN: 'euclidean',
  CHEBYSHEV: 'chebyshev',
  OCTILE: 'octile',
  ZERO: 'zero',
};

// Debug Visualization Colors
export const DEBUG_COLORS = {
  EXPLORED_FILL: 'rgba(59, 130, 246, 0.38)',
  EXPLORED_BORDER: 'rgba(96, 165, 250, 0.7)',
  FRONTIER_FILL: 'rgba(234, 179, 8, 0.45)',
  FRONTIER_BORDER: 'rgba(250, 204, 21, 0.9)',
  PATH_FILL: 'rgba(34, 197, 94, 0.5)',
  PATH_LINE: '#22c55e',
  PATH_WAYPOINT: '#4ade80',
  START_RING: '#38bdf8',
  GOAL_RING: '#ef4444',
  GRID_LINES: 'rgba(255, 255, 255, 0.08)',
};
