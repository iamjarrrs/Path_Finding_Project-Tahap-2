// Main Game Controller with Camera Follow & Procedural World Generator
// Coordinates map, player, NPC, pathfinding, renderer, and user interface

import {
  TILE_SIZE,
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT,
  MINIMAP_WIDTH,
  MINIMAP_HEIGHT,
  ALGORITHM,
  HEURISTIC,
  TILE_TYPE,
} from './constants.js';
import { GameMap } from './map.js';
import { TilesetManager } from './tileset.js';
import { Entity, Player, NPC } from './entity.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { findPath } from './pathfinding.js';
import { runComparisonBenchmark } from './comparison.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.canvas.width = VIEWPORT_WIDTH;
    this.canvas.height = VIEWPORT_HEIGHT;

    this.tileset = new TilesetManager();
    this.map = new GameMap();
    this.imageMapData = null;
    this.camera = new Camera(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    this.renderer = new Renderer(this.canvas, this.tileset);

    this.player = new Player(3, 3);
    this.npc = new NPC(37, 24, 'npc_goblin_archer');
    this.additionalNpcs = [];
    this.allNpcs = [this.npc];
    this.currentChaser = this.npc;
    this.currentTerritoryId = null;

    // Pathfinding Configuration
    this.currentAlgorithm = ALGORITHM.ASTAR;
    this.currentHeuristic = HEURISTIC.MANHATTAN;
    this.heuristicWeight = 1.0;
    this.allowDiagonal = false;
    this.currentPathResult = null;
    this.npcFollowRadius = 8;

    // NPC Follow Mode: 'standby' (diam, run on command/Enter/Space), 'auto_stop' (diam saat MC jalan, kejar saat berhenti), 'continuous' (kejar real-time)
    this.npcMode = 'standby';

    // Step-by-Step Visualization Mode
    this.isStepMode = false;
    this.stepIndex = 0;

    // Interaction Modes
    this.brushMode = 'play';
    this.isMouseDown = false;

    // Key states
    this.keys = {};

    // Timing
    this.lastTime = performance.now();

    // UI Elements
    this._cacheUIElements();
    this._bindEvents();
  }

  async init() {
    this._updateStatus('Loading pixel assets...');
    await this.tileset.loadAssets();
    if (!this.tileset.images.mapBackground) {
      throw new Error('Could not load the map image at assets/map/map_40x30.png.');
    }
    const response = await fetch('assets/map/map_40x30.json');
    if (!response.ok) {
      throw new Error(`Could not load map collision data: ${response.status} ${response.statusText}`);
    }
    this.imageMapData = await response.json();

    this.loadMapPreset('image_map');
    this.camera.follow(this.player, true);

    this._updateStatus('Ready! Move MC with WASD / Arrows.');
    this.recalculatePath();

    // Start Game Loop
    requestAnimationFrame(this._loop.bind(this));
  }

  loadMapPreset(presetName) {
    const coords = presetName === 'image_map'
      ? this.map.loadImageMap(this.imageMapData)
      : this.map.loadPreset(presetName);
    this.camera.setWorldSize(this.map.cols, this.map.rows);
    this.allNpcs = presetName === 'image_map'
      ? coords.npcs.map(({ x, y, character, territory }) => {
          const npc = new NPC(x, y, `npc_${character}`);
          npc.territory = territory;
          return npc;
        })
      : [new NPC(coords.npcStart.x, coords.npcStart.y)];
    this.npc = this.allNpcs[0];
    this.additionalNpcs = this.allNpcs.slice(1);
    this.currentChaser = null;
    this.currentTerritoryId = null;
    if (this.ui.worldSizeBadge) {
      this.ui.worldSizeBadge.textContent =
        `World: ${this.map.cols}×${this.map.rows} (${this.map.cols * this.map.rows} Tiles)`;
    }
    if (coords) {
      this.player.setPosition(coords.mcStart.x, coords.mcStart.y);
    }
    if (presetName === 'image_map') {
      this._selectTerritoryChaser();
    } else {
      this.currentChaser = this.npc;
    }
    this.camera.follow(this.player, true);
    this.recalculatePath();
    this.render();
  }

  generateRandomMap() {
    const coords = this.map.generateRandomMap();
    this.additionalNpcs = [];
    this.npc = new NPC(coords.npcStart.x, coords.npcStart.y);
    this.allNpcs = [this.npc];
    this.currentChaser = this.npc;
    this.currentTerritoryId = null;
    this.camera.setWorldSize(this.map.cols, this.map.rows);
    if (this.ui.worldSizeBadge) {
      this.ui.worldSizeBadge.textContent =
        `World: ${this.map.cols}×${this.map.rows} (${this.map.cols * this.map.rows} Tiles)`;
    }
    if (coords) {
      this.player.setPosition(coords.mcStart.x, coords.mcStart.y);
    }
    this.camera.follow(this.player, true);
    this.recalculatePath();
    this.render();
    this._updateStatus('Generated new random organic world!');
  }

  _selectTerritoryChaser(region = this.map.getRegionAt(this.player.gridX, this.player.gridY)) {
    const territoryId = region?.id || null;
    if (territoryId === this.currentTerritoryId && this.currentChaser) return false;

    if (this.currentChaser) {
      this.currentChaser.stopMovement();
    }

    this.currentTerritoryId = territoryId;
    this.currentChaser = this.allNpcs.find(npc => npc.territory === territoryId) || null;
    this.npc = this.currentChaser || this.allNpcs[0];
    this.additionalNpcs = this.allNpcs.filter(npc => npc !== this.npc);
    return true;
  }

  recalculatePath(triggerFollow = false) {
    if (this.map.isImageMap && !this.currentChaser) {
      this.currentPathResult = null;
      this.renderer.showExplored = false;
      this.renderer.showFrontier = false;
      this.renderer.showPath = false;
      this._updateStatus('Tidak ada NPC di daratan ini.');
      return;
    }
    const start = { x: this.npc.gridX, y: this.npc.gridY };
    const goal = { x: this.player.gridX, y: this.player.gridY };

    this.currentPathResult = findPath({
      map: this.map,
      start,
      goal,
      algorithm: this.currentAlgorithm,
      heuristic: this.currentHeuristic,
      weight: this.heuristicWeight,
      allowDiagonal: this.allowDiagonal,
    });

    const shouldFollow = triggerFollow || (this.npcMode === 'continuous' && this.npc.autoFollow);
    const shouldVisualize = shouldFollow || this.npc.status === 'moving';

    if (shouldFollow && !this.isStepMode) {
      this.npc.setPath(this.currentPathResult);
    }

    this.renderer.showExplored = shouldVisualize;
    this.renderer.showFrontier = shouldVisualize;
    this.renderer.showPath = shouldVisualize && !!(this.currentPathResult && this.currentPathResult.path && this.currentPathResult.path.length > 1);

    if (this.ui && this.ui.toggleExplored) this.ui.toggleExplored.checked = this.renderer.showExplored;
    if (this.ui && this.ui.toggleFrontier) this.ui.toggleFrontier.checked = this.renderer.showFrontier;
    if (this.ui && this.ui.togglePath) this.ui.togglePath.checked = this.renderer.showPath;

    this._updateHUDStats(this.currentPathResult);
  }

  runNpcPathfinding() {
    if (this.map.isImageMap && !this.currentChaser) {
      this._updateStatus('Tidak ada NPC di daratan ini.');
      return;
    }
    if (this.isStepMode) {
      this.stopStepSearch();
    }    this.renderer.showExplored = true;
    this.renderer.showFrontier = true;
    this.renderer.showPath = true;
    if (this.ui && this.ui.toggleExplored) this.ui.toggleExplored.checked = true;
    if (this.ui && this.ui.toggleFrontier) this.ui.toggleFrontier.checked = true;
    if (this.ui && this.ui.togglePath) this.ui.togglePath.checked = true;
    this.recalculatePath(true);
    if (this.currentPathResult && this.currentPathResult.found) {
      this.npc.setPath(this.currentPathResult);
      this._updateStatus(`▶️ Running! NPC bergerak mengikuti jalur (${this.currentPathResult.path.length} langkah)...`);
    } else {
      this._updateStatus('❌ Tidak ada jalur menuju MC (Terhalang)!');
    }
  }

  stopNpc() {
    this.npc.stopMovement();
    this.renderer.showExplored = false;
    this.renderer.showFrontier = false;
    this.renderer.showPath = false;
    if (this.ui && this.ui.toggleExplored) this.ui.toggleExplored.checked = false;
    if (this.ui && this.ui.toggleFrontier) this.ui.toggleFrontier.checked = false;
    if (this.ui && this.ui.togglePath) this.ui.togglePath.checked = false;
    this._updateStatus('⏸️ NPC Diam (Stopped)');
    this._updateHUDStats(this.currentPathResult);
  }

  _loop(currentTime) {
    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // Update tile animations (water waves)
    this.tileset.update(deltaTime);

    // Track MC movement state
    const wasMcMoving = this.player.isMoving;
    const prevMcX = this.player.gridX;
    const prevMcY = this.player.gridY;
    this.player.handleInput(this.keys, this.map, deltaTime);

    const distanceToNpc = Math.hypot(this.player.gridX - this.npc.gridX, this.player.gridY - this.npc.gridY);
    const shouldAutoChase = this.npcMode === 'continuous' && distanceToNpc <= this.npcFollowRadius;

    if (this.player.gridX !== prevMcX || this.player.gridY !== prevMcY) {
      if (this.map.isImageMap) {
        const region = this.map.getRegionAt(this.player.gridX, this.player.gridY);
        this._selectTerritoryChaser(region);
        if (this.currentChaser) {
          this.recalculatePath(true);
        } else {
          this.recalculatePath();
        }
      } else if (shouldAutoChase || this.npcMode === 'continuous') {
        this.recalculatePath(true);
      } else {
        // In standby or auto_stop, update visual path preview without moving NPC
        this.recalculatePath(false);
      }
    }

    // Check if MC just stopped moving in auto_stop mode
    if (wasMcMoving && !this.player.isMoving && this.player.moveProgress >= 1.0) {
      if (this.npcMode === 'auto_stop' && distanceToNpc <= this.npcFollowRadius) {
        this.runNpcPathfinding();
      }
    }

    // Camera smoothly follows player
    this.camera.follow(this.player);
    this.camera.update(deltaTime);

    // Update NPC along path
    if (!this.isStepMode) {
      for (const npc of this.allNpcs) {
        const prevNpcX = npc.gridX;
        const prevNpcY = npc.gridY;
        npc.update(this.map, deltaTime);

        if (npc === this.currentChaser &&
            (npc.gridX !== prevNpcX || npc.gridY !== prevNpcY)) {
          if (npc.status === 'moving' && this.currentPathResult?.path) {
            const currIdx = this.currentPathResult.path.findIndex(
              p => p.x === npc.gridX && p.y === npc.gridY
            );
            if (currIdx >= 0) {
              this.currentPathResult.path = this.currentPathResult.path.slice(currIdx);
            }
          }
        }
      }
    }

    // Render Canvas
    this.render();

    requestAnimationFrame(this._loop.bind(this));
  }

  render() {
    this.renderer.render(
      this.map,
      this.player,
      this.npc,
      this.additionalNpcs,
      this.currentPathResult,
      this.camera
    );
  }

  // Step-by-Step Search Controls
  startStepSearch() {
    this.isStepMode = true;
    this.npc.isMoving = false;
    this.npc.path = [];

    const fullResult = findPath({
      map: this.map,
      start: { x: this.npc.gridX, y: this.npc.gridY },
      goal: { x: this.player.gridX, y: this.player.gridY },
      algorithm: this.currentAlgorithm,
      heuristic: this.currentHeuristic,
      weight: this.heuristicWeight,
      allowDiagonal: this.allowDiagonal,
    });

    this.stepExploredAll = fullResult.explored || [];
    this.stepIndex = 0;
    this.currentPathResult = {
      ...fullResult,
      explored: [],
      frontier: [],
      path: [],
      nodesExpanded: 0,
    };

    this._updateStepControlsUI(true);
    this.nextStep();
  }

  nextStep() {
    if (!this.isStepMode || !this.stepExploredAll) return;

    if (this.stepIndex < this.stepExploredAll.length) {
      this.stepIndex++;
      this.currentPathResult.explored = this.stepExploredAll.slice(0, this.stepIndex);
      this.currentPathResult.nodesExpanded = this.stepIndex;

      if (this.stepIndex === this.stepExploredAll.length) {
        const fullResult = findPath({
          map: this.map,
          start: { x: this.npc.gridX, y: this.npc.gridY },
          goal: { x: this.player.gridX, y: this.player.gridY },
          algorithm: this.currentAlgorithm,
          heuristic: this.currentHeuristic,
          weight: this.heuristicWeight,
        });
        this.currentPathResult.path = fullResult.path;
      }

      this._updateHUDStats(this.currentPathResult);
      this.render();
    }
  }

  stopStepSearch() {
    this.isStepMode = false;
    this._updateStepControlsUI(false);
    this.recalculatePath();
  }

  // Run full algorithm comparison
  compareAlgorithms() {
    const results = runComparisonBenchmark(
      this.map,
      { x: this.npc.gridX, y: this.npc.gridY },
      { x: this.player.gridX, y: this.player.gridY }
    );
    this._displayComparisonModal(results);
  }

  // --- UI Bindings & Event Handlers ---

  _cacheUIElements() {
    this.ui = {
      algoSelect: document.getElementById('algoSelect'),
      heuristicSelect: document.getElementById('heuristicSelect'),
      heuristicGroup: document.getElementById('heuristicGroup'),
      weightSlider: document.getElementById('weightSlider'),
      weightVal: document.getElementById('weightVal'),
      presetSelect: document.getElementById('presetSelect'),
      worldSizeBadge: document.getElementById('worldSizeBadge'),
      npcSpeedSelect: document.getElementById('npcSpeedSelect'),
      brushSelect: document.getElementById('brushSelect'),

      npcModeSelect: document.getElementById('npcModeSelect'),
      btnRunNpc: document.getElementById('btnRunNpc'),
      btnStopNpc: document.getElementById('btnStopNpc'),

      // Toggles
      toggleExplored: document.getElementById('toggleExplored'),
      toggleFrontier: document.getElementById('toggleFrontier'),
      togglePath: document.getElementById('togglePath'),
      toggleGrid: document.getElementById('toggleGrid'),
      toggleTileStats: document.getElementById('toggleTileStats'),
      toggleMinimap: document.getElementById('toggleMinimap'),

      // Stats
      statAlgorithm: document.getElementById('statAlgorithm'),
      statExpanded: document.getElementById('statExpanded'),
      statCost: document.getElementById('statCost'),
      statLength: document.getElementById('statLength'),
      statTime: document.getElementById('statTime'),
      statStatus: document.getElementById('statStatus'),

      // Buttons
      btnCompare: document.getElementById('btnCompare'),
      btnRandomMap: document.getElementById('btnRandomMap'),
      btnStepMode: document.getElementById('btnStepMode'),
      btnStepNext: document.getElementById('btnStepNext'),
      btnStepStop: document.getElementById('btnStepStop'),
      btnResetEntities: document.getElementById('btnResetEntities'),
      btnClearObstacles: document.getElementById('btnClearObstacles'),

      // Modal
      compareModal: document.getElementById('compareModal'),
      btnCloseModal: document.getElementById('btnCloseModal'),
      modalTableBody: document.getElementById('modalTableBody'),
    };
  }

  _bindEvents() {
    // Keyboard Input
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        this.runNpcPathfinding();
      }
      this.keys[e.code] = true;
      this.keys[e.key] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key] = false;
    });

    // Mouse Canvas Interaction
    this.canvas.addEventListener('mousedown', (e) => {
      this.isMouseDown = true;
      this._handleCanvasPointer(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Check if mouse is hovering over minimap
      const pad = 12;
      const mx = VIEWPORT_WIDTH - MINIMAP_WIDTH - pad;
      const my = pad;
      const inMinimap = this.renderer.showMinimap &&
                        sx >= mx && sx <= mx + MINIMAP_WIDTH &&
                        sy >= my && sy <= my + MINIMAP_HEIGHT;

      if (!inMinimap) {
        const gridPos = this.camera.screenToGrid(sx, sy);
        if (this.map.isValid(gridPos.gx, gridPos.gy)) {
          this.renderer.brushPreview = { x: gridPos.gx, y: gridPos.gy };
        } else {
          this.renderer.brushPreview = null;
        }
      } else {
        this.renderer.brushPreview = null;
      }

      if (this.isMouseDown) {
        this._handleCanvasPointer(e);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.renderer.brushPreview = null;
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // Right-click erases to grass
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const gridPos = this.camera.screenToGrid(sx, sy);

      if (this.map.isValid(gridPos.gx, gridPos.gy)) {
        this.map.setTile(gridPos.gx, gridPos.gy, TILE_TYPE.GRASS);
        this.recalculatePath();
      }
    });

    // Controls
    this.ui.algoSelect.addEventListener('change', (e) => {
      this.currentAlgorithm = e.target.value;
      if (this.currentAlgorithm === ALGORITHM.UCS) {
        this.ui.heuristicGroup.style.display = 'none';
      } else {
        this.ui.heuristicGroup.style.display = 'block';
      }
      this.recalculatePath();
    });

    this.ui.heuristicSelect.addEventListener('change', (e) => {
      this.currentHeuristic = e.target.value;
      this.recalculatePath();
    });

    this.ui.weightSlider.addEventListener('input', (e) => {
      this.heuristicWeight = parseFloat(e.target.value);
      this.ui.weightVal.textContent = this.heuristicWeight.toFixed(1);
      this.recalculatePath();
    });

    this.ui.presetSelect.addEventListener('change', (e) => {
      if (e.target.value === 'random_world') {
        this.generateRandomMap();
      } else {
        this.loadMapPreset(e.target.value);
      }
    });

    if (this.ui.btnRandomMap) {
      this.ui.btnRandomMap.addEventListener('click', () => this.generateRandomMap());
    }

    if (this.ui.npcModeSelect) {
      this.ui.npcModeSelect.addEventListener('change', (e) => {
        this.npcMode = e.target.value;
        if (this.npcMode === 'standby') {
          this.stopNpc();
        } else if (this.npcMode === 'continuous') {
          this.recalculatePath(true);
        }
      });
    }

    if (this.ui.btnRunNpc) {
      this.ui.btnRunNpc.addEventListener('click', () => this.runNpcPathfinding());
    }

    if (this.ui.btnStopNpc) {
      this.ui.btnStopNpc.addEventListener('click', () => this.stopNpc());
    }

    this.ui.npcSpeedSelect.addEventListener('change', (e) => {
      this.npc.speed = parseFloat(e.target.value);
    });

    this.ui.brushSelect.addEventListener('change', (e) => {
      this.brushMode = e.target.value;
    });

    // Checkboxes
    this.ui.toggleExplored.addEventListener('change', (e) => {
      this.renderer.showExplored = e.target.checked;
    });
    this.ui.toggleFrontier.addEventListener('change', (e) => {
      this.renderer.showFrontier = e.target.checked;
    });
    this.ui.togglePath.addEventListener('change', (e) => {
      this.renderer.showPath = e.target.checked;
    });
    this.ui.toggleGrid.addEventListener('change', (e) => {
      this.renderer.showGrid = e.target.checked;
    });
    this.ui.toggleTileStats.addEventListener('change', (e) => {
      this.renderer.showTileStats = e.target.checked;
    });
    if (this.ui.toggleMinimap) {
      this.ui.toggleMinimap.addEventListener('change', (e) => {
        this.renderer.showMinimap = e.target.checked;
      });
    }

    // Action Buttons
    this.ui.btnCompare.addEventListener('click', () => this.compareAlgorithms());
    this.ui.btnCloseModal.addEventListener('click', () => {
      this.ui.compareModal.classList.remove('active');
    });
    this.ui.compareModal.addEventListener('click', (e) => {
      if (e.target === this.ui.compareModal) {
        this.ui.compareModal.classList.remove('active');
      }
    });

    const fullscreenBtn = document.getElementById('btnFullscreen');
    const menuToggleBtn = document.getElementById('btnMenuToggle');

    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', async () => {
        if (!document.fullscreenElement) {
          try {
            await document.documentElement.requestFullscreen();
          } catch (error) {
            console.warn('Fullscreen not supported:', error);
          }
        } else {
          try {
            await document.exitFullscreen();
          } catch (error) {
            console.warn('Exit fullscreen failed:', error);
          }
        }
      });

      document.addEventListener('fullscreenchange', () => {
        const inFullscreen = !!document.fullscreenElement;
        document.body.classList.toggle('fullscreen-mode', inFullscreen);
        document.body.classList.toggle('show-menu', inFullscreen && false);

        if (inFullscreen) {
          this.renderer.showExplored = true;
          this.renderer.showFrontier = true;
          this.renderer.showPath = true;
          this.renderer.showMinimap = false;
          if (this.ui && this.ui.toggleExplored) this.ui.toggleExplored.checked = true;
          if (this.ui && this.ui.toggleFrontier) this.ui.toggleFrontier.checked = true;
          if (this.ui && this.ui.togglePath) this.ui.togglePath.checked = true;
          if (this.ui && this.ui.toggleMinimap) this.ui.toggleMinimap.checked = false;
        } else {
          this.renderer.showMinimap = true;
          if (this.ui && this.ui.toggleMinimap) this.ui.toggleMinimap.checked = true;
        }
      });
    }

    if (menuToggleBtn) {
      menuToggleBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) return;
        document.body.classList.toggle('show-menu');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (document.fullscreenElement && (e.key === 'm' || e.key === 'M')) {
        document.body.classList.toggle('show-menu');
      }
    });

    this.ui.btnStepMode.addEventListener('click', () => this.startStepSearch());
    this.ui.btnStepNext.addEventListener('click', () => this.nextStep());
    this.ui.btnStepStop.addEventListener('click', () => this.stopStepSearch());

    this.ui.btnResetEntities.addEventListener('click', () => {
      this.loadMapPreset(this.ui.presetSelect.value);
    });

    this.ui.btnClearObstacles.addEventListener('click', () => {
      for (let y = 1; y < this.map.rows - 1; y++) {
        for (let x = 1; x < this.map.cols - 1; x++) {
          this.map.setTile(x, y, TILE_TYPE.GRASS);
        }
      }
      this.recalculatePath();
    });
  }

  _handleCanvasPointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Check if clicking on the corner minimap
    const pad = 12;
    const mx = VIEWPORT_WIDTH - MINIMAP_WIDTH - pad;
    const my = pad;

    if (this.renderer.showMinimap &&
        sx >= mx && sx <= mx + MINIMAP_WIDTH &&
        sy >= my && sy <= my + MINIMAP_HEIGHT) {
      // Clicked inside minimap: teleport player to clicked map fraction
      const normX = (sx - mx) / MINIMAP_WIDTH;
      const normY = (sy - my) / MINIMAP_HEIGHT;
      const targetGx = Math.max(1, Math.min(this.map.cols - 2, Math.floor(normX * this.map.cols)));
      const targetGy = Math.max(1, Math.min(this.map.rows - 2, Math.floor(normY * this.map.rows)));

      if (this.map.isWalkable(targetGx, targetGy)) {
        this.player.setPosition(targetGx, targetGy);
        if (this.map.isImageMap) this._selectTerritoryChaser();
        this.camera.follow(this.player, true);
        this.recalculatePath(!!this.currentChaser);
      }
      return;
    }

    // World coordinate lookup using Camera
    const gridPos = this.camera.screenToGrid(sx, sy);
    const gx = gridPos.gx;
    const gy = gridPos.gy;

    if (!this.map.isValid(gx, gy)) return;

    if (this.brushMode === 'move_mc' || this.brushMode === 'play') {
      if (this.map.isWalkable(gx, gy)) {
        this.player.setPosition(gx, gy);
        if (this.map.isImageMap) this._selectTerritoryChaser();
        this.camera.follow(this.player, true);
        this.recalculatePath(!!this.currentChaser);
      }
    } else if (this.brushMode === 'move_npc') {
      if (this.map.isWalkable(gx, gy)) {
        this.npc.setPosition(gx, gy);
        this.recalculatePath();
      }
    } else {
      const brushTileMap = {
        paint_wall: TILE_TYPE.WALL,
        paint_tree: TILE_TYPE.TREE,
        paint_water: TILE_TYPE.WATER,
        paint_grass: TILE_TYPE.GRASS,
        paint_mud: TILE_TYPE.MUD,
        paint_bridge: TILE_TYPE.BRIDGE,
      };

      const tileToPaint = brushTileMap[this.brushMode];
      if (tileToPaint !== undefined) {
        if ((gx === this.player.gridX && gy === this.player.gridY) ||
            (gx === this.npc.gridX && gy === this.npc.gridY)) {
          return;
        }
        this.map.setTile(gx, gy, tileToPaint);
        this.recalculatePath();
      }
    }
  }

  _updateHUDStats(result) {
    if (!result) return;

    let algoName = 'A*';
    if (result.algorithm === ALGORITHM.UCS) algoName = 'UCS (Uniform Cost Search)';
    else if (result.algorithm === ALGORITHM.GREEDY) algoName = 'Greedy Best-First';
    else {
      const hName = result.heuristic.charAt(0).toUpperCase() + result.heuristic.slice(1);
      algoName = `A* (${hName})`;
      if (this.heuristicWeight !== 1.0) {
        algoName += ` [w=${this.heuristicWeight.toFixed(1)}]`;
      }
    }

    this.ui.statAlgorithm.textContent = algoName;
    this.ui.statExpanded.textContent = result.nodesExpanded.toLocaleString();
    this.ui.statCost.textContent = result.pathCost ? result.pathCost.toFixed(1) : '0';
    this.ui.statLength.textContent = result.path ? `${result.path.length} steps` : '0';
    this.ui.statTime.textContent = `${result.executionTimeMs.toFixed(2)} ms`;

    let statusText = 'Jalur Ditemukan';
    if (!result.found) {
      statusText = '❌ Tidak Ada Jalur (Terhalang)';
    } else if (this.npc.status === 'moving') {
      const stepsLeft = Math.max(0, (this.npc.path ? this.npc.path.length : 0) - this.npc.pathIndex);
      statusText = `🏃 NPC Berlari Menuju MC (${stepsLeft} langkah tersisa)`;
    } else if (this.npc.status === 'reached') {
      statusText = '🎯 MC Tertangkap!';
    } else if (this.npcMode === 'standby') {
      statusText = '⏸️ NPC Diam (Klik RUN atau Tekan SPACE)';
    } else if (this.npcMode === 'auto_stop') {
      statusText = '⏳ Diam (Menunggu MC berhenti)...';
    } else {
      statusText = '⚡ Pengejaran Kontinu (Aktif)';
    }
    this.ui.statStatus.textContent = statusText;
  }

  _updateStatus(msg) {
    if (this.ui && this.ui.statStatus) {
      this.ui.statStatus.textContent = msg;
    }
  }

  _updateStepControlsUI(inStep) {
    this.ui.btnStepMode.style.display = inStep ? 'none' : 'inline-block';
    this.ui.btnStepNext.style.display = inStep ? 'inline-block' : 'none';
    this.ui.btnStepStop.style.display = inStep ? 'inline-block' : 'none';
  }

  _displayComparisonModal(results) {
    const tbody = this.ui.modalTableBody;
    tbody.innerHTML = '';

    const maxExpanded = Math.max(...results.map(r => r.nodesExpanded), 1);

    results.forEach((r) => {
      const tr = document.createElement('tr');
      const isUcs = r.id === 'ucs';
      const isBest = r.nodesExpanded === Math.min(...results.filter(x => x.found).map(x => x.nodesExpanded));

      const barPercent = Math.max(Math.round((r.nodesExpanded / maxExpanded) * 100), 3);
      const barColor = isBest ? '#22c55e' : (isUcs ? '#ef4444' : '#3b82f6');

      tr.innerHTML = `
        <td>
          <strong>${r.name}</strong>
          <div class="formula-caption">${r.formula}</div>
        </td>
        <td>
          <span class="badge ${isBest ? 'badge-success' : (isUcs ? 'badge-danger' : 'badge-primary')}">
            ${r.nodesExpanded} nodes
          </span>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${barPercent}%; background-color: ${barColor}"></div>
          </div>
        </td>
        <td><strong>${r.pathCost.toFixed(1)}</strong></td>
        <td>${r.pathLength} steps</td>
        <td>${r.timeMs} ms</td>
        <td>
          ${isUcs ? '<span class="text-muted">Baseline (1x)</span>' : `<strong>${r.ratioVsUcs}x fewer nodes</strong> (-${r.reductionPercent}%)`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    this.ui.compareModal.classList.add('active');
  }
}

// Auto-boot when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.__GAME__ = game;
  game.init();
});
