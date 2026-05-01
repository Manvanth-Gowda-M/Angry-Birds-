// FILE: src/game/level.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';
import { createBox, syncMeshToBody } from '../physics/physicsUtils.js';

const DESTROY_IMPULSE = 15;    // N·s threshold to destroy a block on collision
const MAX_BODIES      = 60;    // performance cap

/**
 * Layout configs for each level.
 * Each object: { position: [x,y,z], size: [w,h,d], color, mass }
 *
 * All structures at positive X to the right of the slingshot at X≈-8.
 */
const LEVEL_LAYOUTS = {
  1: [
    // ── Tower at x=6 (3 stacked boxes) ──
    { position: [6, 0.6, 0],  size: [1.2, 1.2, 1.2], color: 0x9b7430, mass: 2 },
    { position: [6, 1.8, 0],  size: [1.2, 1.2, 1.2], color: 0x8b6420, mass: 2 },
    { position: [6, 3.0, 0],  size: [1.2, 1.2, 1.2], color: 0x7a5418, mass: 2 },
    // ── Single box at x=9 ──
    { position: [9, 0.6, 0],  size: [1.2, 1.2, 1.2], color: 0x888888, mass: 2 },
    // ── Pig targets ──
    { position: [6, 4.0, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
    { position: [9, 1.5, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
  ],
  2: [
    // ── Pyramid at x=7 ──
    { position: [5.4, 0.6, 0], size: [1.2, 1.2, 1.2], color: 0x9b7430, mass: 2 },
    { position: [6.6, 0.6, 0], size: [1.2, 1.2, 1.2], color: 0x9b7430, mass: 2 },
    { position: [7.8, 0.6, 0], size: [1.2, 1.2, 1.2], color: 0x9b7430, mass: 2 },
    { position: [6.0, 1.8, 0], size: [1.2, 1.2, 1.2], color: 0x8b6420, mass: 2 },
    { position: [7.2, 1.8, 0], size: [1.2, 1.2, 1.2], color: 0x8b6420, mass: 2 },
    { position: [6.6, 3.0, 0], size: [1.2, 1.2, 1.2], color: 0x7a5418, mass: 2 },
    // ── Tall stone tower ──
    { position: [10.5, 0.6, 0], size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    { position: [10.5, 1.8, 0], size: [1.0, 1.2, 1.0], color: 0x777777, mass: 3 },
    { position: [10.5, 3.0, 0], size: [1.0, 1.2, 1.0], color: 0x666666, mass: 3 },
    // Pigs
    { position: [6.6, 4.0, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
    { position: [10.5, 3.9, 0], size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
  ],
  3: [
    // ── Left tower ──
    { position: [5.5, 0.6, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    { position: [5.5, 1.8, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    { position: [5.5, 3.0, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    // ── Right tower ──
    { position: [9.5, 0.6, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    { position: [9.5, 1.8, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    { position: [9.5, 3.0, 0],  size: [1.0, 1.2, 1.0], color: 0x888888, mass: 3 },
    // ── Plank bridge ──
    { position: [7.5, 3.65, 0], size: [4.5, 0.25, 1.0], color: 0x9b7430, mass: 1.5 },
    // ── Boxes in between ──
    { position: [6.5, 0.6, 0],  size: [1.2, 1.2, 1.0], color: 0x9b7430, mass: 2 },
    { position: [8.5, 0.6, 0],  size: [1.2, 1.2, 1.0], color: 0x9b7430, mass: 2 },
    // Pigs
    { position: [5.5, 3.9, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
    { position: [9.5, 3.9, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
    { position: [7.5, 4.3, 0],  size: [0.9, 0.9, 0.9], color: 0x44bb44, mass: 1, isPig: true },
  ],
};

/**
 * Level — spawns destructible box towers for the current level index.
 *
 * Spec §3.8:
 *  build(levelIndex), reset(), update(), isCleared()
 *  Destroy on collision impulse > 15
 */
export class Level {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {import('./scoreManager.js').ScoreManager} scoreManager
   */
  constructor(sceneModule, physicsWorld, scoreManager) {
    this._scene        = sceneModule;
    this._physics      = physicsWorld;
    this._scoreManager = scoreManager;

    this._levelIndex = 1;
    /** @type {Array<{mesh:THREE.Mesh, body:CANNON.Body, startY:number, alive:boolean, isPig:boolean}>} */
    this._objects = [];
  }

  /**
   * Spawn the level layout.
   * @param {number} levelIndex 1, 2, or 3
   */
  build(levelIndex) {
    this._levelIndex = levelIndex;
    const layout = LEVEL_LAYOUTS[levelIndex] ?? LEVEL_LAYOUTS[1];

    layout.forEach(def => {
      if (this._objects.length >= MAX_BODIES) return;

      const [w, h, d] = def.size;
      const color      = def.color;
      const isPig      = def.isPig ?? false;

      const { mesh, body } = createBox(w, h, d, def.mass,
        this._physics.defaultMaterial, { color });

      // Position
      body.position.set(...def.position);
      mesh.position.set(...def.position);

      this._physics.addBody(body);
      this._scene.addObject(mesh);

      // Score listener
      this._scoreManager.attach(body);

      // Pig decoration
      if (isPig) this._decoratePig(mesh, Math.min(w, h, d) * 0.5);

      const startY = def.position[1];
      const obj    = { mesh, body, startY, alive: true, isPig };
      this._objects.push(obj);

      // Destruction on heavy collision
      body.addEventListener('collide', (event) => {
        if (!obj.alive) return;
        let impulse = 0;
        try {
          impulse = Math.abs(event.contact?.getImpactVelocityAlongNormal?.() ?? 0);
        } catch (_) {
          impulse = event.body?.velocity?.length() ?? 0;
        }
        if (impulse > DESTROY_IMPULSE) {
          this._destroyObject(obj);
        }
      });
    });
  }

  _decoratePig(mesh, r) {
    // Nose
    const noseMat = new THREE.MeshLambertMaterial({ color: 0x33aa33 });
    const nose    = new THREE.Mesh(new THREE.SphereGeometry(r * 0.38, 8, 6), noseMat);
    nose.position.set(0, -r * 0.14, r * 0.9);
    mesh.add(nose);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [[-r * 0.32, r * 0.28], [r * 0.32, r * 0.28]].forEach(([dx, dy]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 7, 5), eyeMat);
      eye.position.set(dx, dy, r * 0.88);
      mesh.add(eye);
      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.09, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0x111111 })
      );
      pupil.position.set(dx, dy, r * 0.97);
      mesh.add(pupil);
    });
  }

  _destroyObject(obj) {
    obj.alive = false;
    this._scoreManager.detach(obj.body);
    this._physics.removeBody(obj.body);

    // Flash red then remove
    if (obj.mesh.material) {
      obj.mesh.material.color?.set(0xff3300);
      obj.mesh.material.emissive?.set(0xff2200);
      obj.mesh.material.emissiveIntensity = 0.7;
    }
    setTimeout(() => {
      this._scene.removeObject(obj.mesh);
    }, 350);
  }

  /** Sync all alive objects' meshes to physics bodies. */
  update() {
    this._objects.forEach(obj => {
      if (obj.alive) syncMeshToBody(obj.mesh, obj.body);
    });
  }

  /**
   * Remove all objects and rebuild.
   */
  reset() {
    this._objects.forEach(obj => {
      if (obj.alive) {
        this._scoreManager.detach(obj.body);
        this._physics.removeBody(obj.body);
        this._scene.removeObject(obj.mesh);
      }
    });
    this._objects = [];
    this.build(this._levelIndex);
  }

  /**
   * Returns true when all pigs (or all boxes if no pigs) are destroyed
   * and at least one object has moved more than 1 unit from start.
   * @returns {boolean}
   */
  isCleared() {
    const pigs = this._objects.filter(o => o.isPig);
    const allPigsDead = pigs.length > 0 && pigs.every(p => !p.alive);
    const somethingFell = this._objects.some(o => {
      return !o.alive || Math.abs(o.body.position.y - o.startY) > 1;
    });
    return allPigsDead && somethingFell;
  }

  get currentLevel() { return this._levelIndex; }
  get objectCount()  { return this._objects.filter(o => o.alive).length; }
}
