// src/game/trajectory.js — Parabola preview dots

import * as THREE from 'three';
import { SLINGSHOT_ANCHOR } from './bird.js';

const DOT_COUNT  = 22;
const TIME_STEP  = 0.12;   // seconds between preview dots
const GRAVITY_Y  = -9.82;

export class TrajectoryPreview {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene   = scene;
    this.visible = false;
    this._dots   = [];
    this._build();
  }

  _build() {
    const geo = new THREE.SphereGeometry(0.08, 6, 5);
    for (let i = 0; i < DOT_COUNT; i++) {
      const alpha = 1 - i / DOT_COUNT;
      const mat   = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.09, 1, 0.65),
        transparent: true,
        opacity: alpha * 0.85,
      });
      const dot = new THREE.Mesh(geo, mat);
      dot.visible = false;
      this.scene.add(dot);
      this._dots.push(dot);
    }
  }

  /**
   * Update dot positions based on current bird position and expected impulse.
   * @param {THREE.Vector3} birdPos
   * @param {{ x, y, z }} impulse
   */
  update(birdPos, impulse) {
    if (!this.visible) {
      this._dots.forEach(d => { d.visible = false; });
      return;
    }

    const mass = 1; // kg
    const vx = impulse.x / mass;
    const vy = impulse.y / mass;
    const vz = impulse.z / mass;

    let px = birdPos.x;
    let py = birdPos.y;
    let pz = birdPos.z;

    for (let i = 0; i < DOT_COUNT; i++) {
      const t  = (i + 1) * TIME_STEP;
      const nx = px + vx * t;
      const ny = py + vy * t + 0.5 * GRAVITY_Y * t * t;
      const nz = pz + vz * t;

      if (ny < 0.05) {
        this._dots[i].visible = false;
        continue;
      }

      this._dots[i].position.set(nx, ny, nz);
      this._dots[i].visible = true;
    }
  }

  show() { this.visible = true; }
  hide() {
    this.visible = false;
    this._dots.forEach(d => { d.visible = false; });
  }

  dispose() {
    this._dots.forEach(d => this.scene.remove(d));
    this._dots = [];
  }
}
