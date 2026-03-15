// ══════════════════════════════════════════
// SECTION: TRACKING (blob-tracking.js)
// Point tracking, line drawing, point info display
// ══════════════════════════════════════════

function trackPoints() {
    trackedPoints = [];
    if (currentMode === 0 || !videoLoaded || !videoPlaying) return;
    videoEl.loadPixels();
    if (videoEl.pixels.length === 0) return;

    // MASK mode: AI re-segmentation — use mask directly for blob placement
    if (currentMode === 14 && maskReady && maskSegData && maskClickNorm) {
        const w = videoEl.width, h = videoEl.height;

        // Re-run AI segmentation every N frames (tracks the click point)
        maskFrameCount++;
        if (maskFrameCount >= MASK_RESEG_EVERY && window.mpSegmenterReady) {
            maskFrameCount = 0;
            maskSegmentWithPoint(maskClickNorm.x, maskClickNorm.y);
        }

        // Use current mask to generate blob candidates
        let gridSize = 15;
        if (w > 1280) gridSize = 30;
        let candidates = [];
        const scaleX = maskSegW / w;
        const scaleY = maskSegH / h;

        for (let y = 0; y < h; y += gridSize) {
            for (let x = 0; x < w; x += gridSize) {
                // Look up mask at this video pixel
                let mx = Math.min(Math.floor(x * scaleX), maskSegW - 1);
                let my = Math.min(Math.floor(y * scaleY), maskSegH - 1);
                if (maskSegData[my * maskSegW + mx] > 0) {
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
            let screenX = map(c.x, 0, w, videoX, videoX + videoW);
            let screenY = map(c.y, 0, h, videoY, videoY + videoH);
            trackedPoints.push(new TrackedPoint(screenX, screenY, c.c, blobVarLevel));
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
            else if (currentMode === 2 && (hVal < 30 || hVal > 330) && sVal > 20 && bVal > 20) validColor = true;

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
        let screenX = map(c.x, 0, w, videoX, videoX + videoW);
        let screenY = map(c.y, 0, h, videoY, videoY + videoH);
        trackedPoints.push(new TrackedPoint(screenX, screenY, c.c, blobVarLevel));
    }
}

function drawLines() {
    let opacity = map(paramValues[2], 0, 100, 0, 255);
    let curvatureLevel = paramValues[3];
    stroke(255, opacity); strokeWeight(1); noFill();

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
