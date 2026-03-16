// ============================================================================
// blob-fx.js — Visual Effects Module for BlobFX
// ============================================================================
// Contains all 23 visual effect functions, the batched pixel pipeline
// (applyActiveEffects), the EFFECT_TYPES classification, and FX-related
// UI listener wiring (setupFxUIListeners).
//
// Loaded as a plain <script> after blob-core.js. All p5.js globals (pixels,
// loadPixels, updatePixels, width, height, pixelDensity, etc.) and app globals
// (activeEffects, videoX/Y/W/H, ui, FX_CAT_COLORS, FX_CATEGORIES, etc.) are
// available in the shared window scope.
// ============================================================================

// ---------------------------------------------------------------------------
// EFFECT_TYPES — unified classification of all 23 effects by render method
// ---------------------------------------------------------------------------
const EFFECT_TYPES = {
    pixel: ['sepia','tint','palette','bricon','chroma','curve','wave','jitter','mblur','bloom','dither','atkinson','pxsort','pixel','glitch','noise','grain'],
    hybrid: ['halftone','ascii','dots'],
    draw: ['grid','scanlines','vignette']
};

// ---------------------------------------------------------------------------
// applyActiveEffects() — batched pixel pipeline using EFFECT_TYPES
// ---------------------------------------------------------------------------
function applyActiveEffects() {
    if (activeEffects.size === 0) return;

    let hasPixel = EFFECT_TYPES.pixel.some(e => activeEffects.has(e));
    let hasHybrid = EFFECT_TYPES.hybrid.some(e => activeEffects.has(e));

    // Single loadPixels() for all pixel-manipulating effects
    if (hasPixel || hasHybrid) loadPixels();

    // Apply pixel effects in pipeline order
    if (activeEffects.has('sepia')) applySepia();
    if (activeEffects.has('tint')) applyTint();
    if (activeEffects.has('palette')) applyPalette();
    if (activeEffects.has('bricon')) applyBriCon();
    if (activeEffects.has('chroma')) applyChromatic();
    if (activeEffects.has('curve')) applyCurve();
    if (activeEffects.has('wave')) applyWave();
    if (activeEffects.has('jitter')) applyJitter();
    if (activeEffects.has('mblur')) applyMblur();
    if (activeEffects.has('bloom')) applyBloom();
    if (activeEffects.has('dither')) applyDithering();
    if (activeEffects.has('atkinson')) applyAtkinson();
    if (activeEffects.has('pxsort')) applyPixelSort();
    if (activeEffects.has('pixel')) applyPixelate();
    if (activeEffects.has('glitch')) applyGlitch();
    if (activeEffects.has('noise')) applyNoise();
    if (activeEffects.has('grain')) applyGrain();

    // Commit pixel changes before hybrid/draw effects
    if (hasPixel || hasHybrid) updatePixels();

    // Hybrid effects (read pixels then draw shapes — get fresh read from updatePixels above)
    if (activeEffects.has('halftone')) applyHalftone();
    if (activeEffects.has('ascii')) applyASCII();
    if (activeEffects.has('dots')) applyDots();

    // Draw-only effects (no pixel access needed)
    if (activeEffects.has('grid')) applyGrid();
    if (activeEffects.has('scanlines')) applyScanlines();
    if (activeEffects.has('vignette')) applyVignette();
}

// ---------------------------------------------------------------------------
// Effect functions (23 total)
// ---------------------------------------------------------------------------

function applyDithering() {
    const bayerMatrix = [
        [ 0, 8, 2, 10],
        [12, 4, 14,  6],
        [ 3, 11, 1,  9],
        [15, 7, 13,  5]
    ];
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let isColor = (ditherColorMode === 'color');
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let threshold = (bayerMatrix[y % 4][x % 4] / 16) * 255;
            if (isColor) {
                pixels[idx]   = pixels[idx]   > threshold ? 255 : 0;
                pixels[idx+1] = pixels[idx+1] > threshold ? 255 : 0;
                pixels[idx+2] = pixels[idx+2] > threshold ? 255 : 0;
            } else {
                let gray = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
                let val = gray > threshold ? 255 : 0;
                pixels[idx] = val;
                pixels[idx+1] = val;
                pixels[idx+2] = val;
            }
        }
    }
}

function applyHalftone() {
    let dotSpacing = halfSpacing;
    let isColor = (halfColorMode === 'color');
    let d = pixelDensity();
    // BUG FIX: removed redundant loadPixels() — batch pipeline handles it
    let dots = [];
    for (let y = Math.floor(videoY); y < videoY + videoH; y += dotSpacing) {
        for (let x = Math.floor(videoX); x < videoX + videoW; x += dotSpacing) {
            let px = Math.floor(x * d);
            let py = Math.floor(y * d);
            let idx = (px + py * width * d) * 4;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            let bri = 0.299 * r + 0.587 * g + 0.114 * b;
            dots.push({ x, y, r, g, b, bri });
        }
    }
    push();
    noStroke();
    if (isColor) {
        fill(0);
    } else {
        fill(255, 220);
    }
    rectMode(CORNER);
    rect(videoX, videoY, videoW, videoH);
    let maxR = dotSpacing * 0.48;
    for (let dot of dots) {
        let sz = map(dot.bri, 0, 255, maxR, 0);
        if (sz < 0.3) continue;
        if (isColor) {
            fill(dot.r, dot.g, dot.b);
        } else {
            fill(0);
        }
        ellipse(dot.x, dot.y, sz * 2, sz * 2);
    }
    pop();
}

function applyPixelSort() {
    let d = pixelDensity();
    let totalW = width * d;
    let sX = Math.floor(videoX * d);
    let eX = Math.floor((videoX + videoW) * d);
    let sY = Math.floor(videoY * d);
    let eY = Math.floor((videoY + videoH) * d);
    let lo = pxsortLo, hi = pxsortHi;
    if (lo >= hi) { let tmp = lo; lo = hi; hi = tmp; }

    if (pxsortDir === 'vertical') {
        for (let x = sX; x < eX; x += 2) {
            let run = [], positions = [];
            for (let y = sY; y <= eY; y++) {
                let idx = (x + y * totalW) * 4;
                let bri = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
                if (bri > lo && bri < hi && y < eY) {
                    run.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2], bri });
                    positions.push(y);
                } else {
                    if (run.length > 3) {
                        run.sort((a, b) => a.bri - b.bri);
                        for (let i = 0; i < run.length; i++) {
                            let idx2 = (x + positions[i] * totalW) * 4;
                            pixels[idx2] = run[i].r;
                            pixels[idx2+1] = run[i].g;
                            pixels[idx2+2] = run[i].b;
                        }
                    }
                    run = [];
                    positions = [];
                }
            }
        }
    } else {
        for (let y = sY; y < eY; y += 2) {
            let run = [], positions = [];
            for (let x = sX; x <= eX; x++) {
                let idx = (x + y * totalW) * 4;
                let bri = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
                if (bri > lo && bri < hi && x < eX) {
                    run.push({ r: pixels[idx], g: pixels[idx+1], b: pixels[idx+2], bri });
                    positions.push(x);
                } else {
                    if (run.length > 3) {
                        run.sort((a, b) => a.bri - b.bri);
                        for (let i = 0; i < run.length; i++) {
                            let idx2 = (positions[i] + y * totalW) * 4;
                            pixels[idx2] = run[i].r;
                            pixels[idx2+1] = run[i].g;
                            pixels[idx2+2] = run[i].b;
                        }
                    }
                    run = [];
                    positions = [];
                }
            }
        }
    }
}

function applyASCII() {
    let chars = ASCII_CHARSETS[asciiCharSet] || ASCII_CHARSETS.classic;
    if (asciiInvert) chars = chars.split('').reverse().join('');
    let d = pixelDensity();
    let totalW = width * d;
    let cellD = asciiCellSize * d;
    loadPixels();
    let cells = [];
    let sx = Math.floor(videoX * d);
    let sy = Math.floor(videoY * d);
    let ex = Math.floor((videoX + videoW) * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let cy = sy; cy < ey; cy += cellD) {
        for (let cx = sx; cx < ex; cx += cellD) {
            let mx = Math.min(cx + Math.floor(cellD / 2), totalW - 1);
            let my = Math.min(cy + Math.floor(cellD / 2), height * d - 1);
            let idx = (mx + my * totalW) * 4;
            let r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
            let bri = 0.299 * r + 0.587 * g + 0.114 * b;
            cells.push({ x: cx / d, y: cy / d, r, g, b, bri });
        }
    }
    push();
    noStroke();
    fill(0);
    rectMode(CORNER);
    rect(videoX, videoY, videoW, videoH);
    textFont('Courier New');
    textSize(asciiCellSize * 1.2);
    textAlign(LEFT, TOP);
    for (let cell of cells) {
        let ci = Math.floor(cell.bri / 255 * (chars.length - 0.01));
        ci = Math.max(0, Math.min(ci, chars.length - 1));
        if (asciiColorMode === 'color') {
            fill(cell.r, cell.g, cell.b);
        } else if (asciiColorMode === 'green') {
            fill(0, cell.bri, 0);
        } else if (asciiColorMode === 'amber') {
            fill(cell.bri, cell.bri * 0.75, 0);
        } else if (asciiColorMode === 'cyan') {
            fill(0, cell.bri, cell.bri);
        } else {
            fill(cell.bri);
        }
        text(chars[ci], cell.x, cell.y);
    }
    pop();
}

function applyChromatic() {
    let d = pixelDensity();
    let totalW = width * d;
    let totalH = height * d;
    let offset = chromaOffset * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let original = new Uint8Array(pixels.length);
    // Copy only the video region rows for performance
    for (let y = sy; y < ey; y++) {
        let rowStart = (sx + y * totalW) * 4;
        let rowEnd = (ex + y * totalW) * 4;
        original.set(pixels.subarray(rowStart, rowEnd), rowStart);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            // Red: sample from right
            let rx = Math.min(x + offset, ex - 1);
            let rIdx = (rx + y * totalW) * 4;
            pixels[idx] = original[rIdx];
            // Green: keep
            pixels[idx + 1] = original[idx + 1];
            // Blue: sample from left
            let bx = Math.max(x - offset, sx);
            let bIdx = (bx + y * totalW) * 4;
            pixels[idx + 2] = original[bIdx + 2];
        }
    }
}

function applyAtkinson() {
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let regionW = ex - sx;
    let regionH = ey - sy;

    if (atkinsonColorMode === 'bw') {
        let gray = new Float32Array(regionW * regionH);
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                gray[rx + ry * regionW] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            }
        }
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let i = rx + ry * regionW;
                let old = gray[i];
                let nv = old > 128 ? 255 : 0;
                gray[i] = nv;
                let err = (old - nv) / 8;
                if (rx + 1 < regionW) gray[i + 1] += err;
                if (rx + 2 < regionW) gray[i + 2] += err;
                if (ry + 1 < regionH) {
                    if (rx - 1 >= 0) gray[i + regionW - 1] += err;
                    gray[i + regionW] += err;
                    if (rx + 1 < regionW) gray[i + regionW + 1] += err;
                }
                if (ry + 2 < regionH) gray[i + regionW * 2] += err;
            }
        }
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                let val = Math.max(0, Math.min(255, Math.round(gray[rx + ry * regionW])));
                pixels[idx] = val;
                pixels[idx + 1] = val;
                pixels[idx + 2] = val;
            }
        }
    } else {
        // Color mode: dither each channel independently
        let rCh = new Float32Array(regionW * regionH);
        let gCh = new Float32Array(regionW * regionH);
        let bCh = new Float32Array(regionW * regionH);
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                rCh[rx + ry * regionW] = pixels[idx];
                gCh[rx + ry * regionW] = pixels[idx + 1];
                bCh[rx + ry * regionW] = pixels[idx + 2];
            }
        }
        [rCh, gCh, bCh].forEach(ch => {
            for (let ry = 0; ry < regionH; ry++) {
                for (let rx = 0; rx < regionW; rx++) {
                    let i = rx + ry * regionW;
                    let old = ch[i];
                    let nv = old > 128 ? 255 : 0;
                    ch[i] = nv;
                    let err = (old - nv) / 8;
                    if (rx + 1 < regionW) ch[i + 1] += err;
                    if (rx + 2 < regionW) ch[i + 2] += err;
                    if (ry + 1 < regionH) {
                        if (rx - 1 >= 0) ch[i + regionW - 1] += err;
                        ch[i + regionW] += err;
                        if (rx + 1 < regionW) ch[i + regionW + 1] += err;
                    }
                    if (ry + 2 < regionH) ch[i + regionW * 2] += err;
                }
            }
        });
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                let i = rx + ry * regionW;
                pixels[idx] = Math.max(0, Math.min(255, Math.round(rCh[i])));
                pixels[idx + 1] = Math.max(0, Math.min(255, Math.round(gCh[i])));
                pixels[idx + 2] = Math.max(0, Math.min(255, Math.round(bCh[i])));
            }
        }
    }
}

function applyScanlines() {
    let intensity = scanIntensity / 100;
    let lineSpacing = Math.max(1, Math.round(videoH / scanCount));
    push();
    stroke(0, intensity * 255);
    strokeWeight(1);
    for (let y = Math.floor(videoY); y < videoY + videoH; y += lineSpacing) {
        line(videoX, y, videoX + videoW, y);
    }
    pop();
}

function applyVignette() {
    let intensity = vigIntensity / 100;
    let radius = vigRadius / 100;
    let cx = videoX + videoW / 2;
    let cy = videoY + videoH / 2;
    let maxDim = Math.max(videoW, videoH);
    push();
    noStroke();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();
    let outerR = maxDim * map(vigRadius, 20, 100, 0.45, 0.85);
    let grad = drawingContext.createRadialGradient(cx, cy, maxDim * radius * 0.4, cx, cy, outerR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
    drawingContext.fillStyle = grad;
    drawingContext.fillRect(videoX, videoY, videoW, videoH);
    drawingContext.restore();
    pop();
}

function applyGrain() {
    let intensity = grainIntensity / 100;
    let sz = Math.max(1, Math.round(map(grainSize, 5, 40, 1, 8)));
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let amp = intensity * 80;
    for (let y = sy; y < ey; y += sz) {
        for (let x = sx; x < ex; x += sz) {
            let noise = (Math.random() - 0.5) * amp;
            let nr = 0, ng = 0, nb = 0;
            if (grainColorMode === 'color') {
                nr = (Math.random() - 0.5) * amp;
                ng = (Math.random() - 0.5) * amp;
                nb = (Math.random() - 0.5) * amp;
            } else {
                nr = ng = nb = noise;
            }
            for (let dy = 0; dy < sz && (y + dy) < ey; dy++) {
                for (let dx = 0; dx < sz && (x + dx) < ex; dx++) {
                    let idx = ((x + dx) + (y + dy) * totalW) * 4;
                    pixels[idx] = Math.max(0, Math.min(255, pixels[idx] + nr));
                    pixels[idx + 1] = Math.max(0, Math.min(255, pixels[idx + 1] + ng));
                    pixels[idx + 2] = Math.max(0, Math.min(255, pixels[idx + 2] + nb));
                }
            }
        }
    }
}

function applyBloom() {
    let intensity = bloomIntensity / 100;
    let rad = Math.max(1, Math.round(map(bloomRadius, 10, 100, 1, 15)));
    let thresh = bloomThreshold / 100 * 255;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    // Extract bright pixels into a separate buffer
    let regionW = ex - sx;
    let regionH = ey - sy;
    let bright = new Float32Array(regionW * regionH * 3);
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let idx = ((sx + x) + (sy + y) * totalW) * 4;
            let r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
            let lum = 0.299 * r + 0.587 * g + 0.114 * b;
            let bi = (x + y * regionW) * 3;
            if (lum > thresh) {
                bright[bi] = r; bright[bi + 1] = g; bright[bi + 2] = b;
            }
        }
    }
    // Simple box blur on bright pixels (horizontal + vertical)
    let tmp = new Float32Array(bright.length);
    // Horizontal pass
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            for (let k = -rad; k <= rad; k++) {
                let nx = x + k;
                if (nx >= 0 && nx < regionW) {
                    let bi = (nx + y * regionW) * 3;
                    sr += bright[bi]; sg += bright[bi + 1]; sb += bright[bi + 2]; cnt++;
                }
            }
            let bi = (x + y * regionW) * 3;
            tmp[bi] = sr / cnt; tmp[bi + 1] = sg / cnt; tmp[bi + 2] = sb / cnt;
        }
    }
    // Vertical pass
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            for (let k = -rad; k <= rad; k++) {
                let ny = y + k;
                if (ny >= 0 && ny < regionH) {
                    let bi = (x + ny * regionW) * 3;
                    sr += tmp[bi]; sg += tmp[bi + 1]; sb += tmp[bi + 2]; cnt++;
                }
            }
            let bi = (x + y * regionW) * 3;
            bright[bi] = sr / cnt; bright[bi + 1] = sg / cnt; bright[bi + 2] = sb / cnt;
        }
    }
    // Additive blend back
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let idx = ((sx + x) + (sy + y) * totalW) * 4;
            let bi = (x + y * regionW) * 3;
            pixels[idx] = Math.min(255, pixels[idx] + bright[bi] * intensity);
            pixels[idx + 1] = Math.min(255, pixels[idx + 1] + bright[bi + 1] * intensity);
            pixels[idx + 2] = Math.min(255, pixels[idx + 2] + bright[bi + 2] * intensity);
        }
    }
}

function applyTint() {
    let intensity = tintIntensity / 100;
    let tints = {
        green: [0, 255, 0], amber: [255, 191, 0],
        cyan: [0, 255, 255], blue: [0, 100, 255]
    };
    let tc = tints[tintPreset] || tints.green;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            let lumN = lum / 255;
            pixels[idx] = Math.round(pixels[idx] * (1 - intensity) + tc[0] * lumN * intensity);
            pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - intensity) + tc[1] * lumN * intensity);
            pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - intensity) + tc[2] * lumN * intensity);
        }
    }
}

function applySepia() {
    let intensity = sepiaIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let r = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
            let sr = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            let sg = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            let sb = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
            pixels[idx] = Math.round(r * (1 - intensity) + sr * intensity);
            pixels[idx + 1] = Math.round(g * (1 - intensity) + sg * intensity);
            pixels[idx + 2] = Math.round(b * (1 - intensity) + sb * intensity);
        }
    }
}

function applyPixelate() {
    let sz = Math.max(2, pixelSize);
    let d = pixelDensity();
    let totalW = width * d;
    let szD = sz * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y += szD) {
        for (let x = sx; x < ex; x += szD) {
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            for (let dy = 0; dy < szD && (y + dy) < ey; dy++) {
                for (let dx = 0; dx < szD && (x + dx) < ex; dx++) {
                    let idx = ((x + dx) + (y + dy) * totalW) * 4;
                    sr += pixels[idx]; sg += pixels[idx+1]; sb += pixels[idx+2]; cnt++;
                }
            }
            sr = Math.round(sr/cnt); sg = Math.round(sg/cnt); sb = Math.round(sb/cnt);
            for (let dy = 0; dy < szD && (y + dy) < ey; dy++) {
                for (let dx = 0; dx < szD && (x + dx) < ex; dx++) {
                    let idx = ((x + dx) + (y + dy) * totalW) * 4;
                    pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                }
            }
        }
    }
}

function applyWave() {
    let amp = waveAmp * 0.5;
    let freq = waveFreq;
    let spd = waveSpeed;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let t = frameCount * spd * 0.05;
    for (let y = sy; y < ey; y++) {
        let offset = Math.round(Math.sin((y / d) * freq * 0.05 + t) * amp * d);
        for (let x = sx; x < ex; x++) {
            let srcX = x + offset;
            srcX = Math.max(sx, Math.min(ex - 1, srcX));
            let dstIdx = (x + y * totalW) * 4;
            let srcIdx = (srcX + y * totalW) * 4;
            pixels[dstIdx] = original[srcIdx];
            pixels[dstIdx+1] = original[srcIdx+1];
            pixels[dstIdx+2] = original[srcIdx+2];
        }
    }
}

function applyGlitch() {
    let intensity = glitchIntensity / 100;
    let freq = glitchFreq / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let maxShift = Math.round(intensity * 30 * d);

    if (glitchMode === 'tear') {
        // Horizontal line tears — slices shift left/right
        let numTears = Math.floor(freq * 20) + 1;
        for (let t = 0; t < numTears; t++) {
            let tearY = sy + Math.floor(Math.random() * (ey - sy));
            let tearH = Math.floor(Math.random() * 12 * d) + 2;
            let shift = Math.round((Math.random() - 0.5) * maxShift * 3);
            for (let dy = 0; dy < tearH && (tearY + dy) < ey; dy++) {
                let row = tearY + dy;
                for (let x = sx; x < ex; x++) {
                    let srcX = Math.max(sx, Math.min(ex - 1, x + shift));
                    let dstIdx = (x + row * totalW) * 4;
                    let srcIdx = (srcX + row * totalW) * 4;
                    pixels[dstIdx] = original[srcIdx];
                    pixels[dstIdx+1] = original[srcIdx+1];
                    pixels[dstIdx+2] = original[srcIdx+2];
                }
            }
        }
    } else if (glitchMode === 'corrupt') {
        // Random rectangular blocks get displaced or color-swapped
        let numBlocks = Math.floor(freq * 15) + 1;
        for (let b = 0; b < numBlocks; b++) {
            let bx = sx + Math.floor(Math.random() * (ex - sx));
            let by = sy + Math.floor(Math.random() * (ey - sy));
            let bw = Math.floor(Math.random() * maxShift * 2) + 4;
            let bh = Math.floor(Math.random() * 10 * d) + 2;
            let srcOx = Math.round((Math.random() - 0.5) * maxShift * 4);
            let srcOy = Math.round((Math.random() - 0.5) * maxShift * 2);
            let swap = Math.floor(Math.random() * 3); // 0=normal, 1=swap RB, 2=swap RG
            for (let dy = 0; dy < bh && (by + dy) < ey; dy++) {
                for (let dx = 0; dx < bw && (bx + dx) < ex; dx++) {
                    let dstIdx = ((bx + dx) + (by + dy) * totalW) * 4;
                    let sX = Math.max(sx, Math.min(ex - 1, bx + dx + srcOx));
                    let sY = Math.max(sy, Math.min(ey - 1, by + dy + srcOy));
                    let srcIdx = (sX + sY * totalW) * 4;
                    if (swap === 1) {
                        pixels[dstIdx] = original[srcIdx+2];
                        pixels[dstIdx+1] = original[srcIdx+1];
                        pixels[dstIdx+2] = original[srcIdx];
                    } else if (swap === 2) {
                        pixels[dstIdx] = original[srcIdx+1];
                        pixels[dstIdx+1] = original[srcIdx];
                        pixels[dstIdx+2] = original[srcIdx+2];
                    } else {
                        pixels[dstIdx] = original[srcIdx];
                        pixels[dstIdx+1] = original[srcIdx+1];
                        pixels[dstIdx+2] = original[srcIdx+2];
                    }
                }
            }
        }
    } else {
        // SHIFT — original channel-shift mode
        for (let y = sy; y < ey; y++) {
            if (Math.random() > freq) continue;
            let blockH = Math.floor(Math.random() * 8 * d) + 1;
            let rShift = Math.round((Math.random() - 0.5) * maxShift * 2);
            let bShift = Math.round((Math.random() - 0.5) * maxShift * 2);
            for (let dy = 0; dy < blockH && (y + dy) < ey; dy++) {
                let row = y + dy;
                for (let x = sx; x < ex; x++) {
                    let idx = (x + row * totalW) * 4;
                    let rSrc = Math.max(sx, Math.min(ex - 1, x + rShift));
                    let bSrc = Math.max(sx, Math.min(ex - 1, x + bShift));
                    pixels[idx] = original[(rSrc + row * totalW) * 4];
                    pixels[idx + 2] = original[(bSrc + row * totalW) * 4 + 2];
                }
            }
            y += blockH - 1;
        }
    }
}

function applyJitter() {
    let intensity = jitterIntensity / 100;
    let maxOff = Math.round(intensity * 15);
    let bs = Math.max(1, jitterBlockSize);
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let offD = maxOff * d;
    let bsD = bs * d;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let t = millis() * 0.003;
    for (let y = sy; y < ey; y += bsD) {
        for (let x = sx; x < ex; x += bsD) {
            let ox, oy;
            if (jitterMode === 'perlin') {
                ox = Math.round((noise(x * 0.02, y * 0.02, t) - 0.5) * offD * 4);
                oy = Math.round((noise(x * 0.02 + 100, y * 0.02 + 100, t) - 0.5) * offD * 4);
            } else if (jitterMode === 'shake') {
                let shakeX = Math.sin(t * 7 + y * 0.01) * offD;
                let shakeY = Math.cos(t * 5 + x * 0.01) * offD * 0.3;
                ox = Math.round(shakeX);
                oy = Math.round(shakeY);
            } else {
                ox = Math.round((Math.random() - 0.5) * offD * 2);
                oy = Math.round((Math.random() - 0.5) * offD * 2);
            }
            let srcX = Math.max(sx, Math.min(ex - 1, x + ox));
            let srcY = Math.max(sy, Math.min(ey - 1, y + oy));
            let srcIdx = (srcX + srcY * totalW) * 4;
            for (let dy = 0; dy < bsD && (y + dy) < ey; dy++) {
                for (let dx = 0; dx < bsD && (x + dx) < ex; dx++) {
                    let dstIdx = ((x + dx) + (y + dy) * totalW) * 4;
                    pixels[dstIdx] = original[srcIdx];
                    pixels[dstIdx+1] = original[srcIdx+1];
                    pixels[dstIdx+2] = original[srcIdx+2];
                }
            }
        }
    }
}

function applyNoise() {
    let intensity = noiseIntensity / 100;
    let sz = Math.max(1, noiseScale);
    let d = pixelDensity();
    let totalW = width * d;
    let szD = sz * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let density = intensity * 0.3;
    for (let y = sy; y < ey; y += szD) {
        for (let x = sx; x < ex; x += szD) {
            if (Math.random() > density) continue;
            let nr, ng, nb;
            if (noiseColorMode === 'color') {
                nr = Math.random() * 255; ng = Math.random() * 255; nb = Math.random() * 255;
            } else {
                nr = ng = nb = Math.random() * 255;
            }
            for (let dy = 0; dy < szD && (y+dy) < ey; dy++) {
                for (let dx = 0; dx < szD && (x+dx) < ex; dx++) {
                    let idx = ((x+dx) + (y+dy) * totalW) * 4;
                    pixels[idx] = nr; pixels[idx+1] = ng; pixels[idx+2] = nb;
                }
            }
        }
    }
}

function applyCurve() {
    let sign = (curveDirection === 'pincushion') ? -1 : 1;
    let intensity = sign * curveIntensity / 100 * 0.5;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let cx = (sx + ex) / 2;
    let cy = (sy + ey) / 2;
    let hw = (ex - sx) / 2;
    let hh = (ey - sy) / 2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let nx = (x - cx) / hw;
            let ny = (y - cy) / hh;
            let r2 = nx * nx + ny * ny;
            let factor = 1 + r2 * intensity;
            let srcNx = nx * factor;
            let srcNy = ny * factor;
            let srcX = Math.round(srcNx * hw + cx);
            let srcY = Math.round(srcNy * hh + cy);
            let dstIdx = (x + y * totalW) * 4;
            if (srcX >= sx && srcX < ex && srcY >= sy && srcY < ey) {
                let srcIdx = (srcX + srcY * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            } else {
                // Clamp to nearest edge pixel instead of black fill
                let clampX = Math.max(sx, Math.min(ex - 1, srcX));
                let clampY = Math.max(sy, Math.min(ey - 1, srcY));
                let clampIdx = (clampX + clampY * totalW) * 4;
                pixels[dstIdx] = original[clampIdx];
                pixels[dstIdx+1] = original[clampIdx+1];
                pixels[dstIdx+2] = original[clampIdx+2];
            }
        }
    }
}

function applyBriCon() {
    let bri = briValue * 2.55;
    let con = conValue / 100;
    let sat = satValue / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            r += bri; g += bri; b += bri;
            r = (r - 128) * con + 128;
            g = (g - 128) * con + 128;
            b = (b - 128) * con + 128;
            if (sat !== 1) {
                let gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = gray + (r - gray) * sat;
                g = gray + (g - gray) * sat;
                b = gray + (b - gray) * sat;
            }
            pixels[idx] = Math.max(0, Math.min(255, Math.round(r)));
            pixels[idx+1] = Math.max(0, Math.min(255, Math.round(g)));
            pixels[idx+2] = Math.max(0, Math.min(255, Math.round(b)));
        }
    }
}

function applyGrid() {
    let scale = gridScale;
    let lw = gridWidth;
    let opacity = gridOpacity / 100 * 255;
    push();
    stroke(255, opacity);
    strokeWeight(lw);
    noFill();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();
    for (let x = videoX; x <= videoX + videoW; x += scale) {
        line(x, videoY, x, videoY + videoH);
    }
    for (let y = videoY; y <= videoY + videoH; y += scale) {
        line(videoX, y, videoX + videoW, y);
    }
    drawingContext.restore();
    pop();
}

function applyDots() {
    let angle = dotsAngle * Math.PI / 180;
    let sc = Math.max(2, dotsScale);
    push();
    noStroke();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();
    let cxV = videoX + videoW / 2;
    let cyV = videoY + videoH / 2;
    let maxDim = Math.max(videoW, videoH) * 1.5;
    let cosA = Math.cos(angle), sinA = Math.sin(angle);
    // BUG FIX: removed redundant loadPixels() — batch pipeline handles it
    let d = pixelDensity();
    let totalW = width * d;
    fill(255, 200);
    rectMode(CORNER);
    rect(videoX, videoY, videoW, videoH);
    for (let gy = -maxDim / 2; gy < maxDim / 2; gy += sc) {
        for (let gx = -maxDim / 2; gx < maxDim / 2; gx += sc) {
            let rx = gx * cosA - gy * sinA + cxV;
            let ry = gx * sinA + gy * cosA + cyV;
            if (rx < videoX - sc || rx > videoX + videoW + sc) continue;
            if (ry < videoY - sc || ry > videoY + videoH + sc) continue;
            let px = Math.floor(rx * d);
            let py = Math.floor(ry * d);
            px = Math.max(0, Math.min(totalW - 1, px));
            py = Math.max(0, Math.min(height * d - 1, py));
            let idx = (px + py * totalW) * 4;
            let bri = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            let dotR = map(bri, 0, 255, sc * 0.45, 0);
            if (dotR > 0.3) {
                fill(0);
                ellipse(rx, ry, dotR * 2, dotR * 2);
            }
        }
    }
    drawingContext.restore();
    pop();
}

function applyMblur() {
    let intensity = mblurIntensity / 100;
    let angle = mblurAngle * Math.PI / 180;
    let samples = 8;
    let maxOff = intensity * 15;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let dx = Math.cos(angle);
    let dy = Math.sin(angle);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y += 2) {
        for (let x = sx; x < ex; x += 2) {
            let sr = 0, sg = 0, sb = 0;
            for (let s = 0; s < samples; s++) {
                let t = (s / (samples - 1) - 0.5) * maxOff * d;
                let sampleX = Math.round(x + dx * t);
                let sampleY = Math.round(y + dy * t);
                sampleX = Math.max(sx, Math.min(ex - 1, sampleX));
                sampleY = Math.max(sy, Math.min(ey - 1, sampleY));
                let idx = (sampleX + sampleY * totalW) * 4;
                sr += original[idx]; sg += original[idx+1]; sb += original[idx+2];
            }
            sr = Math.round(sr / samples);
            sg = Math.round(sg / samples);
            sb = Math.round(sb / samples);
            for (let oy = 0; oy < 2 && (y+oy) < ey; oy++) {
                for (let ox = 0; ox < 2 && (x+ox) < ex; ox++) {
                    let idx = ((x+ox) + (y+oy) * totalW) * 4;
                    pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                }
            }
        }
    }
}

function applyPalette() {
    const palettes = {
        noir: [[0,0,0],[255,255,255]],
        terminal: [[0,17,0],[0,255,0]],
        gameboy: [[15,56,15],[48,98,48],[139,172,15],[155,188,15]],
        synthwave: [[18,4,88],[123,44,191],[224,64,251],[255,110,199],[255,245,157]],
        cyberpunk: [[13,2,33],[38,20,71],[107,45,92],[247,37,133],[76,201,240]],
        amber: [[26,15,0],[61,36,0],[122,72,0],[204,122,0],[255,204,102]],
        arctic: [[10,10,20],[26,42,74],[58,90,138],[106,154,202],[202,232,255]],
        rose: [[42,26,26],[107,64,64],[183,110,121],[232,180,188],[255,240,245]],
        neon: [[13,13,13],[255,7,58],[57,255,20],[0,240,255],[255,255,255]],
        forest: [[26,46,26],[45,74,45],[74,124,74],[122,179,122],[200,230,200]],
        sunset: [[26,20,35],[74,25,66],[179,57,81],[245,169,98],[255,244,224]],
        ocean: [[10,26,26],[26,58,58],[42,106,90],[74,154,122],[138,218,170]]
    };
    let pal = palettes[palettePreset] || palettes.noir;
    let intensity = paletteIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            let minDist = Infinity, nearest = pal[0];
            for (let c of pal) {
                let dr = r - c[0], dg = g - c[1], db = b - c[2];
                let dist = dr*dr + dg*dg + db*db;
                if (dist < minDist) { minDist = dist; nearest = c; }
            }
            pixels[idx] = Math.round(r * (1-intensity) + nearest[0] * intensity);
            pixels[idx+1] = Math.round(g * (1-intensity) + nearest[1] * intensity);
            pixels[idx+2] = Math.round(b * (1-intensity) + nearest[2] * intensity);
        }
    }
}

// ---------------------------------------------------------------------------
// setupFxUIListeners() — FX card interaction + all FX param slider wiring
// ---------------------------------------------------------------------------
function setupFxUIListeners() {

    function wireSlider(sliderId, inputId, setter) {
        let sl = document.getElementById(sliderId);
        let inp = document.getElementById(inputId);
        sl.addEventListener('input', (e) => { let v = parseFloat(e.target.value); setter(v); inp.value = v; });
        inp.addEventListener('change', (e) => {
            let v = parseFloat(e.target.value) || 0;
            v = Math.max(parseFloat(sl.min), Math.min(parseFloat(sl.max), v));
            setter(v); sl.value = v; e.target.value = v; e.target.blur();
        });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); });
    }

    // Effect cards — click to toggle, drag to timeline
    ui.fxCards.forEach(card => {
        card.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            fxDragState = {
                effect: card.dataset.effect,
                cat: card.dataset.cat,
                startX: e.clientX,
                startY: e.clientY,
                dragging: false
            };
        });
    });
    document.addEventListener('mousemove', (e) => {
        if (!fxDragState) return;
        let dx = e.clientX - fxDragState.startX;
        let dy = e.clientY - fxDragState.startY;
        if (!fxDragState.dragging && (dx*dx + dy*dy) > 36) {
            fxDragState.dragging = true;
            ui.dragGhost.textContent = fxDragState.effect.toUpperCase();
            ui.dragGhost.style.display = 'block';
            ui.dragGhost.style.background = FX_CAT_COLORS[FX_CATEGORIES[fxDragState.effect]] || '#888';
        }
        if (fxDragState.dragging) {
            ui.dragGhost.style.left = (e.clientX + 12) + 'px';
            ui.dragGhost.style.top = (e.clientY + 12) + 'px';
            let tlInner = ui.tlTrackInner || ui.tlTrack;
            let tlRect = tlInner.getBoundingClientRect();
            let overTl = e.clientX >= tlRect.left && e.clientX <= tlRect.right &&
                         e.clientY >= tlRect.top - 20 && e.clientY <= tlRect.bottom + 20;
            tlInner.classList.toggle('drag-over', overTl);
            ui.tlDragHint.classList.toggle('drop-active', overTl);
            let tlDurG = getTimelineDuration();
            if (overTl && tlDurG > 0) {
                let ratio = Math.max(0, Math.min(1, (e.clientX - tlRect.left) / tlRect.width));
                let vr = getVisibleTimeRange();
                let segW = Math.min(5, vr.duration) / vr.duration * 100;
                ui.tlGhost.style.left = (ratio * 100) + '%';
                ui.tlGhost.style.width = segW + '%';
                ui.tlGhost.style.background = FX_CAT_COLORS[FX_CATEGORIES[fxDragState.effect]] || '#888';
                ui.tlGhost.style.opacity = '0.35';
                ui.tlGhost.classList.add('visible');
            } else {
                ui.tlGhost.classList.remove('visible');
            }
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (!fxDragState) return;
        if (fxDragState.dragging) {
            ui.dragGhost.style.display = 'none';
            let tlInner2 = ui.tlTrackInner || ui.tlTrack;
            tlInner2.classList.remove('drag-over');
            ui.tlDragHint.classList.remove('drop-active');
            ui.tlGhost.classList.remove('visible');
            let tlRect = tlInner2.getBoundingClientRect();
            let overTl = e.clientX >= tlRect.left && e.clientX <= tlRect.right &&
                         e.clientY >= tlRect.top - 20 && e.clientY <= tlRect.bottom + 20;
            let tlDur = getTimelineDuration();
            if (overTl && tlDur > 0) {
                let ratio = Math.max(0, Math.min(1, (e.clientX - tlRect.left) / tlRect.width));
                let dropTime = snapToBeat(percentToTime(ratio * 100));
                addTimelineSegmentAt(fxDragState.effect, dropTime);
            }
        } else {
            // Click (not drag) — toggle effect globally
            let effectName = fxDragState.effect;
            if (activeEffects.has(effectName)) {
                activeEffects.delete(effectName);
            } else {
                activeEffects.add(effectName);
            }
            updateEffectCardStates();
            updateFxParamVisibility();
        }
        fxDragState = null;
    });

    // ASCII params
    let asciiCellSlider = document.getElementById('slider-ascii-cell');
    let asciiCellInput = document.getElementById('val-ascii-cell');
    asciiCellSlider.addEventListener('input', (e) => {
        asciiCellSize = parseInt(e.target.value);
        asciiCellInput.value = asciiCellSize;
    });
    asciiCellInput.addEventListener('change', (e) => {
        asciiCellSize = Math.max(4, Math.min(24, parseInt(e.target.value) || 10));
        asciiCellSlider.value = asciiCellSize;
        e.target.value = asciiCellSize;
        e.target.blur();
    });
    asciiCellInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    document.querySelectorAll('#ascii-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            asciiColorMode = e.target.dataset.value;
            document.querySelectorAll('#ascii-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    document.querySelectorAll('#ascii-charset-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            asciiCharSet = e.target.dataset.value;
            document.querySelectorAll('#ascii-charset-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    document.querySelectorAll('#ascii-invert-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            asciiInvert = (e.target.dataset.value === 'on');
            document.querySelectorAll('#ascii-invert-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Chroma params
    let chromaSlider = document.getElementById('slider-chroma-offset');
    let chromaInput = document.getElementById('val-chroma-offset');
    chromaSlider.addEventListener('input', (e) => {
        chromaOffset = parseInt(e.target.value);
        chromaInput.value = chromaOffset;
    });
    chromaInput.addEventListener('change', (e) => {
        chromaOffset = Math.max(1, Math.min(25, parseInt(e.target.value) || 5));
        chromaSlider.value = chromaOffset;
        e.target.value = chromaOffset;
        e.target.blur();
    });
    chromaInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    // Atkinson color mode
    document.querySelectorAll('#atkinson-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            atkinsonColorMode = e.target.dataset.value;
            document.querySelectorAll('#atkinson-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // --- High-impact FX params ---
    wireSlider('slider-scan-intensity', 'val-scan-intensity', v => scanIntensity = v);
    wireSlider('slider-scan-count', 'val-scan-count', v => scanCount = v);
    wireSlider('slider-vig-intensity', 'val-vig-intensity', v => vigIntensity = v);
    wireSlider('slider-vig-radius', 'val-vig-radius', v => vigRadius = v);
    wireSlider('slider-grain-intensity', 'val-grain-intensity', v => grainIntensity = v);
    wireSlider('slider-grain-size', 'val-grain-size', v => grainSize = v);
    wireSlider('slider-bloom-intensity', 'val-bloom-intensity', v => bloomIntensity = v);
    wireSlider('slider-bloom-radius', 'val-bloom-radius', v => bloomRadius = v);
    wireSlider('slider-bloom-thresh', 'val-bloom-thresh', v => bloomThreshold = v);
    wireSlider('slider-tint-intensity', 'val-tint-intensity', v => tintIntensity = v);
    wireSlider('slider-sepia-intensity', 'val-sepia-intensity', v => sepiaIntensity = v);

    // Grain color mode
    document.querySelectorAll('#grain-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            grainColorMode = e.target.dataset.value;
            document.querySelectorAll('#grain-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Tint preset
    document.querySelectorAll('#tint-preset-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            tintPreset = e.target.dataset.value;
            document.querySelectorAll('#tint-preset-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    wireSlider('slider-pixel-size', 'val-pixel-size', v => pixelSize = v);
    wireSlider('slider-wave-amp', 'val-wave-amp', v => waveAmp = v);
    wireSlider('slider-wave-freq', 'val-wave-freq', v => waveFreq = v);
    wireSlider('slider-wave-speed', 'val-wave-speed', v => waveSpeed = v);
    wireSlider('slider-glitch-intensity', 'val-glitch-intensity', v => glitchIntensity = v);
    wireSlider('slider-glitch-freq', 'val-glitch-freq', v => glitchFreq = v);
    document.querySelectorAll('#glitch-mode-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            glitchMode = e.target.dataset.value;
            document.querySelectorAll('#glitch-mode-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    wireSlider('slider-jitter-intensity', 'val-jitter-intensity', v => jitterIntensity = v);
    wireSlider('slider-jitter-block', 'val-jitter-block', v => jitterBlockSize = v);
    document.querySelectorAll('#jitter-mode-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            jitterMode = e.target.dataset.value;
            document.querySelectorAll('#jitter-mode-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    wireSlider('slider-half-spacing', 'val-half-spacing', v => halfSpacing = v);
    document.querySelectorAll('#half-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            halfColorMode = e.target.dataset.value;
            document.querySelectorAll('#half-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    document.querySelectorAll('#dither-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            ditherColorMode = e.target.dataset.value;
            document.querySelectorAll('#dither-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    wireSlider('slider-pxsort-lo', 'val-pxsort-lo', v => pxsortLo = v);
    wireSlider('slider-pxsort-hi', 'val-pxsort-hi', v => pxsortHi = v);
    document.querySelectorAll('#pxsort-dir-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            pxsortDir = e.target.dataset.value;
            document.querySelectorAll('#pxsort-dir-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    wireSlider('slider-noise-intensity', 'val-noise-intensity', v => noiseIntensity = v);
    wireSlider('slider-noise-scale', 'val-noise-scale', v => noiseScale = v);
    wireSlider('slider-curve-intensity', 'val-curve-intensity', v => curveIntensity = v);
    document.querySelectorAll('#curve-dir-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            curveDirection = e.target.dataset.value;
            document.querySelectorAll('#curve-dir-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    wireSlider('slider-bri', 'val-bri', v => briValue = v);
    wireSlider('slider-con', 'val-con', v => conValue = v);
    wireSlider('slider-sat', 'val-sat', v => satValue = v);
    wireSlider('slider-grid-scale', 'val-grid-scale', v => gridScale = v);
    wireSlider('slider-grid-width', 'val-grid-width', v => gridWidth = v);
    wireSlider('slider-grid-opacity', 'val-grid-opacity', v => gridOpacity = v);
    wireSlider('slider-dots-angle', 'val-dots-angle', v => dotsAngle = v);
    wireSlider('slider-dots-scale', 'val-dots-scale', v => dotsScale = v);
    wireSlider('slider-mblur-intensity', 'val-mblur-intensity', v => mblurIntensity = v);
    wireSlider('slider-mblur-angle', 'val-mblur-angle', v => mblurAngle = v);
    wireSlider('slider-palette-intensity', 'val-palette-intensity', v => paletteIntensity = v);

    // Noise color mode
    document.querySelectorAll('#noise-color-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            noiseColorMode = e.target.dataset.value;
            document.querySelectorAll('#noise-color-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Palette preset
    document.querySelectorAll('#palette-preset-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            palettePreset = e.target.dataset.value;
            document.querySelectorAll('#palette-preset-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}
