// FILE: src/game/slingshot.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';

const FORCE_MULTIPLIER = 18;
const GRAVITY          = -9.82;
const TRAJ_DOTS        = 28;
const TRAJ_STEP        = 0.09;

/**
 * Slingshot — fork, elastic band, trajectory preview, pull + release.
 */
export class Slingshot {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {THREE.Vector3} anchorPosition
   */
  constructor(sceneModule, physicsWorld, anchorPosition) {
    this._scene    = sceneModule;
    this._physics  = physicsWorld;
    this.anchorPos = anchorPosition.clone();
    this.maxPullDist = 4.0;

    this.state      = 'idle';
    this.bird       = null;
    this.pullVector = new THREE.Vector3();

    this._clamped   = new THREE.Vector3();

    this._buildFork();
    this._buildBand();
    this._buildTrajectoryDots();
  }

  // ── Slingshot fork ───────────────────────────────────────────────
  _buildFork() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6b3d14, roughness: 0.92, metalness: 0.02,
    });
    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x4a2a0e, roughness: 0.95,
    });
    const FORK_H = 2.2;
    const SPREAD = 0.62;

    // Main trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.22, FORK_H + 1.0, 10), woodMat);
    trunk.position.copy(this.anchorPos).add(new THREE.Vector3(0, -0.2, 0));
    trunk.castShadow = true;
    this._scene.addObject(trunk);

    // Ground base (flared)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.38, 0.35, 10), barkMat);
    base.position.copy(this.anchorPos).add(new THREE.Vector3(0, -FORK_H * 0.5, 0));
    base.castShadow = true;
    this._scene.addObject(base);

    // Prongs
    [[-SPREAD, 0.38], [SPREAD, -0.38]].forEach(([dx, rz]) => {
      const prong = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 1.3, 8), woodMat);
      prong.rotation.z = rz;
      prong.position.copy(this.anchorPos).add(new THREE.Vector3(dx, FORK_H * 0.48, 0));
      prong.castShadow = true;
      this._scene.addObject(prong);

      // Rounded knob at top
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3a1e06, roughness: 0.95 })
      );
      knob.position.copy(this.anchorPos).add(new THREE.Vector3(dx, FORK_H, 0));
      this._scene.addObject(knob);

      // Leather wrap (small torus-ish ring)
      const wrap = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.04, 6, 12),
        new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.85 })
      );
      wrap.rotation.z = Math.PI / 2;
      wrap.position.copy(this.anchorPos).add(new THREE.Vector3(dx, FORK_H - 0.22, 0));
      this._scene.addObject(wrap);
    });

    // Fork tip positions (for band)
    this._leftTip  = this.anchorPos.clone().add(new THREE.Vector3(-SPREAD, FORK_H, 0));
    this._rightTip = this.anchorPos.clone().add(new THREE.Vector3( SPREAD, FORK_H, 0));
  }

  // ── Elastic band ─────────────────────────────────────────────────
  _buildBand() {
    // Use QuadraticBezierCurve for smooth band rendering
    this._leftCurve  = new THREE.QuadraticBezierCurve3();
    this._rightCurve = new THREE.QuadraticBezierCurve3();

    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a08, roughness: 0.85, metalness: 0.0,
    });

    const makeTubeMesh = (curve) => {
      const geo  = new THREE.TubeGeometry(curve, 12, 0.04, 6, false);
      const mesh = new THREE.Mesh(geo, bandMat);
      return mesh;
    };

    this._leftBandMesh  = makeTubeMesh(this._leftCurve);
    this._rightBandMesh = makeTubeMesh(this._rightCurve);
    this._scene.addObject(this._leftBandMesh);
    this._scene.addObject(this._rightBandMesh);

    this._bandMat = bandMat;
  }

  // ── Trajectory dots ──────────────────────────────────────────────
  _buildTrajectoryDots() {
    const sharedGeo = new THREE.SphereGeometry(0.07, 6, 5);
    this.trajectoryDots = [];

    for (let i = 0; i < TRAJ_DOTS; i++) {
      const alpha = Math.pow(1 - i / TRAJ_DOTS, 1.5);
      const mat   = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.09 + i * 0.005, 1.0, 0.58),
        transparent: true,
        opacity: alpha * 0.92,
      });
      const dot = new THREE.Mesh(sharedGeo, mat);
      dot.visible = false;
      this._scene.addObject(dot);
      this.trajectoryDots.push(dot);
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  /** Place a bird at anchor and reset state. */
  attachBird(bird) {
    this.bird = bird;
    bird.setPosition(this.anchorPos);
    this.state = 'idle';
    this._clamped.copy(this.anchorPos);
    this._updateBand(this.anchorPos);
    this._hideDots();
  }

  /** Begin grab. */
  grab(pos3D) {
    if (!this.bird || this.state === 'released') return;
    this.state = 'grabbed';
    this.updatePull(pos3D);
  }

  /** Update pull position while pinching / dragging. */
  updatePull(pos3D) {
    if (this.state !== 'grabbed' || !this.bird) return;

    const diff = pos3D.clone().sub(this.anchorPos);
    const len  = diff.length();
    if (len > this.maxPullDist) diff.normalize().multiplyScalar(this.maxPullDist);
    this._clamped.copy(this.anchorPos).add(diff);
    this.pullVector.copy(diff);

    this.bird.setPosition(this._clamped);
    this._updateBand(this._clamped);
    this._updateTrajectoryDots();

    // Tighten band material colour proportional to stretch
    const stretch = Math.min(len / this.maxPullDist, 1);
    this._bandMat.color.setHSL(0.06 - stretch * 0.05, 0.9, 0.2 + stretch * 0.2);
  }

  /** Release — fire the bird. */
  release() {
    if (this.state !== 'grabbed' || !this.bird) return;

    const force = this.anchorPos.clone()
      .sub(this._clamped)
      .multiplyScalar(FORCE_MULTIPLIER);

    this.bird.launch(force);
    this.state = 'released';

    this._bandMat.color.set(0x2a1a08);
    this._updateBand(this.anchorPos);
    this._hideDots();
  }

  /** Call every frame to update the band while bird is flying. */
  drawBand() {
    const birdPos = this.state === 'released'
      ? this.anchorPos
      : (this.bird?.mesh?.position ?? this.anchorPos);
    this._updateBand(birdPos);
  }

  // ── Internals ─────────────────────────────────────────────────────

  _updateBand(birdPos) {
    // Midpoint control: slightly below the midpoint for sag
    const midL = this._leftTip.clone().lerp(birdPos, 0.5);
    midL.y -= 0.15;
    const midR = this._rightTip.clone().lerp(birdPos, 0.5);
    midR.y -= 0.15;

    this._updateTubeMesh(this._leftBandMesh,  this._leftTip,  midL, birdPos);
    this._updateTubeMesh(this._rightBandMesh, this._rightTip, midR, birdPos);
  }

  _updateTubeMesh(tubeMesh, from, control, to) {
    const curve = new THREE.QuadraticBezierCurve3(from, control, to);
    const geo   = new THREE.TubeGeometry(curve, 12, 0.04, 6, false);
    tubeMesh.geometry.dispose();
    tubeMesh.geometry = geo;
  }

  _updateTrajectoryDots() {
    if (this.state !== 'grabbed') { this._hideDots(); return; }

    const force = this.anchorPos.clone().sub(this._clamped).multiplyScalar(FORCE_MULTIPLIER);
    const mass  = 1.2;
    const vx = force.x / mass;
    const vy = force.y / mass;
    const vz = force.z / mass;
    let px = this._clamped.x;
    let py = this._clamped.y;
    let pz = this._clamped.z;

    for (let i = 0; i < TRAJ_DOTS; i++) {
      const t  = (i + 1) * TRAJ_STEP;
      const nx = px + vx * t;
      const ny = py + vy * t + 0.5 * GRAVITY * t * t;
      const nz = pz + vz * t;

      if (ny < 0.06) {
        this.trajectoryDots[i].visible = false;
        continue;
      }
      this.trajectoryDots[i].position.set(nx, ny, nz);
      this.trajectoryDots[i].visible = true;
    }
  }

  _hideDots() {
    this.trajectoryDots.forEach(d => { d.visible = false; });
  }
}
