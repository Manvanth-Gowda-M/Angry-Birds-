// FILE: src/core/camera.js

import * as THREE from 'three';

// OrbitControls loaded lazily from Three.js addons
let OrbitControls = null;

/**
 * Camera — PerspectiveCamera, starting at (0,8,22) → looking at (0,3,0).
 * Press 'C' to toggle OrbitControls for debug panning.
 *
 * Spec §3.3:
 *  fov 60, near 0.1, far 500
 *  Start: position (0,8,22), lookAt (0,3,0)
 *  'C' key → toggle OrbitControls
 */
export class Camera {
  /**
   * @param {import('./renderer.js').Renderer} rendererModule
   */
  constructor(rendererModule) {
    this.cam = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.cam.position.set(0, 8, 22);
    this.cam.lookAt(0, 3, 0);

    this._renderer = rendererModule;
    this._orbitEnabled = false;
    this._controls = null;

    // Resize
    window.addEventListener('resize', this._onResize.bind(this));

    // 'C' key toggles debug camera
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC') this._toggleOrbit();
    });
  }

  _onResize() {
    this.cam.aspect = window.innerWidth / window.innerHeight;
    this.cam.updateProjectionMatrix();
  }

  async _toggleOrbit() {
    if (!OrbitControls) {
      // Lazy-load OrbitControls
      const mod = await import('three/addons/controls/OrbitControls.js');
      OrbitControls = mod.OrbitControls;
    }

    if (this._orbitEnabled && this._controls) {
      this._controls.dispose();
      this._controls = null;
      this._orbitEnabled = false;
      console.info('[Camera] OrbitControls disabled');
    } else {
      this._controls = new OrbitControls(this.cam, this._renderer.canvas);
      this._controls.target.set(0, 3, 0);
      this._controls.enableDamping = true;
      this._controls.dampingFactor = 0.08;
      this._orbitEnabled = true;
      console.info('[Camera] OrbitControls enabled — drag to orbit');
    }
  }

  /**
   * Call each frame to update OrbitControls damping.
   */
  update() {
    if (this._orbitEnabled && this._controls) {
      this._controls.update();
    }
  }

  /**
   * Smoothly move camera to follow a target (used when bird is flying).
   * @param {THREE.Vector3} target
   * @param {number} alpha  Lerp factor
   */
  follow(target, alpha = 0.03) {
    if (this._orbitEnabled) return;  // Don't interfere with orbit controls
    const desiredPos = new THREE.Vector3(target.x - 3, Math.max(8, target.y + 4), 22);
    this.cam.position.lerp(desiredPos, alpha);
    const lookTarget = new THREE.Vector3(target.x + 4, target.y, 0);
    this.cam.lookAt(lookTarget);
  }

  /** Return camera to default position. */
  resetPosition(alpha = 0.04) {
    if (this._orbitEnabled) return;
    const defaultPos = new THREE.Vector3(0, 8, 22);
    this.cam.position.lerp(defaultPos, alpha);
    this.cam.lookAt(0, 3, 0);
  }
}
