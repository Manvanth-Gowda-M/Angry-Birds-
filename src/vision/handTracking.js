// FILE: src/vision/handTracking.js

/**
 * HandTracker — wraps MediaPipe Hands + Camera utils.
 */
export class HandTracker {
  /**
   * @param {HTMLVideoElement} videoElement
   * @param {HTMLCanvasElement} canvasElement
   * @param {(landmarks: Array<{x,y,z}>) => void} onResultsCallback
   * @param {(detected: boolean) => void} [onDetectionChange]
   */
  constructor(videoElement, canvasElement, onResultsCallback, onDetectionChange) {
    this._video           = videoElement;
    this._canvas          = canvasElement;
    this._ctx             = canvasElement.getContext('2d');
    this._onResults       = onResultsCallback;
    this._onDetection     = onDetectionChange ?? null;
    this._hands           = null;
    this._camera          = null;
    this._running         = false;
    this._lastDetected    = false;

    this._canvas.width  = 240;
    this._canvas.height = 180;
  }

  async start() {
    if (typeof Hands === 'undefined') {
      throw new Error('MediaPipe Hands not loaded. Check CDN script tags in index.html.');
    }

    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands:            1,
      modelComplexity:        1,
      minDetectionConfidence: 0.72,
      minTrackingConfidence:  0.72,
    });

    this._hands.onResults((results) => this._handleResults(results));

    this._camera = new Camera(this._video, {
      onFrame: async () => {
        if (this._hands && this._running) {
          await this._hands.send({ image: this._video });
        }
      },
      width: 640, height: 480,
    });

    await this._camera.start();
    this._running = true;
  }

  stop() {
    this._running = false;
    this._camera?.stop();
  }

  _handleResults(results) {
    const ctx = this._ctx;
    const w   = this._canvas.width;
    const h   = this._canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (results.image) {
      ctx.drawImage(results.image, 0, 0, w, h);
    }

    const hasHand = results.multiHandLandmarks?.length > 0;

    if (hasHand !== this._lastDetected) {
      this._lastDetected = hasHand;
      this._onDetection?.(hasHand);
    }

    if (hasHand) {
      const landmarks = results.multiHandLandmarks[0];

      // Draw skeleton
      if (typeof drawConnectors !== 'undefined' && typeof HAND_CONNECTIONS !== 'undefined') {
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: 'rgba(40,220,120,0.85)',
          lineWidth: 1.5,
        });
      }
      if (typeof drawLandmarks !== 'undefined') {
        drawLandmarks(ctx, landmarks, {
          color: 'rgba(255,80,40,0.9)',
          lineWidth: 1,
          radius: 2.5,
        });
      } else {
        landmarks.forEach(lm => {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#ff4422';
          ctx.fill();
        });
      }

      // Highlight pinch fingers
      [4, 8].forEach(idx => {
        const lm = landmarks[idx];
        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      });

      // Pinch line
      const t4 = landmarks[4], t8 = landmarks[8];
      ctx.beginPath();
      ctx.moveTo(t4.x * w, t4.y * h);
      ctx.lineTo(t8.x * w, t8.y * h);
      ctx.strokeStyle = 'rgba(255,220,0,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      this._onResults(landmarks);
    } else {
      // Overlay when no hand
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#999';
      ctx.font      = '11px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Show your hand', w / 2, h / 2 - 6);
      ctx.fillStyle = '#666';
      ctx.font      = '9px Outfit, sans-serif';
      ctx.fillText('to start playing', w / 2, h / 2 + 8);
      ctx.textAlign = 'start';
    }
  }
}
