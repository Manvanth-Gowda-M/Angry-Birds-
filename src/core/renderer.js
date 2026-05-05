// FILE: src/core/renderer.js

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

/**
 * Renderer — WebGLRenderer with UnrealBloom post-processing and adaptive DPR.
 */
export class Renderer {
  constructor() {
    // Detect mobile for adaptive quality
    this._isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: !this._isMobile,
      alpha: false,
      powerPreference: 'high-performance',
    });

    // Adaptive pixel ratio: cap at 2 desktop, 1.5 mobile
    const maxDPR = this._isMobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDPR));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.canvas = this.renderer.domElement;

    // Post-processing (initialised after scene + camera ready)
    this._composer = null;

    window.addEventListener('resize', this._onResize.bind(this));
  }

  /**
   * Initialise EffectComposer with subtle UnrealBloom.
   * Call once after scene and camera are created.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  initPostProcessing(scene, camera) {
    this._composer = new EffectComposer(this.renderer);
    this._composer.addPass(new RenderPass(scene, camera));

    // Bloom: very subtle — adds warmth to lights, glows on bright pixels
    const bloomStrength  = this._isMobile ? 0.18 : 0.28;
    const bloomRadius    = 0.4;
    const bloomThreshold = 0.82;
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      bloomStrength,
      bloomRadius,
      bloomThreshold
    );
    this._composer.addPass(bloom);
    this._composer.addPass(new OutputPass());
  }

  /**
   * Render one frame. Uses composer if available.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  render(scene, camera) {
    if (this._composer) {
      this._composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this._composer) this._composer.setSize(w, h);
    // Camera updates handled by Camera class
  }
}
