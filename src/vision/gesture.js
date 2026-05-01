// FILE: src/vision/gesture.js

import { dist2D } from '../utils/math.js';

/**
 * GestureDetector — detects pinch gesture from MediaPipe hand landmarks.
 *
 * Spec §3.11:
 *  PINCH_THRESHOLD = 0.06 (normalised)
 *  pinchDistance(landmarks)
 *  isPinching(landmarks)
 *  getPinchMidpoint(landmarks)
 *  getWristPosition(landmarks)
 */
export class GestureDetector {
  constructor() {
    this.PINCH_THRESHOLD = 0.06;
  }

  /**
   * Euclidean distance between thumb tip (4) and index tip (8).
   * Landmarks are normalised 0→1.
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {number}
   */
  pinchDistance(landmarks) {
    if (!landmarks || landmarks.length < 9) return 1;
    return dist2D(landmarks[4], landmarks[8]);
  }

  /**
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {boolean}
   */
  isPinching(landmarks) {
    return this.pinchDistance(landmarks) < this.PINCH_THRESHOLD;
  }

  /**
   * Midpoint between thumb tip and index tip (normalised).
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {{ x: number, y: number }}
   */
  getPinchMidpoint(landmarks) {
    if (!landmarks || landmarks.length < 9) return { x: 0.5, y: 0.5 };
    const t = landmarks[4];
    const i = landmarks[8];
    return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
  }

  /**
   * Wrist position (landmark 0), normalised.
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @returns {{ x: number, y: number }}
   */
  getWristPosition(landmarks) {
    if (!landmarks || landmarks.length === 0) return { x: 0.5, y: 0.5 };
    return { x: landmarks[0].x, y: landmarks[0].y };
  }
}
