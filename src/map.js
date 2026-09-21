// Large Grid Map System with Organic Lakes & Procedural Terrain Generation
// Replaces rigid square blocks with natural, curved water bodies, islands, and bridges

import {
  TILE_TYPE,
  TERRAIN_COSTS,
  SOLID_TILES,
  GRID_COLS,
  GRID_ROWS,
} from './constants.js';

export class GameMap {
  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];
    this.initEmpty();
  }

  initEmpty() {
    this.grid = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        // Outer boundary walls
        if (x === 0 || x === this.cols - 1 || y === 0 || y === this.rows - 1) {
          row.push(TILE_TYPE.WALL);
        } else {
          row.push(TILE_TYPE.GRASS);
        }
      }
      this.grid.push(row);
    }
  }

  isValid(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  isWalkable(x, y) {
    if (!this.isValid(x, y)) return false;
    const tile = this.grid[y][x];
    return !SOLID_TILES.has(tile);
  }

  getCost(x, y) {
    if (!this.isValid(x, y)) return Infinity;
    const tile = this.grid[y][x];
    return TERRAIN_COSTS[tile] || 1;
  }

  getTile(x, y) {
    if (!this.isValid(x, y)) return TILE_TYPE.WALL;
    return this.grid[y][x];
  }

  setTile(x, y, tileType) {
    if (this.isValid(x, y)) {
      this.grid[y][x] = tileType;
    }
  }

  // Preset scenarios designed for the 56x40 large world
  loadPreset(presetName) {
    this.initEmpty();

    switch (presetName) {
      case 'river_village':
      case 'great_lake':
        this._buildGreatLakeAndRiver();
        return {
          npcStart: { x: 5, y: 20 },
          mcStart: { x: 49, y: 20 },
        };

      case 'concave_trap':
      case 'lake_peninsula':
        this._buildOrganicPeninsulaTrap();
        return {
          npcStart: { x: 10, y: 20 },
          mcStart: { x: 42, y: 20 },
        };

      case 'forest_sanctuary':
        this._buildForestSanctuary();
        return {
          npcStart: { x: 6, y: 6 },
          mcStart: { x: 48, y: 34 },
        };

      case 'random_world':
        return this.generateRandomMap();

      case 'open_arena':
      default:
        return {
          npcStart: { x: 8, y: 20 },
          mcStart: { x: 48, y: 20 },
        };
    }
  }

  // --- Organic Terrain Generators ---

  /**
   * Carves an organic, non-square lake using overlapping blobs and cellular smoothing
   */
  carveOrganicLake(centerX, centerY, radiusX, radiusY, roughness = 0.35) {
    const minX = Math.max(1, Math.floor(centerX - radiusX - 2));
    const maxX = Math.min(this.cols - 2, Math.ceil(centerX + radiusX + 2));
    const minY = Math.max(1, Math.floor(centerY - radiusY - 2));
    const maxY = Math.min(this.rows - 2, Math.ceil(centerY + radiusY + 2));

    // Phase 1: Radial distance with pseudo-noise perturbations
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Perturbation noise based on sine harmonics
        const angle = Math.atan2(dy, dx);
        const noise = Math.sin(angle * 3 + centerX) * 0.15 +
                      Math.cos(angle * 5 + centerY) * 0.12 +
                      Math.sin(angle * 7) * 0.08;

        if (dist + noise <= 1.0 + roughness) {
          this.grid[y][x] = TILE_TYPE.WATER;
        }
      }
    }

    // Phase 2: Cellular automata smoothing passes to round jagged pixel edges
    this._smoothWaterRegion(minX, minY, maxX, maxY);
    // Phase 3: Add natural muddy shoreline
    this._addMudShores(minX - 2, minY - 2, maxX + 2, maxY + 2);
  }

  /**
   * Carves an organic winding river with smooth bends and variable width
   */
  carveWindingRiver(startY, endY, getXForY, width = 3) {
    for (let y = startY; y <= endY; y++) {
      if (y <= 0 || y >= this.rows - 1) continue;
      const midX = Math.round(getXForY(y));
      const halfW = Math.floor(width / 2);

      for (let dx = -halfW; dx <= halfW + (width % 2); dx++) {
        const x = midX + dx;
        if (x > 0 && x < this.cols - 1) {
          this.grid[y][x] = TILE_TYPE.WATER;
        }
      }
    }
    this._smoothWaterRegion(1, startY, this.cols - 2, endY);
    this._addMudShores(1, startY, this.cols - 2, endY);
  }

  /**
   * Cellular automata smoothing to remove isolated water pixels and round lake bays
   */
  _smoothWaterRegion(minX, minY, maxX, maxY) {
    const clMinX = Math.max(1, minX);
    const clMaxX = Math.min(this.cols - 2, maxX);
    const clMinY = Math.max(1, minY);
    const clMaxY = Math.min(this.rows - 2, maxY);

    const nextState = [];
    for (let y = clMinY; y <= clMaxY; y++) {
      const row = [];
      for (let x = clMinX; x <= clMaxX; x++) {
        let waterCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (this.isValid(nx, ny) && this.grid[ny][nx] === TILE_TYPE.WATER) {
              waterCount++;
            }
          }
        }
        const isWater = this.grid[y][x] === TILE_TYPE.WATER;
        if (isWater) {
          // Keep water unless isolated
          row.push(waterCount >= 3 ? TILE_TYPE.WATER : TILE_TYPE.GRASS);
        } else {
          // Fill small holes inside the lake
          row.push(waterCount >= 6 ? TILE_TYPE.WATER : this.grid[y][x]);
        }
      }
      nextState.push(row);
    }

    // Apply back
    for (let y = clMinY; y <= clMaxY; y++) {
      for (let x = clMinX; x <= clMaxX; x++) {
        this.grid[y][x] = nextState[y - clMinY][x - clMinX];
      }
    }
  }

  _addMudShores(minX, minY, maxX, maxY) {
    const clMinX = Math.max(1, minX);
    const clMaxX = Math.min(this.cols - 2, maxX);
    const clMinY = Math.max(1, minY);
    const clMaxY = Math.min(this.rows - 2, maxY);

    for (let y = clMinY; y <= clMaxY; y++) {
      for (let x = clMinX; x <= clMaxX; x++) {
        if (this.grid[y][x] === TILE_TYPE.GRASS) {
          // Check if adjacent to water
          let adjacentWater = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (this.isValid(nx, ny) && this.grid[ny][nx] === TILE_TYPE.WATER) {
                adjacentWater = true;
                break;
              }
            }
            if (adjacentWater) break;
          }
          if (adjacentWater && Math.random() < 0.75) {
            this.grid[y][x] = TILE_TYPE.MUD;
          }
        }
      }
    }
  }

  _buildBridge(startX, startY, endX, endY) {
    if (startY === endY) {
      // Horizontal bridge
      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      for (let x = minX; x <= maxX; x++) {
        if (this.isValid(x, startY)) {
          this.grid[startY][x] = TILE_TYPE.BRIDGE;
        }
      }
    } else if (startX === endX) {
      // Vertical bridge
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);
      for (let y = minY; y <= maxY; y++) {
        if (this.isValid(startX, y)) {
          this.grid[y][startX] = TILE_TYPE.BRIDGE;
        }
      }
    }
  }

  // --- Preset 1: Great Organic Lake & Winding River (56x40) ---
  _buildGreatLakeAndRiver() {
    // 1. Central Great Lake with organic shape
    this.carveOrganicLake(28, 20, 11, 8, 0.4);

    // 2. Secondary northern lagoon
    this.carveOrganicLake(24, 7, 6, 4, 0.3);

    // 3. Winding tributary connecting North to the Great Lake
    this.carveWindingRiver(1, 14, (y) => 25 + Math.sin(y * 0.45) * 4, 3);

    // 4. Southern River exiting the lake
    this.carveWindingRiver(26, this.rows - 2, (y) => 28 + Math.sin((y - 25) * 0.4) * 5, 3);

    // 5. Wooden Bridges spanning the water
    // Bridge 1: North tributary bridge
    this._buildBridge(22, 9, 29, 9);
    // Bridge 2: Main center-lake wooden walkway across island narrows
    this._buildBridge(21, 20, 35, 20);
    // Bridge 3: South river crossing
    this._buildBridge(25, 33, 33, 33);

    // 6. Cobblestone Trails linking bridges and settlements
    for (let x = 5; x <= 50; x++) {
      if (this.isWalkable(x, 20)) this.grid[20][x] = TILE_TYPE.PATH;
      if (this.isWalkable(x, 9)) this.grid[9][x] = TILE_TYPE.PATH;
      if (this.isWalkable(x, 33)) this.grid[33][x] = TILE_TYPE.PATH;
    }
    for (let y = 9; y <= 33; y++) {
      if (this.isWalkable(10, y)) this.grid[y][10] = TILE_TYPE.PATH;
      if (this.isWalkable(44, y)) this.grid[y][44] = TILE_TYPE.PATH;
    }

    // 7. Villages / Houses
    // West Hamlet
    this._placeBuilding(4, 5, 5, 4);
    this._placeBuilding(4, 25, 5, 4);
    this._placeBuilding(12, 13, 4, 3);

    // East Hamlet
    this._placeBuilding(42, 5, 5, 4);
    this._placeBuilding(43, 26, 6, 4);
    this._placeBuilding(36, 13, 4, 3);

    // 8. Natural Forest Clusters
    this._placeForestCluster(16, 5, 4, 18);
    this._placeForestCluster(15, 30, 5, 22);
    this._placeForestCluster(38, 7, 4, 16);
    this._placeForestCluster(38, 32, 5, 20);
    this._placeForestCluster(2, 14, 3, 10);
    this._placeForestCluster(50, 14, 3, 10);
  }

  // --- Preset 2: Organic Concave Peninsula Trap (Lecture Slide 17 & 22) ---
  _buildOrganicPeninsulaTrap() {
    // Large U-shaped water bay surrounding a land peninsula
    this.carveOrganicLake(28, 20, 15, 12, 0.2);

    // Fill the center with a land peninsula jutting from the left
    for (let y = 14; y <= 26; y++) {
      for (let x = 15; x <= 36; x++) {
        this.grid[y][x] = TILE_TYPE.GRASS;
      }
    }

    // Build curved cliff walls creating the classic concave trap
    for (let x = 20; x <= 34; x++) {
      this.grid[14][x] = TILE_TYPE.WALL;
      this.grid[26][x] = TILE_TYPE.WALL;
    }
    for (let y = 14; y <= 26; y++) {
      this.grid[y][34] = TILE_TYPE.WALL;
    }

    // Bridges allowing the player / NPC to navigate around
    this._buildBridge(35, 8, 35, 12);
    this._buildBridge(35, 28, 35, 32);

    // Path
    for (let x = 8; x <= 46; x++) {
      if (this.isWalkable(x, 8)) this.grid[8][x] = TILE_TYPE.PATH;
      if (this.isWalkable(x, 32)) this.grid[32][x] = TILE_TYPE.PATH;
    }

    // Clustered trees
    this._placeForestCluster(6, 6, 4, 15);
    this._placeForestCluster(6, 30, 4, 15);
    this._placeForestCluster(45, 6, 4, 15);
    this._placeForestCluster(45, 30, 4, 15);
  }

  // --- Preset 3: Forest Sanctuary & Ruins ---
  _buildForestSanctuary() {
    // Multiple winding ponds and ruin walls
    this.carveOrganicLake(18, 14, 7, 5, 0.4);
    this.carveOrganicLake(38, 26, 8, 6, 0.4);

    // Bridges
    this._buildBridge(18, 12, 18, 16);
    this._buildBridge(35, 26, 41, 26);

    // Ancient ruin walls
    for (let x = 24; x <= 32; x++) {
      this.grid[18][x] = TILE_TYPE.WALL;
      this.grid[22][x] = TILE_TYPE.WALL;
    }
    this.grid[18][28] = TILE_TYPE.PATH;
    this.grid[22][28] = TILE_TYPE.PATH;

    // Scattered dense forests
    for (let i = 0; i < 12; i++) {
      const rx = 4 + Math.floor(Math.random() * 46);
      const ry = 4 + Math.floor(Math.random() * 32);
      this._placeForestCluster(rx, ry, 3, 10);
    }
  }

  // --- Procedural Random World Generator ---
  generateRandomMap() {
    this.initEmpty();

    // 1. Generate 2 to 3 organic lakes of random sizes and positions
    const numLakes = 2 + Math.floor(Math.random() * 2);
    const lakes = [];

    for (let i = 0; i < numLakes; i++) {
      const cx = 16 + Math.floor(Math.random() * 24);
      const cy = 10 + Math.floor(Math.random() * 20);
      const rx = 6 + Math.floor(Math.random() * 6);
      const ry = 5 + Math.floor(Math.random() * 5);
      this.carveOrganicLake(cx, cy, rx, ry, 0.35 + Math.random() * 0.2);
      lakes.push({ cx, cy, rx, ry });
    }

    // 2. Generate an organic winding river
    const riverXSeed = 20 + Math.floor(Math.random() * 16);
    const riverFreq = 0.3 + Math.random() * 0.25;
    const riverAmp = 3 + Math.floor(Math.random() * 4);
    this.carveWindingRiver(1, this.rows - 2, (y) => riverXSeed + Math.sin(y * riverFreq) * riverAmp, 3);

    // 3. Strategically place 3 to 4 crossing bridges across the map
    const bridgeYPositions = [8, 18, 28, 34];
    for (const by of bridgeYPositions) {
      // Find water stretches in row 'by' and span them
      for (let x = 10; x < this.cols - 10; x++) {
        if (this.grid[by][x] === TILE_TYPE.WATER) {
          let endX = x;
          while (endX < this.cols - 2 && this.grid[by][endX] === TILE_TYPE.WATER) {
            endX++;
          }
          if (endX - x <= 14) {
            this._buildBridge(Math.max(1, x - 1), by, Math.min(this.cols - 2, endX), by);
          }
          x = endX;
        }
      }
    }

    // 4. Place 4 to 6 random houses
    const numHouses = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numHouses; i++) {
      const hx = (i % 2 === 0) ? 3 + Math.floor(Math.random() * 10) : 40 + Math.floor(Math.random() * 10);
      const hy = 4 + Math.floor(Math.random() * 30);
      this._placeBuilding(hx, hy, 4 + Math.floor(Math.random() * 2), 3 + Math.floor(Math.random() * 2));
    }

    // 5. Place 6 to 10 random forest clusters
    const numForests = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numForests; i++) {
      const fx = 3 + Math.floor(Math.random() * (this.cols - 6));
      const fy = 3 + Math.floor(Math.random() * (this.rows - 6));
      this._placeForestCluster(fx, fy, 3, 10);
    }

    // 6. Find safe start (NPC) and goal (MC) positions
    const npcStart = this._findFirstWalkableTile(3, 15, 10, 25);
    const mcStart = this._findFirstWalkableTile(44, 15, 52, 25);

    // 7. Verify connectivity between NPC and MC
    if (!this._isPathPossible(npcStart, mcStart)) {
      const startX = Math.min(npcStart.x, mcStart.x);
      const endX = Math.max(npcStart.x, mcStart.x);
      const midY = Math.min(this.rows - 2, Math.max(1, Math.round((npcStart.y + mcStart.y) / 2)));

      for (let x = startX; x <= endX; x++) {
        const tile = this.grid[midY][x];
        if (tile === TILE_TYPE.WATER) {
          this.grid[midY][x] = TILE_TYPE.BRIDGE;
        } else if (tile === TILE_TYPE.WALL || tile === TILE_TYPE.TREE || tile === TILE_TYPE.HOUSE_ROOF) {
          this.grid[midY][x] = TILE_TYPE.PATH;
        }
      }

      for (let y = 1; y < this.rows - 1; y++) {
        const x = startX + Math.max(0, Math.min(endX - startX, 1));
        if (this.isValid(x, y) && !this.isWalkable(x, y)) {
          this.grid[y][x] = TILE_TYPE.PATH;
        }
      }
    }

    return { npcStart, mcStart };
  }

  _placeForestCluster(centerX, centerY, radius, count) {
    for (let i = 0; i < count; i++) {
      const tx = Math.round(centerX + (Math.random() * 2 - 1) * radius);
      const ty = Math.round(centerY + (Math.random() * 2 - 1) * radius);
      if (this.isValid(tx, ty) && this.grid[ty][tx] === TILE_TYPE.GRASS) {
        this.grid[ty][tx] = TILE_TYPE.TREE;
      }
    }
  }

  _placeBuilding(startX, startY, width, height) {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const x = startX + dx;
        const y = startY + dy;
        if (!this.isValid(x, y)) continue;

        if (dy === 0) {
          this.grid[y][x] = TILE_TYPE.HOUSE_ROOF;
        } else {
          this.grid[y][x] = TILE_TYPE.WALL;
        }
      }
    }
  }

  _findFirstWalkableTile(minX, minY, maxX, maxY) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
    return { x: 5, y: 20 };
  }

  _isPathPossible(start, goal) {
    // Quick BFS connectivity test
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.x === goal.x && curr.y === goal.y) return true;

      for (const d of dirs) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        const key = `${nx},${ny}`;
        if (this.isWalkable(nx, ny) && !visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return false;
  }
}
