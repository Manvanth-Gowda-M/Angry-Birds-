// FILE: src/main.js
// GameController — wires all modules together and runs the rAF game loop.

import * as THREE from 'three';

// Core
import { Renderer }     from './core/renderer.js';
import { SceneSetup }   from './core/scene.js';
import { Camera }       from './core/camera.js';

// Physics
import { PhysicsWorld } from './physics/world.js';

// Game
import { Bird }         from './game/bird.js';
import { Slingshot }    from './game/slingshot.js';
import { Level }        from './game/level.js';
import { ScoreManager } from './game/scoreManager.js';

// Vision
import { HandTracker }        from './vision/handTracking.js';
import { GestureDetector }    from './vision/gesture.js';
import { CoordinateMapper }   from './vision/coordinateMapper.js';

// Utils
import { LandmarkSmoother } from './utils/smoothing.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const ANCHOR_POSITION  = new THREE.Vector3(-8, 3, 0);
const TOTAL_BIRDS      = 5;
const NEXT_BIRD_DELAY  = 3000;  // ms
const MAX_LEVELS       = 3;

// ─── DOM Elements ────────────────────────────────────────────────────────────
const videoEl      = document.getElementById('webcam');
const overlayEl    = document.getElementById('landmark-overlay');
const loadingEl    = document.getElementById('loading');
const loadStatusEl = document.getElementById('loading-status');
const gameOverEl   = document.getElementById('game-over');
const finalScoreEl = document.getElementById('final-score');
const playAgainBtn = document.getElementById('play-again-btn');
const cameraErrEl  = document.getElementById('camera-error');
const debugPanel   = document.getElementById('debug-panel');
const birdsDisplay = document.getElementById('birds-display');
const levelDisplay = document.getElementById('level-display');

// Debug readouts
const dbgFps     = document.getElementById('dbg-fps');
const dbgBodies  = document.getElementById('dbg-bodies');
const dbgGesture = document.getElementById('dbg-gesture');
const dbgPinch   = document.getElementById('dbg-pinch');

// ─── GameController ──────────────────────────────────────────────────────────
class GameController {
  constructor() {
    // Modules
    this.rendererModule = null;
    this.sceneModule    = null;
    this.cameraModule   = null;
    this.physicsWorld   = null;
    this.level          = null;
    this.scoreManager   = null;
    this.slingshot      = null;
    this.currentBird    = null;
    this.smoother       = null;
    this.gestureDetector= null;
    this.mapper         = null;
    this.handTracker    = null;

    // State
    this._birdsRemaining = TOTAL_BIRDS;
    this._currentLevel   = 1;
    this._mouseMode      = false;
    this._debugVisible   = false;
    this._lastTime       = 0;
    this._running        = false;

    // FPS tracking
    this._fpsFrames = 0;
    this._fpsTimer  = 0;
    this._fps       = 0;

    // Mouse fallback
    this._mouseDown    = false;
    this._raycaster    = new THREE.Raycaster();
    this._mousePlane   = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT (Spec §3.14 — exact order)
  // ═══════════════════════════════════════════════════════════════════════════
  async init() {
    this._updateLoadStatus('Setting up renderer…');

    // 1. Renderer
    this.rendererModule = new Renderer();

    // 2. Scene
    this._updateLoadStatus('Building scene…');
    this.sceneModule = new SceneSetup(this.rendererModule);

    // 3. Camera
    this.cameraModule = new Camera(this.rendererModule);

    // 4. Physics World
    this._updateLoadStatus('Starting physics engine…');
    this.physicsWorld = new PhysicsWorld();

    // 5–6. Level
    this._updateLoadStatus('Building level…');
    this.scoreManager = new ScoreManager(this.physicsWorld);
    this.level = new Level(this.sceneModule, this.physicsWorld, this.scoreManager);
    this.level.build(this._currentLevel);
    this._updateLevelHUD();

    // 7. Score manager already created above

    // 8. Slingshot
    this.slingshot = new Slingshot(this.sceneModule, this.physicsWorld, ANCHOR_POSITION);

    // 9–10. First bird
    this.currentBird = new Bird(this.sceneModule, this.physicsWorld);
    this.slingshot.attachBird(this.currentBird);
    this._updateBirdsHUD();

    // 11–13. Vision helpers
    this.smoother        = new LandmarkSmoother(0.2, 21);
    this.gestureDetector = new GestureDetector();
    this.mapper          = new CoordinateMapper(this.cameraModule.cam, ANCHOR_POSITION);

    // 14–15. Hand tracking
    this._updateLoadStatus('Requesting webcam…');
    await this._initVision();

    // Keyboard shortcuts
    this._setupKeyboard();

    // Mouse fallback (always active, activated by Space or on camera error)
    this._setupMouseFallback();

    // Play-again button
    playAgainBtn.addEventListener('click', () => this.reset());

    // Dismiss loading screen
    this._hideLoading();

    // 16. Start game loop
    this._running = true;
    requestAnimationFrame((t) => this._gameLoop(t));
  }

  // ─── Vision init ─────────────────────────────────────────────────────────
  async _initVision() {
    try {
      this.handTracker = new HandTracker(
        videoEl,
        overlayEl,
        (landmarks) => this._onHandResults(landmarks)
      );
      await this.handTracker.start();
      console.info('[Game] Hand tracking active');
    } catch (err) {
      console.warn('[Game] Camera unavailable:', err.message);
      cameraErrEl.classList.remove('hidden');
      this._mouseMode = true;
    }
  }

  // ─── Hand results callback (Spec §3.14 onHandResults) ────────────────────
  _onHandResults(rawLandmarks) {
    if (this._mouseMode) return;  // Mouse mode overrides

    const smoothed = this.smoother.smooth(rawLandmarks);
    const pinching = this.gestureDetector.isPinching(smoothed);
    const midpoint = this.gestureDetector.getPinchMidpoint(smoothed);
    const pos3D    = this.mapper.map(midpoint.x, midpoint.y);
    const pinchDist = this.gestureDetector.pinchDistance(smoothed);

    // Update debug readouts
    if (this._debugVisible) {
      dbgGesture.textContent = this.slingshot.state;
      dbgPinch.textContent   = pinchDist.toFixed(3);
    }

    // State transitions
    if (pinching && this.slingshot.state === 'idle') {
      this.slingshot.grab(pos3D);
    } else if (pinching && this.slingshot.state === 'grabbed') {
      this.slingshot.updatePull(pos3D);
    } else if (!pinching && this.slingshot.state === 'grabbed') {
      this.slingshot.release();
      this._scheduleNextBird();
    }
  }

  // ─── Mouse fallback (Spec §6) ────────────────────────────────────────────
  _setupMouseFallback() {
    const canvas = this.rendererModule.canvas;

    const toWorld = (clientX, clientY) => {
      const rect  = canvas.getBoundingClientRect();
      const ndcX  = ((clientX - rect.left) / rect.width)  *  2 - 1;
      const ndcY  = ((clientY - rect.top)  / rect.height) * -2 + 1;
      this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraModule.cam);
      const target = new THREE.Vector3();
      this._raycaster.ray.intersectPlane(this._mousePlane, target);
      return target;
    };

    canvas.addEventListener('mousedown', (e) => {
      if (!this._mouseMode) return;
      this._mouseDown = true;
      const wp = toWorld(e.clientX, e.clientY);
      if (this.slingshot.state === 'idle') this.slingshot.grab(wp);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this._mouseMode || !this._mouseDown) return;
      const wp = toWorld(e.clientX, e.clientY);
      if (this.slingshot.state === 'grabbed') this.slingshot.updatePull(wp);
    });

    canvas.addEventListener('mouseup', () => {
      if (!this._mouseMode || !this._mouseDown) return;
      this._mouseDown = false;
      if (this.slingshot.state === 'grabbed') {
        this.slingshot.release();
        this._scheduleNextBird();
      }
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      if (!this._mouseMode) return;
      e.preventDefault();
      this._mouseDown = true;
      const t  = e.touches[0];
      const wp = toWorld(t.clientX, t.clientY);
      if (this.slingshot.state === 'idle') this.slingshot.grab(wp);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!this._mouseMode || !this._mouseDown) return;
      e.preventDefault();
      const t  = e.touches[0];
      const wp = toWorld(t.clientX, t.clientY);
      if (this.slingshot.state === 'grabbed') this.slingshot.updatePull(wp);
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      if (!this._mouseMode || !this._mouseDown) return;
      this._mouseDown = false;
      if (this.slingshot.state === 'grabbed') {
        this.slingshot.release();
        this._scheduleNextBird();
      }
    });
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
          this._mouseMode = !this._mouseMode;
          console.info(`[Game] Mouse mode: ${this._mouseMode}`);
          break;
        case 'KeyR':
          this.reset();
          break;
        case 'KeyD':
          this._debugVisible = !this._debugVisible;
          debugPanel.classList.toggle('hidden', !this._debugVisible);
          break;
      }
    });
  }

  // ─── Bird lifecycle ───────────────────────────────────────────────────────
  _scheduleNextBird() {
    setTimeout(() => this._spawnNextBird(), NEXT_BIRD_DELAY);
  }

  _spawnNextBird() {
    if (this._birdsRemaining <= 0) {
      this._showGameOver();
      return;
    }

    // Check level clear
    if (this.level.isCleared()) {
      this._nextLevel();
      return;
    }

    this._birdsRemaining--;
    this._updateBirdsHUD();

    this.currentBird = new Bird(this.sceneModule, this.physicsWorld);
    this.slingshot.attachBird(this.currentBird);
  }

  // ─── Level progression ────────────────────────────────────────────────────
  _nextLevel() {
    if (this._currentLevel >= MAX_LEVELS) {
      this._showGameOver(true);
      return;
    }
    this._currentLevel++;
    this.level.reset();
    this.level.build(this._currentLevel);
    this._birdsRemaining = TOTAL_BIRDS;
    this._updateBirdsHUD();
    this._updateLevelHUD();

    this.currentBird = new Bird(this.sceneModule, this.physicsWorld);
    this.slingshot.attachBird(this.currentBird);
  }

  // ─── Game over / reset ────────────────────────────────────────────────────
  _showGameOver(win = false) {
    finalScoreEl.textContent = this.scoreManager.getScore().toLocaleString();
    const card = document.querySelector('.game-over-card');
    const emoji = document.querySelector('.go-emoji');
    const title = document.querySelector('.go-title');
    if (win) {
      emoji.textContent = '🏆';
      title.textContent = 'You Win!';
    } else {
      emoji.textContent = '😡';
      title.textContent = 'Game Over';
    }
    gameOverEl.classList.remove('hidden');
  }

  reset() {
    gameOverEl.classList.add('hidden');

    // Reset state
    this._currentLevel   = 1;
    this._birdsRemaining = TOTAL_BIRDS;

    // Reset score
    this.scoreManager.reset();

    // Rebuild level
    this.level.reset();
    this.level.build(this._currentLevel);
    this._updateLevelHUD();
    this._updateBirdsHUD();

    // Spawn fresh bird
    this.currentBird = new Bird(this.sceneModule, this.physicsWorld);
    this.slingshot.attachBird(this.currentBird);
    this.slingshot.state = 'idle';

    // Reset smoother
    this.smoother?.reset();
  }

  // ─── HUD helpers ─────────────────────────────────────────────────────────
  _updateBirdsHUD() {
    birdsDisplay.textContent = `Birds: ${this._birdsRemaining}`;
  }

  _updateLevelHUD() {
    levelDisplay.textContent = `Level ${this._currentLevel}`;
  }

  _updateLoadStatus(msg) {
    if (loadStatusEl) loadStatusEl.textContent = msg;
  }

  _hideLoading() {
    loadingEl.classList.add('fade-out');
    setTimeout(() => loadingEl.classList.add('gone'), 600);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME LOOP (Spec §3.14 gameLoop)
  // ═══════════════════════════════════════════════════════════════════════════
  _gameLoop(timestamp) {
    if (!this._running) return;
    requestAnimationFrame((t) => this._gameLoop(t));

    // Delta time — capped to 50ms to avoid physics explosions on tab switch
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    // ── Physics step ──
    this.physicsWorld.step(dt);

    // ── Update game objects ──
    this.level.update();
    this.currentBird?.update(dt);

    // ── Camera ──
    if (this.currentBird?.state === 'flying') {
      this.cameraModule.follow(this.currentBird.mesh.position, 0.03);
    } else {
      this.cameraModule.resetPosition(0.04);
    }
    this.cameraModule.update();

    // ── Slingshot band ──
    this.slingshot.drawBand();

    // ── FPS counter ──
    this._fpsFrames++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 1.0) {
      this._fps = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsTimer  = 0;
    }

    // ── Debug panel update ──
    if (this._debugVisible) {
      dbgFps.textContent    = this._fps;
      dbgBodies.textContent = this.physicsWorld.bodyCount;
      // gesture & pinch updated in onHandResults
    }

    // ── Render ──
    this.rendererModule.render(this.sceneModule.scene, this.cameraModule.cam);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const gameController = new GameController();

window.addEventListener('load', async () => {
  try {
    await gameController.init();
    window.__game = gameController;  // Dev console access
  } catch (err) {
    console.error('[Game] Fatal init error:', err);
    const loadStatusEl = document.getElementById('loading-status');
    if (loadStatusEl) loadStatusEl.textContent = `Error: ${err.message}`;
  }
});
