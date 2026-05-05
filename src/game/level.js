// FILE: src/game/level.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';
import { createBox, syncMeshToBody } from '../physics/physicsUtils.js';

const DESTROY_IMPULSE = 12;
const MAX_BODIES      = 80;

// ── Block material palettes ─────────────────────────────────────────────────
const BLOCK_TYPES = {
  wood: {
    colors: [0x9b6a20, 0x8b5c18, 0xa07028],
    roughness: 0.82, metalness: 0.0,
    emissive: 0x000000, mass: 2,
  },
  stone: {
    colors: [0x7a7875, 0x8a8a88, 0x696866],
    roughness: 0.88, metalness: 0.05,
    emissive: 0x000000, mass: 3.5,
  },
  glass: {
    colors: [0x88ccee, 0xaaddff, 0x77bbdd],
    roughness: 0.1, metalness: 0.0,
    transparent: true, opacity: 0.72, mass: 0.8,
  },
  ice: {
    colors: [0xbbddf8, 0xd0eeff, 0xa8ccee],
    roughness: 0.05, metalness: 0.15,
    transparent: true, opacity: 0.80, mass: 1.2,
  },
};

// Helper: pick a random color from a palette
function pickColor(palette) {
  return palette.colors[Math.floor(Math.random() * palette.colors.length)];
}

// ── Level layouts ────────────────────────────────────────────────────────────
// Each entry: { position, size, blockType, mass?, isPig? }
const LEVEL_LAYOUTS = {
  1: [
    // Simple wooden tower
    { position: [6.0, 0.6, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [6.0, 1.8, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [6.0, 3.0, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    // Single stone block with pig
    { position: [9.5, 0.6, 0], size: [1.2, 1.2, 1.2], blockType: 'stone' },
    { position: [9.5, 1.8, 0], size: [1.2, 1.2, 1.2], blockType: 'stone' },
    // Pigs
    { position: [6.0, 4.2, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
    { position: [9.5, 2.9, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
  ],
  2: [
    // Wooden pyramid
    { position: [5.4, 0.6, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [6.6, 0.6, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [7.8, 0.6, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [6.0, 1.8, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [7.2, 1.8, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    { position: [6.6, 3.0, 0], size: [1.2, 1.2, 1.2], blockType: 'wood' },
    // Stone tower
    { position: [10.5, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [10.5, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [10.5, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    // Glass roof
    { position: [10.5, 4.0, 0], size: [1.4, 0.3, 1.4], blockType: 'glass' },
    // Pigs
    { position: [6.6,  4.2, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
    { position: [10.5, 4.2, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
  ],
  3: [
    // Bridge fortress
    { position: [5.5, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [5.5, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [5.5, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    // Plank bridge
    { position: [7.5, 3.65, 0], size: [4.5, 0.25, 1.0], blockType: 'wood' },
    // Inner boxes
    { position: [6.5, 0.6, 0], size: [1.2, 1.2, 1.0], blockType: 'wood' },
    { position: [8.5, 0.6, 0], size: [1.2, 1.2, 1.0], blockType: 'wood' },
    // Pigs
    { position: [5.5, 4.2, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
    { position: [9.5, 4.2, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
    { position: [7.5, 4.5, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
  ],
  4: [
    // Ice castle
    { position: [5.5, 0.6, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [5.5, 1.8, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [5.5, 3.0, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [5.5, 4.2, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [8.0, 0.6, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [8.0, 1.8, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [8.0, 3.0, 0], size: [1.1, 1.2, 1.1], blockType: 'ice' },
    { position: [10.5, 0.6, 0], size: [1.1, 1.2, 1.1], blockType: 'stone' },
    { position: [10.5, 1.8, 0], size: [1.1, 1.2, 1.1], blockType: 'stone' },
    { position: [10.5, 3.0, 0], size: [1.1, 1.2, 1.1], blockType: 'stone' },
    // Glass roof slabs
    { position: [5.5, 5.5, 0],  size: [1.4, 0.3, 1.4], blockType: 'glass' },
    { position: [8.0, 4.5, 0],  size: [1.4, 0.3, 1.4], blockType: 'glass' },
    { position: [10.5, 4.5, 0], size: [1.4, 0.3, 1.4], blockType: 'glass' },
    // Pigs
    { position: [5.5, 6.0, 0],  size: [0.92, 0.92, 0.92], blockType: 'ice', isPig: true, mass: 1 },
    { position: [8.0, 5.0, 0],  size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
    { position: [10.5, 5.0, 0], size: [0.92, 0.92, 0.92], blockType: 'wood', isPig: true, mass: 1 },
  ],
  5: [
    // Grand fortress — multiple towers with a big king pig
    { position: [4.5, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [4.5, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [4.5, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [4.5, 4.2, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [7.0, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'wood' },
    { position: [7.0, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'wood' },
    { position: [7.0, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'wood' },
    { position: [9.5, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [9.5, 4.2, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [12.0, 0.6, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [12.0, 1.8, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    { position: [12.0, 3.0, 0], size: [1.0, 1.2, 1.0], blockType: 'stone' },
    // Cross planks
    { position: [6.75, 3.65, 0], size: [4.5, 0.25, 1.0], blockType: 'wood' },
    { position: [10.75, 3.65, 0], size: [4.5, 0.25, 1.0], blockType: 'wood' },
    // Glass panels
    { position: [7.0, 4.5, 0], size: [1.2, 0.3, 1.2], blockType: 'glass' },
    { position: [7.0, 5.5, 0], size: [1.2, 1.2, 1.2], blockType: 'ice' },
    // Pigs — multiple
    { position: [4.5, 5.5, 0],  size: [0.92, 0.92, 0.92], blockType: 'stone', isPig: true, mass: 1 },
    { position: [7.0, 6.5, 0],  size: [1.1,  1.1,  1.1],  blockType: 'wood',  isPig: true, mass: 1.5, kingPig: true },
    { position: [9.5, 5.5, 0],  size: [0.92, 0.92, 0.92], blockType: 'stone', isPig: true, mass: 1 },
    { position: [12.0, 4.5, 0], size: [0.92, 0.92, 0.92], blockType: 'stone', isPig: true, mass: 1 },
  ],
};

/**
 * Level — builds destructible structures for each level.
 */
export class Level {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {import('./scoreManager.js').ScoreManager} scoreManager
   * @param {import('./particles.js').ParticleSystem|null} particles
   */
  constructor(sceneModule, physicsWorld, scoreManager, particles = null) {
    this._scene        = sceneModule;
    this._physics      = physicsWorld;
    this._scoreManager = scoreManager;
    this._particles    = particles;

    this._levelIndex = 1;
    this._objects    = [];

    // Callbacks
    this.onPigKilled = null;   // (worldPos) => void
    this.onBlockHit  = null;   // (worldPos, color) => void
  }

  /** @param {number} levelIndex */
  build(levelIndex) {
    this._levelIndex = levelIndex;
    const layout = LEVEL_LAYOUTS[levelIndex] ?? LEVEL_LAYOUTS[1];

    layout.forEach(def => {
      if (this._objects.length >= MAX_BODIES) return;

      const [w, h, d] = def.size;
      const isPig     = def.isPig ?? false;
      const kingPig   = def.kingPig ?? false;
      const btDef     = BLOCK_TYPES[def.blockType] ?? BLOCK_TYPES.wood;
      const color     = isPig ? (kingPig ? 0x228822 : 0x44bb44) : pickColor(btDef);
      const mass      = def.mass ?? btDef.mass;

      const matOpts = {
        color,
        roughness: btDef.roughness ?? 0.8,
        metalness: btDef.metalness ?? 0.0,
        transparent: btDef.transparent ?? false,
        opacity: btDef.opacity ?? 1.0,
      };

      const { mesh, body } = createBox(w, h, d, mass,
        this._physics.defaultMaterial, matOpts);

      body.position.set(...def.position);
      mesh.position.set(...def.position);

      this._physics.addBody(body);
      this._scene.addObject(mesh);
      this._scoreManager.attach(body);

      if (isPig) this._decoratePig(mesh, Math.min(w, h, d) * 0.5, kingPig);

      const startY = def.position[1];
      // Store original color as THREE.Color for crack-effect reset guard
      const origColor = new THREE.Color(color);
      const obj    = { mesh, body, startY, alive: true, isPig, kingPig, color, cracked: false };
      this._objects.push(obj);

      // Collision → destruction
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
        } else if (impulse > 3 && !obj.cracked) {
          // Crack effect — darken once; store original to avoid cumulative darkening
          obj.cracked = true;
          if (obj.mesh.material && !obj.mesh.material.transparent) {
            obj.mesh.material.color.copy(origColor.clone().multiplyScalar(0.72));
          }
        }
      });
    });
  }

  _decoratePig(mesh, r, isKing) {
    const baseColor  = isKing ? 0x1a8822 : 0x339933;
    const noseColor  = isKing ? 0x117711 : 0x228822;

    // Snout
    const snout = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.42, 10, 8),
      new THREE.MeshStandardMaterial({ color: noseColor, roughness: 0.6 })
    );
    snout.position.set(0, -r * 0.12, r * 0.9);
    snout.scale.set(1, 0.75, 0.4);
    mesh.add(snout);

    // Nostrils
    const nostrilMat = new THREE.MeshBasicMaterial({ color: 0x115511 });
    [-r * 0.12, r * 0.12].forEach(dx => {
      const n = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 5, 4), nostrilMat);
      n.position.set(dx, -r * 0.14, r * 0.95);
      mesh.add(n);
    });

    // Eyes
    const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const eyeB = new THREE.MeshBasicMaterial({ color: 0x111111 });
    [[-r * 0.3, r * 0.3], [r * 0.3, r * 0.3]].forEach(([dx, dy]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 8, 7), eyeW);
      eye.position.set(dx, dy, r * 0.87);
      mesh.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 6, 5), eyeB);
      pupil.position.set(dx, dy, r * 0.97);
      mesh.add(pupil);
    });

    // King's crown
    if (isKing) {
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.3, metalness: 0.4 });
      const crown = new THREE.Group();
      // Base ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, r * 0.08, 8, 16), crownMat);
      ring.rotation.x = Math.PI / 2;
      crown.add(ring);
      // Three points
      [-0.4, 0, 0.4].forEach((dx, i) => {
        const h = i === 1 ? r * 0.8 : r * 0.55;
        const point = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, h, 5), crownMat);
        point.position.set(dx * r, r * 0.18 + h / 2, 0);
        crown.add(point);
      });
      crown.position.set(0, r * 0.9, 0);
      mesh.add(crown);
    }
  }

  _destroyObject(obj) {
    obj.alive = false;
    this._scoreManager.detach(obj.body);
    this._physics.removeBody(obj.body);

    const pos = new THREE.Vector3(
      obj.body.position.x,
      obj.body.position.y,
      obj.body.position.z
    );

    // Particles
    if (this._particles) {
      if (obj.isPig) {
        this._particles.spawnPigDefeat(pos);
        this._particles.spawnImpactFlash(pos, 0x44ff88);
        if (this.onPigKilled) this.onPigKilled(pos);
      } else {
        this._particles.spawnDebris(pos, obj.color, 10);
        this._particles.spawnImpactFlash(pos, 0xffaa44);
        if (this.onBlockHit) this.onBlockHit(pos, obj.color);
      }
    }

    // Flash effect then remove
    if (obj.mesh.material) {
      if (obj.isPig) {
        obj.mesh.material.color?.set(0xffff88);
        obj.mesh.material.emissive?.set(0xffff44);
        if (obj.mesh.material.emissiveIntensity !== undefined)
          obj.mesh.material.emissiveIntensity = 1;
      } else {
        obj.mesh.material.color?.set(0xff4400);
        obj.mesh.material.emissive?.set(0xff2200);
        if (obj.mesh.material.emissiveIntensity !== undefined)
          obj.mesh.material.emissiveIntensity = 0.8;
      }
    }
    setTimeout(() => this._scene.removeObject(obj.mesh), 300);
  }

  update() {
    this._objects.forEach(obj => {
      if (obj.alive) syncMeshToBody(obj.mesh, obj.body);
    });
  }

  reset() {
    this._objects.forEach(obj => {
      if (obj.alive) {
        this._scoreManager.detach(obj.body);
        this._physics.removeBody(obj.body);
        this._scene.removeObject(obj.mesh);
      }
    });
    this._objects = [];
  }

  isCleared() {
    const pigs = this._objects.filter(o => o.isPig);
    return pigs.length > 0 && pigs.every(p => !p.alive);
  }

  /** Number of birds remaining needed for star rating. */
  get objectCount()  { return this._objects.filter(o => o.alive).length; }
  get currentLevel() { return this._levelIndex; }
  get maxLevel()     { return Object.keys(LEVEL_LAYOUTS).length; }
}
