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
  BATTLE_CONFIG,
} from './constants.js';
import { GameMap } from './map.js';
import { TilesetManager } from './tileset.js';
import { Entity, Player, NPC } from './entity.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { findPath } from './pathfinding.js';
import { runComparisonBenchmark } from './comparison.js';
import { getBestNPCAction, ACTIONS } from './minimax.js';

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

    // Game State
    this.gameState = 'EXPLORATION'; // 'EXPLORATION' | 'BATTLE'
    this.battleState = {
      playerHP: 100,
      npcHP: 100,
      playerDefending: false,
      npcDefending: false
    };
    this.mcSpawn = { x: 3, y: 3 };
    this.battleNpc = null;
    this.battleTimers = [];

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
      this.mcSpawn = { x: coords.mcStart.x, y: coords.mcStart.y };
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
      this.mcSpawn = { x: coords.mcStart.x, y: coords.mcStart.y };
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
    const activeNpc = this.currentChaser || this.npc;
    if (!activeNpc || (this.map.isImageMap && !this.currentChaser)) {
      this.currentPathResult = null;
      this.renderer.showExplored = false;
      this.renderer.showFrontier = false;
      this.renderer.showPath = false;
      this._updateStatus('Tidak ada NPC di daratan ini.');
      return;
    }
    const start = { x: activeNpc.gridX, y: activeNpc.gridY };
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
    } this.renderer.showExplored = true;
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

    if (this.gameState === 'BATTLE') {
      // Pause movement in battle state, but still render
      this.render();
      requestAnimationFrame(this._loop.bind(this));
      return;
    }

    // Update tile animations (water waves)
    this.tileset.update(deltaTime);

    // Track MC movement state
    const wasMcMoving = this.player.isMoving;
    const prevMcX = this.player.gridX;
    const prevMcY = this.player.gridY;
    this.player.handleInput(this.keys, this.map, deltaTime);

    const targetNpc = this.currentChaser || this.npc;
    const distanceToNpc = targetNpc ? Math.hypot(this.player.gridX - targetNpc.gridX, this.player.gridY - targetNpc.gridY) : Infinity;
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

        // Battle Trigger Check
        if (this.gameState === 'EXPLORATION' && npc === this.currentChaser && npc.gridX === this.player.gridX && npc.gridY === this.player.gridY) {
          this.startBattle(npc);
          break; // Stop updating other NPCs for now
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

  // --- Battle System ---

  startBattle(chasingNpc = null) {
    if (this.gameState === 'BATTLE') return;
    console.log("Battle triggered!");
    this.gameState = 'BATTLE';
    this.battleNpc = chasingNpc || this.currentChaser || this.npc;
    this._clearBattleTimers();

    this.battleState = {
      playerHP: 100,
      npcHP: 100,
      playerDefending: false,
      npcDefending: false
    };

    // UI Update
    this.ui.battleModal.classList.add('active');
    this.updateBattleUI();
    this.ui.battleStatusText.textContent = "⚔️ Turn-Based Battle! ⚔️ (Giliranmu)";
    this.setBattleButtonsEnabled(true);
    this._updateStatus('⚔️ Mode Pertarungan Aktif!');
  }

  _clearBattleTimers() {
    if (this.battleTimers && this.battleTimers.length > 0) {
      this.battleTimers.forEach(t => clearTimeout(t));
    }
    this.battleTimers = [];
  }

  _addBattleTimer(timer) {
    if (!this.battleTimers) this.battleTimers = [];
    this.battleTimers.push(timer);
    return timer;
  }

  endBattle(playerWon) {
    this._clearBattleTimers();
    this.setBattleButtonsEnabled(false);
    this.ui.battleStatusText.textContent = playerWon
      ? "🎉 MENANG! NPC berhasil dikalahkan! 🎉"
      : "💀 KALAH! Main Character Gugur... 💀";

    const endTimer = setTimeout(() => {
      this.ui.battleModal.classList.remove('active');

      if (playerWon) {
        // NPC mati: hilangkan karakter NPC yang kalah dari map
        const defeatedNpc = this.battleNpc || this.currentChaser || this.npc;
        if (defeatedNpc) {
          defeatedNpc.stopMovement();
          this.allNpcs = this.allNpcs.filter(n => n !== defeatedNpc);
          this.additionalNpcs = this.additionalNpcs.filter(n => n !== defeatedNpc);
          if (this.currentChaser === defeatedNpc) this.currentChaser = null;
          if (this.npc === defeatedNpc) this.npc = this.allNpcs[0] || null;
        }
        // Posisi MC TETAP di tempat yang sama dan bisa lanjut main
        this._updateStatus('🎉 NPC dikalahkan! Kamu bisa lanjut menjelajah.');
      } else {
        // MC mati: MC kembali respawn ke tempat awal
        if (this.mcSpawn) {
          this.player.setPosition(this.mcSpawn.x, this.mcSpawn.y);
        }
        // Hentikan pergerakan semua NPC
        for (const n of this.allNpcs) {
          n.stopMovement();
        }
        if (this.currentChaser) {
          this.currentChaser.stopMovement();
        }
        // Kamera kembali fokus ke player di titik awal
        this.camera.follow(this.player, true);
        if (this.map.isImageMap) {
          this._selectTerritoryChaser();
        }
        this._updateStatus('💀 MC Respawn ke titik awal. Siap bermain kembali!');
      }

      this.gameState = 'EXPLORATION';
      this.battleNpc = null;
      this.recalculatePath(false);
      this.render();
    }, 1800);

    this._addBattleTimer(endTimer);
  }

  updateBattleUI() {
    this.ui.playerHpBar.style.width = `${Math.max(0, this.battleState.playerHP)}%`;
    this.ui.playerHpText.textContent = Math.max(0, this.battleState.playerHP);

    this.ui.npcHpBar.style.width = `${Math.max(0, this.battleState.npcHP)}%`;
    this.ui.npcHpText.textContent = Math.max(0, this.battleState.npcHP);
  }

  setBattleButtonsEnabled(enabled) {
    this.ui.btnAttack.disabled = !enabled;
    this.ui.btnDefend.disabled = !enabled;
    this.ui.btnPotion.disabled = !enabled;
  }

  doPlayerAction(action) {
    if (this.gameState !== 'BATTLE') return;

    this.battleState.playerDefending = false;

    const baseDamage = BATTLE_CONFIG.BASE_DAMAGE;
    const healAmount = BATTLE_CONFIG.HEAL_AMOUNT;
    const maxHP = BATTLE_CONFIG.MAX_HP;

    if (action === ACTIONS.ATTACK) {
      let damage = baseDamage;
      if (this.battleState.npcDefending) damage = Math.floor(damage * 0.5);
      this.battleState.npcHP -= damage;
      this.ui.battleStatusText.textContent = `⚔️ MC menyerang! Memberikan ${damage} damage.`;
    } else if (action === ACTIONS.DEFEND) {
      this.battleState.playerDefending = true;
      this.ui.battleStatusText.textContent = `🛡️ MC bertahan! Damage berikutnya berkurang 50%.`;
    } else if (action === ACTIONS.POTION) {
      this.battleState.playerHP = Math.min(maxHP, this.battleState.playerHP + healAmount);
      this.ui.battleStatusText.textContent = `🧪 MC meminum potion! HP bertambah ${healAmount}.`;
    }

    this.updateBattleUI();
    this.setBattleButtonsEnabled(false);

    if (this.battleState.npcHP <= 0) {
      this.endBattle(true);
      return;
    }

    const npcTurnTimer = setTimeout(() => {
      if (this.gameState === 'BATTLE') {
        this.doNPCAction();
      }
    }, 900);
    this._addBattleTimer(npcTurnTimer);
  }

  doNPCAction() {
    if (this.gameState !== 'BATTLE') return;
    this.ui.battleStatusText.textContent = "🤖 NPC sedang berpikir (Minimax)...";

    const thinkTimer = setTimeout(() => {
      if (this.gameState !== 'BATTLE') return;
      const { bestAction, evaluations, nodesMinimax, nodesAlphaBeta, pruningReduction } = getBestNPCAction(this.battleState);

      // Update Debug UI — Minimax vs Alpha-Beta Comparison
      if (this.ui.debugEvaluations) {
        this.ui.debugEvaluations.innerHTML = `Attack: ${evaluations[ACTIONS.ATTACK]}, Defend: ${evaluations[ACTIONS.DEFEND]}, Potion: ${evaluations[ACTIONS.POTION]}`;
      }
      if (this.ui.debugNodeMinimax) this.ui.debugNodeMinimax.textContent = nodesMinimax;
      if (this.ui.debugNodeAlphaBeta) this.ui.debugNodeAlphaBeta.textContent = nodesAlphaBeta;
      if (this.ui.debugPruningReduction) this.ui.debugPruningReduction.textContent = `${pruningReduction}%`;
      if (this.ui.debugAction) this.ui.debugAction.textContent = bestAction;

      this.battleState.npcDefending = false;
      const baseDamage = BATTLE_CONFIG.BASE_DAMAGE;
      const healAmount = BATTLE_CONFIG.HEAL_AMOUNT;
      const maxHP = BATTLE_CONFIG.MAX_HP;

      if (bestAction === ACTIONS.ATTACK) {
        let damage = baseDamage;
        if (this.battleState.playerDefending) damage = Math.floor(damage * 0.5);
        this.battleState.playerHP -= damage;
        this.ui.battleStatusText.textContent = `⚔️ NPC menyerang! Memberikan ${damage} damage.`;
      } else if (bestAction === ACTIONS.DEFEND) {
        this.battleState.npcDefending = true;
        this.ui.battleStatusText.textContent = `🛡️ NPC bertahan! Damage berikutnya berkurang 50%.`;
      } else if (bestAction === ACTIONS.POTION) {
        this.battleState.npcHP = Math.min(maxHP, this.battleState.npcHP + healAmount);
        this.ui.battleStatusText.textContent = `🧪 NPC meminum potion! HP bertambah ${healAmount}.`;
      }

      this.updateBattleUI();

      if (this.battleState.playerHP <= 0) {
        this.endBattle(false);
        return;
      }

      const nextTurnTimer = setTimeout(() => {
        if (this.gameState === 'BATTLE') {
          this.ui.battleStatusText.textContent = "Giliranmu!";
          this.setBattleButtonsEnabled(true);
        }
      }, 900);
      this._addBattleTimer(nextTurnTimer);
    }, 450);

    this._addBattleTimer(thinkTimer);
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

      // Drawer Menu
      btnFloatingMenu: document.getElementById('btnFloatingMenu'),
      btnCloseSidebar: document.getElementById('btnCloseSidebar'),
      sidebarDrawer: document.getElementById('sidebarDrawer'),
      menuBackdrop: document.getElementById('menuBackdrop'),

      // Battle UI
      battleModal: document.getElementById('battleModal'),
      battleStatusText: document.getElementById('battleStatusText'),
      playerHpBar: document.getElementById('playerHpBar'),
      playerHpText: document.getElementById('playerHpText'),
      npcHpBar: document.getElementById('npcHpBar'),
      npcHpText: document.getElementById('npcHpText'),
      btnAttack: document.getElementById('btnAttack'),
      btnDefend: document.getElementById('btnDefend'),
      btnPotion: document.getElementById('btnPotion'),
      debugEvaluations: document.getElementById('debugEvaluations'),
      debugNodeCount: document.getElementById('debugNodeCount'),       // legacy (may be null)
      debugNodeMinimax: document.getElementById('debugNodeMinimax'),
      debugNodeAlphaBeta: document.getElementById('debugNodeAlphaBeta'),
      debugPruningReduction: document.getElementById('debugPruningReduction'),
      debugAction: document.getElementById('debugAction'),
    };
  }

  toggleMenu() {
    const isOpen = document.body.classList.toggle('menu-open');
    if (this.ui.sidebarDrawer) {
      this.ui.sidebarDrawer.classList.toggle('open', isOpen);
    }
  }

  openMenu() {
    document.body.classList.add('menu-open');
    if (this.ui.sidebarDrawer) {
      this.ui.sidebarDrawer.classList.add('open');
    }
  }

  closeMenu() {
    document.body.classList.remove('menu-open');
    if (this.ui.sidebarDrawer) {
      this.ui.sidebarDrawer.classList.remove('open');
    }
  }

  _getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / (rect.width || this.canvas.width);
    const scaleY = this.canvas.height / (rect.height || this.canvas.height);
    return {
      sx: (e.clientX - rect.left) * scaleX,
      sy: (e.clientY - rect.top) * scaleY,
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
      if ((e.key === 'm' || e.key === 'M') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        this.toggleMenu();
      }
      if (e.key === 'Escape') {
        this.closeMenu();
        if (this.ui.compareModal) this.ui.compareModal.classList.remove('active');
      }
      this.keys[e.code] = true;
      this.keys[e.key] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.keys[e.key] = false;
    });

    // Drawer Menu Events
    if (this.ui.btnFloatingMenu) {
      this.ui.btnFloatingMenu.addEventListener('click', () => this.toggleMenu());
    }
    if (this.ui.btnCloseSidebar) {
      this.ui.btnCloseSidebar.addEventListener('click', () => this.closeMenu());
    }
    if (this.ui.menuBackdrop) {
      this.ui.menuBackdrop.addEventListener('click', () => this.closeMenu());
    }

    // Mouse Canvas Interaction
    this.canvas.addEventListener('mousedown', (e) => {
      this.isMouseDown = true;
      this._handleCanvasPointer(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const { sx, sy } = this._getCanvasCoords(e);

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
      const { sx, sy } = this._getCanvasCoords(e);
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

    // Battle Actions
    this.ui.btnAttack.addEventListener('click', () => this.doPlayerAction(ACTIONS.ATTACK));
    this.ui.btnDefend.addEventListener('click', () => this.doPlayerAction(ACTIONS.DEFEND));
    this.ui.btnPotion.addEventListener('click', () => this.doPlayerAction(ACTIONS.POTION));

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
    const { sx, sy } = this._getCanvasCoords(e);

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
