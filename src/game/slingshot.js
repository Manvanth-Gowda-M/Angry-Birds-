// FILE: src/game/slingshot.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';
import { clamp } from '../utils/math.js';

const FORCE_MULTIPLIER = 18;
const GRAVITY          = -9.82;  // for trajectory simulation
const TRAJ_DOTS        = 20;
const TRAJ_STEP        = 0.1;   // seconds between trajectory preview points

/**
 * Slingshot — anchor, elastic band rendering, bird attachment,
 * pull constraints, trajectory preview, release impulse.
 *
 * Spec §3.6:
 *  anchorPos: THREE.Vector3
 *  maxPullDist: 4.0
 *  state: 'idle' | 'grabbed' | 'released'
 *  attachBird, grab, updatePull, release, drawBand, updateTrajectory
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

    this.state      = 'idle';    // 'idle' | 'grabbed' | 'released'
    this.bird       = null;
    this.pullVector = new THREE.Vector3();

    this._clamped   = new THREE.Vector3();   // clamped pull position (bird pos)

    this._buildFork();
    this._buildBand();
    this._buildTrajectoryDots();
  }

  // ── Slingshot fork ──────────────────────────────────────────────────
  _buildFork() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a4d1a, roughness: 0.9 });
    const FORK_H  = 2.2;
    const SPREAD  = 0.6;

    // Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, FORK_H + 0.8, 9), woodMat);
    trunk.position.copy(this.anchorPos).add(new THREE.Vector3(0, -0.3, 0));
    trunk.castShadow = true;
    this._scene.addObject(trunk);

    // Left & right prongs
    [[-SPREAD, 0.38], [SPREAD, -0.38]].forEach(([dx, rz]) => {
      const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 7), woodMat);
      prong.rotation.z = rz;
      prong.position.copy(this.anchorPos).add(new THREE.Vector3(dx, FORK_H * 0.48 - 0.1, 0));
      prong.castShadow = true;
      this._scene.addObject(prong);

      // Knob at tip
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5),
        new THREE.MeshStandardMaterial({ color: 0x5a320a, roughness: 0.95 }));
      knob.position.copy(this.anchorPos).add(new THREE.Vector3(dx, FORK_H, 0));
      this._scene.addObject(knob);
    });

    // Fork tip world positions (for band attachment)
    this._leftTip  = this.anchorPos.clone().add(new THREE.Vector3(-SPREAD, FORK_H, 0));
    this._rightTip = this.anchorPos.clone().add(new THREE.Vector3( SPREAD, FORK_H, 0));
  }

  // ── Elastic band (two THREE.Line objects) ───────────────────────────
  _buildBand() {
    const bandMat = new THREE.LineBasicMaterial({ color: 0x4a3010, linewidth: 2 });

    const makeLine = () => {
      const geo  = new THREE.BufferGeometry();
      const pts  = new Float32Array(6);   // 2 points × 3 floats
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      return new THREE.Line(geo, bandMat);
    };

    this._leftBand  = makeLine();
    this._rightBand = makeLine();
    this._scene.addObject(this._leftBand);
    this._scene.addObject(this._rightBand);
  }

  // ── Trajectory preview dots ─────────────────────────────────────────
  _buildTrajectoryDots() {
    const dotGeo = new THREE.SphereGeometry(0.07, 6, 4);
    this.trajectoryDots = [];

    for (let i = 0; i < TRAJ_DOTS; i++) {
      const alpha = 1 - i / TRAJ_DOTS;
      const mat   = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.6, 0.1),
        transparent: true,
        opacity: alpha * 0.9,
      });
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.visible = false;
      this._scene.addObject(dot);
      this.trajectoryDots.push(dot);
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Place a bird at the anchor and reset state.
   * @param {import('./bird.js').Bird} bird
   */
  attachBird(bird) {
    this.bird = bird;
    bird.setPosition(this.anchorPos);
    this.state = 'idle';
    this._clamped.copy(this.anchorPos);
    this._updateBand(this.anchorPos);
    this._hideDots();
  }

  /**
   * Begin grab — called when pinch first detected.
   * @param {THREE.Vector3} pos3D
   */
  grab(pos3D) {
    if (!this.bird || this.state === 'released') return;
    this.state = 'grabbed';
    this.updatePull(pos3D);
  }

  /**
   * Update bird position while pinching.
   * @param {THREE.Vector3} pos3D
   */
  updatePull(pos3D) {
    if (this.state !== 'grabbed' || !this.bird) return;

    // Clamp pull distance from anchor
    const diff = pos3D.clone().sub(this.anchorPos);
    if (diff.length() > this.maxPullDist) {
      diff.normalize().multiplyScalar(this.maxPullDist);
    }
    this._clamped.copy(this.anchorPos).add(diff);
    this.pullVector.copy(diff);

    // Move bird mesh+body to clamped position
    this.bird.setPosition(this._clamped);

    // Update visual
    this._updateBand(this._clamped);
    this._updateTrajectoryDots();
  }

  /**
   * Release — apply impulse to bird.
   */
  release() {
    if (this.state !== 'grabbed' || !this.bird) return;

    // Force = (anchor – clamped) * multiplier
    const force = this.anchorPos.clone()
      .sub(this._clamped)
      .multiplyScalar(FORCE_MULTIPLIER);

    this.bird.launch(force);
    this.state = 'released';

    // Reset bands to anchor
    this._updateBand(this.anchorPos);
    this._hideDots();
  }

  /**
   * Update the elastic band geometry (call every frame).
   */
  drawBand() {
    const birdPos = this.state === 'released'
      ? this.anchorPos
      : (this.bird?.mesh?.position ?? this.anchorPos);
    this._updateBand(birdPos);
  }

  // ── Internals ───────────────────────────────────────────────────────

  _updateBand(birdPos) {
    this._setLinePoints(this._leftBand,  this._leftTip,  birdPos);
    this._setLinePoints(this._rightBand, this._rightTip, birdPos);
  }

  _setLinePoints(line, from, to) {
    const pos = line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x;   pos[4] = to.y;   pos[5] = to.z;
    line.geometry.attributes.position.needsUpdate = true;
  }

  _updateTrajectoryDots() {
    if (this.state !== 'grabbed') { this._hideDots(); return; }

    // Compute impulse (same formula as release)
    const force = this.anchorPos.clone().sub(this._clamped).multiplyScalar(FORCE_MULTIPLIER);
    const mass  = 1.2;
    let vx = force.x / mass;
    let vy = force.y / mass;
    let vz = force.z / mass;

    let px = this._clamped.x;
    let py = this._clamped.y;
    let pz = this._clamped.z;

    for (let i = 0; i < TRAJ_DOTS; i++) {
      const t = (i + 1) * TRAJ_STEP;
      const nx = px + vx * t;
      const ny = py + vy * t + 0.5 * GRAVITY * t * t;
      const nz = pz + vz * t;

      if (ny < 0.05) {
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
