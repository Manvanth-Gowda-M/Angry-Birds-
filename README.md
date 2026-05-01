# 🐦 Angry Birds 3D — Hand Gesture Edition

A fully-featured 3D browser-based physics game inspired by Angry Birds, controlled by **real-time hand gestures** via your webcam.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎮 3D Rendering | Three.js r160 with shadow maps, sky shader, environment |
| ⚙️ Physics | cannon-es with gravity, friction, bounce, sleep |
| 🤏 Hand Gestures | MediaPipe Hands — pinch to grab, open to launch |
| 🐷 Destructible Pigs | Collision-based death with score rewards |
| 📦 Wooden Structures | Physics-driven stacked box towers |
| 🎯 Trajectory Preview | Kinematic parabola preview while aiming |
| 🖱️ Mouse Fallback | Press Space for drag-to-aim mouse mode |
| 🎵 3 Levels | Progressive difficulty with rebuild on win |
| 📊 HUD | Score, bird queue, level counter |

## 🚀 How to Play

### Prerequisites
- Modern browser (Chrome/Firefox/Edge)
- Webcam

### Run Locally

```bash
# Option 1: npx serve (no install)
npx serve .

# Option 2: Python
python -m http.server 5500
```

Then open `http://localhost:5500`

### Controls

| Gesture / Key | Action |
|--------------|--------|
| 🤏 Pinch (thumb + index close) | Grab bird |
| 👐 Open hand / release pinch | Launch bird |
| `Space` | Toggle mouse drag mode |
| `R` | Reset current level |

## 🗂️ Project Structure

```
/
├── index.html          # Entry point, HUD, overlays
├── style.css           # Dark glassmorphism UI
└── src/
    ├── main.js         # Game loop, state machine, wiring
    ├── core/
    │   ├── scene.js    # Three.js scene, sky shader, lighting, trees
    │   ├── renderer.js # WebGLRenderer with shadows & tone mapping
    │   └── camera.js   # Camera + smooth bird-follow
    ├── physics/
    │   ├── world.js    # cannon-es world, gravity, ground
    │   └── physicsUtils.js # Sync mesh↔body, createBox/Sphere
    ├── game/
    │   ├── bird.js     # Bird queue, impulse launch, eye decorations
    │   ├── slingshot.js# Fork mesh, elastic bands, pull clamping
    │   ├── level.js    # 3 level layouts, pig/box spawning, scoring
    │   └── trajectory.js # Parabola preview dots
    └── vision/
        ├── handTracking.js    # MediaPipe + webcam init
        ├── gesture.js         # Pinch state machine with EMA smoothing
        └── coordinateMapper.js# 2D landmark → 3D world raycasting
```

## ⚙️ Tech Stack

- **Three.js r160** — WebGL 3D rendering
- **cannon-es 0.20** — Rigid body physics
- **MediaPipe Hands 0.4** — Hand landmark detection
- **Vanilla ES Modules** — No build step required

## 🧠 Gesture Architecture

```
Webcam Frame
    ↓
MediaPipe Hands → 21 landmarks (normalised 0-1)
    ↓
gesture.js → Pinch state machine (IDLE → GRABBING → RELEASED)
    ↓
coordinateMapper.js → Raycasting → 3D world position
    ↓
slingshot.js → Clamp to MAX_PULL=2.8 → Compute impulse
    ↓
bird.js → body.applyImpulse() → Physics takes over
```

## 🎨 Smoothing

Hand positions are EMA-smoothed with `α=0.22`:
```
smoothed(t) = 0.22 * raw(t) + 0.78 * smoothed(t-1)
```
