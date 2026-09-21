// Canvas Rendering Engine with Camera Follow & Corner Minimap
// Handles crisp pixel-art tilemap, animated sprites, and AI search debug overlays

import {
  TILE_SIZE,
  DEBUG_COLORS,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  MINIMAP_WIDTH,
  MINIMAP_HEIGHT,
  GRID_COLS,
  GRID_ROWS,
} from './constants.js';

export class Renderer {
  constructor(canvas, tilesetManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false; // Crisp pixel art
    this.tileset = tilesetManager;

    // Debug Display Flags
    this.showExplored = false;
    this.showFrontier = false;
    this.showPath = false;
    this.showGrid = false;
    this.showTileStats = false;
    this.showMinimap = true;

    this.brushPreview = null; // { x, y } in world grid coordinates
  }

  render(map, player, npc, pathResult, camera) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    // Get visible grid tile range for efficient viewport culling
    const bounds = camera.getVisibleGridBounds();

    // 1. Render Visible Tilemap
    for (let y = bounds.startRow; y <= bounds.endRow; y++) {
      for (let x = bounds.startCol; x <= bounds.endCol; x++) {
        const tileType = map.getTile(x, y);
        const screen = camera.worldToScreen(x * TILE_SIZE, y * TILE_SIZE);
        this.tileset.drawTile(ctx, tileType, screen.sx, screen.sy);
      }
    }

    // 2. Render Debug Overlays (Explored & Frontier)
    if (pathResult) {
      if (this.showExplored && pathResult.explored) {
        this._renderExploredNodes(ctx, pathResult.explored, camera, bounds);
      }
      if (this.showFrontier && pathResult.frontier) {
        this._renderFrontierNodes(ctx, pathResult.frontier, camera, bounds);
      }
    }

    // 3. Render Chosen Path Line
    if (this.showPath && pathResult && pathResult.path && pathResult.path.length > 0) {
      this._renderPath(ctx, pathResult.path, camera);
    }

    // 4. Render Start & Goal Rings
    this._renderEntityRings(ctx, npc, player, camera);

    // 5. Render Entities (Depth-sorted by Y position)
    const entities = [
      { entity: player, type: 'alex', label: 'MC (Alex)' },
      { entity: npc, type: 'bob', label: 'NPC (Bob)' },
    ];
    entities.sort((a, b) => a.entity.pixelY - b.entity.pixelY);

    for (const item of entities) {
      const e = item.entity;
      const screen = camera.worldToScreen(e.pixelX, e.pixelY);
      this.tileset.drawCharacter(
        ctx,
        e.characterKey,
        e.isMoving,
        e.direction,
        e.animFrame,
        screen.sx,
        screen.sy
      );
      this._renderEntityLabel(ctx, item.label, screen.sx, screen.sy, e.characterKey);
    }

    // 6. Optional Grid Lines & Tile Values
    if (this.showGrid) {
      this._renderGridLines(ctx, camera, bounds);
    }

    if (this.showTileStats && pathResult && pathResult.explored) {
      this._renderTileFGH(ctx, pathResult.explored, camera, bounds);
    }

    // 7. Mouse Brush Cursor Preview
    if (this.brushPreview) {
      const screen = camera.worldToScreen(
        this.brushPreview.x * TILE_SIZE,
        this.brushPreview.y * TILE_SIZE
      );
      this._renderBrushPreview(ctx, screen.sx, screen.sy);
    }

    // 8. Corner Minimap HUD
    if (this.showMinimap) {
      this._renderMinimap(ctx, map, player, npc, pathResult, camera);
    }
  }

  _renderExploredNodes(ctx, explored, camera, bounds) {
    const total = explored.length;
    for (let i = 0; i < total; i++) {
      const node = explored[i];
      // Skip offscreen nodes
      if (node.x < bounds.startCol || node.x > bounds.endCol ||
          node.y < bounds.startRow || node.y > bounds.endRow) {
        continue;
      }

      const screen = camera.worldToScreen(node.x * TILE_SIZE, node.y * TILE_SIZE);
      const ratio = i / Math.max(total, 1);

      ctx.fillStyle = `rgba(59, 130, 246, ${0.25 + ratio * 0.35})`;
      ctx.fillRect(screen.sx, screen.sy, TILE_SIZE, TILE_SIZE);

      ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(screen.sx + 0.5, screen.sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  _renderFrontierNodes(ctx, frontier, camera, bounds) {
    ctx.fillStyle = DEBUG_COLORS.FRONTIER_FILL;
    ctx.strokeStyle = DEBUG_COLORS.FRONTIER_BORDER;
    ctx.lineWidth = 2;

    for (const node of frontier) {
      if (node.x < bounds.startCol || node.x > bounds.endCol ||
          node.y < bounds.startRow || node.y > bounds.endRow) {
        continue;
      }

      const screen = camera.worldToScreen(node.x * TILE_SIZE, node.y * TILE_SIZE);
      ctx.fillRect(screen.sx + 2, screen.sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeRect(screen.sx + 2, screen.sy + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  _renderPath(ctx, path, camera) {
    if (path.length <= 1) return;

    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const screen = camera.worldToScreen(
        path[i].x * TILE_SIZE + TILE_SIZE / 2,
        path[i].y * TILE_SIZE + TILE_SIZE / 2
      );
      if (i === 0) {
        ctx.moveTo(screen.sx, screen.sy);
      } else {
        ctx.lineTo(screen.sx, screen.sy);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Waypoint dots
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < path.length; i++) {
      const screen = camera.worldToScreen(
        path[i].x * TILE_SIZE + TILE_SIZE / 2,
        path[i].y * TILE_SIZE + TILE_SIZE / 2
      );
      ctx.beginPath();
      ctx.arc(screen.sx, screen.sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _renderEntityRings(ctx, npc, player, camera) {
    const sNpc = camera.worldToScreen(npc.pixelX + TILE_SIZE / 2, npc.pixelY + TILE_SIZE / 2);
    ctx.save();
    ctx.strokeStyle = DEBUG_COLORS.START_RING;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sNpc.sx, sNpc.sy + 4, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const sPlayer = camera.worldToScreen(player.pixelX + TILE_SIZE / 2, player.pixelY + TILE_SIZE / 2);
    ctx.save();
    ctx.strokeStyle = DEBUG_COLORS.GOAL_RING;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(sPlayer.sx, sPlayer.sy + 4, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _renderEntityLabel(ctx, label, sx, sy, characterKey) {
    const isAlex = characterKey === 'alex';
    const tagY = sy - 36;
    const tagX = sx + TILE_SIZE / 2;

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';

    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(tagX - textWidth / 2 - 4, tagY - 10, textWidth + 8, 14);

    ctx.fillStyle = isAlex ? '#f87171' : '#60a5fa';
    ctx.fillText(label, tagX, tagY);
  }

  _renderGridLines(ctx, camera, bounds) {
    ctx.strokeStyle = DEBUG_COLORS.GRID_LINES;
    ctx.lineWidth = 1;

    for (let x = bounds.startCol; x <= bounds.endCol; x++) {
      const s = camera.worldToScreen(x * TILE_SIZE, 0);
      ctx.beginPath();
      ctx.moveTo(s.sx, 0);
      ctx.lineTo(s.sx, VIEWPORT_HEIGHT);
      ctx.stroke();
    }
    for (let y = bounds.startRow; y <= bounds.endRow; y++) {
      const s = camera.worldToScreen(0, y * TILE_SIZE);
      ctx.beginPath();
      ctx.moveTo(0, s.sy);
      ctx.lineTo(VIEWPORT_WIDTH, s.sy);
      ctx.stroke();
    }
  }

  _renderTileFGH(ctx, explored, camera, bounds) {
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    for (const n of explored) {
      if (n.x < bounds.startCol || n.x > bounds.endCol ||
          n.y < bounds.startRow || n.y > bounds.endRow) {
        continue;
      }
      const s = camera.worldToScreen(n.x * TILE_SIZE + TILE_SIZE / 2, n.y * TILE_SIZE);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`g:${Math.round(n.g)}`, s.sx, s.sy + 11);
      ctx.fillStyle = '#fde047';
      ctx.fillText(`h:${Math.round(n.h)}`, s.sx, s.sy + 20);
      ctx.fillStyle = '#6ee7b7';
      ctx.fillText(`f:${Math.round(n.f)}`, s.sx, s.sy + 29);
    }
  }

  _renderBrushPreview(ctx, sx, sy) {
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.setLineDash([]);
  }

  // --- Corner Minimap HUD ---
  _renderMinimap(ctx, map, player, npc, pathResult, camera) {
    const pad = 12;
    const mx = VIEWPORT_WIDTH - MINIMAP_WIDTH - pad;
    const my = pad;
    const scaleX = MINIMAP_WIDTH / map.cols;
    const scaleY = MINIMAP_HEIGHT / map.rows;

    ctx.save();

    // Background Card
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.fillRect(mx, my, MINIMAP_WIDTH, MINIMAP_HEIGHT);
    ctx.strokeRect(mx, my, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Terrain color map
    for (let y = 0; y < map.rows; y++) {
      for (let x = 0; x < map.cols; x++) {
        const t = map.getTile(x, y);
        let col = '#22c55e'; // Grass
        if (t === 2) col = '#0284c7';      // Water
        else if (t === 3) col = '#a16207'; // Bridge
        else if (t === 4) col = '#991b1b'; // Wall
        else if (t === 5) col = '#c2410c'; // Roof
        else if (t === 6) col = '#15803d'; // Tree
        else if (t === 7) col = '#713f12'; // Mud
        else if (t === 1) col = '#e2d9c8'; // Path

        ctx.fillStyle = col;
        ctx.fillRect(mx + x * scaleX, my + y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
      }
    }

    // Explored search wave on minimap
    if (this.showExplored && pathResult && pathResult.explored) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.65)';
      for (const node of pathResult.explored) {
        ctx.fillRect(mx + node.x * scaleX, my + node.y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
      }
    }

    // Path trail on minimap
    if (this.showPath && pathResult && pathResult.path && pathResult.path.length > 0) {
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < pathResult.path.length; i++) {
        const px = mx + pathResult.path[i].x * scaleX + scaleX / 2;
        const py = my + pathResult.path[i].y * scaleY + scaleY / 2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Camera Viewport Rectangle on minimap
    const camGx = camera.x / TILE_SIZE;
    const camGy = camera.y / TILE_SIZE;
    const camGw = camera.viewportWidth / TILE_SIZE;
    const camGh = camera.viewportHeight / TILE_SIZE;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + camGx * scaleX, my + camGy * scaleY, camGw * scaleX, camGh * scaleY);

    // Entity blips
    // NPC Bob (Blue)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(mx + npc.gridX * scaleX + scaleX / 2, my + npc.gridY * scaleY + scaleY / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Player MC Alex (Red)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(mx + player.gridX * scaleX + scaleX / 2, my + player.gridY * scaleY + scaleY / 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Mini-label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px monospace';
    ctx.fillText('MAP 56x40', mx + 4, my + 10);

    ctx.restore();
  }
}
