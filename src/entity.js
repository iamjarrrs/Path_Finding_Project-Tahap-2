// Entity System: Player and NPCs
// Handles movement, sprite animations, and path traversal

import { DIRECTION, TILE_SIZE, DIR_OFFSETS } from './constants.js';

export class Entity {
  constructor(gridX, gridY, characterKey) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.pixelX = gridX * TILE_SIZE;
    this.pixelY = gridY * TILE_SIZE;
    this.targetGridX = gridX;
    this.targetGridY = gridY;

    this.characterKey = characterKey;
    this.direction = DIRECTION.DOWN;
    this.isMoving = false;

    this.animFrame = 0;
    this.animSpeed = 12; // Frames per second

    this.speed = 3.5; // Tiles per second
    this.moveProgress = 1.0; // 0.0 to 1.0 between current tile and target tile
  }

  setPosition(gx, gy) {
    this.gridX = gx;
    this.gridY = gy;
    this.targetGridX = gx;
    this.targetGridY = gy;
    this.pixelX = gx * TILE_SIZE;
    this.pixelY = gy * TILE_SIZE;
    this.isMoving = false;
    this.moveProgress = 1.0;
  }

  updateAnimation(deltaTime) {
    if (this.isMoving) {
      this.animFrame += this.animSpeed * deltaTime;
    } else {
      // Slower idle breathing
      this.animFrame += (this.animSpeed * 0.4) * deltaTime;
    }
  }
}

export class Player extends Entity {
  constructor(gridX, gridY) {
    super(gridX, gridY, 'alex');
    this.speed = 4.2; // Smooth, responsive player speed
  }

  handleInput(keys, map, deltaTime) {
    if (this.moveProgress < 1.0) {
      // Continue moving towards target tile
      this.moveProgress += (this.speed * deltaTime);
      if (this.moveProgress >= 1.0) {
        this.moveProgress = 1.0;
        this.gridX = this.targetGridX;
        this.gridY = this.targetGridY;
        this.pixelX = this.gridX * TILE_SIZE;
        this.pixelY = this.gridY * TILE_SIZE;
        this.isMoving = false;
      } else {
        // Interpolate pixel position
        const startPx = this.gridX * TILE_SIZE;
        const startPy = this.gridY * TILE_SIZE;
        const targetPx = this.targetGridX * TILE_SIZE;
        const targetPy = this.targetGridY * TILE_SIZE;
        this.pixelX = startPx + (targetPx - startPx) * this.moveProgress;
        this.pixelY = startPy + (targetPy - startPy) * this.moveProgress;
      }
      this.updateAnimation(deltaTime);
      return;
    }

    // Check key inputs for next step
    let dx = 0;
    let dy = 0;
    let dir = this.direction;

    if (keys['ArrowUp'] || keys['KeyW'] || keys['w'] || keys['W']) {
      dy = -1;
      dir = DIRECTION.UP;
    } else if (keys['ArrowDown'] || keys['KeyS'] || keys['s'] || keys['S']) {
      dy = 1;
      dir = DIRECTION.DOWN;
    } else if (keys['ArrowLeft'] || keys['KeyA'] || keys['a'] || keys['A']) {
      dx = -1;
      dir = DIRECTION.LEFT;
    } else if (keys['ArrowRight'] || keys['KeyD'] || keys['d'] || keys['D']) {
      dx = 1;
      dir = DIRECTION.RIGHT;
    }

    if (dx !== 0 || dy !== 0) {
      this.direction = dir;
      const nextX = this.gridX + dx;
      const nextY = this.gridY + dy;

      if (map.isWalkable(nextX, nextY)) {
        this.targetGridX = nextX;
        this.targetGridY = nextY;
        this.moveProgress = 0.0;
        this.isMoving = true;
      } else {
        this.isMoving = false;
      }
    } else {
      this.isMoving = false;
    }

    this.updateAnimation(deltaTime);
  }
}

export class NPC extends Entity {
  constructor(gridX, gridY, characterKey = 'bob') {
    super(gridX, gridY, characterKey);
    this.speed = 3.2; // Slightly slower than player for fun chase gameplay
    this.path = []; // List of {x, y} coordinates to follow
    this.pathIndex = 0;
    this.status = 'idle'; // 'idle', 'moving', 'reached', 'no_path'
    this.autoFollow = true;
    this.lastGoalX = -1;
    this.lastGoalY = -1;
  }

  setPath(pathResult) {
    if (!pathResult || !pathResult.found || pathResult.path.length <= 1) {
      this.path = [];
      this.pathIndex = 0;
      this.status = (pathResult && pathResult.found && pathResult.path.length === 1) ? 'reached' : 'no_path';
      return;
    }

    this.path = pathResult.path;
    // Step 0 is current position, start moving towards step 1
    this.pathIndex = 1;
    this.status = 'moving';
  }

  stopMovement() {
    this.path = [];
    this.pathIndex = 0;
    this.targetGridX = this.gridX;
    this.targetGridY = this.gridY;
    this.pixelX = this.gridX * TILE_SIZE;
    this.pixelY = this.gridY * TILE_SIZE;
    this.moveProgress = 1.0;
    this.isMoving = false;
    this.status = 'idle';
  }

  update(map, deltaTime) {
    this.updateAnimation(deltaTime);

    if (this.moveProgress < 1.0) {
      // Continue step transition towards target tile
      this.moveProgress += (this.speed * deltaTime);
      if (this.moveProgress >= 1.0) {
        this.moveProgress = 1.0;
        this.gridX = this.targetGridX;
        this.gridY = this.targetGridY;
        this.pixelX = this.gridX * TILE_SIZE;
        this.pixelY = this.gridY * TILE_SIZE;
        this.isMoving = false;

        // Advance to next waypoint in path
        if (this.path && this.pathIndex < this.path.length - 1) {
          this.pathIndex++;
          this._startMovingToNextWaypoint(map);
        } else {
          this.status = 'reached';
        }
      } else {
        // Smoothly interpolate pixel coordinates
        const startPx = this.gridX * TILE_SIZE;
        const startPy = this.gridY * TILE_SIZE;
        const targetPx = this.targetGridX * TILE_SIZE;
        const targetPy = this.targetGridY * TILE_SIZE;
        this.pixelX = startPx + (targetPx - startPx) * this.moveProgress;
        this.pixelY = startPy + (targetPy - startPy) * this.moveProgress;
      }
      return;
    }

    // If currently at rest, start next step if path is available
    if (this.path && this.pathIndex < this.path.length) {
      this._startMovingToNextWaypoint(map);
    }
  }

  _startMovingToNextWaypoint(map) {
    if (!this.path || this.pathIndex >= this.path.length) {
      this.status = 'reached';
      this.isMoving = false;
      return;
    }

    const nextTile = this.path[this.pathIndex];
    if (!nextTile) return;

    // Check if adjacent tile is still walkable
    if (!map.isWalkable(nextTile.x, nextTile.y)) {
      this.status = 'blocked';
      this.isMoving = false;
      return;
    }

    // Determine direction
    const dx = nextTile.x - this.gridX;
    const dy = nextTile.y - this.gridY;

    if (dx > 0) this.direction = DIRECTION.RIGHT;
    else if (dx < 0) this.direction = DIRECTION.LEFT;
    else if (dy > 0) this.direction = DIRECTION.DOWN;
    else if (dy < 0) this.direction = DIRECTION.UP;

    this.targetGridX = nextTile.x;
    this.targetGridY = nextTile.y;
    this.moveProgress = 0.0;
    this.isMoving = true;
    this.status = 'moving';
  }
}
