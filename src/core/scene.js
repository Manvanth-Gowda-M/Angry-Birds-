// FILE: src/core/scene.js

import * as THREE from 'three';

/**
 * SceneSetup — Three.js scene, gradient sky, ground, lighting, fog.
 *
 * Spec §3.1:
 *  - Gradient sky (large sphere, ShaderMaterial, blue → orange)
 *  - Ground PlaneGeometry(100,100), receiveShadow
 *  - Directional light at (10,20,10), castShadow, 2048×2048 shadow map
 *  - Ambient light intensity 0.4
 *  - THREE.Fog(0x87CEEB, 40, 120)
 */
export class SceneSetup {
  /**
   * @param {import('./renderer.js').Renderer} rendererModule
   */
  constructor(rendererModule) {
    this.renderer = rendererModule;
    this.scene = new THREE.Scene();

    this._buildSky();
    this._buildGround();
    this._buildLights();
    this._buildFog();
    this._buildEnvironment();
  }

  // ── Sky sphere with gradient shader ──────────────────────────────
  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(220, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor:    { value: new THREE.Color(0x0a6daa) },   // deep blue
        horizonColor:{ value: new THREE.Color(0xffa040) },   // warm orange
        exponent:    { value: 0.55 },
      },
      vertexShader: /* glsl */ `
        varying float vY;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vY = normalize(worldPos.xyz).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform float exponent;
        varying float vY;
        void main() {
          float t = pow(max(vY, 0.0), exponent);
          gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
        }
      `,
    });
    this._sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this._sky);
  }

  // ── Ground ───────────────────────────────────────────────────────
  _buildGround() {
    const geo = new THREE.PlaneGeometry(100, 100, 10, 10);
    const mat = new THREE.MeshLambertMaterial({ color: 0x4cae4c });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  // ── Lights ───────────────────────────────────────────────────────
  _buildLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Directional (sun)
    this.dirLight = new THREE.DirectionalLight(0xfff4e0, 1.8);
    this.dirLight.position.set(10, 20, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width  = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far  = 100;
    this.dirLight.shadow.camera.left   = -30;
    this.dirLight.shadow.camera.right  =  30;
    this.dirLight.shadow.camera.top    =  25;
    this.dirLight.shadow.camera.bottom = -15;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);
  }

  // ── Fog ──────────────────────────────────────────────────────────
  _buildFog() {
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120);
  }

  // ── Decorative environment (trees, clouds) ────────────────────────
  _buildEnvironment() {
    // Pine trees far in background
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3d1a });
    const leafMat  = new THREE.MeshLambertMaterial({ color: 0x2a6018 });
    const treePositions = [
      [-22, 0, -10], [28, 0, -14], [35, 0, -8],
      [40, 0, -18], [44, 0, -6], [-28, 0, -8],
    ];
    treePositions.forEach(([x, y, z]) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.8, 7), trunkMat);
      trunk.position.set(x, 1.4, z);
      trunk.castShadow = true;
      this.scene.add(trunk);

      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.5, 8), leafMat);
      cone1.position.set(x, 4.5, z);
      cone1.castShadow = true;
      this.scene.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.8, 8), leafMat);
      cone2.position.set(x, 6.5, z);
      this.scene.add(cone2);
    });

    // Fluffy clouds
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    [[-6,16,-35], [8,20,-45], [20,14,-38]].forEach(([x, y, z]) => {
      const g = new THREE.Group();
      [0, 1, 2].forEach(i => {
        const r = 2 + Math.random() * 1.4;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), cloudMat);
        blob.position.set((i - 1) * 2.5, Math.random() * 0.8, 0);
        g.add(blob);
      });
      g.position.set(x, y, z);
      this.scene.add(g);
    });
  }

  /**
   * Add a mesh/object to the scene.
   * @param {THREE.Object3D} obj
   */
  addObject(obj) {
    this.scene.add(obj);
  }

  /**
   * Remove a mesh/object from the scene and dispose its resources.
   * @param {THREE.Object3D} obj
   * @param {boolean} dispose  Whether to dispose geometry & material
   */
  removeObject(obj, dispose = true) {
    this.scene.remove(obj);
    if (dispose) {
      obj.traverse(child => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
    }
  }
}
