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
    pixel: ['sepia','tint','palette','gradmap','duotone','thermal','bricon','emboss','chroma','rgbshift','curve','wave','jitter','mblur','bloom','dither','atkinson','pxsort','pixel','glitch','noise','grain'],
    hybrid: ['halftone','ascii','dots','led','crt'],
    draw: ['grid','scanlines','vignette']
};

// ---------------------------------------------------------------------------
// applyActiveEffects() — batched pixel pipeline using EFFECT_TYPES
// ---------------------------------------------------------------------------
function applyActiveEffects() {
    if (!masterFxEnabled || activeEffects.size === 0) return;

    let hasPixel = EFFECT_TYPES.pixel.some(e => activeEffects.has(e));
    let hasHybrid = EFFECT_TYPES.hybrid.some(e => activeEffects.has(e));

    // Single loadPixels() for all pixel-manipulating effects
    if (hasPixel || hasHybrid) loadPixels();

    // Apply pixel effects in pipeline order (30 effects total)
    // Color tier
    if (activeEffects.has('sepia')) applySepia();
    if (activeEffects.has('tint')) applyTint();
    if (activeEffects.has('palette')) applyPalette();
    if (activeEffects.has('gradmap')) applyGradientMap();
    if (activeEffects.has('duotone')) applyDuotone();
    if (activeEffects.has('thermal')) applyThermal();
    if (activeEffects.has('bricon')) applyBriCon();
    // Distortion tier
    if (activeEffects.has('emboss')) applyEmboss();
    if (activeEffects.has('chroma')) applyChromatic();
    if (activeEffects.has('rgbshift')) applyRGBShift();
    if (activeEffects.has('curve')) applyCurve();
    if (activeEffects.has('wave')) applyWave();
    if (activeEffects.has('jitter')) applyJitter();
    if (activeEffects.has('mblur')) applyMblur();
    // Pattern tier
    if (activeEffects.has('bloom')) applyBloom();
    if (activeEffects.has('dither')) applyDithering();
    if (activeEffects.has('atkinson')) applyAtkinson();
    if (activeEffects.has('pxsort')) applyPixelSort();
    if (activeEffects.has('pixel')) applyPixelate();
    // Overlay tier (pixel)
    if (activeEffects.has('glitch')) applyGlitch();
    if (activeEffects.has('noise')) applyNoise();
    if (activeEffects.has('grain')) applyGrain();

    // Commit pixel changes before hybrid/draw effects
    if (hasPixel || hasHybrid) updatePixels();

    // Hybrid effects (read pixels then draw shapes)
    if (activeEffects.has('halftone')) applyHalftone();
    if (activeEffects.has('ascii')) applyASCII();
    if (activeEffects.has('dots')) applyDots();
    if (activeEffects.has('led')) applyLED();
    if (activeEffects.has('crt')) applyCRT();

    // Draw-only effects (no pixel access needed)
    if (activeEffects.has('grid')) applyGrid();
    if (activeEffects.has('scanlines')) applyScanlines();
    if (activeEffects.has('vignette')) applyVignette();
}

// ---------------------------------------------------------------------------
// Effect functions (23 total)
// ---------------------------------------------------------------------------

function applyDithering() {
    const bayer2 = [[0,2],[3,1]];
    const bayer4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
    const bayer8 = [
        [0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],
        [12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],
        [3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],
        [15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]
    ];
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d);
    let ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d);
    let ey = Math.floor((videoY + videoH) * d);
    let strength = ditherStrength / 100;
    let pxScale = Math.max(1, Math.round(ditherPixelation));

    // Get palette colors
    let pal = PALETTES[ditherPalette] || PALETTES.bw;
    // Limit to ditherColorCount
    let colorCount = Math.max(2, Math.min(pal.length, ditherColorCount));
    if (colorCount < pal.length) {
        // Evenly sample from palette
        let sampled = [];
        for (let i = 0; i < colorCount; i++) sampled.push(pal[Math.floor(i * pal.length / colorCount)]);
        pal = sampled;
    }

    function nearestPalColor(r, g, b) {
        let minD = Infinity, best = pal[0];
        for (let c of pal) {
            let dr = r-c[0], dg = g-c[1], db = b-c[2];
            let dist = dr*dr + dg*dg + db*db;
            if (dist < minD) { minD = dist; best = c; }
        }
        return best;
    }

    let algo = ditherAlgorithm;

    if (algo === 'floyd') {
        // Floyd-Steinberg error diffusion
        let regionW = ex - sx, regionH = ey - sy;
        let rCh = new Float32Array(regionW * regionH);
        let gCh = new Float32Array(regionW * regionH);
        let bCh = new Float32Array(regionW * regionH);
        for (let ry = 0; ry < regionH; ry += pxScale) {
            for (let rx = 0; rx < regionW; rx += pxScale) {
                let idx = ((sx+rx) + (sy+ry) * totalW) * 4;
                let i = rx + ry * regionW;
                rCh[i] = pixels[idx]; gCh[i] = pixels[idx+1]; bCh[i] = pixels[idx+2];
            }
        }
        for (let ry = 0; ry < regionH; ry += pxScale) {
            for (let rx = 0; rx < regionW; rx += pxScale) {
                let i = rx + ry * regionW;
                let nc = nearestPalColor(rCh[i], gCh[i], bCh[i]);
                let er = rCh[i]-nc[0], eg = gCh[i]-nc[1], eb = bCh[i]-nc[2];
                rCh[i]=nc[0]; gCh[i]=nc[1]; bCh[i]=nc[2];
                // Distribute error: right 7/16, below-left 3/16, below 5/16, below-right 1/16
                if (rx+pxScale<regionW) { let j=i+pxScale; rCh[j]+=er*7/16; gCh[j]+=eg*7/16; bCh[j]+=eb*7/16; }
                if (ry+pxScale<regionH) {
                    if (rx-pxScale>=0) { let j=i+regionW*pxScale-pxScale; rCh[j]+=er*3/16; gCh[j]+=eg*3/16; bCh[j]+=eb*3/16; }
                    { let j=i+regionW*pxScale; rCh[j]+=er*5/16; gCh[j]+=eg*5/16; bCh[j]+=eb*5/16; }
                    if (rx+pxScale<regionW) { let j=i+regionW*pxScale+pxScale; rCh[j]+=er/16; gCh[j]+=eg/16; bCh[j]+=eb/16; }
                }
            }
        }
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx+rx) + (sy+ry) * totalW) * 4;
                let si = (rx - rx%pxScale) + (ry - ry%pxScale) * regionW;
                let or = pixels[idx], og = pixels[idx+1], ob = pixels[idx+2];
                pixels[idx]   = Math.round(or*(1-strength) + Math.max(0,Math.min(255,rCh[si]))*strength);
                pixels[idx+1] = Math.round(og*(1-strength) + Math.max(0,Math.min(255,gCh[si]))*strength);
                pixels[idx+2] = Math.round(ob*(1-strength) + Math.max(0,Math.min(255,bCh[si]))*strength);
            }
        }
    } else {
        // Bayer ordered dithering (bayer2, bayer4, bayer8)
        let matrix, mSize;
        if (algo === 'bayer2') { matrix = bayer2; mSize = 2; }
        else if (algo === 'bayer8') { matrix = bayer8; mSize = 8; }
        else { matrix = bayer4; mSize = 4; } // bayer4 default + 'ordered'
        let mMax = mSize * mSize;
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + y * totalW) * 4;
                let bx = Math.floor((x-sx)/pxScale) % mSize;
                let by = Math.floor((y-sy)/pxScale) % mSize;
                let threshold = (matrix[by][bx] / mMax) * 255;
                let or = pixels[idx], og = pixels[idx+1], ob = pixels[idx+2];
                // Quantize to nearest palette color using threshold
                let gray = 0.299*or + 0.587*og + 0.114*ob;
                let nc = nearestPalColor(
                    or + (threshold - 128) * 0.5,
                    og + (threshold - 128) * 0.5,
                    ob + (threshold - 128) * 0.5
                );
                pixels[idx]   = Math.round(or*(1-strength) + nc[0]*strength);
                pixels[idx+1] = Math.round(og*(1-strength) + nc[1]*strength);
                pixels[idx+2] = Math.round(ob*(1-strength) + nc[2]*strength);
            }
        }
    }
}

function applyHalftone() {
    let dotSpacing = halfSpacing;
    let isColor = (halfColorMode === 'color');
    let d = pixelDensity();
    let inv = halfInverted;
    let contrast = halfContrast / 50; // 0-2 range
    let spread = halfSpread;
    let angleRad = halfAngle * Math.PI / 180;

    // Parse ink/paper colors
    function hexToRGB(hex) {
        let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        return [r,g,b];
    }
    let inkRGB = hexToRGB(inv ? halfPaperColor : halfInkColor);
    let paperRGB = hexToRGB(inv ? halfInkColor : halfPaperColor);

    let dots = [];
    // Sample with optional rotation
    let cx = videoX + videoW/2, cy = videoY + videoH/2;
    let cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
    let extW = Math.max(videoW, videoH) * 1.5;
    for (let gy = -extW/2; gy < extW/2; gy += dotSpacing) {
        for (let gx = -extW/2; gx < extW/2; gx += dotSpacing) {
            let rx = gx * cosA - gy * sinA + cx + (spread > 0 ? (Math.random()-0.5)*spread : 0);
            let ry = gx * sinA + gy * cosA + cy + (spread > 0 ? (Math.random()-0.5)*spread : 0);
            if (rx < videoX || rx >= videoX+videoW || ry < videoY || ry >= videoY+videoH) continue;
            let px = Math.floor(rx * d), py = Math.floor(ry * d);
            let idx = (px + py * width * d) * 4;
            if (idx < 0 || idx >= pixels.length - 3) continue;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            let bri = 0.299*r + 0.587*g + 0.114*b;
            dots.push({ x:rx, y:ry, r, g, b, bri });
        }
    }
    push();
    noStroke();
    // Fill paper color
    fill(paperRGB[0], paperRGB[1], paperRGB[2]);
    rectMode(CORNER);
    rect(videoX, videoY, videoW, videoH);
    let maxR = dotSpacing * 0.48;
    for (let dot of dots) {
        // Apply contrast to brightness mapping
        let bri01 = dot.bri / 255;
        bri01 = 0.5 + (bri01 - 0.5) * contrast;
        bri01 = Math.max(0, Math.min(1, bri01));
        let sz = (1 - bri01) * maxR;
        if (sz < 0.3) continue;
        if (isColor) {
            fill(dot.r, dot.g, dot.b);
        } else {
            fill(inkRGB[0], inkRGB[1], inkRGB[2]);
        }
        // Draw shape
        switch (halfShape) {
            case 'square':
                rectMode(CENTER);
                rect(dot.x, dot.y, sz*2, sz*2);
                break;
            case 'diamond':
                push(); translate(dot.x, dot.y); rotate(Math.PI/4);
                rectMode(CENTER); rect(0, 0, sz*1.6, sz*1.6);
                pop(); break;
            case 'triangle':
                triangle(dot.x, dot.y-sz, dot.x-sz*0.87, dot.y+sz*0.5, dot.x+sz*0.87, dot.y+sz*0.5);
                break;
            case 'line':
                stroke(isColor ? color(dot.r,dot.g,dot.b) : color(inkRGB[0],inkRGB[1],inkRGB[2]));
                strokeWeight(sz * 0.6);
                line(dot.x - sz, dot.y, dot.x + sz, dot.y);
                noStroke();
                break;
            default: // circle
                ellipse(dot.x, dot.y, sz*2, sz*2);
        }
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
    let thresh = atkinsonThreshold;
    let errDiv = Math.round(map(atkinsonSpread, 0, 100, 12, 6));
    let strength = atkinsonStrength / 100;

    function diffuse(ch) {
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let i = rx + ry * regionW;
                let old = ch[i];
                let nv = old > thresh ? 255 : 0;
                ch[i] = nv;
                let err = (old - nv) / errDiv;
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
    }

    if (atkinsonColorMode === 'bw') {
        let gray = new Float32Array(regionW * regionH);
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                gray[rx + ry * regionW] = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            }
        }
        diffuse(gray);
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                let val = Math.max(0, Math.min(255, Math.round(gray[rx + ry * regionW])));
                pixels[idx] = Math.round(pixels[idx]*(1-strength) + val*strength);
                pixels[idx+1] = Math.round(pixels[idx+1]*(1-strength) + val*strength);
                pixels[idx+2] = Math.round(pixels[idx+2]*(1-strength) + val*strength);
            }
        }
    } else {
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
        [rCh, gCh, bCh].forEach(diffuse);
        for (let ry = 0; ry < regionH; ry++) {
            for (let rx = 0; rx < regionW; rx++) {
                let idx = ((sx + rx) + (sy + ry) * totalW) * 4;
                let i = rx + ry * regionW;
                pixels[idx] = Math.round(pixels[idx]*(1-strength) + Math.max(0,Math.min(255,Math.round(rCh[i])))*strength);
                pixels[idx+1] = Math.round(pixels[idx+1]*(1-strength) + Math.max(0,Math.min(255,Math.round(gCh[i])))*strength);
                pixels[idx+2] = Math.round(pixels[idx+2]*(1-strength) + Math.max(0,Math.min(255,Math.round(bCh[i])))*strength);
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
    // Multi-pass blur based on bloomSpread
    let passes = Math.max(1, Math.round(bloomSpread / 30));
    for (let p = 1; p < passes; p++) {
        let tmp2 = new Float32Array(bright.length);
        for (let y = 0; y < regionH; y++) {
            for (let x = 0; x < regionW; x++) {
                let sr = 0, sg = 0, sb = 0, cnt = 0;
                for (let k = -rad; k <= rad; k++) {
                    let nx = x + k;
                    if (nx >= 0 && nx < regionW) { let bi = (nx + y * regionW) * 3; sr += bright[bi]; sg += bright[bi+1]; sb += bright[bi+2]; cnt++; }
                }
                let bi = (x + y * regionW) * 3;
                tmp2[bi] = sr/cnt; tmp2[bi+1] = sg/cnt; tmp2[bi+2] = sb/cnt;
            }
        }
        for (let y = 0; y < regionH; y++) {
            for (let x = 0; x < regionW; x++) {
                let sr = 0, sg = 0, sb = 0, cnt = 0;
                for (let k = -rad; k <= rad; k++) {
                    let ny = y + k;
                    if (ny >= 0 && ny < regionH) { let bi = (x + ny * regionW) * 3; sr += tmp2[bi]; sg += tmp2[bi+1]; sb += tmp2[bi+2]; cnt++; }
                }
                let bi = (x + y * regionW) * 3;
                bright[bi] = sr/cnt; bright[bi+1] = sg/cnt; bright[bi+2] = sb/cnt;
            }
        }
    }
    // Exposure scaling
    let exposure = bloomExposure / 100;
    // Blend back with selected mode
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let idx = ((sx + x) + (sy + y) * totalW) * 4;
            let bi = (x + y * regionW) * 3;
            let br = bright[bi] * intensity * exposure;
            let bg = bright[bi+1] * intensity * exposure;
            let bb = bright[bi+2] * intensity * exposure;
            let pr = pixels[idx], pg = pixels[idx+1], pb = pixels[idx+2];
            if (bloomBlendMode === 'screen') {
                pixels[idx]   = Math.min(255, Math.round(255 - (255-pr)*(255-br)/255));
                pixels[idx+1] = Math.min(255, Math.round(255 - (255-pg)*(255-bg)/255));
                pixels[idx+2] = Math.min(255, Math.round(255 - (255-pb)*(255-bb)/255));
            } else if (bloomBlendMode === 'softlight') {
                let f = (c, b) => b < 128 ? c - (255 - 2*b) * c * (255 - c) / (255*255) : c + (2*b - 255) * (Math.sqrt(c/255)*255 - c) / 255;
                pixels[idx]   = Math.min(255, Math.max(0, Math.round(f(pr, br))));
                pixels[idx+1] = Math.min(255, Math.max(0, Math.round(f(pg, bg))));
                pixels[idx+2] = Math.min(255, Math.max(0, Math.round(f(pb, bb))));
            } else {
                // Additive (default)
                pixels[idx]   = Math.min(255, pr + br);
                pixels[idx+1] = Math.min(255, pg + bg);
                pixels[idx+2] = Math.min(255, pb + bb);
            }
        }
    }
}

function applyTint() {
    let intensity = tintIntensity / 100;
    let tints = {
        green: [0, 255, 0], amber: [255, 191, 0],
        cyan: [0, 255, 255], blue: [0, 100, 255]
    };
    let tc;
    if (tintPreset === 'custom') {
        let hex = tintCustomColor || '#00ff00';
        tc = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    } else {
        tc = tints[tintPreset] || tints.green;
    }
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
    // Speed throttle: only regenerate every N frames
    let spd = Math.max(1, Math.round((100 - glitchSpeed) / 10));
    if (typeof applyGlitch._frame === 'undefined') applyGlitch._frame = 0;
    applyGlitch._frame++;
    if (applyGlitch._frame % spd !== 0 && applyGlitch._lastPixels) {
        // Reuse last glitch frame
        for (let y = sy; y < ey; y++) {
            let start = (sx + y * totalW) * 4;
            let end = (ex + y * totalW) * 4;
            pixels.set(applyGlitch._lastPixels.subarray(start, end), start);
        }
        return;
    }
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    // Use seed for deterministic randomness if set
    let rng = glitchSeed > 0 ?
        (() => { let s = glitchSeed + applyGlitch._frame; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })() :
        Math.random;
    let chShift = glitchChannelShift / 50; // multiplier
    let blkSz = glitchBlockSize / 50; // multiplier
    let maxShift = Math.round(intensity * 30 * d * chShift);

    if (glitchMode === 'tear') {
        let numTears = Math.floor(freq * 20) + 1;
        for (let t = 0; t < numTears; t++) {
            let tearY = sy + Math.floor(rng() * (ey - sy));
            let tearH = Math.floor(rng() * 12 * d * blkSz) + 2;
            let shift = Math.round((rng() - 0.5) * maxShift * 3);
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
        let numBlocks = Math.floor(freq * 15) + 1;
        for (let b = 0; b < numBlocks; b++) {
            let bx = sx + Math.floor(rng() * (ex - sx));
            let by = sy + Math.floor(rng() * (ey - sy));
            let bw = Math.floor(rng() * maxShift * 2 * blkSz) + 4;
            let bh = Math.floor(rng() * 10 * d * blkSz) + 2;
            let srcOx = Math.round((rng() - 0.5) * maxShift * 4);
            let srcOy = Math.round((rng() - 0.5) * maxShift * 2);
            let swap = Math.floor(rng() * 3);
            for (let dy = 0; dy < bh && (by + dy) < ey; dy++) {
                for (let dx = 0; dx < bw && (bx + dx) < ex; dx++) {
                    let dstIdx = ((bx + dx) + (by + dy) * totalW) * 4;
                    let sX = Math.max(sx, Math.min(ex - 1, bx + dx + srcOx));
                    let sY = Math.max(sy, Math.min(ey - 1, by + dy + srcOy));
                    let srcIdx = (sX + sY * totalW) * 4;
                    if (swap === 1) {
                        pixels[dstIdx] = original[srcIdx+2]; pixels[dstIdx+1] = original[srcIdx+1]; pixels[dstIdx+2] = original[srcIdx];
                    } else if (swap === 2) {
                        pixels[dstIdx] = original[srcIdx+1]; pixels[dstIdx+1] = original[srcIdx]; pixels[dstIdx+2] = original[srcIdx+2];
                    } else {
                        pixels[dstIdx] = original[srcIdx]; pixels[dstIdx+1] = original[srcIdx+1]; pixels[dstIdx+2] = original[srcIdx+2];
                    }
                }
            }
        }
    } else {
        // SHIFT
        for (let y = sy; y < ey; y++) {
            if (rng() > freq) continue;
            let blockH = Math.floor(rng() * 8 * d * blkSz) + 1;
            let rShift = Math.round((rng() - 0.5) * maxShift * 2);
            let bShift = Math.round((rng() - 0.5) * maxShift * 2);
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
    // Cache for speed throttle
    if (!applyGlitch._lastPixels || applyGlitch._lastPixels.length !== pixels.length) {
        applyGlitch._lastPixels = new Uint8Array(pixels.length);
    }
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4;
        let end = (ex + y * totalW) * 4;
        applyGlitch._lastPixels.set(pixels.subarray(start, end), start);
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
    let pal = PALETTES[palettePreset] || PALETTES.noir;
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
// NEW EFFECTS (7) — Thermal, Gradient Map, Duotone, Emboss, RGB Shift, LED, CRT
// ---------------------------------------------------------------------------

function hexToRGBArray(hex) {
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function applyThermal() {
    // Heatmap LUT: blue → cyan → green → yellow → red → white
    const heatmap = [
        [0,0,128],[0,0,255],[0,128,255],[0,255,255],[0,255,128],
        [0,255,0],[128,255,0],[255,255,0],[255,128,0],[255,0,0],[255,255,255]
    ];
    let intensity = thermalIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = (0.299*pixels[idx] + 0.587*pixels[idx+1] + 0.114*pixels[idx+2]) / 255;
            let pos = lum * (heatmap.length - 1);
            let lo = Math.floor(pos), hi = Math.min(heatmap.length-1, lo+1);
            let t = pos - lo;
            let hr = heatmap[lo][0]*(1-t) + heatmap[hi][0]*t;
            let hg = heatmap[lo][1]*(1-t) + heatmap[hi][1]*t;
            let hb = heatmap[lo][2]*(1-t) + heatmap[hi][2]*t;
            pixels[idx]   = Math.round(pixels[idx]*(1-intensity) + hr*intensity);
            pixels[idx+1] = Math.round(pixels[idx+1]*(1-intensity) + hg*intensity);
            pixels[idx+2] = Math.round(pixels[idx+2]*(1-intensity) + hb*intensity);
        }
    }
}

function applyGradientMap() {
    let c1 = hexToRGBArray(gradColor1);
    let c2 = hexToRGBArray(gradColor2);
    let intensity = gradIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = (0.299*pixels[idx] + 0.587*pixels[idx+1] + 0.114*pixels[idx+2]) / 255;
            let mr = c1[0]*(1-lum) + c2[0]*lum;
            let mg = c1[1]*(1-lum) + c2[1]*lum;
            let mb = c1[2]*(1-lum) + c2[2]*lum;
            pixels[idx]   = Math.round(pixels[idx]*(1-intensity) + mr*intensity);
            pixels[idx+1] = Math.round(pixels[idx+1]*(1-intensity) + mg*intensity);
            pixels[idx+2] = Math.round(pixels[idx+2]*(1-intensity) + mb*intensity);
        }
    }
}

function applyDuotone() {
    let s = hexToRGBArray(duoShadow);
    let h = hexToRGBArray(duoHighlight);
    let intensity = duoIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = (0.299*pixels[idx] + 0.587*pixels[idx+1] + 0.114*pixels[idx+2]) / 255;
            let mr = s[0]*(1-lum) + h[0]*lum;
            let mg = s[1]*(1-lum) + h[1]*lum;
            let mb = s[2]*(1-lum) + h[2]*lum;
            pixels[idx]   = Math.round(pixels[idx]*(1-intensity) + mr*intensity);
            pixels[idx+1] = Math.round(pixels[idx+1]*(1-intensity) + mg*intensity);
            pixels[idx+2] = Math.round(pixels[idx+2]*(1-intensity) + mb*intensity);
        }
    }
}

function applyEmboss() {
    let angleRad = embossAngle * Math.PI / 180;
    let strength = embossStrength / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let dx = Math.round(Math.cos(angleRad));
    let dy = Math.round(Math.sin(angleRad));
    // Work on a copy
    let regionW = ex - sx, regionH = ey - sy;
    let buf = new Uint8Array(regionW * regionH * 3);
    for (let ry = 0; ry < regionH; ry++) {
        for (let rx = 0; rx < regionW; rx++) {
            let idx = ((sx+rx) + (sy+ry) * totalW) * 4;
            let bi = (rx + ry * regionW) * 3;
            buf[bi] = pixels[idx]; buf[bi+1] = pixels[idx+1]; buf[bi+2] = pixels[idx+2];
        }
    }
    for (let ry = 1; ry < regionH-1; ry++) {
        for (let rx = 1; rx < regionW-1; rx++) {
            let idx = ((sx+rx) + (sy+ry) * totalW) * 4;
            let bi1 = ((rx+dx) + (ry+dy) * regionW) * 3;
            let bi2 = ((rx-dx) + (ry-dy) * regionW) * 3;
            let er = buf[bi1] - buf[bi2] + 128;
            let eg = buf[bi1+1] - buf[bi2+1] + 128;
            let eb = buf[bi1+2] - buf[bi2+2] + 128;
            pixels[idx]   = Math.round(pixels[idx]*(1-strength) + Math.max(0,Math.min(255,er))*strength);
            pixels[idx+1] = Math.round(pixels[idx+1]*(1-strength) + Math.max(0,Math.min(255,eg))*strength);
            pixels[idx+2] = Math.round(pixels[idx+2]*(1-strength) + Math.max(0,Math.min(255,eb))*strength);
        }
    }
}

function applyRGBShift() {
    let intensity = rgbShiftIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let rxOff = Math.round(rgbShiftRX * d * intensity);
    let ryOff = Math.round(rgbShiftRY * d * intensity);
    let bxOff = Math.round(rgbShiftBX * d * intensity);
    let byOff = Math.round(rgbShiftBY * d * intensity);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            // Red channel offset
            let rsx = Math.max(sx, Math.min(ex-1, x + rxOff));
            let rsy = Math.max(sy, Math.min(ey-1, y + ryOff));
            pixels[idx] = original[(rsx + rsy * totalW) * 4];
            // Green stays
            // Blue channel offset
            let bsx = Math.max(sx, Math.min(ex-1, x + bxOff));
            let bsy = Math.max(sy, Math.min(ey-1, y + byOff));
            pixels[idx+2] = original[(bsx + bsy * totalW) * 4 + 2];
        }
    }
}

function applyLED() {
    let cellSz = Math.max(3, ledCellSize);
    let gap = Math.max(1, ledGap);
    let glowR = ledGlow / 100;
    let brightness = ledBrightness / 100;
    let d = pixelDensity();

    push();
    drawingContext.save();
    rectMode(CORNER);
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();

    // Black background
    fill(0);
    noStroke();
    rect(videoX, videoY, videoW, videoH);

    if (glowR > 0) {
        drawingContext.shadowBlur = cellSz * glowR * 0.5;
    }

    for (let y = Math.floor(videoY); y < videoY + videoH; y += cellSz + gap) {
        for (let x = Math.floor(videoX); x < videoX + videoW; x += cellSz + gap) {
            let px = Math.floor((x + cellSz/2) * d);
            let py = Math.floor((y + cellSz/2) * d);
            let idx = (px + py * width * d) * 4;
            if (idx < 0 || idx >= pixels.length - 3) continue;
            let r = Math.min(255, pixels[idx] * brightness);
            let g = Math.min(255, pixels[idx+1] * brightness);
            let b = Math.min(255, pixels[idx+2] * brightness);
            let c = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
            drawingContext.fillStyle = c;
            if (glowR > 0) drawingContext.shadowColor = c;
            drawingContext.beginPath();
            drawingContext.roundRect(x, y, cellSz, cellSz, cellSz * 0.15);
            drawingContext.fill();
        }
    }
    drawingContext.shadowBlur = 0;
    drawingContext.restore();
    pop();
}

function applyCRT() {
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);

    // Chromatic aberration on pixels
    if (crtChroma > 0) {
        let chrOff = Math.round(crtChroma * d);
        let original = new Uint8Array(pixels.length);
        for (let y = sy; y < ey; y++) {
            let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
            original.set(pixels.subarray(start, end), start);
        }
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + y * totalW) * 4;
                let rSrc = Math.max(sx, Math.min(ex-1, x + chrOff));
                let bSrc = Math.max(sx, Math.min(ex-1, x - chrOff));
                pixels[idx] = original[(rSrc + y * totalW) * 4];
                pixels[idx+2] = original[(bSrc + y * totalW) * 4 + 2];
            }
        }
    }

    // Static noise overlay
    if (crtStatic > 0) {
        let noiseAmt = crtStatic / 100;
        for (let y = sy; y < ey; y += 2) {
            for (let x = sx; x < ex; x += 2) {
                if (Math.random() > noiseAmt * 0.3) continue;
                let idx = (x + y * totalW) * 4;
                let n = Math.round(Math.random() * 60 * noiseAmt);
                pixels[idx] = Math.min(255, pixels[idx] + n);
                pixels[idx+1] = Math.min(255, pixels[idx+1] + n);
                pixels[idx+2] = Math.min(255, pixels[idx+2] + n);
            }
        }
    }

    // Draw-phase: scanlines + glow + curvature vignette
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();

    // Scanlines
    let scanWeight = crtScanWeight;
    let lineH = Math.max(2, scanWeight + 1);
    drawingContext.fillStyle = `rgba(0,0,0,${0.15 * scanWeight})`;
    for (let y = videoY; y < videoY + videoH; y += lineH) {
        drawingContext.fillRect(videoX, y, videoW, Math.max(1, scanWeight * 0.5));
    }

    // Phosphor glow (subtle RGB sub-pixel simulation)
    if (crtGlow > 20) {
        drawingContext.globalCompositeOperation = 'lighter';
        drawingContext.globalAlpha = (crtGlow / 100) * 0.08;
        drawingContext.filter = `blur(${Math.round(crtGlow/30)}px)`;
        drawingContext.drawImage(drawingContext.canvas, videoX, videoY, videoW, videoH, videoX, videoY, videoW, videoH);
        drawingContext.filter = 'none';
        drawingContext.globalCompositeOperation = 'source-over';
        drawingContext.globalAlpha = 1;
    }

    // Barrel curvature vignette
    if (crtCurvature > 5) {
        let curv = crtCurvature / 100;
        let grad = drawingContext.createRadialGradient(
            videoX + videoW/2, videoY + videoH/2, Math.min(videoW, videoH) * 0.3,
            videoX + videoW/2, videoY + videoH/2, Math.max(videoW, videoH) * (0.55 + curv * 0.2)
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.7, `rgba(0,0,0,${curv * 0.3})`);
        grad.addColorStop(1, `rgba(0,0,0,${curv * 0.8})`);
        drawingContext.fillStyle = grad;
        drawingContext.fillRect(videoX, videoY, videoW, videoH);
    }

    drawingContext.restore();
    pop();
}

// ---------------------------------------------------------------------------
// Randomize / Reset helpers
// ---------------------------------------------------------------------------
function randomizeEffect(effectName) {
    let params = FX_PARAM_MAP[effectName];
    let defaults = FX_DEFAULTS[effectName];
    if (!params || !defaults) return;
    params.forEach(p => {
        let def = defaults[p.v];
        if (def === undefined) return;
        let val;
        if (typeof def === 'boolean') {
            val = Math.random() > 0.5;
        } else if (typeof def === 'string') {
            if (def.startsWith('#')) {
                // Random color
                val = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
            } else {
                // Enum — pick from known options based on DOM buttons
                let btns = document.querySelectorAll(`[data-effect="${effectName}"] .selector-btn, #fx-params-${effectName} .selector-btn, #fx-params-${effectName} .fx-shape-btn`);
                if (btns.length > 0) {
                    let options = Array.from(btns).map(b => b.dataset.value).filter(Boolean);
                    val = options[Math.floor(Math.random() * options.length)] || def;
                } else val = def;
            }
        } else {
            // Number — find slider to get min/max
            let sl = document.querySelector(`#fx-params-${effectName} input[type="range"]`);
            // Find the specific slider for this param
            let allSliders = document.querySelectorAll(`#fx-params-${effectName} input[type="range"]`);
            let matched = null;
            allSliders.forEach(s => {
                if (s.id && s.id.includes(p.v.replace(/([A-Z])/g, '-$1').toLowerCase())) matched = s;
            });
            if (matched) {
                let min = parseFloat(matched.min), max = parseFloat(matched.max);
                val = min + Math.random() * (max - min);
                val = parseFloat(matched.step) < 1 ? Math.round(val * 10) / 10 : Math.round(val);
            } else {
                val = def * (0.5 + Math.random());
            }
        }
        p.s(val);
    });
    syncFxControlsForEffect(effectName);
}

function resetEffect(effectName) {
    let params = FX_PARAM_MAP[effectName];
    let defaults = FX_DEFAULTS[effectName];
    if (!params || !defaults) return;
    params.forEach(p => {
        if (defaults[p.v] !== undefined) p.s(defaults[p.v]);
    });
    syncFxControlsForEffect(effectName);
}

function syncFxControlsForEffect(effectName) {
    let group = document.getElementById('fx-params-' + effectName);
    if (!group) return;
    let params = FX_PARAM_MAP[effectName];
    if (!params) return;
    params.forEach(p => {
        let val = p.g();
        // Sync sliders
        group.querySelectorAll('input[type="range"]').forEach(sl => {
            if (sl.id && sl.id.includes(p.v.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''))) {
                sl.value = val;
            }
        });
        // Sync number inputs
        group.querySelectorAll('input[type="number"]').forEach(inp => {
            if (inp.id && inp.id.includes(p.v.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''))) {
                inp.value = val;
            }
        });
        // Sync color pickers
        group.querySelectorAll('input[type="color"]').forEach(cp => {
            if (cp.id && cp.id.includes(p.v.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''))) {
                cp.value = val;
            }
        });
        // Sync hex inputs
        group.querySelectorAll('.fx-hex-input').forEach(hi => {
            if (hi.id && hi.id.includes(p.v.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''))) {
                hi.value = val;
            }
        });
        // Sync selector buttons
        if (typeof val === 'string' && !val.startsWith('#')) {
            group.querySelectorAll('.selector-btn, .fx-shape-btn').forEach(btn => {
                if (btn.parentElement && btn.dataset.value === val) {
                    btn.parentElement.querySelectorAll('.selector-btn, .fx-shape-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }
        // Sync toggle switches
        if (typeof val === 'boolean') {
            group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = val;
            });
        }
    });
}

// ---------------------------------------------------------------------------
// buildFxPanel() — JS-generate the Effecto-style FX panel
// ---------------------------------------------------------------------------
function buildFxPanel() {
    const cats = ['color','distortion','pattern','overlay'];
    const catLabels = {color:'Color',distortion:'Distort',pattern:'Pattern',overlay:'Overlay'};

    // ── TAB BAR ──
    let tabBar = document.getElementById('fx-cat-tabs');
    tabBar.className = 'fx-tab-bar';
    cats.forEach(cat => {
        let btn = document.createElement('button');
        btn.className = 'fx-tab' + (cat === currentFxCat ? ' active' : '');
        btn.dataset.cat = cat;
        btn.style.setProperty('--tab-color', FX_CAT_COLORS[cat]);
        btn.innerHTML = `<span class="tab-dot"></span>${catLabels[cat]}<span class="tab-count"></span>`;
        btn.addEventListener('click', () => switchFxCategory(cat));
        tabBar.appendChild(btn);
    });

    // ── DROPDOWN ROW ──
    let selRow = document.getElementById('fx-selector-row');
    selRow.className = 'fx-dropdown-row';
    let arrowL = document.createElement('button');
    arrowL.className = 'fx-dropdown-arrow';
    arrowL.textContent = '\u2039';
    arrowL.title = 'Previous effect';
    arrowL.addEventListener('click', () => cycleFxEffect(-1));
    let sel = document.createElement('select');
    sel.id = 'fx-effect-select';
    sel.className = 'fx-dropdown-select';
    sel.addEventListener('change', () => selectFxEffect(sel.value));
    let arrowR = document.createElement('button');
    arrowR.className = 'fx-dropdown-arrow';
    arrowR.textContent = '\u203A';
    arrowR.title = 'Next effect';
    arrowR.addEventListener('click', () => cycleFxEffect(1));
    let onBtn = document.createElement('button');
    onBtn.className = 'fx-on-btn';
    onBtn.id = 'fx-on-btn';
    onBtn.textContent = 'ON';
    onBtn.title = 'Toggle effect on/off';
    onBtn.addEventListener('click', () => toggleCurrentFxEffect());
    let dragH = document.createElement('div');
    dragH.className = 'fx-drag-handle';
    dragH.title = 'Drag to timeline';
    dragH.innerHTML = '&#x2630;';
    dragH.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !currentViewedEffect) return;
        fxDragState = {
            effect: currentViewedEffect,
            cat: FX_CATEGORIES[currentViewedEffect],
            startX: e.clientX,
            startY: e.clientY,
            dragging: false
        };
    });
    selRow.append(arrowL, sel, arrowR, onBtn, dragH);

    // ── PARAM GROUPS (generate all, show one at a time) ──
    let container = document.getElementById('fx-params-container');
    for (let [effectName, cfg] of Object.entries(FX_UI_CONFIG)) {
        let group = document.createElement('div');
        group.className = 'fx-param-group';
        group.id = 'fx-params-' + effectName;

        // Header with randomize/reset
        if (cfg.hasRandomize) {
            let hdr = document.createElement('div');
            hdr.className = 'fx-param-header';
            hdr.innerHTML = `<span class="fx-param-title">${cfg.label}</span>` +
                `<button class="fx-action-btn" data-action="randomize" data-effect="${effectName}" title="Randomize">&#x1F3B2;</button>` +
                `<button class="fx-action-btn" data-action="reset" data-effect="${effectName}" title="Reset">&#x21BB;</button>`;
            group.appendChild(hdr);
        }

        // Controls
        cfg.controls.forEach(ctrl => {
            if (ctrl.type === 'slider') {
                let row = document.createElement('div');
                row.className = 'fx-inline-slider';
                row.innerHTML = `<span class="fx-slider-label">${ctrl.label}</span>` +
                    `<input type="range" id="${ctrl.sid}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${ctrl.min}">` +
                    `<input type="number" class="value-input" id="${ctrl.vid}" value="${ctrl.min}">`;
                group.appendChild(row);
            } else if (ctrl.type === 'selector') {
                let lbl = document.createElement('label');
                lbl.textContent = ctrl.label;
                lbl.style.fontSize = '9px';
                lbl.style.fontWeight = '600';
                lbl.style.color = 'var(--text-muted)';
                lbl.style.marginTop = '4px';
                lbl.style.display = 'block';
                group.appendChild(lbl);
                let row = document.createElement('div');
                row.className = 'selector-row';
                row.id = ctrl.cid;
                ctrl.opts.forEach((opt, i) => {
                    let btn = document.createElement('button');
                    btn.className = 'selector-btn' + (i === 0 ? ' active' : '');
                    btn.dataset.value = opt.v;
                    btn.textContent = opt.l;
                    row.appendChild(btn);
                });
                group.appendChild(row);
            } else if (ctrl.type === 'color') {
                let lbl = document.createElement('label');
                lbl.textContent = ctrl.label;
                lbl.style.fontSize = '9px';
                lbl.style.fontWeight = '600';
                lbl.style.color = 'var(--text-muted)';
                lbl.style.marginTop = '4px';
                lbl.style.display = 'block';
                group.appendChild(lbl);
                let picker = document.createElement('div');
                picker.className = 'fx-color-picker';
                let defColor = '#000000';
                // Find default from FX_DEFAULTS
                let defs = FX_DEFAULTS[effectName];
                if (defs) {
                    for (let k of Object.keys(defs)) {
                        if (typeof defs[k] === 'string' && defs[k].startsWith('#') &&
                            k.toLowerCase().includes(ctrl.cid.split('-').pop().replace('color',''))) {
                            defColor = defs[k]; break;
                        }
                    }
                    // Fallback: match by order
                    if (defColor === '#000000') {
                        let colorKeys = Object.keys(defs).filter(k => typeof defs[k] === 'string' && defs[k].startsWith('#'));
                        let colorIdx = cfg.controls.filter(c => c.type === 'color').indexOf(ctrl);
                        if (colorKeys[colorIdx]) defColor = defs[colorKeys[colorIdx]];
                    }
                }
                picker.innerHTML = `<input type="color" class="fx-color-input" id="${ctrl.cid}" value="${defColor}">` +
                    `<input type="text" class="fx-hex-input" id="${ctrl.hid}" value="${defColor}" maxlength="7">`;
                group.appendChild(picker);
            } else if (ctrl.type === 'shape') {
                let lbl = document.createElement('label');
                lbl.textContent = ctrl.label;
                lbl.style.cssText = 'font-size:9px;font-weight:600;color:var(--text-muted);margin-top:4px;display:block';
                group.appendChild(lbl);
                let row = document.createElement('div');
                row.className = 'fx-shape-selector';
                row.id = ctrl.cid;
                ctrl.opts.forEach((opt, i) => {
                    let btn = document.createElement('button');
                    btn.className = 'fx-shape-btn' + (i === 0 ? ' active' : '');
                    btn.dataset.value = opt.v;
                    btn.title = opt.t;
                    btn.textContent = opt.icon;
                    row.appendChild(btn);
                });
                group.appendChild(row);
            } else if (ctrl.type === 'swatch') {
                let lbl = document.createElement('label');
                lbl.textContent = ctrl.label;
                lbl.style.cssText = 'font-size:9px;font-weight:600;color:var(--text-muted);margin-top:4px;display:block';
                group.appendChild(lbl);
                let grid = document.createElement('div');
                grid.className = 'fx-swatch-grid';
                grid.id = ctrl.cid;
                ctrl.swatches.forEach((sw, i) => {
                    let div = document.createElement('div');
                    div.className = 'fx-swatch' + (i === 0 ? ' active' : '');
                    div.dataset.ink = sw.ink;
                    div.dataset.paper = sw.paper;
                    div.title = sw.t;
                    div.style.background = `linear-gradient(135deg,${sw.ink} 50%,${sw.paper} 50%)`;
                    grid.appendChild(div);
                });
                group.appendChild(grid);
            } else if (ctrl.type === 'toggle') {
                let row = document.createElement('div');
                row.className = 'fx-toggle-row';
                row.innerHTML = `<label style="font-size:9px;font-weight:600;color:var(--text-muted)">${ctrl.label}</label>` +
                    `<label class="fx-toggle-switch"><input type="checkbox" id="${ctrl.tid}"><span class="toggle-slider"></span></label>`;
                group.appendChild(row);
            }
        });
        container.appendChild(group);
    }

    // Sync all controls with current global values
    for (let name of Object.keys(FX_UI_CONFIG)) {
        syncFxControlsForEffect(name);
    }

    // Set initial state
    switchFxCategory('color');
}

function switchFxCategory(cat) {
    currentFxCat = cat;
    // Update tab active state
    document.querySelectorAll('.fx-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    // Populate dropdown
    let sel = document.getElementById('fx-effect-select');
    let effects = getEffectsForCategory(cat);
    sel.innerHTML = '';
    effects.forEach(name => {
        let opt = document.createElement('option');
        opt.value = name;
        let cfg = FX_UI_CONFIG[name];
        let prefix = activeEffects.has(name) ? '\u2022 ' : '  ';
        opt.textContent = prefix + (cfg ? cfg.label : name.toUpperCase());
        sel.appendChild(opt);
    });
    // Select first effect or keep current if it's in this category
    if (effects.includes(currentViewedEffect)) {
        sel.value = currentViewedEffect;
    } else {
        currentViewedEffect = effects[0];
        sel.value = effects[0];
    }
    showFxParams(currentViewedEffect);
    updateFxOnButton();
}

function selectFxEffect(name) {
    currentViewedEffect = name;
    showFxParams(name);
    updateFxOnButton();
}

function cycleFxEffect(dir) {
    let effects = getEffectsForCategory(currentFxCat);
    let idx = effects.indexOf(currentViewedEffect);
    idx = (idx + dir + effects.length) % effects.length;
    currentViewedEffect = effects[idx];
    document.getElementById('fx-effect-select').value = currentViewedEffect;
    showFxParams(currentViewedEffect);
    updateFxOnButton();
}

function toggleCurrentFxEffect() {
    if (!currentViewedEffect) return;
    if (activeEffects.has(currentViewedEffect)) {
        activeEffects.delete(currentViewedEffect);
    } else {
        activeEffects.add(currentViewedEffect);
    }
    updateEffectCardStates();
    updateFxOnButton();
    // Update dropdown marker
    let sel = document.getElementById('fx-effect-select');
    let effects = getEffectsForCategory(currentFxCat);
    effects.forEach(name => {
        let opt = sel.querySelector(`option[value="${name}"]`);
        if (opt) {
            let cfg = FX_UI_CONFIG[name];
            let prefix = activeEffects.has(name) ? '\u2022 ' : '  ';
            opt.textContent = prefix + (cfg ? cfg.label : name.toUpperCase());
        }
    });
}

function showFxParams(effectName) {
    // Hide all param groups, show the selected one
    document.querySelectorAll('#fx-params-container .fx-param-group').forEach(g => {
        g.classList.toggle('visible', g.id === 'fx-params-' + effectName);
    });
}

function updateFxOnButton() {
    let btn = document.getElementById('fx-on-btn');
    if (!btn || !currentViewedEffect) return;
    let isActive = activeEffects.has(currentViewedEffect);
    btn.classList.toggle('active', isActive);
    btn.textContent = isActive ? 'ON' : 'OFF';
    let catColor = FX_CAT_COLORS[FX_CATEGORIES[currentViewedEffect]] || '#6C5CE7';
    btn.style.setProperty('--cat-color', catColor);
}

// ---------------------------------------------------------------------------
// setupFxUIListeners() — Effecto-style panel build + event wiring
// ---------------------------------------------------------------------------
function setupFxUIListeners() {

    function wireSlider(sliderId, inputId, setter) {
        let sl = document.getElementById(sliderId);
        let inp = document.getElementById(inputId);
        if (!sl || !inp) return;
        sl.addEventListener('input', (e) => { let v = parseFloat(e.target.value); setter(v); inp.value = v; });
        inp.addEventListener('change', (e) => {
            let v = parseFloat(e.target.value) || 0;
            v = Math.max(parseFloat(sl.min), Math.min(parseFloat(sl.max), v));
            setter(v); sl.value = v; e.target.value = v; e.target.blur();
        });
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); });
    }

    function wireColorPicker(colorId, hexId, setter) {
        let cp = document.getElementById(colorId);
        let hi = document.getElementById(hexId);
        if (!cp || !hi) return;
        cp.addEventListener('input', (e) => { setter(e.target.value); hi.value = e.target.value; });
        hi.addEventListener('change', (e) => {
            let v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) { setter(v); cp.value = v; }
            else { e.target.value = cp.value; }
        });
        hi.addEventListener('keydown', e => e.stopPropagation());
    }

    function wireSelector(containerId, setter) {
        document.querySelectorAll('#' + containerId + ' .selector-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                setter(e.target.dataset.value);
                document.querySelectorAll('#' + containerId + ' .selector-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    }

    function wireShapeSelector(containerId, setter) {
        document.querySelectorAll('#' + containerId + ' .fx-shape-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                setter(e.currentTarget.dataset.value);
                document.querySelectorAll('#' + containerId + ' .fx-shape-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });
    }

    // ── BUILD THE PANEL ──
    buildFxPanel();

    // ── WIRE ALL CONTROLS FROM FX_UI_CONFIG ──
    for (let [effectName, cfg] of Object.entries(FX_UI_CONFIG)) {
        cfg.controls.forEach(ctrl => {
            if (ctrl.type === 'slider') {
                wireSlider(ctrl.sid, ctrl.vid, ctrl.setter);
            } else if (ctrl.type === 'color') {
                wireColorPicker(ctrl.cid, ctrl.hid, ctrl.setter);
            } else if (ctrl.type === 'selector') {
                wireSelector(ctrl.cid, ctrl.setter);
            } else if (ctrl.type === 'shape') {
                wireShapeSelector(ctrl.cid, ctrl.setter);
            } else if (ctrl.type === 'toggle') {
                let cb = document.getElementById(ctrl.tid);
                if (cb) cb.addEventListener('change', e => ctrl.setter(e.target.checked));
            }
        });
    }

    // ── SWATCH GRIDS ──
    // Halftone presets (special: sets ink + paper colors)
    document.querySelectorAll('#half-presets .fx-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            halfInkColor = sw.dataset.ink || '#000000';
            halfPaperColor = sw.dataset.paper || '#ffffff';
            let ci = document.getElementById('half-ink-color');
            let ch = document.getElementById('half-ink-hex');
            let pi = document.getElementById('half-paper-color');
            let ph = document.getElementById('half-paper-hex');
            if (ci) ci.value = halfInkColor;
            if (ch) ch.value = halfInkColor;
            if (pi) pi.value = halfPaperColor;
            if (ph) ph.value = halfPaperColor;
            document.querySelectorAll('#half-presets .fx-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
        });
    });

    // ── DRAG TO TIMELINE (mousemove/mouseup — same as before) ──
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
            // Click on drag handle without dragging — no-op (toggle is via ON/OFF btn)
        }
        fxDragState = null;
    });

    // ── RANDOMIZE / RESET BUTTONS ──
    document.querySelectorAll('.fx-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let effect = btn.dataset.effect;
            if (btn.dataset.action === 'randomize') randomizeEffect(effect);
            else if (btn.dataset.action === 'reset') resetEffect(effect);
        });
    });

    // ── MASTER FX TOGGLE ──
    let masterToggle = document.getElementById('master-fx-toggle');
    if (masterToggle) masterToggle.addEventListener('change', e => masterFxEnabled = e.target.checked);
}
