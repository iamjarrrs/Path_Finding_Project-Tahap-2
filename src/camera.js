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

    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;

    this.smoothSpeed = 5.0; // Lerp speed
  }

  follow(targetEntity, immediate = false) {
    if (!targetEntity) return;

    // Desired camera position to center the entity
    const desiredX = targetEntity.pixelX + TILE_SIZE / 2 - this.viewportWidth / 2;
    const desiredY = targetEntity.pixelY + TILE_SIZE / 2 - this.viewportHeight / 2;

    // Clamp to world boundaries
    const maxX = Math.max(0, WORLD_WIDTH - this.viewportWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewportHeight);

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
    const maxX = Math.max(0, WORLD_WIDTH - this.viewportWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewportHeight);
    this.x = Math.max(0, Math.min(this.x, maxX));
    this.y = Math.max(0, Math.min(this.y, maxY));
  }

  worldToScreen(wx, wy) {
    return {
      sx: wx - this.x,
      sy: wy - this.y,
    };
  }

  screenToWorld(sx, sy) {
    return {
      wx: sx + this.x,
      wy: sy + this.y,
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
    const endCol = Math.min(GRID_COLS - 1, Math.ceil((this.x + this.viewportWidth) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(this.y / TILE_SIZE) - 1);
    const endRow = Math.min(GRID_ROWS - 1, Math.ceil((this.y + this.viewportHeight) / TILE_SIZE) + 1);

    return { startCol, endCol, startRow, endRow };
  }
}
