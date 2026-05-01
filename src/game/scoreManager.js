// FILE: src/game/scoreManager.js

import { CANNON } from '../physics/world.js';

/**
 * ScoreManager — listens to Cannon-es collide events on structure bodies
 * and awards points based on impact magnitude.
 *
 * Spec §3.9:
 *  Points = Math.floor(impulse * 10), capped at 500 per hit
 *  Updates DOM #score-display
 */
export class ScoreManager {
  /**
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   */
  constructor(physicsWorld) {
    this._physics   = physicsWorld;
    this._score     = 0;
    this._listeners = new Map();   // body → handler (for cleanup)

    this._scoreEl = document.getElementById('score-display');
  }

  /**
   * Attach a collision listener to a physics body.
   * @param {CANNON.Body} body
   */
  attach(body) {
    if (this._listeners.has(body)) return;  // already attached

    const handler = (event) => {
      const contact = event.contact;
      if (!contact) return;

      // Get impact velocity
      let impactVel = 0;
      try {
        impactVel = Math.abs(contact.getImpactVelocityAlongNormal?.() ?? 0);
      } catch (_) {
        // Fallback: use relative velocity approximation
        const rv = event.body?.velocity;
        if (rv) impactVel = rv.length();
      }

      const points = Math.min(Math.floor(impactVel * 10), 500);
      if (points > 0) {
        this._score += points;
        this.updateHUD();
      }
    };

    body.addEventListener('collide', handler);
    this._listeners.set(body, handler);
  }

  /**
   * Detach a collision listener from a body (call when body is removed).
   * @param {CANNON.Body} body
   */
  detach(body) {
    const handler = this._listeners.get(body);
    if (handler) {
      body.removeEventListener('collide', handler);
      this._listeners.delete(body);
    }
  }

  /** @returns {number} */
  getScore() { return this._score; }

  reset() {
    // Detach all listeners
    this._listeners.forEach((handler, body) => {
      try { body.removeEventListener('collide', handler); } catch (_) {}
    });
    this._listeners.clear();
    this._score = 0;
    this.updateHUD();
  }

  /**
   * Refresh the score DOM element.
   */
  updateHUD() {
    if (this._scoreEl) {
      this._scoreEl.textContent = `Score: ${this._score.toLocaleString()}`;
      // Pulse animation
      this._scoreEl.classList.remove('pulse');
      void this._scoreEl.offsetWidth;  // reflow
      this._scoreEl.classList.add('pulse');
      setTimeout(() => this._scoreEl.classList.remove('pulse'), 250);
    }
  }
}
