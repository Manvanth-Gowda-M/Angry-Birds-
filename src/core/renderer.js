// FILE: src/core/renderer.js

import * as THREE from 'three';

/**
 * Renderer — wraps THREE.WebGLRenderer with shadow support and resize handling.
 *
 * Usage:
 *   const r = new Renderer();
 *   r.renderer.render(scene, camera);
 */
export class Renderer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping for pleasant colours
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // Reference to canvas for convenience
    this.canvas = this.renderer.domElement;

    // Bind resize
    window.addEventListener('resize', this._onResize.bind(this));
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Camera update is handled by the Camera class via its own resize listener
  }

  /**
   * Render one frame.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    this.renderer.render(scene, camera);
  }
}
