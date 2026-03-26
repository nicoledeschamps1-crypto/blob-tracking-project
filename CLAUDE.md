# BlobFX — CLAUDE.md

## Project Identity
**BlobFX** ("Hues of Dispositions") is a browser-based real-time video effects app built with p5.js. It tracks colors/blobs in webcam or uploaded video and applies 63 stackable visual effects with audio reactivity, AI masking, face tracking, and a timeline editor. Created by Nicole Deschamps (HUESOFSATURN), based on @pbltrr's original blob tracking code. Goal: ship as a free public browser app in 2026.

**Use case**: Creative video effects for social media, garment/fabric display, artistic video processing. Inspired by Efecto.app and Grainrad.com.

## Architecture
- **Pure client-side JS** — no build step, no bundler, no framework
- **9 modular files** loaded via `<script>` tags in shared global scope:
  `blob-core.js` → `blob-fx.js` → `blob-shader-fx.js` → `blob-overlay.js` → `blob-audio.js` → `blob-timeline.js` → `blob-mask.js` → `blob-tracking.js` → `blob-tracking.html`
- **20,330 lines total** across all files
- **WebGL2 shader pipeline** (`ShaderFXPipeline` class) — 33 GPU effects with per-effect opacity + blend modes
- **p5.js 1.9.0** — call `pixelDensity(1)` after `createCanvas`, then `resizeCanvas()`
- **MediaPipe** — FaceLandmarker + InteractiveSegmenter, lazy-loaded on first use, GPU with CPU fallback
- **400+ implicit globals** — no namespace yet (known tech debt)

## Key Patterns
- `FX_UI_CONFIG` in blob-core.js = single source of truth for all 63 effects
- `activeEffects` (Set) and `hiddenEffects` (Set) manage effect state
- `paramValues` priority: USER > TIMELINE > AUDIO (via `paramBaseline` + `paramOwner`)
- Scratch buffer system: `getScratchBuffer()`/`getScratchFloat()` — reused across pixel effects
- Webcam mirror: push/translate/scale/pop on video image only, never coords
- `mousePressed()` must `return false;` to suppress p5.js native event propagation
- File inputs use `<label for>` pattern (not `.click()`) for iOS Safari compatibility
- Cache busting: use `?v=YYYYMMDD` on script tags in HTML

## Current State (2026-03-26)
**Last committed**: `24021cd` (2026-03-24) — Full UI/UX audit
**Uncommitted changes** in 4 files (blob-core.js, blob-overlay.js, blob-shader-fx.js, blob-tracking.html):
- Fixed `mousePressed()` file chooser cascade (return false)
- iOS Safari file input fixes (label pattern, extension fallback)
- Mobile responsive improvements (drawer toggles, timeline compact)
- `window.shaderFX` exposed for DevTools/Playwright

**What's built**: 63 effects (14 Color, 20 Distortion, 11 Pattern, 18 Overlay), 40 presets, 18 tracking modes, 9 blob styles, 3 connection modes, AI Magic Mask v2, face tracking (eyes/lips/face), audio sync v2 with beat detection, timeline editor with segments/undo/zoom, video overlay with blend modes, datamosh (melt/shatter), layer system (Model C), responsive UI with purple design system.

**What's in progress**: Mobile UI (iOS upload still broken), QA audit fixes (26 bugs found, not yet addressed).

## Active Work Threads

### 1. QA Bug Fixes (26 items from 2026-03-26 audit)
12 critical bugs identified by 4-agent code review. Top priority:
- `maskSegInFlight` never reset on mode exit (blob-mask.js)
- InteractiveSegmenter no GPU→CPU fallback on Safari
- `audioContext.resume()` not awaited (Chrome autoplay)
- Blob URL memory leak on failed video load
- `activeEffects` set mutation mid-iteration (blob-fx.js)
- Split view 'both' mode never handled
See: `~/.claude/projects/-Users-nicoledeschamps/memory/blobfx-session-2026-03-26.md` for full list

### 2. Uncommitted Changes Need Committing
4 files modified with iOS fixes, mousePressed fix, mobile CSS, window.shaderFX. All tested via Playwright. Ready to commit.

### 3. Mobile UI Polish
iOS file upload still broken despite label+extension fix. Drawer toggles and timeline compact done. Remaining: touch-friendly FX cards, portrait canvas sizing, touch timeline scrub, full <500px audit. See: `project-blobfx-mobile.md` in memory.

### 4. Public Launch Prep
Targeting 2026. Needs: .gitignore (cert.pem/key.pem in repo!), favicon, hosting setup (GitHub Pages/Vercel), onboarding UX, performance budget on mid-tier hardware, browser compat testing, license choice.

### 5. Architecture Cleanup
400+ implicit globals need namespacing before adding more features. Dead `paramOwner` priority system (declared but never written by audio/timeline). Debug console.log always on. innerHTML XSS-fragile patterns.

## Key Decisions Made
| Decision | Why |
|----------|-----|
| Pure client-side, no bundler | Simplicity — it's a creative tool, not a SaaS. Deploy anywhere static files are served. |
| Global scope via script tags | Started from @pbltrr's single-file original. Modularized into 9 files but kept shared globals for minimal refactor risk. |
| WebGL2 shader pipeline | CPU pixel effects too slow for real-time at high resolution. GPU path gives 60fps. |
| Layer system Model C (fixed stack, not Photoshop-style) | Avoids complexity of reorderable layers. Users toggle visibility + blend per fixed layer. |
| `<label for>` file inputs (not .click()) | iOS Safari blocks programmatic `.click()` on file inputs. Label pattern is the only reliable cross-platform approach. |
| `return false` in mousePressed | p5.js only suppresses browser default behavior when handler returns false. `return;` caused file dialogs to cascade. |
| paramValues priority (USER > TIMELINE > AUDIO) | Audio and timeline both want to drive params — priority system prevents fighting. User always wins. |
| Lazy MediaPipe loading | Models are 5-10MB. Loading on page init adds seconds to startup. Load on first mode activation instead. |
| FACE_DETECT_INTERVAL = 3 | Face detection is expensive. Run every 3rd frame, EMA smooth between. |
| Purple-tinted design system (hsl 278°) | Brand identity for HUESOFSATURN. All grays carry purple hue. OKLCH gradient top bar. |

## Constraints & Preferences
- **Stack**: p5.js 1.9.0, vanilla JS, MediaPipe, WebGL2 GLSL, CSS custom properties
- **Font**: Commit Mono (Google Fonts)
- **Testing**: Playwright MCP for browser automation; local server via `./serve.sh`
- **Deploy target**: Static file hosting (no server required)
- **Sync rule**: After ANY file change, sync all 9 files to `~/Downloads/` — user opens standalone copy
- **No flash/strobe** effects without toggle + epilepsy warning
- **Click-to-apply UX**: select=activate, eye=toggle visibility, trash=remove
- **FX browsing decoupled**: selecting/cycling effects does NOT auto-enable them
- **Multi-agent harness**: `/harness` slash command runs plan→build→evaluate pipeline with Playwright QA
- **Cache busting**: Always update `?v=` query strings when changing JS files
- **Git**: Single `main` branch, `gh` CLI at `~/bin/gh`, auth as nicoledeschamps1-crypto

## People & Connections
- **Nicole Deschamps** (HUESOFSATURN) — creator, sole developer
- **@pbltrr** — original "Browser Blob Tracking" source code (Patreon: patreon.com/pbltrr)
- **GitHub**: nicoledeschamps1-crypto/blob-tracking-project

## What to Notice (Proactive Surfacing)
- **Uncommitted work**: 4 files modified since last commit (2026-03-24). Multiple sessions of work not yet committed.
- **cert.pem + key.pem in repo**: Security issue — these should be in .gitignore immediately.
- **No .gitignore at all**: screen-recording.mov (924KB), certs, and harness artifacts all tracked.
- **26 QA bugs unfixed**: 12 critical items from the 2026-03-26 audit sitting unaddressed.
- **iOS upload still broken**: Despite two rounds of fixes, real iOS Safari file upload fails.
- **400+ globals**: Technical debt growing — each new feature adds more global state.
- **Debug logging always on**: `console.log` every 60 frames in blob-tracking.js.
- **innerHTML XSS patterns**: FX_UI_CONFIG labels interpolated unsanitized in blob-fx.js.
- **Memory leaks**: Blob URLs not revoked on failed loads, sublane event listeners never cleaned up, MediaPipe instances never `.close()`-d.
