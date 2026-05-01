// FILE: src/game/bird.js

import * as THREE from 'three';
import { CANNON } from '../physics/world.js';
import { syncMeshToBody } from '../physics/physicsUtils.js';

const SETTLED_SPEED   = 0.5;   // m/s — below this, bird may be 'landed'
const SETTLED_TIME    = 2.0;   // seconds at low speed before state = 'landed'

/**
 * Bird — one projectile in the game.
 *
 * State machine: 'ready' → 'flying' → 'landed'
 *
 * Spec §3.7:
 *  SphereGeometry(r, 16, 16), red MeshLambertMaterial
 *  small cone beak, two white eyes
 *  launch(impulse) → wakeUp + applyImpulse
 *  update() → syncMeshToBody; detect landing
 */
export class Bird {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   * @param {number} radius
   */
  constructor(sceneModule, physicsWorld, radius = 0.5) {
    this._scene   = sceneModule;
    this._physics = physicsWorld;
    this.radius   = radius;
    this.state    = 'ready';   // 'ready' | 'flying' | 'landed'

    this._settledTimer = 0;

    this._buildMesh();
    this._buildBody();
  }

  // ── Visual ──────────────────────────────────────────────────────────
  _buildMesh() {
    // Root group (so beak & eyes transform with the sphere)
    this.mesh = new THREE.Group();

    // Body sphere
    const bodyGeo = new THREE.SphereGeometry(this.radius, 16, 16);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xdd2211 });
    this._body3D  = new THREE.Mesh(bodyGeo, bodyMat);
    this._body3D.castShadow    = true;
    this._body3D.receiveShadow = true;
    this.mesh.add(this._body3D);

    // Beak (orange cone)
    const beakGeo = new THREE.ConeGeometry(0.13, 0.32, 8);
    const beakMat = new THREE.MeshLambertMaterial({ color: 0xffa500 });
    const beak    = new THREE.Mesh(beakGeo, beakMat);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(this.radius * 0.85, -0.04, 0.15);
    this.mesh.add(beak);

    // Eyes (white sphere + black pupil)
    const eyeGeo    = new THREE.SphereGeometry(0.1, 8, 6);
    const eyeMat    = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilGeo  = new THREE.SphereGeometry(0.055, 6, 5);
    const pupilMat  = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const browGeo   = new THREE.BoxGeometry(0.22, 0.045, 0.04);
    const browMat   = new THREE.MeshBasicMaterial({ color: 0x111111 });

    [[-0.12, 0.18], [0.12, 0.18]].forEach(([dx, dy], i) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(dx, dy, this.radius * 0.9);
      this.mesh.add(eye);

      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(dx, dy, this.radius * 0.98);
      this.mesh.add(pupil);

      // Angry brow
      const brow = new THREE.Mesh(browGeo, browMat);
      brow.rotation.z = i === 0 ? 0.35 : -0.35;
      brow.position.set(dx, dy + 0.12, this.radius * 0.86);
      this.mesh.add(brow);
    });

    this._scene.addObject(this.mesh);
  }

  // ── Physics body ─────────────────────────────────────────────────────
  _buildBody() {
    const shape = new CANNON.Sphere(this.radius);
    this.body = new CANNON.Body({
      mass: 1.2,
      shape,
      linearDamping:  0.01,
      angularDamping: 0.3,
      material: this._physics.defaultMaterial,
    });
    this.body.allowSleep = true;
    this.body.sleep();
    this._physics.addBody(this.body);
  }

  /**
   * Place the bird at a world position (used by Slingshot.attachBird).
   * @param {THREE.Vector3} v3
   */
  setPosition(v3) {
    this.body.position.set(v3.x, v3.y, v3.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.sleep();
    syncMeshToBody(this.mesh, this.body);
  }

  /**
   * Fire the bird.
   * @param {THREE.Vector3} impulse
   */
  launch(impulse) {
    this.body.wakeUp();
    this.body.applyImpulse(
      new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
      new CANNON.Vec3(0, 0, 0)
    );
    this.state = 'flying';
    this._settledTimer = 0;
  }

  /**
   * Call once per frame.
   * @param {number} dt  Delta seconds
   */
  update(dt) {
    syncMeshToBody(this.mesh, this.body);

    if (this.state === 'flying') {
      const speed = this.body.velocity.length();
      if (speed < SETTLED_SPEED) {
        this._settledTimer += dt;
        if (this._settledTimer >= SETTLED_TIME) {
          this.state = 'landed';
        }
      } else {
        this._settledTimer = 0;
      }
    }
  }

  /**
   * Remove bird from scene and physics world.
   */
  destroy() {
    this._scene.removeObject(this.mesh);
    this._physics.removeBody(this.body);
  }
}
