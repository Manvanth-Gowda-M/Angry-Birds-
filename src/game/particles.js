// FILE: src/game/particles.js — Particle effects for destruction, pig defeats, and launch puffs

import * as THREE from 'three';

const MAX_PARTICLES = 300;   // pool cap to keep memory bounded

/**
 * ParticleSystem — manages short-lived debris, sparkles and dust particles.
 */
export class ParticleSystem {
  /**
   * @param {import('../core/scene.js').SceneSetup} sceneModule
   */
  constructor(sceneModule) {
    this._scene     = sceneModule;
    this._particles = [];
  }

  // ── Public spawners ──────────────────────────────────────────────

  /**
   * Exploding block debris.
   * @param {THREE.Vector3} position
   * @param {number} color  THREE hex color
   * @param {number} count
   */
  spawnDebris(position, color, count = 10) {
    if (this._particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < count; i++) {
      const s  = Math.random() * 0.18 + 0.06;
      const geo = Math.random() > 0.5
        ? new THREE.BoxGeometry(s, s, s)
        : new THREE.TetrahedronGeometry(s * 0.7, 0);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.5;
      mesh.position.y += Math.random() * 0.4;
      mesh.position.z += (Math.random() - 0.5) * 0.5;

      const speed  = Math.random() * 8 + 3;
      const angle  = Math.random() * Math.PI * 2;
      const upBias = Math.random() * 7 + 2;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        upBias,
        Math.sin(angle) * speed * 0.5
      );

      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      );

      this._scene.addObject(mesh);
      this._particles.push({
        mesh, vel, rotVel,
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.0,
        gravity: true,
      });
    }
  }

  /**
   * Sparkle burst when a pig is defeated.
   * @param {THREE.Vector3} position
   */
  spawnPigDefeat(position) {
    if (this._particles.length > MAX_PARTICLES) return;
    const colors = [0xffdd00, 0xff8800, 0x44ff88, 0xffffff, 0xff4488];
    const count  = 18;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const s     = Math.random() * 0.14 + 0.06;
      const geo   = new THREE.SphereGeometry(s, 5, 4);
      const mat   = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.position.y += 0.3;

      const speed = Math.random() * 6 + 3;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 8 + 4,
        Math.sin(angle) * speed * 0.4
      );

      this._scene.addObject(mesh);
      this._particles.push({
        mesh, vel,
        rotVel: new THREE.Vector3(0, 0, 0),
        life: 0.6 + Math.random() * 0.5,
        maxLife: 0.9,
        gravity: true,
      });
    }
  }

  /**
   * Small dust puff at launch.
   * @param {THREE.Vector3} position
   */
  spawnLaunchPuff(position) {
    if (this._particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < 6; i++) {
      const r   = Math.random() * 0.22 + 0.1;
      const geo = new THREE.SphereGeometry(r, 5, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xddcc99,
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 1.5
      );

      this._scene.addObject(mesh);
      this._particles.push({
        mesh, vel,
        rotVel: new THREE.Vector3(0, 0, 0),
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.45,
        gravity: false,
      });
    }
  }

  /**
   * Ring shockwave-like flash at impact point.
   * @param {THREE.Vector3} position
   * @param {number} color
   */
  spawnImpactFlash(position, color = 0xffaa44) {
    if (this._particles.length > MAX_PARTICLES) return;
    const geo = new THREE.RingGeometry(0.1, 0.8, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y += 0.1;
    mesh.rotation.x = -Math.PI / 2;

    this._scene.addObject(mesh);
    this._particles.push({
      mesh,
      vel:    new THREE.Vector3(0, 0, 0),
      rotVel: new THREE.Vector3(0, 0, 0),
      life: 0.3,
      maxLife: 0.3,
      gravity: false,
      scale: true,        // expand the ring outward
      scaleRate: 5,
    });
  }

  // ── Per-frame update ─────────────────────────────────────────────
  /**
   * @param {number} dt
   */
  update(dt) {
    const toRemove = [];

    this._particles.forEach((p, i) => {
      p.life -= dt;

      if (p.life <= 0) {
        toRemove.push(i);
        this._scene.removeObject(p.mesh);
        return;
      }

      // Motion
      if (p.gravity) p.vel.y -= 16 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      // Rotation
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      // Scale (ring flash)
      if (p.scale) {
        const s = 1 + (1 - p.life / p.maxLife) * p.scaleRate;
        p.mesh.scale.setScalar(s);
      }

      // Fade opacity
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.mesh.material?.opacity !== undefined) {
        p.mesh.material.opacity = alpha * (p.scale ? 0.7 : (p.gravity ? 1 : 0.65));
      }

      // Stop on ground
      if (p.gravity && p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y = 0;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
    });

    // Remove dead particles in reverse order
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this._particles.splice(toRemove[i], 1);
    }
  }

  get particleCount() { return this._particles.length; }
}
