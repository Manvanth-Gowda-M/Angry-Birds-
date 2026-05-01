// FILE: src/vision/coordinateMapper.js

import * as THREE from 'three';

/**
 * CoordinateMapper — converts normalised MediaPipe 2D coordinates
 * to a THREE.Vector3 in world space by raycasting onto a Z plane.
 *
 * Spec §3.12:
 *  planeZ = slingshotAnchor.z
 *  Correct for MediaPipe X mirror: nx = 1 - normX
 *  NDC: ndcX = nx*2-1, ndcY = -(ny*2-1)
 *  Raycast to Z plane: t = (planeZ - ray.origin.z) / ray.direction.z
 */
export class CoordinateMapper {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} slingshotAnchor
   */
  constructor(camera, slingshotAnchor) {
    this._camera    = camera;
    this._planeZ    = slingshotAnchor.z;
    this._raycaster = new THREE.Raycaster();
  }

  /**
   * Map normalised hand coordinates to a 3D world position.
   * @param {number} normX  0 (left) → 1 (right), MediaPipe-raw
   * @param {number} normY  0 (top)  → 1 (bottom)
   * @returns {THREE.Vector3}
   */
  map(normX, normY) {
    // MediaPipe X is already mirrored relative to display; correct:
    const nx = 1 - normX;
    const ny = normY;

    // Convert to NDC
    const ndcX =  nx * 2 - 1;
    const ndcY = -(ny * 2 - 1);

    // Update raycaster
    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this._camera);

    const ray = this._raycaster.ray;

    // Avoid division by zero (ray parallel to Z plane)
    if (Math.abs(ray.direction.z) < 1e-6) {
      return new THREE.Vector3(ray.origin.x, ray.origin.y, this._planeZ);
    }

    // t parameter: how far along the ray we need to travel to hit planeZ
    const t = (this._planeZ - ray.origin.z) / ray.direction.z;

    // World position
    return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
  }
}
