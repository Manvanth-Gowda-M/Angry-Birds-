// FILE: src/game/scoreManager.js

import { CANNON } from '../physics/world.js';

const POPUP_CONTAINER_ID = 'score-popups';

/**
 * ScoreManager — collision-based scoring, floating DOM score popups, combo system.
 */
export class ScoreManager {
  /**
   * @param {import('../physics/world.js').PhysicsWorld} physicsWorld
   */
  constructor(physicsWorld) {
    this._physics   = physicsWorld;
    this._score     = 0;
    this._listeners = new Map();

    this._scoreEl   = document.getElementById('score-display');
    this._popupEl   = document.getElementById(POPUP_CONTAINER_ID);

    // Combo
    this._comboCount = 0;
    this._comboTimer = 0;
    this._COMBO_WINDOW = 1.5;  // seconds

    // External callback
    this.onPoints = null;   // (points, worldPos?) => void
  }

  /**
   * Attach a collision listener to a body.
   * @param {CANNON.Body} body
   */
  attach(body) {
    if (this._listeners.has(body)) return;

    const handler = (event) => {
      const contact = event.contact;
      if (!contact) return;

      let impactVel = 0;
      try {
        impactVel = Math.abs(contact.getImpactVelocityAlongNormal?.() ?? 0);
      } catch (_) {
        impactVel = event.body?.velocity?.length() ?? 0;
      }

      const points = Math.min(Math.floor(impactVel * 12), 600);
      if (points > 0) {
        this._awardPoints(points);
      }
    };

    body.addEventListener('collide', handler);
    this._listeners.set(body, handler);
  }

  /**
   * Detach listener from a body.
   * @param {CANNON.Body} body
   */
  detach(body) {
    const handler = this._listeners.get(body);
    if (handler) {
      body.removeEventListener('collide', handler);
      this._listeners.delete(body);
    }
  }

  /**
   * Award bonus points (pig kill, special ability, etc.).
   * @param {number} points
   * @param {string} type  'pig' | 'combo' | 'win' | ''
   * @param {{ x:number, y:number }|null} screenPos
   */
  awardBonus(points, type = '', screenPos = null) {
    this._awardPoints(points, type, screenPos);
  }

  /**
   * Call each frame to tick the combo window timer.
   * @param {number} dt
   */
  update(dt) {
    if (this._comboTimer > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) {
        this._comboCount = 0;
      }
    }
  }

  getScore() { return this._score; }

  reset() {
    this._listeners.forEach((handler, body) => {
      try { body.removeEventListener('collide', handler); } catch (_) {}
    });
    this._listeners.clear();
    this._score     = 0;
    this._comboCount = 0;
    this.updateHUD();
  }

  updateHUD() {
    if (this._scoreEl) {
      this._scoreEl.textContent = this._score.toLocaleString();
      this._scoreEl.closest?.('.hud-item')?.classList?.remove?.('pulse');
      void this._scoreEl.offsetWidth;
      this._scoreEl.closest?.('.hud-item')?.classList?.add?.('pulse');
      setTimeout(() => this._scoreEl.closest?.('.hud-item')?.classList?.remove?.('pulse'), 300);
    }
  }

  // ── Internals ─────────────────────────────────────────────────────

  _awardPoints(points, type = '', screenPos = null) {
    // Combo multiplier
    this._comboCount++;
    this._comboTimer = this._COMBO_WINDOW;
    let multiplier = 1;
    if (this._comboCount >= 4) multiplier = 3;
    else if (this._comboCount >= 2) multiplier = 2;

    const total = Math.round(points * multiplier);
    this._score += total;
    this.updateHUD();

    // Show popup
    const popupType = multiplier > 1 ? 'combo' : (type || '');
    const label = multiplier > 1
      ? `x${multiplier} COMBO! +${total.toLocaleString()}`
      : `+${total.toLocaleString()}`;
    this._showPopup(label, popupType, screenPos);

    if (this.onPoints) this.onPoints(total, screenPos);
  }

  _showPopup(text, type = '', screenPos = null) {
    if (!this._popupEl) return;

    const el = document.createElement('div');
    el.className = 'score-popup' + (type ? ` ${type}` : '');
    el.textContent = text;

    // Position: randomize horizontally near the centre of the screen
    // or near the given screen position
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = screenPos ? screenPos.x : vw / 2 + (Math.random() - 0.5) * vw * 0.25;
    const cy = screenPos ? screenPos.y : vh * 0.45 + (Math.random() - 0.5) * vh * 0.12;
    el.style.left = `${Math.max(10, Math.min(cx - 40, vw - 180))}px`;
    el.style.top  = `${Math.max(10, Math.min(cy, vh - 80))}px`;

    this._popupEl.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback removal
    setTimeout(() => el.remove(), 1600);
  }
}
