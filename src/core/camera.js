// FILE: src/core/camera.js

import * as THREE from 'three';

let OrbitControls = null;

/**
 * Camera — PerspectiveCamera with smooth follow, camera shake, and OrbitControls toggle.
 */
export class Camera {
  /**
   * @param {import('./renderer.js').Renderer} rendererModule
   */
  constructor(rendererModule) {
    this.cam = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    this.cam.position.set(0, 8, 22);
    this.cam.lookAt(0, 3, 0);

    this._renderer     = rendererModule;
    this._orbitEnabled = false;
    this._controls     = null;

    // Camera shake
    this._shakeIntensity = 0;
    this._shakeDuration  = 0;
    this._shakeTimer     = 0;
    this._basePos        = new THREE.Vector3(0, 8, 22);

    window.addEventListener('resize', this._onResize.bind(this));
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
      const mod = await import('three/addons/controls/OrbitControls.js');
      OrbitControls = mod.OrbitControls;
    }
    if (this._orbitEnabled && this._controls) {
      this._controls.dispose();
      this._controls     = null;
      this._orbitEnabled = false;
    } else {
      this._controls = new OrbitControls(this.cam, this._renderer.canvas);
      this._controls.target.set(0, 3, 0);
      this._controls.enableDamping  = true;
      this._controls.dampingFactor  = 0.08;
      this._orbitEnabled = true;
    }
  }

  /**
   * Trigger a camera shake.
   * @param {number} intensity  Max offset in world units
   * @param {number} duration   Seconds
   */
  shake(intensity = 0.25, duration = 0.35) {
    this._shakeIntensity = intensity;
    this._shakeDuration  = duration;
    this._shakeTimer     = duration;
  }

  /**
   * Call each frame.
   * @param {number} dt  Delta seconds
   */
  update(dt) {
    if (this._orbitEnabled && this._controls) {
      this._controls.update();
    }

    // Camera shake
    if (this._shakeTimer > 0) {
      this._shakeTimer -= dt;
      const t = Math.max(0, this._shakeTimer / this._shakeDuration);
      const s = this._shakeIntensity * t;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s * 0.5;
    }
  }

  /**
   * Smoothly follow a flying bird.
   * @param {THREE.Vector3} target
   * @param {number} alpha
   */
  follow(target, alpha = 0.035) {
    if (this._orbitEnabled) return;
    const desiredPos = new THREE.Vector3(
      target.x - 2,
      Math.max(7, target.y + 5),
      22
    );
    this.cam.position.lerp(desiredPos, alpha);
    this._basePos.copy(this.cam.position);
    this.cam.lookAt(target.x + 3, target.y, 0);
  }

  /** Return to default position. */
  resetPosition(alpha = 0.05) {
    if (this._orbitEnabled) return;
    const defaultPos = new THREE.Vector3(0, 8, 22);
    this.cam.position.lerp(defaultPos, alpha);
    this._basePos.copy(this.cam.position);
    this.cam.lookAt(0, 3, 0);
  }
}
