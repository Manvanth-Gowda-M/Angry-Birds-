// FILE: src/physics/physicsUtils.js

import * as THREE from 'three';
import { CANNON } from './world.js';

/**
 * Copy a Cannon body's position+quaternion onto a Three.js mesh.
 * @param {THREE.Object3D} mesh
 * @param {CANNON.Body} body
 */
export function syncMeshToBody(mesh, body) {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(
    body.quaternion.x,
    body.quaternion.y,
    body.quaternion.z,
    body.quaternion.w
  );
}

/**
 * Create a paired Three.js + Cannon box.
 *
 * @param {number} w Width
 * @param {number} h Height
 * @param {number} d Depth
 * @param {number} mass  0 = static
 * @param {CANNON.Material|null} material
 * @param {{ color?: number, roughness?: number }} meshOpts
 * @returns {{ mesh: THREE.Mesh, body: CANNON.Body }}
 */
export function createBox(w, h, d, mass, material = null, meshOpts = {}) {
  // Three.js mesh
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mat  = new THREE.MeshStandardMaterial({
    color:     meshOpts.color     ?? 0x8b6914,
    roughness: meshOpts.roughness ?? 0.8,
    metalness: meshOpts.metalness ?? 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;

  // Cannon body
  const shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
  const body  = new CANNON.Body({
    mass,
    shape,
    linearDamping:  0.1,
    angularDamping: 0.4,
    material: material ?? undefined,
  });

  return { mesh, body };
}

/**
 * Create a paired Three.js + Cannon sphere.
 *
 * @param {number} radius
 * @param {number} mass
 * @param {CANNON.Material|null} material
 * @param {{ color?: number }} meshOpts
 * @returns {{ mesh: THREE.Mesh, body: CANNON.Body }}
 */
export function createSphere(radius, mass, material = null, meshOpts = {}) {
  const geo  = new THREE.SphereGeometry(radius, 16, 16);
  const mat  = new THREE.MeshLambertMaterial({ color: meshOpts.color ?? 0xff3322 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;

  const shape = new CANNON.Sphere(radius);
  const body  = new CANNON.Body({
    mass,
    shape,
    linearDamping:  0.01,
    angularDamping: 0.3,
    material: material ?? undefined,
  });

  return { mesh, body };
}
