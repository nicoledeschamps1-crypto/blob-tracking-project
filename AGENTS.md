# Hues of Dispositions (H.O.D.) — AGENTS.md

## Project Identity
**Hues of Dispositions** is a browser-based real-time video effects app built with p5.js. It tracks colors/blobs in webcam or uploaded video and applies 68 stackable visual effects with audio reactivity, AI masking, face tracking, and a timeline editor. Created by Nicole Deschamps (HUESOFSATURN). Goal: ship as a free public browser app in 2026.

**Use case**: Creative video effects for social media, garment/fabric display, artistic video processing. Comparable tools: effect.app, Grainrad.com, CapCut, VSCO.

**GitHub**: nicoledeschamps1-crypto/blob-tracking-project
**Live**: nicoledeschamps1-crypto.github.io/blob-tracking-project/blob-tracking.html

## Architecture
- **Pure client-side JS** — no build step, no bundler, no framework
- **9 modular files** loaded via `<script>` tags in shared global scope
- **~23,000 lines total** across all files
- **Entry point**: `blob-tracking.html` (contains all HTML + CSS + inline p5 sketch init)

### File Load Order
```
1. blob-core.js      — globals, p5 lifecycle, UI state, playback, recording, FX_UI_CONFIG
2. blob-fx.js        — 30+ pixel effects, FX pipeline, scratch buffer system, UI wiring
3. blob-shader-fx.js — WebGL2 GPU shader pipeline, 33 GPU effects, GLSL shaders, blend modes
4. blob-overlay.js   — video/image overlay, drag-drop, 12 blend modes, opacity, fit modes
5. blob-audio.js     — WebAudio, beat detection, energy analysis, 7 sync targets, BPM
6. blob-timeline.js  — timeline segments, waveform, playhead, zoom/pan, keyboard shortcuts
7. blob-mask.js      — AI Magic Mask v2 (MediaPipe InteractiveSegmenter), multi-click
8. blob-tracking.js  — blob persistence, DBSCAN clustering, heatmap, ROI, spatial hash
```

### Tech Stack
- **p5.js 1.9.0** — canvas rendering, pixel manipulation
- **WebGL2** — separate hidden canvas for GPU shader effects (33 effects)
- **MediaPipe** — FaceLandmarker + InteractiveSegmenter (lazy-loaded, GPU with CPU fallback)
- **WebAudio API** — AnalyserNode, beat detection, spectrum analysis
- **GSAP** — not used here (that's the portfolio site)
- **CSS** — 3-layer design token system (primitives -> semantic -> component), hsl(278) purple tint

## Code Conventions
- **Indentation**: 4 spaces
- **Variables**: camelCase, underscore prefix for internal state (`_persistentBlobs`)
- **Constants**: SCREAMING_SNAKE_CASE (`FX_UI_CONFIG`, `PARAM_SRC_USER`)
- **Semicolons**: always
- **Comments**: section headers with `// ══════════════` dividers
- **Error handling**: try/catch in draw loop so one broken effect doesn't kill the app
- **No modules/imports**: everything lives in global scope (400+ implicit globals — known tech debt)

## Key Patterns to Understand Before Reviewing
- `FX_UI_CONFIG` in blob-core.js = single source of truth for all 68 effects
- `activeEffects` (Set) and `hiddenEffects` (Set) manage effect state
- `paramValues` priority: USER > TIMELINE > AUDIO (via `paramBaseline` + `paramOwner`)
- Scratch buffer system: `getScratchBuffer()`/`getScratchFloat()` — reused typed arrays to avoid GC
- Webcam mirror: push/translate/scale/pop on video image only, never coords/effects
- `mousePressed()` must `return false;` to suppress p5.js native event propagation
- File inputs use `<label for>` pattern (not `.click()`) for iOS Safari compatibility
- `pixelDensity(1)` must be called after `createCanvas`, then `resizeCanvas()` (p5.js 1.9.0 quirk)
- `captureStream(0)` + `requestFrame()` for 1:1 draw-to-recorded frame recording
- Separate hidden WebGL2 canvas for shader pipeline (not p5's canvas)

## Known Issues — Priority Review Areas

### Critical
1. **400+ implicit globals** — no namespace; all files share global scope. Audit for name collisions and unintended mutations.
2. **innerHTML XSS patterns** — FX_UI_CONFIG labels interpolated unsanitized in blob-fx.js
3. **iOS Safari file upload broken** — despite `<label for>` pattern and extension fallback
4. **cert.pem + key.pem tracked in git** — security risk

### Memory & Resource Leaks
5. **Blob URLs not revoked** on failed video load
6. **MediaPipe instances never `.close()`-d** — FaceLandmarker and InteractiveSegmenter
7. **Timeline sublane event listeners** never cleaned up
8. **Debug console.log every 60 frames** in blob-tracking.js (always on)

### Architecture Concerns
9. **Dead code**: `paramOwner` priority system declared but never written by audio/timeline
10. **Split view 'both' mode** referenced but never implemented
11. **Global state coupling**: changes in one file can silently break another
12. **No test suite** — relies on manual Playwright browser testing

### Performance
13. **FACE_DETECT_INTERVAL = 3** — face detection every 3rd frame with EMA smoothing
14. **Scratch buffers** — verify no leaked allocations in hot path
15. **WebGL context loss** — handlers exist but recovery path needs verification

## What a Good Review Covers
When reviewing this project, focus on:
1. **Bugs**: race conditions, null derefs, off-by-one, state desync between UI and engine
2. **Security**: innerHTML injection, eval-like patterns, data URL handling
3. **Memory leaks**: unreleased resources, growing arrays, unclosed media streams
4. **Performance**: hot-path allocations, unnecessary DOM queries in draw loop, shader compilation
5. **Architecture**: global coupling, circular dependencies between files, dead code
6. **Browser compat**: Safari/iOS quirks, WebGL2 availability, MediaPipe GPU fallback

## Do NOT
- Suggest switching to React/Vue/TypeScript — this is intentionally vanilla JS
- Suggest adding a bundler — static file simplicity is a deliberate choice
- Rewrite the global scope pattern — it's known tech debt, needs careful migration plan
- Add flash/strobe effects without on/off toggle + epilepsy warning
