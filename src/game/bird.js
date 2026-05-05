// FILE: src/game/bird.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';
import { syncMeshToBody } from '../physics/physicsUtils.js';

const SETTLED_SPEED = 0.4;
const SETTLED_TIME  = 1.8;

// ── Bird type definitions ────────────────────────────────────────────────────
export const BirdType = {
  RED:    'red',
  YELLOW: 'yellow',
  BLUE:   'blue',
  BLACK:  'black',
};

const CONFIGS = {
  red: {
    radius: 0.52, mass: 1.2,
    bodyColor: 0xdd1a0a, bellyColor: 0xff4422,
    beakColor: 0xff8c00,
    feathers: true, fuse: false, triangular: false,
    label: '😡',
  },
  yellow: {
    radius: 0.46, mass: 0.85,
    bodyColor: 0xffcc00, bellyColor: 0xffe566,
    beakColor: 0xff7700,
    feathers: false, fuse: false, triangular: true,
    label: '🟡',
  },
  blue: {
    radius: 0.34, mass: 0.65,
    bodyColor: 0x2277ee, bellyColor: 0x66aaff,
    beakColor: 0xff8800,
    feathers: false, fuse: false, triangular: false,
    label: '🔵',
  },
  black: {
    radius: 0.64, mass: 2.8,
    bodyColor: 0x1a1a1a, bellyColor: 0x333333,
    beakColor: 0xff6600,
    feathers: false, fuse: true, triangular: false,
    label: '💣',
  },
};

/**
 * Bird — projectile with type-specific appearance and special ability.
 *
 * Types:
 *  RED:    Normal, no special ability.
 *  YELLOW: Speed boost on activate() — triples X velocity.
 *  BLUE:   Splits into 2 extra birds on activate().
 *  BLACK:  Explodes (radial impulse) on land/activate.
 *
 * State machine: 'ready' → 'flying' → 'landed'
 */
export class Bird {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {string} type  BirdType constant
   */
  constructor(sceneModule, physicsWorld, type) {
    this._scene   = sceneModule;
    this._physics = physicsWorld;
    this.type     = type ?? BirdType.RED;
    this.config   = CONFIGS[this.type] ?? CONFIGS.red;
    this.radius   = this.config.radius;

    this.state         = 'ready';
    this._settledTimer = 0;
    this._activated    = false;
    this._exploded     = false;
    this._fuseSpark    = null;

    // Callbacks
    this.onExplode = null;   // (THREE.Vector3) => void

    this._buildMesh();
    this._buildBody();
  }

  // ── Visual ────────────────────────────────────────────────────────
  _buildMesh() {
    this.mesh = new THREE.Group();
    const cfg = this.config;
    const r   = this.radius;

    // Body
    let bodyGeo;
    if (cfg.triangular) {
      bodyGeo = new THREE.SphereGeometry(r, 16, 12);
      this.mesh.scale.set(1.25, 0.88, 0.82);
    } else {
      bodyGeo = new THREE.SphereGeometry(r, 20, 16);
    }
    const bodyMat = new THREE.MeshStandardMaterial({
      color:     cfg.bodyColor,
      roughness: 0.55,
      metalness: 0.0,
      emissive:  new THREE.Color(cfg.bodyColor).multiplyScalar(0.08),
    });
    this._body3D = new THREE.Mesh(bodyGeo, bodyMat);
    this._body3D.castShadow    = true;
    this._body3D.receiveShadow = true;
    this.mesh.add(this._body3D);

    // Belly patch
    const bellyGeo = new THREE.SphereGeometry(r * 0.6, 10, 8);
    const bellyMat = new THREE.MeshStandardMaterial({ color: cfg.bellyColor, roughness: 0.6 });
    const belly = new THREE.Mesh(bellyGeo, bellyMat);
    belly.position.set(r * 0.25, -r * 0.2, r * 0.7);
    belly.scale.set(0.85, 0.85, 0.25);
    this.mesh.add(belly);

    // Beak (top + bottom)
    const beakMat = new THREE.MeshStandardMaterial({ color: cfg.beakColor, roughness: 0.4 });
    const bTop = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 7), beakMat);
    bTop.rotation.z = -Math.PI / 2;
    bTop.position.set(r * 0.86, r * 0.06, r * 0.4);
    this.mesh.add(bTop);
    const bBot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 7), beakMat);
    bBot.rotation.z = Math.PI / 2;
    bBot.position.set(r * 0.82, -r * 0.12, r * 0.4);
    this.mesh.add(bBot);

    // Eyes
    const eyeGeo   = new THREE.SphereGeometry(0.11, 9, 7);
    const eyeMat   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const pupilGeo = new THREE.SphereGeometry(0.065, 7, 6);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    [[-0.14, 0.2], [0.14, 0.2]].forEach(([dx, dy], i) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(dx, dy, r * 0.88);
      this.mesh.add(eye);

      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(dx + (i === 0 ? 0.02 : -0.02), dy - 0.02, r * 0.97);
      this.mesh.add(pupil);

      // Glint
      const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      glint.position.set(dx + 0.04, dy + 0.04, r * 0.99);
      this.mesh.add(glint);
    });

    // Angry brows
    const browMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    [[-0.14, 0.35, -0.32], [0.14, 0.35, 0.32]].forEach(([dx, dy, rz]) => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.06), browMat);
      brow.rotation.z = rz;
      brow.position.set(dx, dy, r * 0.84);
      this.mesh.add(brow);
    });

    // Feathers (red only)
    if (cfg.feathers) {
      const fm1 = new THREE.MeshStandardMaterial({ color: 0xcc1100, roughness: 0.7 });
      const fm2 = new THREE.MeshStandardMaterial({ color: 0x991100, roughness: 0.7 });
      [[-0.1, 0, 0], [0, 0.05, 0.08], [0.1, 0, 0]].forEach(([fx, fy, fz], fi) => {
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 5), fi % 2 === 0 ? fm1 : fm2);
        feather.position.set(fx, r * 0.95 + fy, fz);
        feather.castShadow = true;
        this.mesh.add(feather);
      });
    }

    // Fuse (black bomb)
    if (cfg.fuse) {
      const fuseMat = new THREE.MeshStandardMaterial({ color: 0x888844, roughness: 0.9 });
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), fuseMat);
      fuse.position.set(0, r * 0.98, 0);
      fuse.rotation.z = 0.3;
      this.mesh.add(fuse);

      this._fuseSpark = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
      );
      this._fuseSpark.position.set(0.15, r + 0.45, 0);
      this.mesh.add(this._fuseSpark);
    }

    this._scene.addObject(this.mesh);
  }

  // ── Physics body ──────────────────────────────────────────────────
  _buildBody() {
    const shape = new CANNON.Sphere(this.radius);
    this.body = new CANNON.Body({
      mass: this.config.mass,
      shape,
      linearDamping:  0.01,
      angularDamping: 0.3,
      material: this._physics.defaultMaterial,
    });
    this.body.allowSleep = true;
    this.body.sleep();
    this._physics.addBody(this.body);

    // Black bird: explode on any significant collision
    if (this.type === BirdType.BLACK) {
      this.body.addEventListener('collide', (e) => {
        if (this.state !== 'flying' || this._exploded) return;
        const impact = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() ?? 0)
          || (e.body?.velocity?.length() ?? 0);
        if (impact > 3) this._explode();
      });
    }
  }

  /** Place the bird at a world position. */
  setPosition(v3) {
    this.body.position.set(v3.x, v3.y, v3.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.sleep();
    syncMeshToBody(this.mesh, this.body);
  }

  /** Fire the bird. */
  launch(impulse) {
    this.body.wakeUp();
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
      new CANNON.Vec3(0, 0, 0)
    );
    this.state = 'flying';
    this._settledTimer = 0;
    this._activated    = false;
  }

  /**
   * Activate special ability.
   * @returns {Bird[]|null}  Blue bird returns 2 split birds; others return null.
   */
  activate() {
    if (this._activated || this.state !== 'flying') return null;
    this._activated = true;

    switch (this.type) {
      case BirdType.YELLOW:
        this.body.velocity.x *= 3.0;
        this.body.velocity.y *= 1.4;
        this._body3D.material.emissive.set(0xffee00);
        setTimeout(() => { this._body3D.material.emissive.set(0x000000); }, 350);
        break;
      case BirdType.BLUE:
        return this._split();
      case BirdType.BLACK:
        this._explode();
        break;
      default: break;
    }
    return null;
  }

  _split() {
    const vel = this.body.velocity;
    const result = [];
    [-0.38, 0.38].forEach(offsetY => {
      const b = new Bird(this._scene, this._physics, BirdType.BLUE);
      b.body.wakeUp();
      b.body.position.copy(this.body.position);
      b.body.velocity.set(vel.x * 0.9, vel.y + offsetY * 5, vel.z);
      b.state = 'flying';
      result.push(b);
    });
    return result;
  }

  _explode() {
    if (this._exploded) return;
    this._exploded = true;

    const pos    = this.body.position;
    const radius = 5.5;
    const force  = 120;

    this._physics.world.bodies.forEach(b => {
      if (b === this.body || b.mass === 0) return;
      const dx = b.position.x - pos.x;
      const dy = b.position.y - pos.y;
      const dz = b.position.z - pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < radius && dist > 0.01) {
        const scale = (1 - dist / radius) * force;
        b.wakeUp();
        b.applyImpulse(
          new CANNON.Vec3(dx / dist * scale, Math.abs(dy / dist * scale) + 15, dz / dist * scale),
          new CANNON.Vec3(0, 0, 0)
        );
      }
    });

    if (this.onExplode) {
      this.onExplode(new THREE.Vector3(pos.x, pos.y, pos.z));
    }

    // Visual flash
    this._body3D.material.color.set(0xffffff);
    this._body3D.material.emissive.set(0xffaa00);
    setTimeout(() => {
      this._body3D.material.color.set(this.config.bodyColor);
      this._body3D.material.emissive.set(0x000000);
    }, 220);

    this.state = 'landed';
  }

  /** Call once per frame. */
  update(dt) {
    syncMeshToBody(this.mesh, this.body);

    if (this._fuseSpark && this.state === 'flying') {
      this._fuseSpark.material.color.setHex(Math.random() > 0.5 ? 0xffaa00 : 0xff6600);
    }

    if (this.state === 'flying') {
      const speed = this.body.velocity.length();
      if (speed < SETTLED_SPEED) {
        this._settledTimer += dt;
        if (this._settledTimer >= SETTLED_TIME) {
          this.state = 'landed';
          if (this.type === BirdType.BLACK && !this._exploded) {
            this._explode();
          }
        }
      } else {
        this._settledTimer = 0;
      }
    }
  }

  /** Remove from scene and physics. */
  destroy() {
    this._scene.removeObject(this.mesh);
    this._physics.removeBody(this.body);
  }

  get label() { return this.config.label; }
}
