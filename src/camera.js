// 2D Follow Camera System
// Smoothly centers on the target entity with world boundary clamping and viewport culling

import {
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
} from './constants.js';

export class Camera {
  constructor(viewportWidth = VIEWPORT_WIDTH, viewportHeight = VIEWPORT_HEIGHT) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.cols = GRID_COLS;
    this.rows = GRID_ROWS;
    this.worldWidth = WORLD_WIDTH;
    this.worldHeight = WORLD_HEIGHT;
    this.zoom = 1.8;

    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;

    this.smoothSpeed = 5.0; // Lerp speed
  }

  setWorldSize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.worldWidth = cols * TILE_SIZE;
    this.worldHeight = rows * TILE_SIZE;
  }

  follow(targetEntity, immediate = false) {
    if (!targetEntity) return;

    // Desired camera position to center the entity
    const desiredX = targetEntity.pixelX + TILE_SIZE / 2 - this.viewportWidth / (2 * this.zoom);
    const desiredY = targetEntity.pixelY + TILE_SIZE / 2 - this.viewportHeight / (2 * this.zoom);

    // Clamp to world boundaries
    const maxX = Math.max(0, this.worldWidth - this.viewportWidth / this.zoom);
    const maxY = Math.max(0, this.worldHeight - this.viewportHeight / this.zoom);

    this.targetX = Math.max(0, Math.min(desiredX, maxX));
    this.targetY = Math.max(0, Math.min(desiredY, maxY));

    if (immediate) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  update(deltaTime) {
    // Smooth lerp towards target
    const factor = Math.min(1.0, this.smoothSpeed * deltaTime);
    this.x += (this.targetX - this.x) * factor;
    this.y += (this.targetY - this.y) * factor;

    // Re-clamp
    const maxX = Math.max(0, this.worldWidth - this.viewportWidth / this.zoom);
    const maxY = Math.max(0, this.worldHeight - this.viewportHeight / this.zoom);
    this.x = Math.max(0, Math.min(this.x, maxX));
    this.y = Math.max(0, Math.min(this.y, maxY));
  }

  worldToScreen(wx, wy) {
    return {
      sx: wx,
      sy: wy,
    };
  }

  screenToWorld(sx, sy) {
    return {
      wx: sx / this.zoom + this.x,
      wy: sy / this.zoom + this.y,
    };
  }

  screenToGrid(sx, sy) {
    const world = this.screenToWorld(sx, sy);
    return {
      gx: Math.floor(world.wx / TILE_SIZE),
      gy: Math.floor(world.wy / TILE_SIZE),
    };
  }

  // Returns visible tile index bounds for efficient viewport culling
  getVisibleGridBounds() {
    const startCol = Math.max(0, Math.floor(this.x / TILE_SIZE) - 1);
    const endCol = Math.min(this.cols - 1, Math.ceil((this.x + this.viewportWidth / this.zoom) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(this.y / TILE_SIZE) - 1);
    const endRow = Math.min(this.rows - 1, Math.ceil((this.y + this.viewportHeight / this.zoom) / TILE_SIZE) + 1);

    return { startCol, endCol, startRow, endRow };
  }
}
