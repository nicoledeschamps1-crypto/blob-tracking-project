// ══════════════════════════════════════════
// SECTION: MASK (blob-mask.js)
// AI Magic Mask — MediaPipe Interactive Segmenter
// ══════════════════════════════════════════

function enterMaskSelecting() {
    if (!videoLoaded || !videoEl) return;
    maskSelecting = true;
    maskReady = false;
    maskClickNorm = null;
    maskSegData = null;
    maskSegW = 0;
    maskSegH = 0;
    maskFrameCount = 0;
    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
    // Pause video for selection
    if (videoPlaying && videoEl) {
        videoEl.pause();
        videoPlaying = false;
        let playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        ui.btnPlay.innerHTML = playIcon;
        ui.tlBtnPlay.innerHTML = playIcon;
        if (audioElement && audioLoaded) { audioElement.pause(); audioPlaying = false; }
    }
    document.getElementById('mask-controls-group').style.display = '';
    if (!window.mpSegmenterReady) {
        document.getElementById('mask-loading').style.display = '';
        document.getElementById('mask-hint').textContent = 'Loading AI model, please wait...';
    }
    updateButtonStates();
}

function exitMaskMode() {
    let wasSelecting = maskSelecting;
    maskSelecting = false;
    maskReady = false;
    maskClickNorm = null;
    maskSegData = null;
    maskSegW = 0;
    maskSegH = 0;
    maskFrameCount = 0; // Fix: reset frame count to prevent stale re-segmentation on re-entry
    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
    document.getElementById('mask-controls-group').style.display = 'none';
    if (wasSelecting && !videoPlaying && videoEl && videoLoaded) {
        togglePlay();
    }
}

function runMaskSegmentation(clickX, clickY) {
    // clickX, clickY in screen coords → normalized [0,1]
    if (!window.mpSegmenterReady || !window.mpSegmenter || !videoEl || !videoEl.elt) return;

    let normX = Math.max(0, Math.min(1, (clickX - videoX) / videoW));
    let normY = Math.max(0, Math.min(1, (clickY - videoY) / videoH));
    maskClickNorm = { x: normX, y: normY };

    maskSegmentWithPoint(normX, normY);
}

function maskSegmentWithPoint(normX, normY) {
    // Run MediaPipe segmentation at the given normalized point
    if (!window.mpSegmenter || !videoEl || !videoEl.elt) return;
    if (maskSegInFlight) return; // prevent overlapping async calls
    maskSegInFlight = true;

    const roi = { keypoint: { x: normX, y: normY } };

    try {
        window.mpSegmenter.segment(videoEl.elt, roi, (result) => {
            maskSegInFlight = false;
            // Discard result if user left MASK mode during segmentation
            if (currentMode !== 14) return;
            // Prefer confidence masks (unambiguous: higher = more foreground)
            if (result.confidenceMasks && result.confidenceMasks.length > 0) {
                let fgMask = result.confidenceMasks.length > 1
                    ? result.confidenceMasks[1] : result.confidenceMasks[0];
                maskSegW = fgMask.width;
                maskSegH = fgMask.height;
                let floats = fgMask.getAsFloat32Array();
                maskSegData = new Uint8Array(floats.length);
                for (let i = 0; i < floats.length; i++) {
                    maskSegData[i] = floats[i] > 0.5 ? 255 : 0;
                }
            } else if (result.categoryMask) {
                const mask = result.categoryMask;
                maskSegW = mask.width;
                maskSegH = mask.height;
                let raw = mask.getAsUint8Array();
                maskSegData = new Uint8Array(raw.length);
                let nonZero = 0;
                for (let i = 0; i < raw.length; i++) if (raw[i] > 0) nonZero++;
                let invert = nonZero > raw.length * 0.5;
                for (let i = 0; i < raw.length; i++) {
                    maskSegData[i] = invert ? (raw[i] === 0 ? 255 : 0)
                                            : (raw[i] > 0 ? 255 : 0);
                }
            }

            // Update click point to centroid of mask (for next re-segmentation)
            if (maskSegData) {
                let cx = 0, cy = 0, count = 0;
                for (let y = 0; y < maskSegH; y++) {
                    for (let x = 0; x < maskSegW; x++) {
                        if (maskSegData[y * maskSegW + x] > 0) {
                            cx += x; cy += y; count++;
                        }
                    }
                }
                if (count > 0) {
                    maskClickNorm = {
                        x: (cx / count) / maskSegW,
                        y: (cy / count) / maskSegH
                    };
                }
            }

            // Build overlay for selection preview
            if (maskSelecting) buildMaskOverlay();
            updateButtonStates();
        });
    } catch (e) {
        maskSegInFlight = false;
        console.error('Segmentation failed:', e);
    }
}

function buildMaskOverlay() {
    if (!maskSegData || maskSegW === 0) return;
    if (maskOverlay) maskOverlay.remove();
    maskOverlay = createGraphics(maskSegW, maskSegH);
    maskOverlay.pixelDensity(1);
    maskOverlay.loadPixels();
    for (let i = 0; i < maskSegData.length; i++) {
        if (maskSegData[i] > 0) {
            maskOverlay.pixels[i * 4 + 0] = 0;
            maskOverlay.pixels[i * 4 + 1] = 255;
            maskOverlay.pixels[i * 4 + 2] = 128;
            maskOverlay.pixels[i * 4 + 3] = 100;
        } else {
            maskOverlay.pixels[i * 4 + 0] = 0;
            maskOverlay.pixels[i * 4 + 1] = 0;
            maskOverlay.pixels[i * 4 + 2] = 0;
            maskOverlay.pixels[i * 4 + 3] = 0;
        }
    }
    maskOverlay.updatePixels();
}

function finalizeMask() {
    if (!maskSegData || !videoEl) return;
    // Verify mask has content
    let fgCount = 0;
    for (let i = 0; i < maskSegData.length; i++) if (maskSegData[i] > 0) fgCount++;
    if (fgCount === 0) {
        maskSegData = null;
        if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
        updateButtonStates();
        return;
    }

    maskSelecting = false;
    maskReady = true;
    maskFrameCount = 0;
    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
    // Resume video
    if (!videoPlaying && videoEl && videoLoaded) {
        togglePlay();
    }
    updateButtonStates();
}

// ── MASK UI LISTENERS ──────────────────────

function setupMaskUIListeners() {
    document.getElementById('mask-done-btn').addEventListener('click', () => {
        if (currentMode === 14 && maskSelecting && maskSegData) finalizeMask();
    });
    document.getElementById('mask-repick-btn').addEventListener('click', () => {
        if (currentMode === 14) enterMaskSelecting();
    });
}
