// ══════════════════════════════════════════
// SECTION: TRACKING (blob-tracking.js)
// Point tracking, line drawing, point info display
// ══════════════════════════════════════════

function trackPoints() {
    trackedPoints = [];
    if (currentMode === 0 || !videoLoaded || !videoPlaying) return;
    videoEl.loadPixels();
    if (videoEl.pixels.length === 0) return;

    // FACE LANDMARK modes (EYES=15, LIPS=16, FACE=17)
    if (currentMode >= 15 && currentMode <= 17) {
        if (!window.mpFaceLandmarkerReady || !window.mpFaceLandmarker) {
            if (!window._faceWarnThrottle || Date.now() - window._faceWarnThrottle > 3000) {
                window._faceWarnThrottle = Date.now();
                console.warn('[FaceTrack] Not ready:', {
                    ready: window.mpFaceLandmarkerReady,
                    instance: !!window.mpFaceLandmarker,
                    initError: window.mpFaceInitError || 'none'
                });
            }
            return;
        }

        const w = videoEl.width, h = videoEl.height;

        // Detect every frame for smooth tracking
        faceDetectFrame++;
        if (faceDetectFrame >= FACE_DETECT_INTERVAL || !faceLandmarkCache) {
            faceDetectFrame = 0;
            try {
                // Use offscreen canvas — more reliable than raw video element with MediaPipe + p5.js
                const vid = videoEl.elt;
                if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;
                if (!window._mpFaceCanvas) {
                    window._mpFaceCanvas = document.createElement('canvas');
                }
                const fc = window._mpFaceCanvas;
                if (fc.width !== vid.videoWidth || fc.height !== vid.videoHeight) {
                    fc.width = vid.videoWidth;
                    fc.height = vid.videoHeight;
                }
                if (!window._mpFaceCtx) window._mpFaceCtx = fc.getContext('2d');
                window._mpFaceCtx.drawImage(vid, 0, 0);
                const ts = performance.now();
                const result = window.mpFaceLandmarker.detectForVideo(fc, ts);
                // Log first few detection results for debugging
                if (!window._faceDetectCount) window._faceDetectCount = 0;
                window._faceDetectCount++;
                if (window._faceDetectCount <= 5 || window._faceDetectCount % 60 === 0) {
                    const faces = result?.faceLandmarks?.length || 0;
                    console.log('[FaceTrack] Frame ' + window._faceDetectCount +
                        ': ' + faces + ' face(s), canvas=' + fc.width + 'x' + fc.height);
                }
                if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
                    window._faceDetectErrors = 0; // Reset error counter on success
                    if (window.mpFaceInitError && window.mpFaceInitError.startsWith('Detection failing')) {
                        window.mpFaceInitError = null; // Clear transient error
                    }
                    let rawLandmarks = result.faceLandmarks;

                    // EMA smoothing: blend new detections with previous positions
                    if (smoothedLandmarks && smoothedLandmarks.length === rawLandmarks.length) {
                        for (let fi = 0; fi < rawLandmarks.length; fi++) {
                            let raw = rawLandmarks[fi];
                            let sm = smoothedLandmarks[fi];
                            if (sm.length === raw.length) {
                                for (let li = 0; li < raw.length; li++) {
                                    sm[li] = {
                                        x: sm[li].x * LANDMARK_SMOOTH + raw[li].x * (1 - LANDMARK_SMOOTH),
                                        y: sm[li].y * LANDMARK_SMOOTH + raw[li].y * (1 - LANDMARK_SMOOTH),
                                        z: sm[li].z * LANDMARK_SMOOTH + raw[li].z * (1 - LANDMARK_SMOOTH)
                                    };
                                }
                            } else {
                                smoothedLandmarks[fi] = raw.map(l => ({x: l.x, y: l.y, z: l.z}));
                            }
                        }
                    } else {
                        // First detection or face count changed — initialize smoothed
                        smoothedLandmarks = rawLandmarks.map(face =>
                            face.map(l => ({x: l.x, y: l.y, z: l.z}))
                        );
                    }
                    faceLandmarkCache = smoothedLandmarks;
                }
            } catch (e) {
                if (!window._faceDetectErrors) window._faceDetectErrors = 0;
                window._faceDetectErrors++;
                if (window._faceDetectErrors <= 5 || window._faceDetectErrors % 30 === 0) {
                    console.warn('[FaceTrack] Detection error #' + window._faceDetectErrors + ':', e.message || e);
                }
                // After 10 consecutive errors, clear stale cache and signal error
                if (window._faceDetectErrors >= 10) {
                    faceLandmarkCache = null;
                    smoothedLandmarks = null;
                    window.mpFaceInitError = 'Detection failing: ' + (e.message || 'unknown error');
                }
            }
        }

        if (!faceLandmarkCache || faceLandmarkCache.length === 0) return;

        // Select landmark indices based on mode
        let indices = null;
        if (currentMode === 15) indices = FACE_EYES_INDICES;
        else if (currentMode === 16) indices = FACE_LIPS_INDICES;
        // mode 17 (FACE) uses all landmarks — indices stays null

        let candidates = [];
        for (let faceIdx = 0; faceIdx < faceLandmarkCache.length; faceIdx++) {
            const landmarks = faceLandmarkCache[faceIdx];
            const landmarkList = indices
                ? indices.filter(i => i < landmarks.length).map(i => landmarks[i])
                : landmarks;

            for (const lm of landmarkList) {
                // MediaPipe landmarks are normalized [0,1]
                let vx = Math.floor(lm.x * w);
                let vy = Math.floor(lm.y * h);
                vx = Math.max(0, Math.min(w - 1, vx));
                vy = Math.max(0, Math.min(h - 1, vy));

                // Sample video pixel color at landmark position
                let idx = (vx + vy * w) * 4;
                let r = videoEl.pixels[idx], g = videoEl.pixels[idx + 1], b = videoEl.pixels[idx + 2];
                candidates.push(new CandidatePoint(vx, vy, color(r, g, b)));
            }
        }

        // Spectrum param: add interpolated points between landmarks for density
        let spectrum = map(paramValues[1], 0, 100, 0, 70);
        if (spectrum > 20 && candidates.length > 1) {
            let extras = [];
            let numExtras = Math.floor(map(spectrum, 20, 70, 0, candidates.length * 2));
            for (let i = 0; i < numExtras; i++) {
                let a = candidates[Math.floor(Math.random() * candidates.length)];
                let b_pt = candidates[Math.floor(Math.random() * candidates.length)];
                let t = Math.random();
                let mx = Math.floor(a.x + (b_pt.x - a.x) * t);
                let my = Math.floor(a.y + (b_pt.y - a.y) * t);
                mx = Math.max(0, Math.min(w - 1, mx));
                my = Math.max(0, Math.min(h - 1, my));
                let idx = (mx + my * w) * 4;
                let r = videoEl.pixels[idx], g = videoEl.pixels[idx + 1], b_v = videoEl.pixels[idx + 2];
                extras.push(new CandidatePoint(mx, my, color(r, g, b_v)));
            }
            candidates.push(...extras);
        }

        candidates.sort(() => Math.random() - 0.5);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];

        for (let i = 0; i < numPoints; i++) {
            let c = candidates[i];
            let sc = videoToScreenCoords(c.x, c.y);
            trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
        }
        return;
    }

    // MASK mode: AI re-segmentation — use mask directly for blob placement
    if (currentMode === 14 && maskReady && maskSegData && maskClickNorm) {
        const w = videoEl.width, h = videoEl.height;

        // Adaptive re-segmentation: interval adjusts based on centroid drift
        maskFrameCount++;
        if (maskFrameCount >= maskResegInterval && window.mpSegmenterReady) {
            maskFrameCount = 0;
            maskSegmentWithPoint(maskClickNorm.x, maskClickNorm.y, false, 'replace');
        }

        // Use current mask to generate blob candidates
        let gridSize = 15;
        if (w > 1280) gridSize = 30;
        let candidates = [];
        const scaleX = maskSegW / w;
        const scaleY = maskSegH / h;

        for (let y = 0; y < h; y += gridSize) {
            for (let x = 0; x < w; x += gridSize) {
                let mx = Math.min(Math.floor(x * scaleX), maskSegW - 1);
                let my = Math.min(Math.floor(y * scaleY), maskSegH - 1);
                let maskVal = maskSegData[my * maskSegW + mx];
                if (maskVal > 0) {
                    // Soft density: probabilistically thin blobs at feathered edges
                    if (maskConfData) {
                        let conf = maskConfData[my * maskSegW + mx];
                        if (conf < 0.8 && Math.random() > conf) continue;
                    }
                    let idx = (x + y * w) * 4;
                    let r = videoEl.pixels[idx], g = videoEl.pixels[idx+1], b = videoEl.pixels[idx+2];
                    candidates.push(new CandidatePoint(x, y, color(r, g, b)));
                }
            }
        }

        candidates.sort(() => Math.random() - 0.5);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];
        for (let i = 0; i < numPoints; i++) {
            let c = candidates[i];
            let sc = videoToScreenCoords(c.x, c.y);
            trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
        }
        return;
    }

    let candidates = [];
    let spectrum = map(paramValues[1], 0, 100, 0, 70);
    let gridSize = 15;
    const w = videoEl.width; const h = videoEl.height;
    if (w > 1280) gridSize = 30;

    let newGridPixels = {};

    for (let y = 0; y < h; y += gridSize) {
        for (let x = 0; x < w; x += gridSize) {
            let index = (x + y * w) * 4;
            let r = videoEl.pixels[index], g = videoEl.pixels[index+1], b = videoEl.pixels[index+2];
            let c = color(r, g, b);
            let hVal = hue(c), sVal = saturation(c), bVal = brightness(c);
            let validColor = false;

            if (currentMode === 1 && hVal > 100 && hVal < 260 && sVal > 20 && bVal > 20 && abs(hVal - 210) <= spectrum) validColor = true;
            else if (currentMode === 2 && sVal > 20 && bVal > 20) {
                let redDist = hVal > 180 ? 360 - hVal : hVal;
                if (redDist <= max(spectrum, 15)) validColor = true;
            }

            // MOTION: compare to previous frame — RGB distance exceeds threshold
            else if (currentMode === 3) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
                let prev = prevGridPixels[key];
                if (prev) {
                    let dist = Math.sqrt((r - prev.r) ** 2 + (g - prev.g) ** 2 + (b - prev.b) ** 2);
                    let motionThresh = map(spectrum, 0, 70, 10, 180);
                    if (dist > motionThresh) validColor = true;
                }
            }

            // SKIN: detect skin tones
            else if (currentMode === 4) {
                let hueTol = map(spectrum, 0, 70, 0, 25);
                let skinLow = -hueTol;
                let skinHigh = 50 + hueTol;
                let inHue = (hVal >= 0 && hVal <= skinHigh) || (skinLow < 0 && hVal >= (360 + skinLow));
                if (inHue && sVal >= 15 && sVal <= 75 && bVal >= 30 && bVal <= 90) {
                    validColor = true;
                }
            }

            // CUSTOM: track user-selected hue within spectrum tolerance
            else if (currentMode === 5) {
                let hueDist = abs(hVal - customHue);
                if (hueDist > 180) hueDist = 360 - hueDist;
                if (hueDist <= spectrum && sVal > 15 && bVal > 15) validColor = true;
            }

            // BRIGHT: track brightest pixels
            else if (currentMode === 6) {
                let briThresh = map(spectrum, 0, 70, 95, 40);
                if (bVal > briThresh) validColor = true;
            }

            // DARK: track darkest pixels
            else if (currentMode === 7) {
                let darkThresh = map(spectrum, 0, 70, 5, 50);
                if (bVal < darkThresh && bVal > 0) validColor = true;
            }

            // EDGE: gradient magnitude between neighboring pixels
            else if (currentMode === 8) {
                if (x + 1 < w && y + 1 < h) {
                    let idxR = ((x + 1) + y * w) * 4;
                    let idxB = (x + (y + 1) * w) * 4;
                    let gx = Math.abs(r - videoEl.pixels[idxR]) + Math.abs(g - videoEl.pixels[idxR+1]) + Math.abs(b - videoEl.pixels[idxR+2]);
                    let gy = Math.abs(r - videoEl.pixels[idxB]) + Math.abs(g - videoEl.pixels[idxB+1]) + Math.abs(b - videoEl.pixels[idxB+2]);
                    let gradient = (gx + gy) / 6;
                    let edgeThresh = map(spectrum, 0, 70, 80, 10);
                    if (gradient > edgeThresh) validColor = true;
                }
            }

            // CHROMA: track most saturated pixels
            else if (currentMode === 9) {
                let satThresh = map(spectrum, 0, 70, 80, 20);
                if (sVal > satThresh && bVal > 15) validColor = true;
            }

            // WARM: reds, oranges, yellows (hue 0-60° + 300-360°)
            else if (currentMode === 10) {
                let warmTol = map(spectrum, 0, 70, 0, 30);
                if ((hVal <= 60 + warmTol || hVal >= 300 - warmTol) && sVal > 15 && bVal > 15) validColor = true;
            }

            // COOL: blues, greens, purples (hue 150-270°)
            else if (currentMode === 11) {
                let coolTol = map(spectrum, 0, 70, 0, 40);
                if (hVal >= 150 - coolTol && hVal <= 270 + coolTol && sVal > 15 && bVal > 15) validColor = true;
            }

            // FLICKER: pixels that change rapidly over multiple frames
            else if (currentMode === 12) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
                let prev = prevGridPixels[key];
                if (prev) {
                    let dist = Math.sqrt((r - prev.r) ** 2 + (g - prev.g) ** 2 + (b - prev.b) ** 2);
                    if (dist > 25) {
                        flickerScores[key] = Math.min((flickerScores[key] || 0) + 0.35, 1.0);
                    } else {
                        flickerScores[key] = (flickerScores[key] || 0) * 0.7;
                    }
                }
                let flickThresh = map(spectrum, 0, 70, 0.3, 0.8);
                if ((flickerScores[key] || 0) > flickThresh) validColor = true;
            }

            // INVERT: complement of custom hue
            else if (currentMode === 13) {
                let invertHue = (customHue + 180) % 360;
                let hueDist = abs(hVal - invertHue);
                if (hueDist > 180) hueDist = 360 - hueDist;
                if (hueDist <= spectrum && sVal > 15 && bVal > 15) validColor = true;
            }

            if (validColor) candidates.push(new CandidatePoint(x, y, c));

            // Always store current pixels for motion/flicker modes
            if (currentMode !== 3 && currentMode !== 12) {
                let key = x + ',' + y;
                newGridPixels[key] = { r: r, g: g, b: b };
            }
        }
    }
    prevGridPixels = newGridPixels;
    candidates.sort(() => Math.random() - 0.5);
    let quantityLevel = paramValues[0];
    let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
    numPoints = min(numPoints, candidates.length);
    let blobVarLevel = paramValues[6];

    for (let i = 0; i < numPoints; i++) {
        let c = candidates[i];
        let sc = videoToScreenCoords(c.x, c.y);
        trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
    }
}

function drawLines() {
    if (trackedPoints.length < 2) return;
    let opacity = map(paramValues[2], 0, 100, 0, 255);
    let curvatureLevel = lineStraight ? 0 : paramValues[3];
    // Parse line color and apply opacity
    let c = color(lineColor);
    stroke(red(c), green(c), blue(c), opacity);
    strokeWeight(lineWeight);
    noFill();

    beginShape();
    if (curvatureLevel === 0) {
        for (let p of trackedPoints) vertex(p.posicao.x, p.posicao.y);
    } else {
        let expFactor = pow(curvatureLevel / 100.0, 2.5);
        let chaosAmp = map(expFactor, 0, 1, 0, 120);
        let breakAmp = map(curvatureLevel, 60, 100, 0, 40);
        let timeFactor = frameCount * 0.01;
        curveVertex(trackedPoints[0].posicao.x, trackedPoints[0].posicao.y);
        for (let p of trackedPoints) {
            let nX1 = noise(p.posicao.x * 0.005, p.posicao.y * 0.005, timeFactor);
            let nY1 = noise(p.posicao.x * 0.005, p.posicao.y * 0.005, timeFactor + 100);
            let oX1 = map(nX1, 0, 1, -chaosAmp, chaosAmp);
            let oY1 = map(nY1, 0, 1, -chaosAmp, chaosAmp);
            let nX2 = noise(p.posicao.x * 0.1, p.posicao.y * 0.1, timeFactor + 200);
            let nY2 = noise(p.posicao.x * 0.1, p.posicao.y * 0.1, timeFactor + 300);
            let oX2 = map(nX2, 0, 1, -breakAmp, breakAmp);
            let oY2 = map(nY2, 0, 1, -breakAmp, breakAmp);
            curveVertex(p.posicao.x + oX1 + oX2, p.posicao.y + oY1 + oY2);
        }
        let last = trackedPoints[trackedPoints.length - 1];
        curveVertex(last.posicao.x, last.posicao.y);
    }
    endShape();
}

function drawPointInfo(p) {
    if (activeVizModes.size === 0) return;

    let colorSquareSize = 24;
    let fontColor = color(255, 200);
    let offsetX = p.posicao.x + 12;
    let curY = p.posicao.y + 4;
    let modes = [...activeVizModes].sort((a, b) => a - b);

    for (let vizMode of modes) {
        fill(fontColor); noStroke(); textSize(11);

        if (vizMode === 0) { // XY
            text(`x${p.posicao.x.toFixed(0)},y${p.posicao.y.toFixed(0)}`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 1) { // RGB
            let r = red(p.cor), g = green(p.cor), b = blue(p.cor);
            text(`R:${r.toFixed(0)} G:${g.toFixed(0)} B:${b.toFixed(0)}`, offsetX, curY);
            curY += 4;
            fill(p.cor); rectMode(CORNER);
            rect(offsetX, curY, colorSquareSize, colorSquareSize);
            curY += colorSquareSize + 6;
        }
        else if (vizMode === 2) { // SAT
            text(`st: ${saturation(p.cor).toFixed(0)}%`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 3) { // TXT
            text(p.dynamicWord, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 4) { // HUE
            text(`hue: ${hue(p.cor).toFixed(0)}\u00B0`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 5) { // HEX
            let rr = red(p.cor), gg = green(p.cor), bb = blue(p.cor);
            let hex = '#' + [rr, gg, bb].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
            text(hex, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 6) { // BRI
            text(`bri: ${brightness(p.cor).toFixed(0)}%`, offsetX, curY);
            curY += 14;
        }
        else if (vizMode === 8) { // TAG
            push();
            textSize(8); textStyle(BOLD); fill(255, 200);
            if (productInfo.brand) { text(productInfo.brand.toUpperCase(), offsetX, curY); curY += 11; }
            textStyle(NORMAL); textSize(10);
            if (productInfo.name) { text(productInfo.name, offsetX, curY); curY += 12; }
            textSize(8); fill(200, 160);
            let tagDetails = [productInfo.material, productInfo.size].filter(Boolean).join(' \u00B7 ');
            if (tagDetails) { text(tagDetails, offsetX, curY); curY += 11; }
            fill(255, 220); textStyle(BOLD);
            if (productInfo.price) { text(productInfo.price, offsetX, curY); curY += 11; }
            textStyle(NORMAL);
            pop();
            curY += 4;
        }
        else if (vizMode === 9) { // PLT
            push();
            let chipSize = 26;
            fill(p.cor); noStroke(); rectMode(CORNER);
            rect(offsetX, curY, chipSize, chipSize);
            noFill(); stroke(255, 100); strokeWeight(0.5);
            rect(offsetX, curY, chipSize, chipSize);
            let pr = red(p.cor), pg = green(p.cor), pb = blue(p.cor);
            let pHex = '#' + [pr, pg, pb].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
            noStroke(); fill(255, 160); textSize(8);
            text(pHex, offsetX, curY + chipSize + 10);
            pop();
            curY += chipSize + 16;
        }
    }
}
