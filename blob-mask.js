// ══════════════════════════════════════════
// SECTION: MASK (blob-mask.js)
// AI Magic Mask v2 — Live tracking, smooth edges,
// multi-click refinement, auto-finalize
// ══════════════════════════════════════════

function _resetMaskState() {
    maskSelecting = false;
    maskReady = false;
    maskClickNorm = null;
    maskSegData = null;
    maskConfData = null;
    maskSegW = 0;
    maskSegH = 0;
    maskFrameCount = 0;
    maskPoints = [];
    maskPrevCentroid = null;
    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
}

function enterMaskSelecting() {
    if (!videoLoaded || !videoEl) return;
    _resetMaskState();
    maskSelecting = true;
    // No pause — video keeps playing for live selection
    document.getElementById('mask-controls-group').style.display = '';
    if (!window.mpSegmenterReady) {
        document.getElementById('mask-loading').style.display = '';
        document.getElementById('mask-hint').textContent = 'Loading AI model, please wait...';
    }
    updateButtonStates();
}

function exitMaskMode() {
    _resetMaskState();
    document.getElementById('mask-controls-group').style.display = 'none';
}

function runMaskSegmentation(clickX, clickY, modifierType) {
    // clickX, clickY in screen coords → normalized [0,1]
    if (!window.mpSegmenterReady || !window.mpSegmenter || !videoEl || !videoEl.elt) return;

    let normX = Math.max(0, Math.min(1, (clickX - videoX) / videoW));
    let normY = Math.max(0, Math.min(1, (clickY - videoY) / videoH));

    if (modifierType === 'add' && maskReady) {
        maskPoints.push({ x: normX, y: normY, type: 'add' });
    } else if (modifierType === 'subtract' && maskReady) {
        maskPoints.push({ x: normX, y: normY, type: 'subtract' });
    } else {
        // Fresh selection — replace everything
        maskPoints = [{ x: normX, y: normY, type: 'add' }];
        maskClickNorm = { x: normX, y: normY };
    }

    maskSegmentWithPoint(normX, normY, true, modifierType || 'replace');
}

function maskSegmentWithPoint(normX, normY, autoFinalize, compositeMode) {
    // Run MediaPipe segmentation at the given normalized point
    if (!window.mpSegmenter || !videoEl || !videoEl.elt) return;
    if (maskSegInFlight) return; // prevent overlapping async calls
    maskSegInFlight = true;

    const roi = { keypoint: { x: normX, y: normY } };

    try {
        window.mpSegmenter.segment(videoEl.elt, roi, (result) => {
          try {
            maskSegInFlight = false;
            // Discard result if user left MASK mode during segmentation
            if (currentMode !== 14) { if (result.close) result.close(); return; }

            let newSegData = null;
            let newConfData = null;

            // Prefer confidence masks (higher = more foreground)
            if (result.confidenceMasks && result.confidenceMasks.length > 0) {
                let fgMask = result.confidenceMasks.length > 1
                    ? result.confidenceMasks[1] : result.confidenceMasks[0];
                maskSegW = fgMask.width;
                maskSegH = fgMask.height;
                let floats = fgMask.getAsFloat32Array();

                // Store raw confidence for smooth edges
                newConfData = new Float32Array(floats.length);
                newConfData.set(floats);

                // Build binary mask with soft thresholding
                newSegData = new Uint8Array(floats.length);
                let lo = MASK_SOFT_THRESHOLD;
                let hi = lo + MASK_FEATHER;
                for (let i = 0; i < floats.length; i++) {
                    if (floats[i] >= hi) newSegData[i] = 255;
                    else if (floats[i] >= lo) newSegData[i] = Math.floor(255 * (floats[i] - lo) / (hi - lo));
                    else newSegData[i] = 0;
                }
            } else if (result.categoryMask) {
                const mask = result.categoryMask;
                maskSegW = mask.width;
                maskSegH = mask.height;
                let raw = mask.getAsUint8Array();
                newSegData = new Uint8Array(raw.length);
                let nonZero = 0;
                for (let i = 0; i < raw.length; i++) if (raw[i] > 0) nonZero++;
                let invert = nonZero > raw.length * 0.5;
                for (let i = 0; i < raw.length; i++) {
                    newSegData[i] = invert ? (raw[i] === 0 ? 255 : 0)
                                            : (raw[i] > 0 ? 255 : 0);
                }
                // No confidence data for category masks
                newConfData = null;
            }

            // Free GPU memory — close individual mask handles before result
            if (result.confidenceMasks) {
                for (let m of result.confidenceMasks) { if (m && m.close) m.close(); }
            }
            if (result.categoryMask && result.categoryMask.close) result.categoryMask.close();
            if (result.close) result.close();

            if (!newSegData) return;

            // Composite with existing mask based on mode
            if (compositeMode === 'add' && maskSegData && maskSegData.length === newSegData.length) {
                for (let i = 0; i < newSegData.length; i++) {
                    maskSegData[i] = Math.max(maskSegData[i], newSegData[i]);
                    if (maskConfData && newConfData) maskConfData[i] = Math.max(maskConfData[i], newConfData[i]);
                }
            } else if (compositeMode === 'subtract' && maskSegData && maskSegData.length === newSegData.length) {
                for (let i = 0; i < newSegData.length; i++) {
                    if (newSegData[i] > 128) {
                        maskSegData[i] = 0;
                        if (maskConfData) maskConfData[i] = 0;
                    }
                }
            } else {
                // Replace (fresh selection or re-segmentation during tracking)
                maskSegData = newSegData;
                maskConfData = newConfData;
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
                    let newCentroid = {
                        x: (cx / count) / maskSegW,
                        y: (cy / count) / maskSegH
                    };

                    // Adaptive re-segmentation: track centroid drift
                    if (maskPrevCentroid) {
                        let drift = Math.sqrt(
                            (newCentroid.x - maskPrevCentroid.x) ** 2 +
                            (newCentroid.y - maskPrevCentroid.y) ** 2
                        );
                        if (drift > 0.05) maskResegInterval = 2;
                        else if (drift < 0.01) maskResegInterval = 6;
                        else maskResegInterval = 3;
                    }
                    maskPrevCentroid = newCentroid;
                    maskClickNorm = newCentroid;
                }

                // Auto-finalize on user click if mask is valid
                if (autoFinalize && !maskReady && count > 50) {
                    maskSelecting = false;
                    maskReady = true;
                    maskFrameCount = 0;
                    maskIndicatorStart = 0;
                    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
                }
            }

            // Build overlay for brief visual feedback on selection
            if (maskSelecting || autoFinalize) buildMaskOverlay();
            updateButtonStates();
          } catch (cbErr) {
            maskSegInFlight = false;
            console.error('[Mask] Callback error:', cbErr);
          }
        });
    } catch (e) {
        maskSegInFlight = false;
        console.error('Segmentation failed:', e);
    }
}

function buildMaskOverlay() {
    if (!maskSegW || maskSegW === 0) return;
    // Reuse existing overlay if dimensions match, otherwise recreate
    if (maskOverlay && maskOverlay.width === maskSegW && maskOverlay.height === maskSegH) {
        // Reuse — just clear and redraw
    } else {
        if (maskOverlay) maskOverlay.remove();
        maskOverlay = createGraphics(maskSegW, maskSegH);
    }
    maskOverlay.pixelDensity(1);
    maskOverlay.loadPixels();
    for (let i = 0; i < (maskConfData || maskSegData).length; i++) {
        let alpha = 0;
        if (maskConfData) {
            // Smooth gradient overlay using confidence
            let conf = maskConfData[i];
            let lo = MASK_SOFT_THRESHOLD;
            let hi = lo + MASK_FEATHER;
            if (conf >= hi) alpha = 100;
            else if (conf >= lo) alpha = Math.floor(100 * (conf - lo) / (hi - lo));
        } else if (maskSegData && maskSegData[i] > 0) {
            alpha = Math.floor(maskSegData[i] * 100 / 255);
        }
        maskOverlay.pixels[i * 4 + 0] = 0;
        maskOverlay.pixels[i * 4 + 1] = 255;
        maskOverlay.pixels[i * 4 + 2] = 128;
        maskOverlay.pixels[i * 4 + 3] = alpha;
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
        maskConfData = null;
        if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
        updateButtonStates();
        return;
    }

    maskSelecting = false;
    maskReady = true;
    maskFrameCount = 0;
    maskIndicatorStart = 0;
    if (maskOverlay) { maskOverlay.remove(); maskOverlay = null; }
    updateButtonStates();
}

function clearMask() {
    _resetMaskState();
    maskSelecting = true; // Re-enter selecting mode after clear
    updateButtonStates();
}

// ── MASK UI LISTENERS ──────────────────────

function setupMaskUIListeners() {
    document.getElementById('mask-clear-btn').addEventListener('click', () => {
        if (currentMode === 14) clearMask();
    });
}
