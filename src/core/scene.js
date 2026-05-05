// FILE: src/core/scene.js

import * as THREE from 'three';

/**
 * SceneSetup — animated sky, PBR ground, hemisphere + directional lighting,
 * drifting clouds, richer environment decoration.
 */
export class SceneSetup {
  /**
   * @param {import('./renderer.js').Renderer} rendererModule
   */
  constructor(rendererModule) {
    this.renderer = rendererModule;
    this.scene = new THREE.Scene();

    this._time = 0;
    this._clouds = [];

    this._buildSky();
    this._buildGround();
    this._buildLights();
    this._buildFog();
    this._buildEnvironment();
  }

  // ── Animated sky sphere ──────────────────────────────────────────
  _buildSky() {
    const skyGeo = new THREE.SphereGeometry(250, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor:     { value: new THREE.Color(0x085aa0) },
        midColor:     { value: new THREE.Color(0x1c8acf) },
        horizonColor: { value: new THREE.Color(0xffaa55) },
        time:         { value: 0 },
      },
      vertexShader: /* glsl */`
        varying float vY;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vY = normalize(wp.xyz).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  topColor;
        uniform vec3  midColor;
        uniform vec3  horizonColor;
        uniform float time;
        varying float vY;

        void main() {
          float t = clamp(vY, 0.0, 1.0);
          // Two-zone blend: horizon→mid→top
          vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.25, t));
          col       = mix(col,          topColor, smoothstep(0.15, 0.70, t));

          // Subtle animated shimmer in the upper sky
          float shimmer = sin(time * 0.4 + vY * 8.0) * 0.012 * t;
          col += shimmer;

          // Sun disk near horizon
          float sunY = 0.12 + sin(time * 0.03) * 0.05;
          float sunDot = smoothstep(0.018, 0.0, abs(vY - sunY) + 0.06);
          col = mix(col, vec3(1.0, 0.95, 0.7), sunDot * 0.9);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this._sky = new THREE.Mesh(skyGeo, skyMat);
    this._skyMat = skyMat;
    this.scene.add(this._sky);
  }

  // ── Ground — procedural grass texture ────────────────────────────
  _buildGround() {
    const tex = this._makeGrassTexture();

    const geo = new THREE.PlaneGeometry(200, 200, 20, 20);
    const mat = new THREE.MeshStandardMaterial({
      map:       tex,
      roughness: 0.92,
      metalness: 0.0,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // A slightly elevated, brighter strip right under the play area
    const stripGeo = new THREE.PlaneGeometry(60, 30);
    const stripMat = new THREE.MeshStandardMaterial({
      color:     0x4da840,
      roughness: 0.88,
      metalness: 0.0,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(4, 0.002, 0);
    strip.receiveShadow = true;
    this.scene.add(strip);
  }

  _makeGrassTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base fill
    ctx.fillStyle = '#4a9c3a';
    ctx.fillRect(0, 0, size, size);

    // Darker patches
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 18 + 6;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const d = Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgba(${30 + d},${80 + d},${20 + d},0.25)`;
      ctx.fill();
    }
    // Blade-like vertical stripes
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size;
      const h = Math.random() * 12 + 3;
      ctx.fillStyle = `rgba(60,130,30,${Math.random() * 0.3})`;
      ctx.fillRect(x, Math.random() * size, 1.5, h);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  // ── Lights ───────────────────────────────────────────────────────
  _buildLights() {
    // Hemisphere: sky blue → warm ground bounce
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a7c40, 0.55);
    this.scene.add(hemi);

    // Directional sun
    this.dirLight = new THREE.DirectionalLight(0xfff4d8, 2.0);
    this.dirLight.position.set(12, 24, 10);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width  = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near    = 0.5;
    this.dirLight.shadow.camera.far     = 120;
    this.dirLight.shadow.camera.left    = -35;
    this.dirLight.shadow.camera.right   =  35;
    this.dirLight.shadow.camera.top     =  30;
    this.dirLight.shadow.camera.bottom  = -15;
    this.dirLight.shadow.bias           = -0.0007;
    this.dirLight.shadow.normalBias     = 0.02;
    this.scene.add(this.dirLight);

    // Warm fill from left
    const fill = new THREE.DirectionalLight(0xffd0a0, 0.35);
    fill.position.set(-10, 8, 5);
    this.scene.add(fill);
  }

  // ── Fog ──────────────────────────────────────────────────────────
  _buildFog() {
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);
  }

  // ── Environment (trees, clouds, hills) ───────────────────────────
  _buildEnvironment() {
    this._buildTrees();
    this._buildClouds();
    this._buildHills();
    this._buildRocks();
  }

  _buildTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3d1a, roughness: 0.95 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x2d6e1a, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3a8820, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x1f5410, roughness: 0.9 }),
    ];

    const treePositions = [
      [-24, 0, -12, 1.0], [30, 0, -15, 1.2], [37, 0, -9, 0.85],
      [42, 0, -20, 1.3],  [46, 0, -7, 0.9], [-30, 0, -9, 1.1],
      [-18, 0, -18, 0.8], [22, 0, -8, 0.95], [-38, 0, -14, 1.4],
      [55, 0, -12, 1.0],  [-50, 0, -10, 1.2],
    ];

    treePositions.forEach(([x, y, z, scale]) => {
      const g = new THREE.Group();
      const h = 2.8 * scale;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * scale, 0.24 * scale, h + 0.6, 8), trunkMat);
      trunk.position.y = (h + 0.6) / 2;
      trunk.castShadow = true;
      g.add(trunk);

      const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];
      [[1.6 * scale, 3.5, h + 0.2], [1.15 * scale, 2.8, h + 1.8],
       [0.8 * scale, 2.2, h + 3.0]].forEach(([r, ch, cy]) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 9), leafMat);
        cone.position.y = cy;
        cone.castShadow = true;
        g.add(cone);
      });

      g.position.set(x, y, z);
      this.scene.add(g);
    });
  }

  _buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0,
      transparent: true, opacity: 0.88,
    });

    const cloudDefs = [
      [-8, 18, -40, 1.0, 0.012], [10, 22, -50, 1.2, 0.008],
      [24, 16, -42, 0.9, 0.015], [-20, 20, -48, 1.1, 0.01],
      [40, 19, -38, 0.85, 0.013],
    ];

    cloudDefs.forEach(([x, y, z, scale, speed]) => {
      const g = new THREE.Group();
      const blobCount = Math.floor(Math.random() * 2) + 3;
      for (let i = 0; i < blobCount; i++) {
        const r = (2 + Math.random() * 1.8) * scale;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
        blob.position.set(
          (i - blobCount / 2) * 2.8 * scale,
          Math.random() * 1.2 * scale,
          (Math.random() - 0.5) * 1.5 * scale
        );
        g.add(blob);
      }
      g.position.set(x, y, z);
      g.userData.speed = speed;
      g.userData.startX = x;
      this.scene.add(g);
      this._clouds.push(g);
    });
  }

  _buildHills() {
    // Background silhouette hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x2d6018, roughness: 1 });
    const hillDefs = [
      [0, -4, -60, 30, 10, 60],
      [-40, -4, -55, 25, 8, 50],
      [50, -4, -52, 20, 7, 40],
    ];
    hillDefs.forEach(([x, y, z, rx, ry, rz]) => {
      const geo = new THREE.SphereGeometry(1, 12, 8);
      geo.scale(rx, ry, rz);
      const hill = new THREE.Mesh(geo, hillMat);
      hill.position.set(x, y, z);
      this.scene.add(hill);
    });
  }

  _buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.88 });
    const rockDefs = [
      [-12, 0, -4, 0.5], [14, 0, -3, 0.4], [18, 0, -5, 0.6],
      [-5, 0, -6, 0.35], [25, 0, -4, 0.45],
    ];
    rockDefs.forEach(([x, y, z, s]) => {
      const geo = new THREE.DodecahedronGeometry(s, 0);
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(x, s * 0.5, z);
      rock.rotation.set(
        Math.random() * 0.8, Math.random() * Math.PI * 2, Math.random() * 0.5);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    });
  }

  // ── Per-frame update ─────────────────────────────────────────────
  /**
   * @param {number} dt  Delta seconds
   */
  update(dt) {
    this._time += dt;

    // Animate sky time uniform
    if (this._skyMat) {
      this._skyMat.uniforms.time.value = this._time;
    }

    // Drift clouds
    this._clouds.forEach(cloud => {
      cloud.position.x += cloud.userData.speed;
      // Wrap around when drifted too far right
      if (cloud.position.x > 80) {
        cloud.position.x = -80;
      }
    });
  }

  // ── Object helpers ───────────────────────────────────────────────
  /** @param {THREE.Object3D} obj */
  addObject(obj)  { this.scene.add(obj); }

  /**
   * @param {THREE.Object3D} obj
   * @param {boolean} dispose
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
