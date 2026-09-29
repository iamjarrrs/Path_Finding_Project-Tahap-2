// Tileset & Sprite Loader Module
// Handles character sprite animations and tile graphics

import { TILE_TYPE, TILE_SIZE, DIRECTION } from './constants.js';

export class TilesetManager {
  constructor() {
    this.images = {};
    this.proceduralTiles = {};
    this.treeImages = [];
    this.loaded = false;
    this.waterAnimFrame = 0;
  }

  async loadAssets() {
    const treeAssets = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`tree_${i + 1}`, `trees/spr_tree_${i + 1}.png`])
    );

    const assetsToLoad = {
      mapBackground: 'assets/map/map_40x30.png',
      mcKnight: 'assets/mc/knight_joy.png',
      npcNecromancer: 'assets/npc/necromancer/Necromancer_creativekind-Sheet.png',
      npcEvilKnight: 'assets/npc/evil_knight/knight_spritesheet.png',
      npcGoblinArcher: 'assets/npc/archer/GoblinArcheranim.png',
      npcBarbarian: 'assets/npc/barbarian/Barbarian.png',
      interiors: 'Interiors_free/16x16/Interiors_free_16x16.png',
      roomBuilder: 'Interiors_free/16x16/Room_Builder_free_16x16.png',
      ...treeAssets,
    };

    const promises = Object.entries(assetsToLoad).map(([key, src]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images[key] = img;
          resolve(true);
        };
        img.onerror = () => {
          console.warn(`Could not load image: ${src}. Fallback rendering will be used.`);
          resolve(false);
        };
        img.src = src;
      });
    });

    await Promise.all(promises);
    this.treeImages = Object.entries(this.images)
      .filter(([key]) => key.startsWith('tree_'))
      .map(([, img]) => img);
    this._generateProceduralTiles();
    this.loaded = true;
  }

  _generateProceduralTiles() {
    // Generate authentic pixel-art patterns on offscreen canvases (32x32)
    const createTileCanvas = (drawFn) => {
      const c = document.createElement('canvas');
      c.width = TILE_SIZE;
      c.height = TILE_SIZE;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      drawFn(ctx);
      return c;
    };

    // 1. Grass Tile
    this.proceduralTiles[TILE_TYPE.GRASS] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#2d6d34';
      ctx.fillRect(0, 0, 32, 32);

      for (let i = 0; i < 14; i++) {
        const x = (i * 7 + 3) % 32;
        const y = (i * 11 + 5) % 32;
        const w = 3 + (i % 3);
        const h = 4 + (i % 4);
        ctx.fillStyle = i % 2 === 0 ? '#2c6530' : '#3b9a4d';
        ctx.fillRect(x, y, w, h);
      }

      ctx.fillStyle = '#6ecb6f';
      for (let i = 0; i < 10; i++) {
        const x = (i * 9 + 2) % 31;
        const y = (i * 13 + 4) % 28;
        ctx.fillRect(x, y, 1, 3);
        ctx.fillRect(x + 1, y - 1, 1, 2);
      }
    });

    // 2. Cobblestone Path Tile
    this.proceduralTiles[TILE_TYPE.PATH] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#e2d9c8'; // Warm stone base
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#b7a992'; // Mortar grooves
      ctx.fillRect(0, 15, 32, 2);
      ctx.fillRect(15, 0, 2, 16);
      ctx.fillRect(24, 16, 2, 16);
      ctx.fillRect(7, 16, 2, 16);
      // Stones highlights & bevels
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(1, 1, 13, 2);
      ctx.fillRect(18, 1, 13, 2);
      ctx.fillRect(1, 17, 5, 2);
      ctx.fillRect(10, 17, 13, 2);
    });

    // 3. Water Tiles (Animated variations)
    this.waterFrames = [0, 1, 2].map((f) => {
      return createTileCanvas((ctx) => {
        ctx.fillStyle = '#1d7fb1';
        ctx.fillRect(0, 0, 32, 32);

        const offset = f * 6;
        ctx.fillStyle = '#59cfff';
        for (let y = 3; y < 32; y += 7) {
          const waveX = (offset + y * 2) % 32;
          ctx.fillRect(waveX, y, 12, 2);
        }

        ctx.fillStyle = '#bfefff';
        for (let i = 0; i < 6; i++) {
          const x = (i * 7 + offset) % 32;
          const y = 4 + (i % 4) * 6;
          ctx.fillRect(x, y, 3, 2);
        }
      });
    });
    this.proceduralTiles[TILE_TYPE.WATER] = this.waterFrames[0];

    // 4. Wooden Bridge Tile
    this.proceduralTiles[TILE_TYPE.BRIDGE] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#854d0e'; // Dark wood base
      ctx.fillRect(0, 0, 32, 32);
      // Horizontal bridge planks
      for (let y = 0; y < 32; y += 8) {
        ctx.fillStyle = '#a16207'; // Plank top
        ctx.fillRect(2, y + 1, 28, 6);
        ctx.fillStyle = '#ca8a04'; // Plank highlight
        ctx.fillRect(2, y + 1, 28, 1);
        ctx.fillStyle = '#713f12'; // Plank shadow groove
        ctx.fillRect(0, y + 7, 32, 1);
        // Iron nails
        ctx.fillStyle = '#475569';
        ctx.fillRect(4, y + 3, 2, 2);
        ctx.fillRect(26, y + 3, 2, 2);
      }
      // Bridge side railings
      ctx.fillStyle = '#713f12';
      ctx.fillRect(0, 0, 2, 32);
      ctx.fillRect(30, 0, 2, 32);
    });

    // 5. House Brick Wall Tile
    this.proceduralTiles[TILE_TYPE.WALL] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#991b1b'; // Brick red
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#fca5a5'; // Mortar
      for (let y = 0; y < 32; y += 8) {
        ctx.fillRect(0, y, 32, 1);
        const shift = (y / 8) % 2 === 0 ? 0 : 8;
        for (let x = shift; x < 32; x += 16) {
          ctx.fillRect(x, y, 1, 8);
        }
      }
      // Top concrete rim
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 32, 3);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(0, 3, 32, 1);
    });

    // 6. House Terracotta Roof Tile
    this.proceduralTiles[TILE_TYPE.HOUSE_ROOF] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#c2410c'; // Warm terracotta
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#ea580c'; // Shingle row highlights
      for (let y = 0; y < 32; y += 8) {
        ctx.fillRect(0, y, 32, 3);
        ctx.fillStyle = '#7c2d12'; // Shingle shadow
        ctx.fillRect(0, y + 7, 32, 1);
        ctx.fillStyle = '#ea580c';
      }
    });

    // 7. Tree Tile
    this.proceduralTiles[TILE_TYPE.TREE] = createTileCanvas((ctx) => {
      // Grass background
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, 32, 32);

      // Soft ground shadow to ground the tree
      ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
      ctx.beginPath();
      ctx.ellipse(16, 25, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trunk with natural taper and bark lines
      ctx.fillStyle = '#7c4a1f';
      ctx.fillRect(13, 18, 7, 12);
      ctx.fillStyle = '#5b3417';
      ctx.fillRect(16, 18, 3, 12);
      ctx.fillStyle = '#a66a32';
      ctx.fillRect(12, 20, 2, 9);
      ctx.fillRect(19, 20, 2, 9);
      ctx.fillStyle = '#4a2b12';
      ctx.fillRect(14, 18, 1, 12);
      ctx.fillRect(18, 18, 1, 12);

      // Foliage clusters with uneven organic shapes
      ctx.fillStyle = '#1e5b2d';
      ctx.beginPath();
      ctx.ellipse(11, 12, 8, 7, -0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(20, 12, 9, 7, 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2f8f46';
      ctx.beginPath();
      ctx.ellipse(15, 10, 12, 9, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#5ae27b';
      ctx.beginPath();
      ctx.ellipse(14, 8, 6, 5, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(19, 9, 7, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#9be7a8';
      ctx.beginPath();
      ctx.ellipse(12, 9, 4, 3.5, -0.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(20, 8, 4, 3, 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    // 8. Mud Tile (Higher movement cost = 3)
    this.proceduralTiles[TILE_TYPE.MUD] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#4b2f1a';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#704421';
      ctx.fillRect(4, 6, 12, 8);
      ctx.fillRect(16, 16, 12, 8);
      ctx.fillStyle = '#2f4a1a';
      ctx.fillRect(2, 2, 4, 3);
      ctx.fillRect(24, 22, 6, 3);
      ctx.fillStyle = '#8d5124';
      ctx.fillRect(6, 8, 4, 2);
    });

    // 9. Interior Floor Parquet Tile
    this.proceduralTiles[TILE_TYPE.FLOOR] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#fed7aa'; // Warm oak floor
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#f97316'; // Wood grain
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(16, 16, 16, 16);
      ctx.fillStyle = '#c2410c';
      ctx.fillRect(0, 15, 32, 1);
      ctx.fillRect(15, 0, 1, 32);
    });

    // 10. Interior Furniture Tile (Solid)
    this.proceduralTiles[TILE_TYPE.FURNITURE] = createTileCanvas((ctx) => {
      ctx.fillStyle = '#fed7aa'; // Floor behind furniture
      ctx.fillRect(0, 0, 32, 32);
      // Desk
      ctx.fillStyle = '#7c2d12'; // Mahogany table top
      ctx.fillRect(2, 4, 28, 22);
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(4, 6, 24, 18);
      // Book / Laptop on table
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(8, 10, 8, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(9, 11, 6, 4);
    });
  }

  update(deltaTime) {
    // Animate water ripples
    this.waterAnimTimer = (this.waterAnimTimer || 0) + deltaTime;
    if (this.waterAnimTimer > 0.3) {
      this.waterAnimTimer = 0;
      this.waterAnimFrame = (this.waterAnimFrame + 1) % 3;
      if (this.waterFrames && this.waterFrames[this.waterAnimFrame]) {
        this.proceduralTiles[TILE_TYPE.WATER] = this.waterFrames[this.waterAnimFrame];
      }
    }
  }

  drawMapBackground(ctx, map, camera) {
    const image = this.images.mapBackground;
    if (!image || !image.complete || image.naturalWidth === 0) return false;

    ctx.drawImage(
      image,
      0,
      0,
      image.naturalWidth,
      image.naturalHeight,
      0,
      0,
      map.cols * TILE_SIZE,
      map.rows * TILE_SIZE
    );
    return true;
  }

  drawMapThumbnail(ctx, x, y, width, height) {
    const image = this.images.mapBackground;
    if (!image || !image.complete || image.naturalWidth === 0) return false;

    ctx.drawImage(image, x, y, width, height);
    return true;
  }

  drawTile(ctx, tileType, x, y) {
    if (tileType === TILE_TYPE.TREE && this.treeImages && this.treeImages.length > 0) {
      const treeImage = this.treeImages[0];
      if (treeImage && treeImage.complete && treeImage.naturalWidth > 0) {
        const grassTile = this.proceduralTiles[TILE_TYPE.GRASS];
        if (grassTile) {
          ctx.drawImage(grassTile, x, y, TILE_SIZE, TILE_SIZE);
        }

        ctx.imageSmoothingEnabled = false;

        const drawW = 128;
        const drawH = 128;
        const drawX = x - 48;
        const drawY = y - 96;
        ctx.drawImage(treeImage, drawX, drawY, drawW, drawH);
        return;
      }
    }

    const tileCanvas = this.proceduralTiles[tileType];
    if (tileCanvas) {
      ctx.drawImage(tileCanvas, x, y, TILE_SIZE, TILE_SIZE);
    } else {
      // Fallback
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  /**
   * Draws a frame from the selected character sprite sheet.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} characterKey
   * @param {boolean} isMoving
   * @param {number} direction - DIRECTION.RIGHT | UP | LEFT | DOWN
   * @param {number} animFrame - Current animation frame
   * @param {number} worldX - World X in pixels (feet anchor at bottom)
   * @param {number} worldY - World Y in pixels
   */
  drawCharacter(ctx, characterKey, isMoving, direction, animFrame, worldX, worldY) {
    if (characterKey === 'alex') {
      const knight = this.images.mcKnight;
      if (knight && knight.complete && knight.naturalWidth > 0) {
        const frameSize = knight.naturalHeight;
        const framesPerDirection = Math.floor(knight.naturalWidth / frameSize) / 2;
        const directionOffset = direction === DIRECTION.LEFT ? framesPerDirection : 0;
        const animationOffset = isMoving ? Math.floor(animFrame) % framesPerDirection : 0;
        const frame = directionOffset + animationOffset;
        const destW = 96;
        const destH = 96;
        const destX = worldX + (TILE_SIZE - destW) / 2;
        const destY = worldY + TILE_SIZE - destH;
        ctx.drawImage(
          knight,
          frame * frameSize,
          0,
          frameSize,
          frameSize,
          destX,
          destY,
          destW,
          destH
        );
        return;
      }

      this._drawFallbackCharacter(
        ctx,
        characterKey,
        direction,
        worldX - 32,
        worldY - 32,
        64,
        64
      );
      return;
    }

    const spriteConfigs = {
      npc_necromancer: { key: 'npcNecromancer', frameWidth: 160, frameHeight: 128, frames: 8 },
      npc_evil_knight: { key: 'npcEvilKnight', frameWidth: 192, frameHeight: 182, frames: 7 },
      npc_goblin_archer: { key: 'npcGoblinArcher', frameWidth: 128, frameHeight: 128, frames: 8 },
      npc_barbarian: { key: 'npcBarbarian', frameWidth: 160, frameHeight: 160, frames: 10 },
    };
    const config = spriteConfigs[characterKey];
    const spriteSheet = config && this.images[config.key];
    const destSize = 96;
    const scale = destSize / Math.max(config?.frameWidth || destSize, config?.frameHeight || destSize);
    const destW = config ? config.frameWidth * scale : destSize;
    const destH = config ? config.frameHeight * scale : destSize;
    const destX = worldX + (TILE_SIZE - destW) / 2;
    const destY = worldY + TILE_SIZE - destH;

    if (config && spriteSheet && spriteSheet.complete && spriteSheet.naturalWidth > 0) {
      const columns = Math.floor(spriteSheet.naturalWidth / config.frameWidth);
      const frame = isMoving ? Math.floor(animFrame) % Math.min(config.frames, columns) : 0;
      ctx.drawImage(
        spriteSheet,
        frame * config.frameWidth,
        0,
        config.frameWidth,
        config.frameHeight,
        destX,
        destY,
        destW,
        destH
      );
    } else {
      // Procedural fallback avatar
      this._drawFallbackCharacter(ctx, characterKey, direction, destX, destY, destW, destH);
    }
  }

  _drawFallbackCharacter(ctx, characterKey, direction, x, y, w, h) {
    const isAlex = characterKey === 'alex';
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 16, y + 60, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = isAlex ? '#ef4444' : '#3b82f6';
    ctx.fillRect(x + 8, y + 26, 16, 20);

    // Head
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(x + 16, y + 18, 10, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#0f172a';
    if (direction === DIRECTION.RIGHT) {
      ctx.fillRect(x + 20, y + 16, 2, 3);
    } else if (direction === DIRECTION.LEFT) {
      ctx.fillRect(x + 10, y + 16, 2, 3);
    } else if (direction === DIRECTION.DOWN) {
      ctx.fillRect(x + 13, y + 16, 2, 3);
      ctx.fillRect(x + 17, y + 16, 2, 3);
    }
  }
}
