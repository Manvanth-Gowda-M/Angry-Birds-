// FILE: src/physics/world.js

import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

// Re-export CANNON so other physics modules can import from here
export { CANNON };

/**
 * PhysicsWorld — wraps cannon-es World with fixed-step advancement.
 *
 * Spec §3.4:
 *  gravity (0, -9.82, 0)
 *  SAPBroadphase
 *  solver iterations: 20
 *  step: fixedStep=1/60, maxSubSteps=3
 */
export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });

    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 20;

    // Ground body
    const groundShape = new CANNON.Plane();
    const groundBody  = new CANNON.Body({ mass: 0 });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    // Shared materials
    this.defaultMaterial = new CANNON.Material('default');
    this.groundMaterial  = new CANNON.Material('ground');
    groundBody.material  = this.groundMaterial;

    const contact = new CANNON.ContactMaterial(this.defaultMaterial, this.groundMaterial, {
      friction: 0.45,
      restitution: 0.3,
    });
    this.world.addContactMaterial(contact);

    const selfContact = new CANNON.ContactMaterial(this.defaultMaterial, this.defaultMaterial, {
      friction: 0.4,
      restitution: 0.2,
    });
    this.world.addContactMaterial(selfContact);
  }

  /**
   * Advance the physics simulation.
   * @param {number} dt  Delta time in seconds (capped by caller)
   */
  step(dt) {
    this.world.step(1 / 60, dt, 3);
  }

  /**
   * Add a body to the world.
   * @param {CANNON.Body} body
   */
  addBody(body) {
    this.world.addBody(body);
  }

  /**
   * Remove a body from the world.
   * @param {CANNON.Body} body
   */
  removeBody(body) {
    try { this.world.removeBody(body); } catch (_) {}
  }

  /** Total number of bodies currently in the world. */
  get bodyCount() {
    return this.world.bodies.length;
  }
}
