// FILE: src/vision/handTracking.js

/**
 * HandTracker — wraps MediaPipe Hands + Camera utils.
 *
 * MediaPipe is loaded globally via <script> tags in index.html,
 * so `Hands` and `Camera` are available on `window`.
 *
 * Spec §3.10:
 *  maxNumHands: 1, modelComplexity: 1
 *  minDetectionConfidence: 0.7, minTrackingConfidence: 0.7
 *  Draws landmarks on overlay canvas
 *  Exposes start(), stop()
 */
export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {HTMLCanvasElement} canvasElement  The landmark overlay canvas
   * @param {(landmarks: Array<{x,y,z}>) => void} onResultsCallback
   */
  constructor(videoElement, canvasElement, onResultsCallback) {
    this._video     = videoElement;
    this._canvas    = canvasElement;
    this._ctx       = canvasElement.getContext('2d');
    this._onResults = onResultsCallback;
    this._hands     = null;
    this._camera    = null;
    this._running   = false;

    // Resize canvas to match its CSS size
    this._canvas.width  = 240;
    this._canvas.height = 180;
  }

  /**
   * Initialise MediaPipe and start the camera loop.
   * @returns {Promise<void>}
   */
  async start() {
    // Verify MediaPipe globals are present
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands not loaded. Check CDN script tags in index.html.');
    }

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands:              1,
      modelComplexity:          1,
      minDetectionConfidence:   0.7,
      minTrackingConfidence:    0.7,
    });

    this._hands.onResults((results) => this._handleResults(results));

    // MediaPipe Camera utility drives the video loop
    this._camera = new Camera(this._video, {
      onFrame: async () => {
        if (this._hands && this._running) {
          await this._hands.send({ image: this._video });
        }
      },
      width: 640,
      height: 480,
    });

    await this._camera.start();
    this._running = true;
  }

  /** Stop webcam + MediaPipe loop. */
  stop() {
    this._running = false;
    this._camera?.stop();
  }

  // ── Internal ──────────────────────────────────────────────────────────
  _handleResults(results) {
    const ctx = this._ctx;
    const w   = this._canvas.width;
    const h   = this._canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw webcam frame
    if (results.image) {
      ctx.drawImage(results.image, 0, 0, w, h);
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];

      // Draw skeleton using MediaPipe drawing utilities (if available)
      if (typeof drawConnectors !== 'undefined' && typeof HAND_CONNECTIONS !== 'undefined') {
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: '#22ff88',
          lineWidth: 1.5,
        });
      }
      if (typeof drawLandmarks !== 'undefined') {
        drawLandmarks(ctx, landmarks, {
          color: '#ff4422',
          lineWidth: 1,
          radius: 3,
        });
      } else {
        // Fallback: draw dots manually
        landmarks.forEach(lm => {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ff4422';
          ctx.fill();
        });
      }

      // Highlight thumb tip (4) and index tip (8) for pinch visualisation
      [4, 8].forEach(idx => {
        const lm = landmarks[idx];
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Fire callback
      this._onResults(landmarks);
    } else {
      // No hand detected — show placeholder text
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#aaa';
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No hand detected', w / 2, h / 2);
      ctx.textAlign = 'start';
    }
  }
}
