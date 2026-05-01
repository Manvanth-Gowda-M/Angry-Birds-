// FILE: src/utils/smoothing.js

import { lerp } from './math.js';

/**
 * LandmarkSmoother
 * Applies exponential moving average to a MediaPipe landmark array.
 * Each landmark is smoothed independently on x, y, z.
 */
export class LandmarkSmoother {
  /**
   * @param {number} alpha        Smoothing factor 0–1 (lower = smoother/laggier)
   * @param {number} numLandmarks Number of landmarks (21 for hands)
   */
  constructor(alpha = 0.2, numLandmarks = 21) {
    this.alpha = alpha;
    this.numLandmarks = numLandmarks;
    /** @type {Array<{x:number,y:number,z:number}>} */
    this.smoothed = Array.from({ length: numLandmarks }, () => ({ x: 0, y: 0, z: 0 }));
    this._initialised = false;
  }

  /**
   * Feed raw MediaPipe landmarks and get EMA-smoothed array back.
   * @param {Array<{x:number,y:number,z:number}>} rawLandmarks
   * @returns {Array<{x:number,y:number,z:number}>}
   */
  smooth(rawLandmarks) {
    if (!rawLandmarks || rawLandmarks.length === 0) return this.smoothed;

    if (!this._initialised) {
      // First frame: seed with raw values
      for (let i = 0; i < this.numLandmarks; i++) {
        const r = rawLandmarks[i] ?? { x: 0, y: 0, z: 0 };
        this.smoothed[i] = { x: r.x, y: r.y, z: r.z ?? 0 };
      }
      this._initialised = true;
      return this.smoothed;
    }

    for (let i = 0; i < this.numLandmarks; i++) {
      const r = rawLandmarks[i] ?? { x: 0, y: 0, z: 0 };
      const s = this.smoothed[i];
      s.x = lerp(s.x, r.x, this.alpha);
      s.y = lerp(s.y, r.y, this.alpha);
      s.z = lerp(s.z, r.z ?? 0, this.alpha);
    }
    return this.smoothed;
  }

  /** Reset to uninitialised state (call on hand loss). */
  reset() {
    this._initialised = false;
  }
}
