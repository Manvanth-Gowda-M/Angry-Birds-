// FILE: src/main.js — GameController

import * as THREE from 'three';

// Core
import { Renderer }   from './core/renderer.js';
import { SceneSetup } from './core/scene.js';
import { Camera }     from './core/camera.js';

// Physics
import { PhysicsWorld } from './physics/world.js';

// Game
import { Bird, BirdType }   from './game/bird.js';
import { Slingshot }         from './game/slingshot.js';
import { Level }             from './game/level.js';
import { ScoreManager }      from './game/scoreManager.js';
import { ParticleSystem }    from './game/particles.js';

// Vision
import { HandTracker }      from './vision/handTracking.js';
import { GestureDetector }  from './vision/gesture.js';
import { CoordinateMapper } from './vision/coordinateMapper.js';

// Utils
import { LandmarkSmoother } from './utils/smoothing.js';

// ─── Constants ───────────────────────────────────────────────────────────────
const ANCHOR_POSITION = new THREE.Vector3(-8, 3, 0);
const NEXT_BIRD_DELAY = 2800;   // ms
const MAX_LEVELS      = 5;

/** Per-level bird queues (cycle if level > defined). */
const LEVEL_BIRD_QUEUES = {
  1: [BirdType.RED,    BirdType.RED,    BirdType.YELLOW, BirdType.RED,    BirdType.RED],
  2: [BirdType.YELLOW, BirdType.RED,    BirdType.BLUE,   BirdType.RED,    BirdType.YELLOW],
  3: [BirdType.BLUE,   BirdType.RED,    BirdType.YELLOW, BirdType.BLUE,   BirdType.RED],
  4: [BirdType.BLACK,  BirdType.RED,    BirdType.YELLOW, BirdType.BLACK,  BirdType.RED],
  5: [BirdType.RED,    BirdType.BLACK,  BirdType.YELLOW, BirdType.BLUE,   BirdType.BLACK],
};

// ─── DOM elements ─────────────────────────────────────────────────────────────
const videoEl          = document.getElementById('webcam');
const overlayEl        = document.getElementById('landmark-overlay');
const loadingEl        = document.getElementById('loading');
const loadStatusEl     = document.getElementById('loading-status');
const gameOverEl       = document.getElementById('game-over');
const finalScoreEl     = document.getElementById('final-score');
const playAgainBtn     = document.getElementById('play-again-btn');
const cameraErrEl      = document.getElementById('camera-error');
const debugPanel       = document.getElementById('debug-panel');
const levelDisplayEl   = document.getElementById('level-display');
const levelCompleteEl  = document.getElementById('level-complete');
const lcScoreEl        = document.getElementById('lc-score');
const nextLevelBtn     = document.getElementById('next-level-btn');
const birdQueueEl      = document.getElementById('bird-queue');
const handStatusEl     = document.getElementById('hand-status');

const dbgFps     = document.getElementById('dbg-fps');
const dbgBodies  = document.getElementById('dbg-bodies');
const dbgGesture = document.getElementById('dbg-gesture');
const dbgPinch   = document.getElementById('dbg-pinch');

// ─── GameController ───────────────────────────────────────────────────────────
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
    this.particles      = null;
    this.currentBird    = null;
    this.activeBirds    = [];    // includes split birds

    // Vision
    this.smoother        = null;
    this.gestureDetector = null;
    this.mapper          = null;
    this.handTracker     = null;

    // State
    this._currentLevel   = 1;
    this._birdQueue      = [];
    this._birdIndex      = 0;
    this._mouseMode      = false;
    this._debugVisible   = false;
    this._lastTime       = 0;
    this._running        = false;

    // FPS
    this._fpsFrames = 0;
    this._fpsTimer  = 0;
    this._fps       = 0;

    // Mouse / touch fallback
    this._mouseDown  = false;
    this._raycaster  = new THREE.Raycaster();
    this._mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  }

  // ═══ INIT ═══════════════════════════════════════════════════════════════════
  async init() {
    this._updateLoadStatus('Setting up renderer…');
    this.rendererModule = new Renderer();

    this._updateLoadStatus('Building scene…');
    this.sceneModule  = new SceneSetup(this.rendererModule);
    this.cameraModule = new Camera(this.rendererModule);

    this._updateLoadStatus('Starting physics…');
    this.physicsWorld = new PhysicsWorld();

    // Particles
    this.particles = new ParticleSystem(this.sceneModule);

    // Score manager
    this.scoreManager = new ScoreManager(this.physicsWorld);
    this.scoreManager.onPoints = (pts) => {
      // Trigger camera shake on big hits
      if (pts > 80) this.cameraModule.shake(0.18 + pts / 1000, 0.3);
    };

    // Level
    this._updateLoadStatus('Building level…');
    this.level = new Level(this.sceneModule, this.physicsWorld, this.scoreManager, this.particles);
    this.level.onPigKilled = (pos) => {
      const sp = this._worldToScreen(pos);
      this.scoreManager.awardBonus(500, 'pig', sp);
      this.cameraModule.shake(0.28, 0.45);
    };
    this.level.onBlockHit = (_pos, _color) => {};
    this.level.build(this._currentLevel);
    this._updateLevelHUD();

    // Slingshot
    this.slingshot = new Slingshot(this.sceneModule, this.physicsWorld, ANCHOR_POSITION);

    // Bird queue + first bird
    this._buildBirdQueue(this._currentLevel);
    this._spawnBirdFromQueue();

    // Post-processing (after scene + camera created)
    this.rendererModule.initPostProcessing(this.sceneModule.scene, this.cameraModule.cam);

    // Vision
    this.smoother        = new LandmarkSmoother(0.22, 21);
    this.gestureDetector = new GestureDetector();
    this.mapper          = new CoordinateMapper(this.cameraModule.cam, ANCHOR_POSITION);

    this._updateLoadStatus('Requesting webcam…');
    await this._initVision();

    this._setupKeyboard();
    this._setupMouseFallback();

    playAgainBtn.addEventListener('click', () => this.reset());
    nextLevelBtn.addEventListener('click', () => this._proceedNextLevel());

    this._hideLoading();
    this._running = true;
    requestAnimationFrame(t => this._gameLoop(t));
  }

  // ─── Vision ───────────────────────────────────────────────────────
  async _initVision() {
    try {
      this.handTracker = new HandTracker(
        videoEl, overlayEl,
        (lm) => this._onHandResults(lm),
        (detected) => {
          if (handStatusEl) {
            handStatusEl.textContent = detected ? '✋ Hand detected' : '👁 Detecting hand…';
          }
        }
      );
      await this.handTracker.start();
    } catch (err) {
      console.warn('[Game] Camera unavailable:', err.message);
      cameraErrEl.classList.remove('hidden');
      this._mouseMode = true;
    }
  }

  _onHandResults(rawLandmarks) {
    if (this._mouseMode) return;

    const smoothed  = this.smoother.smooth(rawLandmarks);
    const pinching  = this.gestureDetector.isPinching(smoothed);
    const midpoint  = this.gestureDetector.getPinchMidpoint(smoothed);
    const pos3D     = this.mapper.map(midpoint.x, midpoint.y);
    const pinchDist = this.gestureDetector.pinchDistance(smoothed);

    if (this._debugVisible) {
      dbgGesture.textContent = this.slingshot.state;
      dbgPinch.textContent   = pinchDist.toFixed(3);
    }

    if (pinching && this.slingshot.state === 'idle') {
      this.slingshot.grab(pos3D);
    } else if (pinching && this.slingshot.state === 'grabbed') {
      this.slingshot.updatePull(pos3D);
    } else if (!pinching && this.slingshot.state === 'grabbed') {
      this.slingshot.release();
      this._scheduleNextBird();
    }
  }

  // ─── Bird lifecycle ────────────────────────────────────────────────
  _buildBirdQueue(level) {
    const queue = LEVEL_BIRD_QUEUES[level] ?? LEVEL_BIRD_QUEUES[1];
    this._birdQueue = [...queue];
    this._birdIndex = 0;
    this._renderBirdQueueHUD();
  }

  _spawnBirdFromQueue() {
    if (this._birdIndex >= this._birdQueue.length) {
      // Out of birds
      this._checkLevelEnd();
      return;
    }

    const type = this._birdQueue[this._birdIndex];
    this.currentBird = new Bird(this.sceneModule, this.physicsWorld, type);
    this.activeBirds = [this.currentBird];

    // Black bird explosion callback
    this.currentBird.onExplode = (pos) => {
      this.particles.spawnDebris(pos, 0x333333, 15);
      this.particles.spawnImpactFlash(pos, 0xff4400);
      this.cameraModule.shake(0.5, 0.5);
    };

    this.slingshot.attachBird(this.currentBird);
    this._renderBirdQueueHUD();
  }

  _scheduleNextBird() {
    setTimeout(() => {
      this._birdIndex++;
      this._spawnBirdFromQueue();
    }, NEXT_BIRD_DELAY);
  }

  _checkLevelEnd() {
    if (this.level.isCleared()) {
      setTimeout(() => this._showLevelComplete(), 1200);
    } else {
      setTimeout(() => this._showGameOver(false), 800);
    }
  }

  // ─── Split birds (Blue bird) ────────────────────────────────────────
  _handleSplitBirds(splits) {
    if (!splits || splits.length === 0) return;
    splits.forEach(b => {
      b.onExplode = null;
      this.activeBirds.push(b);
    });
  }

  // ─── Level complete ────────────────────────────────────────────────
  _showLevelComplete() {
    const birdsUsed = this._birdIndex + 1;
    const birdsLeft = Math.max(0, this._birdQueue.length - birdsUsed);

    // Star rating
    let stars = 1;
    if (birdsLeft >= 2) stars = 3;
    else if (birdsLeft >= 1) stars = 2;

    ['star-1','star-2','star-3'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (i < stars) el.classList.remove('inactive');
      else           el.classList.add('inactive');
    });

    // Bonus score for remaining birds
    if (birdsLeft > 0) {
      const bonus = birdsLeft * 1500;
      this.scoreManager.awardBonus(bonus, 'win');
    }

    if (lcScoreEl) lcScoreEl.textContent = this.scoreManager.getScore().toLocaleString();
    levelCompleteEl.classList.remove('hidden');
  }

  _proceedNextLevel() {
    levelCompleteEl.classList.add('hidden');
    if (this._currentLevel >= MAX_LEVELS) {
      this._showGameOver(true);
      return;
    }
    this._currentLevel++;
    this.level.reset();
    this.level.build(this._currentLevel);
    this._updateLevelHUD();

    this._buildBirdQueue(this._currentLevel);
    this._spawnBirdFromQueue();
  }

  // ─── Game over ────────────────────────────────────────────────────
  _showGameOver(win = false) {
    finalScoreEl.textContent = this.scoreManager.getScore().toLocaleString();
    document.querySelector('.go-emoji').textContent = win ? '🏆' : '😡';
    document.querySelector('.go-title').textContent = win ? 'You Win!' : 'Game Over';
    gameOverEl.classList.remove('hidden');
  }

  reset() {
    gameOverEl.classList.add('hidden');
    levelCompleteEl.classList.add('hidden');

    this._currentLevel = 1;
    this.scoreManager.reset();

    this.level.reset();
    this.level.build(this._currentLevel);
    this._updateLevelHUD();

    this._buildBirdQueue(this._currentLevel);
    this._spawnBirdFromQueue();
    this.slingshot.state = 'idle';
    this.smoother?.reset();
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
          this._mouseMode = !this._mouseMode;
          break;
        case 'KeyR':
          this.reset();
          break;
        case 'KeyD':
          this._debugVisible = !this._debugVisible;
          debugPanel.classList.toggle('hidden', !this._debugVisible);
          break;
        case 'KeyA':
          this._activateCurrentBird();
          break;
      }
    });
  }

  _activateCurrentBird() {
    if (!this.currentBird || this.currentBird.state !== 'flying') return;
    const splits = this.currentBird.activate();
    if (splits) this._handleSplitBirds(splits);
  }

  // ─── Mouse / touch fallback ────────────────────────────────────────
  _setupMouseFallback() {
    const canvas = this.rendererModule.canvas;

    const toWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX =  ((clientX - rect.left) / rect.width)  * 2 - 1;
      const ndcY = -((clientY - rect.top)  / rect.height) * 2 + 1;
      this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.cameraModule.cam);
      const target = new THREE.Vector3();
      this._raycaster.ray.intersectPlane(this._mousePlane, target);
      return target;
    };

    // Mouse
    canvas.addEventListener('mousedown', (e) => {
      if (!this._mouseMode) return;
      this._mouseDown = true;
      const wp = toWorld(e.clientX, e.clientY);
      if (this.slingshot.state === 'idle') this.slingshot.grab(wp);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this._mouseMode || !this._mouseDown) return;
      if (this.slingshot.state === 'grabbed') this.slingshot.updatePull(toWorld(e.clientX, e.clientY));
    });
    canvas.addEventListener('mouseup', () => {
      if (!this._mouseMode || !this._mouseDown) return;
      this._mouseDown = false;
      if (this.slingshot.state === 'grabbed') {
        this.slingshot.release();
        this._scheduleNextBird();
      }
    });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
      if (!this._mouseMode) return;
      e.preventDefault();
      this._mouseDown = true;
      const t = e.touches[0];
      const wp = toWorld(t.clientX, t.clientY);
      if (this.slingshot.state === 'idle') this.slingshot.grab(wp);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (!this._mouseMode || !this._mouseDown) return;
      e.preventDefault();
      const t = e.touches[0];
      if (this.slingshot.state === 'grabbed') this.slingshot.updatePull(toWorld(t.clientX, t.clientY));
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      if (!this._mouseMode) return;
      this._mouseDown = false;
      if (this.slingshot.state === 'grabbed') {
        this.slingshot.release();
        this._scheduleNextBird();
      } else if (e.changedTouches.length > 0) {
        // Tap on canvas while bird flying = activate
        this._activateCurrentBird();
      }
    });

    // Desktop click while flying = activate ability
    canvas.addEventListener('click', () => {
      if (this._mouseMode) this._activateCurrentBird();
    });
  }

  // ─── HUD helpers ──────────────────────────────────────────────────
  _updateLevelHUD() {
    if (levelDisplayEl) levelDisplayEl.textContent = `Level ${this._currentLevel}`;
  }

  _renderBirdQueueHUD() {
    if (!birdQueueEl) return;
    birdQueueEl.innerHTML = '';
    this._birdQueue.forEach((type, i) => {
      const el = document.createElement('div');
      const size = i === this._birdIndex ? 52 : (i < this._birdIndex ? 36 : 44);
      el.className = 'bq-item'
        + (i === this._birdIndex ? ' bq-current' : '')
        + (i < this._birdIndex  ? ' bq-used'    : '');
      el.style.width  = size + 'px';
      el.style.height = size + 'px';

      const labels = { red: '😡', yellow: '🟡', blue: '🔵', black: '💣' };
      el.textContent = labels[type] ?? '😡';
      birdQueueEl.appendChild(el);
    });
  }

  _updateLoadStatus(msg) {
    if (loadStatusEl) loadStatusEl.textContent = msg;
  }

  _hideLoading() {
    loadingEl.classList.add('fade-out');
    setTimeout(() => loadingEl.classList.add('gone'), 700);
  }

  // ─── World-to-screen helper ────────────────────────────────────────
  _worldToScreen(worldPos) {
    const v = worldPos.clone().project(this.cameraModule.cam);
    return {
      x: (v.x + 1) / 2 * window.innerWidth,
      y: (-v.y + 1) / 2 * window.innerHeight,
    };
  }

  // ═══ GAME LOOP ═══════════════════════════════════════════════════════════════
  _gameLoop(timestamp) {
    if (!this._running) return;
    requestAnimationFrame(t => this._gameLoop(t));

    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    // Physics
    this.physicsWorld.step(dt);

    // Update scene (animated sky + clouds)
    this.sceneModule.update(dt);

    // Update particles
    this.particles.update(dt);

    // Score manager (combo timer)
    this.scoreManager.update(dt);

    // Update level objects
    this.level.update();

    // Update birds
    this.activeBirds.forEach(b => b.update(dt));

    // Level cleared?
    if (this.slingshot.state === 'released' && this.level.isCleared()) {
      if (this.currentBird?.state === 'landed' ||
          this.activeBirds.every(b => b.state === 'landed')) {
        this._showLevelComplete();
        this.slingshot.state = 'idle';  // prevent re-trigger
      }
    }

    // Camera follow
    const flyingBird = this.activeBirds.find(b => b.state === 'flying');
    if (flyingBird) {
      this.cameraModule.follow(flyingBird.mesh.position, 0.035);
    } else {
      this.cameraModule.resetPosition(0.045);
    }
    this.cameraModule.update(dt);

    // Slingshot band
    this.slingshot.drawBand();

    // FPS
    this._fpsFrames++;
    this._fpsTimer  += dt;
    if (this._fpsTimer >= 1.0) {
      this._fps       = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsTimer  = 0;
    }
    if (this._debugVisible) {
      dbgFps.textContent    = this._fps;
      dbgBodies.textContent = this.physicsWorld.bodyCount;
    }

    // Render
    this.rendererModule.render(this.sceneModule.scene, this.cameraModule.cam);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const gameController = new GameController();

window.addEventListener('load', async () => {
  try {
    await gameController.init();
    window.__game = gameController;
  } catch (err) {
    console.error('[Game] Fatal init error:', err);
    if (loadStatusEl) loadStatusEl.textContent = `Error: ${err.message}`;
  }
});
