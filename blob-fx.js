// ============================================================================
// blob-fx.js — Visual Effects Module for BlobFX
// ============================================================================
// Contains all 30 visual effect functions, the batched pixel pipeline
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
    pixel: ['sepia','tint','palette','gradmap','duotone','thermal','bricon',
        'threshold','exposure','colortemp','rgbgain','levels','colorbal','colmatrix',
        'emboss','chroma','rgbshift','curve','wave','jitter','mblur',
        'blursharp','modulate','ripple','swirl','reedglass','polar2rect','rect2polar','radblur','zoomblur','circblur','elgrid',
        'bloom','dither','atkinson','pxsort','pixel',
        'y2kblue',
        'glitch','noise','grain','crt',
        'ntsc','paperscan','xerox','grunge'],
    hybrid: ['halftone','ascii','dots','led','printstamp'],
    draw: ['grid','scanlines','vignette','stripe']
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

    // Color tier
    if (activeEffects.has('sepia')) applySepia();
    if (activeEffects.has('tint')) applyTint();
    if (activeEffects.has('palette')) applyPalette();
    if (activeEffects.has('gradmap')) applyGradientMap();
    if (activeEffects.has('duotone')) applyDuotone();
    if (activeEffects.has('thermal')) applyThermal();
    if (activeEffects.has('bricon')) applyBriCon();
    if (activeEffects.has('threshold')) applyThreshold();
    if (activeEffects.has('exposure')) applyExposure();
    if (activeEffects.has('colortemp')) applyColorTemp();
    if (activeEffects.has('rgbgain')) applyRGBGain();
    if (activeEffects.has('levels')) applyLevels();
    if (activeEffects.has('colorbal')) applyColorBalance();
    if (activeEffects.has('colmatrix')) applyColorMatrix();
    // Distortion tier
    if (activeEffects.has('emboss')) applyEmboss();
    if (activeEffects.has('chroma')) applyChromatic();
    if (activeEffects.has('rgbshift')) applyRGBShift();
    if (activeEffects.has('curve')) applyCurve();
    if (activeEffects.has('wave')) applyWave();
    if (activeEffects.has('jitter')) applyJitter();
    if (activeEffects.has('mblur')) applyMblur();
    if (activeEffects.has('blursharp')) applyBlurSharp();
    if (activeEffects.has('modulate')) applyModulate();
    if (activeEffects.has('ripple')) applyRipple();
    if (activeEffects.has('swirl')) applySwirl();
    if (activeEffects.has('reedglass')) applyReedGlass();
    if (activeEffects.has('polar2rect')) applyPolar2Rect();
    if (activeEffects.has('rect2polar')) applyRect2Polar();
    if (activeEffects.has('radblur')) applyRadialBlur();
    if (activeEffects.has('zoomblur')) applyZoomBlur();
    if (activeEffects.has('circblur')) applyCircBlur();
    if (activeEffects.has('elgrid')) applyElasticGrid();
    // Pattern tier
    if (activeEffects.has('bloom')) applyBloom();
    if (activeEffects.has('dither')) applyDithering();
    if (activeEffects.has('atkinson')) applyAtkinson();
    if (activeEffects.has('pxsort')) applyPixelSort();
    if (activeEffects.has('pixel')) applyPixelate();
    if (activeEffects.has('y2kblue')) applyY2KBlue();
    // Overlay tier (pixel)
    if (activeEffects.has('glitch')) applyGlitch();
    if (activeEffects.has('noise')) applyNoise();
    if (activeEffects.has('grain')) applyGrain();
    if (activeEffects.has('crt')) applyCRT();
    if (activeEffects.has('ntsc')) applyNTSC();
    if (activeEffects.has('paperscan')) applyPaperScan();
    if (activeEffects.has('xerox')) applyXerox();
    if (activeEffects.has('grunge')) applyGrunge();

    // Commit pixel changes before hybrid/draw effects
    if (hasPixel || hasHybrid) updatePixels();

    // Hybrid effects (read pixels then draw shapes)
    if (activeEffects.has('halftone')) applyHalftone();
    if (activeEffects.has('ascii')) applyASCII();
    if (activeEffects.has('dots')) applyDots();
    if (activeEffects.has('led')) applyLED();
    if (activeEffects.has('printstamp')) applyPrintStamp();

    // Draw-only effects (no pixel access needed)
    if (activeEffects.has('grid')) applyGrid();
    if (activeEffects.has('scanlines')) applyScanlines();
    if (activeEffects.has('vignette')) applyVignette();
    if (activeEffects.has('stripe')) applyStripe();
}

// Apply a single named effect (used by split view dual FX)
function applySingleEffect(name) {
    if (!name || !EFFECT_FN_MAP[name]) return;
    let isPixel = EFFECT_TYPES.pixel.includes(name);
    let isHybrid = EFFECT_TYPES.hybrid.includes(name);
    if (isPixel) {
        loadPixels();
        EFFECT_FN_MAP[name]();
        updatePixels();
    } else if (isHybrid) {
        loadPixels();
        EFFECT_FN_MAP[name]();
        // No updatePixels — hybrid effects draw shapes directly
    } else {
        // Draw-only effects
        EFFECT_FN_MAP[name]();
    }
}

// ---------------------------------------------------------------------------
// Effect functions (30 total)
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
    if (chromaMode === 'radial') {
        // Radial aberration: offset channels radially from center
        let cx = (sx + ex) / 2, cy = (sy + ey) / 2;
        let maxDist = Math.sqrt((ex-sx)*(ex-sx) + (ey-sy)*(ey-sy)) / 2;
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + y * totalW) * 4;
                let dx = x - cx, dy = y - cy;
                let dist = Math.sqrt(dx*dx + dy*dy);
                let angle = Math.atan2(dy, dx);
                let radOff = (dist / maxDist) * offset;
                // Red: sample outward
                let rrx = Math.max(sx, Math.min(ex-1, Math.round(x + Math.cos(angle) * radOff)));
                let rry = Math.max(sy, Math.min(ey-1, Math.round(y + Math.sin(angle) * radOff)));
                pixels[idx] = original[(rrx + rry * totalW) * 4];
                // Green: keep
                pixels[idx + 1] = original[idx + 1];
                // Blue: sample inward
                let brx = Math.max(sx, Math.min(ex-1, Math.round(x - Math.cos(angle) * radOff)));
                let bry = Math.max(sy, Math.min(ey-1, Math.round(y - Math.sin(angle) * radOff)));
                pixels[idx + 2] = original[(brx + bry * totalW) * 4 + 2];
            }
        }
    } else {
        // Linear aberration (default)
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
    push();
    stroke(0, intensity * 255);
    strokeWeight(1);
    if (scanVertical) {
        let lineSpacing = Math.max(1, Math.round(videoW / scanCount));
        for (let x = Math.floor(videoX); x < videoX + videoW; x += lineSpacing) {
            line(x, videoY, x, videoY + videoH);
        }
    } else {
        let lineSpacing = Math.max(1, Math.round(videoH / scanCount));
        for (let y = Math.floor(videoY); y < videoY + videoH; y += lineSpacing) {
            line(videoX, y, videoX + videoW, y);
        }
    }
    pop();
}

function applyVignette() {
    let intensity = vigIntensity / 100;
    let radius = vigRadius / 100;
    let cx = videoX + videoW / 2;
    let cy = videoY + videoH / 2;
    let maxDim = Math.max(videoW, videoH);
    // Parse vignette color
    let vc = hexToRGBArray(vigColor || '#000000');
    push();
    noStroke();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();
    let outerR = maxDim * map(vigRadius, 20, 100, 0.45, 0.85);
    let grad = drawingContext.createRadialGradient(cx, cy, maxDim * radius * 0.4, cx, cy, outerR);
    grad.addColorStop(0, `rgba(${vc[0]},${vc[1]},${vc[2]},0)`);
    grad.addColorStop(1, `rgba(${vc[0]},${vc[1]},${vc[2]},${intensity})`);
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
    let isAnamorphic = bloomAnamorphic;
    // Horizontal pass
    for (let y = 0; y < regionH; y++) {
        for (let x = 0; x < regionW; x++) {
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            let hRad = isAnamorphic ? rad * 3 : rad; // Wider horizontal blur for anamorphic
            for (let k = -hRad; k <= hRad; k++) {
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
    // Vertical pass (skip if anamorphic — horizontal-only light streaks)
    if (!isAnamorphic) {
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
    } else {
        // For anamorphic, copy horizontal result back to bright
        bright.set(tmp);
    }
    // Multi-pass blur based on bloomSpread
    let passes = Math.max(1, Math.round(bloomSpread / 30));
    for (let p = 1; p < passes; p++) {
        let tmp2 = new Float32Array(bright.length);
        let hRad2 = isAnamorphic ? rad * 3 : rad;
        for (let y = 0; y < regionH; y++) {
            for (let x = 0; x < regionW; x++) {
                let sr = 0, sg = 0, sb = 0, cnt = 0;
                for (let k = -hRad2; k <= hRad2; k++) {
                    let nx = x + k;
                    if (nx >= 0 && nx < regionW) { let bi = (nx + y * regionW) * 3; sr += bright[bi]; sg += bright[bi+1]; sb += bright[bi+2]; cnt++; }
                }
                let bi = (x + y * regionW) * 3;
                tmp2[bi] = sr/cnt; tmp2[bi+1] = sg/cnt; tmp2[bi+2] = sb/cnt;
            }
        }
        if (!isAnamorphic) {
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
        } else {
            bright.set(tmp2);
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
            // Warmth adjustment
            let w = sepiaWarmth;
            if (w !== 0) { sr = Math.min(255, sr + w * 0.5); sg = Math.min(255, sg + w * 0.2); sb = Math.max(0, sb - w * 0.3); }
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
    if (pixelMode === 'hex') {
        // Hexagonal grid pixelation
        let hexW = szD * 1.5;
        let hexH = szD * Math.sqrt(3);
        let halfH = hexH / 2;
        for (let row = 0; row * halfH + sy < ey; row++) {
            let yOff = row * halfH + sy;
            let xShift = (row % 2) * (hexW / 2);
            for (let col = 0; col * hexW + sx + xShift < ex; col++) {
                let xOff = col * hexW + sx + xShift;
                let cxH = Math.round(xOff + hexW/2);
                let cyH = Math.round(yOff + halfH/2);
                // Sample center pixel
                cxH = Math.max(sx, Math.min(ex-1, cxH));
                cyH = Math.max(sy, Math.min(ey-1, cyH));
                let sIdx = (cxH + cyH * totalW) * 4;
                let sr = pixels[sIdx], sg = pixels[sIdx+1], sb = pixels[sIdx+2];
                // Fill hex region (approximate with rect for speed)
                let x0 = Math.max(sx, Math.round(xOff));
                let y0 = Math.max(sy, Math.round(yOff));
                let x1 = Math.min(ex, Math.round(xOff + hexW));
                let y1 = Math.min(ey, Math.round(yOff + halfH));
                for (let py = y0; py < y1; py++) {
                    for (let px = x0; px < x1; px++) {
                        let idx = (px + py * totalW) * 4;
                        pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                    }
                }
            }
        }
    } else {
        // Square grid (default)
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
}

function applyWave() {
    let amp = waveAmp * 0.5;
    let freq = waveFreq;
    let spd = waveSpeed;
    let mode = waveMode;
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
    if (mode === 'circular') {
        let cx = (sx + ex) / 2, cy = (sy + ey) / 2;
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let dx = x - cx, dy = y - cy;
                let dist = Math.sqrt(dx*dx + dy*dy);
                let wave = Math.sin(dist * freq * 0.05 + t) * amp * d;
                let angle = Math.atan2(dy, dx);
                let srcX = Math.max(sx, Math.min(ex - 1, Math.round(x + Math.cos(angle) * wave)));
                let srcY = Math.max(sy, Math.min(ey - 1, Math.round(y + Math.sin(angle) * wave)));
                let dstIdx = (x + y * totalW) * 4;
                let srcIdx = (srcX + srcY * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            }
        }
    } else if (mode === 'vertical') {
        for (let x = sx; x < ex; x++) {
            let offset = Math.round(Math.sin((x / d) * freq * 0.05 + t) * amp * d);
            for (let y = sy; y < ey; y++) {
                let srcY = Math.max(sy, Math.min(ey - 1, y + offset));
                let dstIdx = (x + y * totalW) * 4;
                let srcIdx = (x + srcY * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            }
        }
    } else {
        // Horizontal (default)
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
    } else if (glitchMode === 'vhs') {
        // VHS mode: horizontal tracking lines + slight shift + color bleed
        let trackLines = Math.floor(freq * 12) + 2;
        let bleedOff = Math.round(maxShift * 0.3);
        for (let t = 0; t < trackLines; t++) {
            let lineY = sy + Math.floor(rng() * (ey - sy));
            let lineH = Math.floor(rng() * 6 * d * blkSz) + 1;
            let hShift = Math.round((rng() - 0.5) * maxShift * 1.2);
            for (let dy = 0; dy < lineH && (lineY + dy) < ey; dy++) {
                let row = lineY + dy;
                for (let x = sx; x < ex; x++) {
                    let dstIdx = (x + row * totalW) * 4;
                    let srcX = Math.max(sx, Math.min(ex - 1, x + hShift));
                    let srcIdx = (srcX + row * totalW) * 4;
                    // Horizontal shift with color bleed
                    let rSrc = Math.max(sx, Math.min(ex - 1, srcX + bleedOff));
                    let bSrc = Math.max(sx, Math.min(ex - 1, srcX - bleedOff));
                    pixels[dstIdx]   = original[(rSrc + row * totalW) * 4];
                    pixels[dstIdx+1] = original[srcIdx + 1];
                    pixels[dstIdx+2] = original[(bSrc + row * totalW) * 4 + 2];
                }
            }
        }
        // VHS noise band (thin bright horizontal band)
        let bandY = sy + Math.floor(rng() * (ey - sy));
        let bandH = Math.floor(3 * d);
        for (let dy = 0; dy < bandH && (bandY + dy) < ey; dy++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + (bandY + dy) * totalW) * 4;
                pixels[idx]   = Math.min(255, pixels[idx] + 50);
                pixels[idx+1] = Math.min(255, pixels[idx+1] + 50);
                pixels[idx+2] = Math.min(255, pixels[idx+2] + 50);
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
    if (noiseAlgo === 'simplex') {
        // Use p5.js noise() for smoother, more organic noise
        let t = frameCount * 0.02;
        let noiseScale = 0.02 / sz;
        for (let y = sy; y < ey; y += szD) {
            for (let x = sx; x < ex; x += szD) {
                let nv = noise(x * noiseScale, y * noiseScale, t);
                if (nv < (1 - density * 3)) continue;
                let nr, ng, nb;
                if (noiseColorMode === 'color') {
                    nr = noise(x * noiseScale + 100, y * noiseScale, t) * 255;
                    ng = noise(x * noiseScale, y * noiseScale + 100, t) * 255;
                    nb = noise(x * noiseScale + 200, y * noiseScale + 200, t) * 255;
                } else {
                    nr = ng = nb = nv * 255;
                }
                for (let dy = 0; dy < szD && (y+dy) < ey; dy++) {
                    for (let dx = 0; dx < szD && (x+dx) < ex; dx++) {
                        let idx = ((x+dx) + (y+dy) * totalW) * 4;
                        pixels[idx] = nr; pixels[idx+1] = ng; pixels[idx+2] = nb;
                    }
                }
            }
        }
    } else {
        // Random noise (default)
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
    const thermalPalettes = {
        default: [[0,0,128],[0,0,255],[0,128,255],[0,255,255],[0,255,128],[0,255,0],[128,255,0],[255,255,0],[255,128,0],[255,0,0],[255,255,255]],
        iron: [[0,0,0],[0,0,100],[80,0,120],[160,0,80],[200,50,0],[255,100,0],[255,200,50],[255,255,150],[255,255,255]],
        rainbow: [[0,0,128],[0,0,255],[0,255,255],[0,255,0],[255,255,0],[255,128,0],[255,0,0],[255,0,128]],
        arctic: [[0,20,60],[0,60,120],[40,120,180],[100,180,220],[180,220,240],[220,240,255],[255,255,255]],
        night: [[0,0,0],[0,20,0],[0,50,10],[0,90,20],[10,140,30],[30,200,50],[80,255,80],[180,255,180]]
    };
    let heatmap = thermalPalettes[thermalPalette] || thermalPalettes.default;
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
    let c3 = hexToRGBArray(gradColor3);
    let mid = gradMidpoint / 100;
    let intensity = gradIntensity / 100;
    let d = pixelDensity();
    let totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = (0.299*pixels[idx] + 0.587*pixels[idx+1] + 0.114*pixels[idx+2]) / 255;
            let t;
            let mr, mg, mb;
            if (lum <= mid) {
                t = mid > 0 ? lum / mid : 0;
                mr = c1[0]*(1-t) + c3[0]*t;
                mg = c1[1]*(1-t) + c3[1]*t;
                mb = c1[2]*(1-t) + c3[2]*t;
            } else {
                t = mid < 1 ? (lum - mid) / (1 - mid) : 1;
                mr = c3[0]*(1-t) + c2[0]*t;
                mg = c3[1]*(1-t) + c2[1]*t;
                mb = c3[2]*(1-t) + c2[2]*t;
            }
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
            if (embossColor) {
                // Color preserve: compute emboss as grayscale, blend with original colors
                let eGray = ((buf[bi1] - buf[bi2]) + (buf[bi1+1] - buf[bi2+1]) + (buf[bi1+2] - buf[bi2+2])) / 3;
                let factor = (eGray + 128) / 128; // 0..2 range: <1 darkens, >1 lightens
                pixels[idx]   = Math.round(pixels[idx]*(1-strength) + Math.max(0,Math.min(255,pixels[idx]*factor))*strength);
                pixels[idx+1] = Math.round(pixels[idx+1]*(1-strength) + Math.max(0,Math.min(255,pixels[idx+1]*factor))*strength);
                pixels[idx+2] = Math.round(pixels[idx+2]*(1-strength) + Math.max(0,Math.min(255,pixels[idx+2]*factor))*strength);
            } else {
                let er = buf[bi1] - buf[bi2] + 128;
                let eg = buf[bi1+1] - buf[bi2+1] + 128;
                let eb = buf[bi1+2] - buf[bi2+2] + 128;
                pixels[idx]   = Math.round(pixels[idx]*(1-strength) + Math.max(0,Math.min(255,er))*strength);
                pixels[idx+1] = Math.round(pixels[idx+1]*(1-strength) + Math.max(0,Math.min(255,eg))*strength);
                pixels[idx+2] = Math.round(pixels[idx+2]*(1-strength) + Math.max(0,Math.min(255,eb))*strength);
            }
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
            if (ledShape === 'circle') {
                drawingContext.arc(x + cellSz/2, y + cellSz/2, cellSz/2, 0, Math.PI * 2);
            } else {
                drawingContext.roundRect(x, y, cellSz, cellSz, cellSz * 0.15);
            }
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

    // Phosphor patterns
    if (crtPhosphor !== 'none') {
        drawingContext.globalCompositeOperation = 'multiply';
        drawingContext.globalAlpha = 0.15;
        if (crtPhosphor === 'slot') {
            // Slot mask: RGB vertical stripes in offset rows
            let cellW = 3, cellH = 4;
            for (let py = videoY; py < videoY + videoH; py += cellH) {
                let rowOff = (Math.floor((py - videoY) / cellH) % 2) * 1;
                for (let px = videoX + rowOff; px < videoX + videoW; px += cellW) {
                    drawingContext.fillStyle = 'rgb(255,0,0)';
                    drawingContext.fillRect(px, py, 1, cellH);
                    drawingContext.fillStyle = 'rgb(0,255,0)';
                    drawingContext.fillRect(px+1, py, 1, cellH);
                    drawingContext.fillStyle = 'rgb(0,0,255)';
                    drawingContext.fillRect(px+2, py, 1, cellH);
                }
            }
        } else if (crtPhosphor === 'grille') {
            // Aperture grille: vertical RGB stripes
            for (let px = videoX; px < videoX + videoW; px += 3) {
                drawingContext.fillStyle = 'rgb(255,0,0)';
                drawingContext.fillRect(px, videoY, 1, videoH);
                drawingContext.fillStyle = 'rgb(0,255,0)';
                drawingContext.fillRect(px+1, videoY, 1, videoH);
                drawingContext.fillStyle = 'rgb(0,0,255)';
                drawingContext.fillRect(px+2, videoY, 1, videoH);
            }
        } else if (crtPhosphor === 'shadow') {
            // Shadow mask: triangular pattern of RGB dots
            let dotSz = 2;
            for (let py = videoY; py < videoY + videoH; py += dotSz * 2) {
                for (let px = videoX; px < videoX + videoW; px += dotSz * 3) {
                    let off = (Math.floor((py - videoY) / (dotSz*2)) % 2) * dotSz;
                    drawingContext.fillStyle = 'rgb(255,0,0)';
                    drawingContext.fillRect(px+off, py, dotSz, dotSz);
                    drawingContext.fillStyle = 'rgb(0,255,0)';
                    drawingContext.fillRect(px+off+dotSz, py, dotSz, dotSz);
                    drawingContext.fillStyle = 'rgb(0,0,255)';
                    drawingContext.fillRect(px+off+dotSz*2, py, dotSz, dotSz);
                }
            }
        }
        drawingContext.globalCompositeOperation = 'source-over';
        drawingContext.globalAlpha = 1;
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

    // ── EFFECT CARD GRID ──
    let cardGrid = document.getElementById('fx-card-grid');
    // Build cards for ALL effects (shown/hidden per category)
    let fxFavorites = JSON.parse(localStorage.getItem('blobfx-favorites') || '[]');
    for (let [effectName, cfg] of Object.entries(FX_UI_CONFIG)) {
        let card = document.createElement('div');
        card.className = 'fx-card';
        card.dataset.effect = effectName;
        card.dataset.cat = FX_CATEGORIES[effectName];
        card.style.setProperty('--cat-color', FX_CAT_COLORS[FX_CATEGORIES[effectName]]);
        card.textContent = cfg.label;
        // Favorite star
        let star = document.createElement('span');
        star.className = 'fx-fav' + (fxFavorites.includes(effectName) ? ' starred' : '');
        star.textContent = '\u2605';
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFxFavorite(effectName);
        });
        card.appendChild(star);
        card.addEventListener('click', () => selectFxEffect(effectName));
        cardGrid.appendChild(card);
    }
    buildFxFavoritesRow();

    // ── DROPDOWN ROW (compact toggle/drag controls) ──
    let selRow = document.getElementById('fx-selector-row');
    selRow.className = 'fx-dropdown-row';
    let sel = document.createElement('select');
    sel.id = 'fx-effect-select';
    sel.className = 'fx-dropdown-select';
    sel.style.display = 'none'; // Hidden — cards replace it
    sel.addEventListener('change', () => selectFxEffect(sel.value));
    let onBtn = document.createElement('button');
    onBtn.className = 'fx-on-btn';
    onBtn.id = 'fx-on-btn';
    onBtn.innerHTML = '<svg class="eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '<svg class="eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
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
    // Effect name label (replaces dropdown visually)
    let nameLabel = document.createElement('span');
    nameLabel.id = 'fx-effect-name-label';
    nameLabel.style.cssText = 'flex:1;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text)';
    selRow.append(nameLabel, onBtn, dragH);

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

    // Post Process add button
    let ppAddBtn = document.getElementById('fx-pp-add');
    if (ppAddBtn) {
        ppAddBtn.addEventListener('click', () => {
            if (currentViewedEffect && !activeEffects.has(currentViewedEffect)) {
                activeEffects.add(currentViewedEffect);
                updateEffectCardStates();
                updateFxOnButton();
                updateDropdownMarkers();
                updatePostProcessList();
            }
        });
    }
}

function switchFxCategory(cat) {
    currentFxCat = cat;
    // Update tab active state
    document.querySelectorAll('.fx-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    // Show/hide cards per category
    document.querySelectorAll('#fx-card-grid .fx-card').forEach(card => {
        card.style.display = card.dataset.cat === cat ? '' : 'none';
    });
    // Populate hidden dropdown (for internal state tracking)
    let sel = document.getElementById('fx-effect-select');
    let effects = getEffectsForCategory(cat);
    if (sel) {
        sel.innerHTML = '';
        effects.forEach(name => {
            let opt = document.createElement('option');
            opt.value = name;
            let cfg = FX_UI_CONFIG[name];
            opt.textContent = cfg ? cfg.label : name.toUpperCase();
            sel.appendChild(opt);
        });
    }
    // Select first effect or keep current if it's in this category
    if (effects.includes(currentViewedEffect)) {
        if (sel) sel.value = currentViewedEffect;
    } else {
        currentViewedEffect = effects[0];
        if (sel) sel.value = effects[0];
    }
    showFxParams(currentViewedEffect);
    updateFxOnButton();
    updateCardHighlights();
}

function selectFxEffect(name) {
    currentViewedEffect = name;
    // Switch to the correct category if needed
    let cat = FX_CATEGORIES[name];
    if (cat && cat !== currentFxCat) switchFxCategory(cat);
    showFxParams(name);
    updateFxOnButton();
    updateCardHighlights();
    // Update name label
    let lbl = document.getElementById('fx-effect-name-label');
    let cfg = FX_UI_CONFIG[name];
    if (lbl && cfg) lbl.textContent = cfg.label;
}

function cycleFxEffect(dir) {
    let effects = getEffectsForCategory(currentFxCat);
    let idx = effects.indexOf(currentViewedEffect);
    idx = (idx + dir + effects.length) % effects.length;
    currentViewedEffect = effects[idx];
    let sel = document.getElementById('fx-effect-select');
    if (sel) sel.value = currentViewedEffect;
    showFxParams(currentViewedEffect);
    updateFxOnButton();
    updateCardHighlights();
    let lbl = document.getElementById('fx-effect-name-label');
    let cfg = FX_UI_CONFIG[currentViewedEffect];
    if (lbl && cfg) lbl.textContent = cfg.label;
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
    updateDropdownMarkers();
    updatePostProcessList();
    updateCardHighlights();
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
    let catColor = FX_CAT_COLORS[FX_CATEGORIES[currentViewedEffect]] || '#6C5CE7';
    btn.style.setProperty('--cat-color', catColor);
}

function updateCardHighlights() {
    document.querySelectorAll('#fx-card-grid .fx-card').forEach(card => {
        let name = card.dataset.effect;
        card.classList.toggle('viewing', name === currentViewedEffect);
        card.classList.toggle('active-effect', activeEffects.has(name));
    });
    // Also update favorites row
    document.querySelectorAll('#fx-favorites-row .fx-card').forEach(card => {
        let name = card.dataset.effect;
        card.classList.toggle('viewing', name === currentViewedEffect);
        card.classList.toggle('active-effect', activeEffects.has(name));
    });
}

function toggleFxFavorite(effectName) {
    let favs = JSON.parse(localStorage.getItem('blobfx-favorites') || '[]');
    let idx = favs.indexOf(effectName);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.push(effectName);
    localStorage.setItem('blobfx-favorites', JSON.stringify(favs));
    // Update star icons in card grid
    document.querySelectorAll('#fx-card-grid .fx-card').forEach(card => {
        if (card.dataset.effect === effectName) {
            let star = card.querySelector('.fx-fav');
            if (star) star.classList.toggle('starred', favs.includes(effectName));
        }
    });
    buildFxFavoritesRow();
}

function buildFxFavoritesRow() {
    let row = document.getElementById('fx-favorites-row');
    if (!row) return;
    row.innerHTML = '';
    let favs = JSON.parse(localStorage.getItem('blobfx-favorites') || '[]');
    favs.forEach(name => {
        let cfg = FX_UI_CONFIG[name];
        if (!cfg) return;
        let card = document.createElement('div');
        card.className = 'fx-card';
        card.dataset.effect = name;
        card.style.setProperty('--cat-color', FX_CAT_COLORS[FX_CATEGORIES[name]]);
        card.textContent = cfg.label;
        card.classList.toggle('viewing', name === currentViewedEffect);
        card.classList.toggle('active-effect', activeEffects.has(name));
        card.addEventListener('click', () => selectFxEffect(name));
        row.appendChild(card);
    });
}

// ---------------------------------------------------------------------------
// PRESETS — apply, save, delete, UI
// ---------------------------------------------------------------------------
function applyPreset(presetKey, isCustom) {
    let preset = isCustom ? getCustomPresets()[presetKey] : FX_PRESETS[presetKey];
    if (!preset) return;

    // 1. Clear all active effects and reset them
    activeEffects.forEach(name => resetEffect(name));
    activeEffects.clear();

    // 2. Apply each effect in the preset
    for (let [effectName, params] of Object.entries(preset.effects)) {
        // Set parameters via FX_PARAM_MAP
        let paramMap = FX_PARAM_MAP[effectName];
        if (paramMap) {
            paramMap.forEach(p => {
                if (params[p.v] !== undefined) p.s(params[p.v]);
            });
        }
        // Activate the effect
        activeEffects.add(effectName);
        // Sync UI controls
        syncFxControlsForEffect(effectName);
    }

    // 3. Update state
    currentPreset = presetKey;

    // 4. Update all UI
    updateEffectCardStates();
    updateFxOnButton();
    updateDropdownMarkers();
    updatePostProcessList();
    updateCardHighlights();
    updatePresetActiveIndicator();
    updatePresetCardHighlights();
}

function clearPreset() {
    // Reset all active effects to defaults, then deactivate
    activeEffects.forEach(name => resetEffect(name));
    activeEffects.clear();
    currentPreset = null;
    updateEffectCardStates();
    updateFxOnButton();
    updateDropdownMarkers();
    updatePostProcessList();
    updateCardHighlights();
    updatePresetActiveIndicator();
    updatePresetCardHighlights();
}

function captureCurrentState() {
    // Snapshot all active effects + their current parameter values
    let snapshot = {};
    activeEffects.forEach(name => {
        let paramMap = FX_PARAM_MAP[name];
        if (!paramMap) return;
        snapshot[name] = {};
        paramMap.forEach(p => { snapshot[name][p.v] = p.g(); });
    });
    return snapshot;
}

function saveCustomPreset(name) {
    if (!name || activeEffects.size === 0) return;
    let presets = getCustomPresets();
    let key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    presets[key] = {
        name: name,
        category: 'custom',
        desc: 'Custom preset',
        effects: captureCurrentState()
    };
    localStorage.setItem('blobfx-presets', JSON.stringify(presets));
    currentPreset = key;
    buildPresetCustomGrid();
    updatePresetActiveIndicator();
    updatePresetCardHighlights();
}

function deleteCustomPreset(key) {
    let presets = getCustomPresets();
    delete presets[key];
    localStorage.setItem('blobfx-presets', JSON.stringify(presets));
    if (currentPreset === key) currentPreset = null;
    buildPresetCustomGrid();
    updatePresetActiveIndicator();
    updatePresetCardHighlights();
}

function getCustomPresets() {
    return JSON.parse(localStorage.getItem('blobfx-presets') || '{}');
}

// ── Preset UI builders ──
let currentPresetCat = 'all';

function buildPresetPanel() {
    // Category pills
    let catTabs = document.getElementById('fx-preset-cat-tabs');
    if (!catTabs) return;
    catTabs.innerHTML = '';
    FX_PRESET_CATEGORIES.forEach(cat => {
        let btn = document.createElement('button');
        btn.className = 'fx-preset-cat-btn' + (cat === currentPresetCat ? ' active' : '');
        btn.dataset.cat = cat;
        if (FX_PRESET_CAT_COLORS[cat]) btn.style.setProperty('--preset-cat-color', FX_PRESET_CAT_COLORS[cat]);
        btn.textContent = FX_PRESET_CAT_LABELS[cat];
        btn.addEventListener('click', () => {
            currentPresetCat = cat;
            catTabs.querySelectorAll('.fx-preset-cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
            buildPresetGrid();
        });
        catTabs.appendChild(btn);
    });

    buildPresetGrid();
    buildPresetCustomGrid();
    updatePresetActiveIndicator();

    // Save button (use onclick to prevent duplicate listeners)
    let saveBtn = document.getElementById('fx-preset-save-btn');
    if (saveBtn) {
        saveBtn.onclick = () => {
            if (activeEffects.size === 0) { alert('No active effects to save as preset.'); return; }
            let name = prompt('Preset name:');
            if (name && name.trim()) saveCustomPreset(name.trim());
        };
    }
}

function buildPresetGrid() {
    let grid = document.getElementById('fx-preset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let [key, preset] of Object.entries(FX_PRESETS)) {
        if (currentPresetCat !== 'all' && preset.category !== currentPresetCat) continue;
        let card = createPresetCard(key, preset, false);
        grid.appendChild(card);
    }
    updatePresetCardHighlights();
}

function buildPresetCustomGrid() {
    let grid = document.getElementById('fx-preset-custom-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let customs = getCustomPresets();
    for (let [key, preset] of Object.entries(customs)) {
        let card = createPresetCard(key, preset, true);
        grid.appendChild(card);
    }
    updatePresetCardHighlights();
}

function createPresetCard(key, preset, isCustom) {
    let card = document.createElement('div');
    card.className = 'fx-preset-card' + (isCustom ? ' custom-preset' : '');
    card.dataset.preset = key;
    card.dataset.custom = isCustom ? '1' : '0';
    let catColor = FX_PRESET_CAT_COLORS[preset.category] || '#6C5CE7';
    card.style.setProperty('--preset-cat-color', catColor);

    let effectNames = Object.keys(preset.effects).map(e => {
        let cfg = FX_UI_CONFIG[e];
        return cfg ? cfg.label : e;
    });

    card.innerHTML =
        `<div class="fx-preset-card-name">${preset.name}</div>` +
        `<div class="fx-preset-card-desc">${preset.desc || ''}</div>` +
        `<div class="fx-preset-card-effects">${effectNames.map(n => `<span>${n}</span>`).join('')}</div>` +
        (isCustom ? `<span class="fx-preset-delete" title="Delete preset">&times;</span>` : '');

    card.addEventListener('click', (e) => {
        if (e.target.classList.contains('fx-preset-delete')) return;
        applyPreset(key, isCustom);
    });

    if (isCustom) {
        let del = card.querySelector('.fx-preset-delete');
        if (del) del.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCustomPreset(key);
        });
    }

    return card;
}

function updatePresetActiveIndicator() {
    let indicator = document.getElementById('fx-preset-active');
    if (!indicator) return;
    if (!currentPreset) {
        indicator.style.display = 'none';
        return;
    }
    let preset = FX_PRESETS[currentPreset] || (getCustomPresets()[currentPreset]);
    if (!preset) { indicator.style.display = 'none'; return; }
    indicator.style.display = 'flex';
    indicator.innerHTML =
        `<span>\u2605 ${preset.name}</span>` +
        `<button class="fx-preset-active-clear" title="Clear preset">Clear</button>`;
    indicator.querySelector('.fx-preset-active-clear').addEventListener('click', clearPreset);
}

function updatePresetCardHighlights() {
    document.querySelectorAll('.fx-preset-card').forEach(card => {
        card.classList.toggle('active-preset', card.dataset.preset === currentPreset);
    });
}

function switchFxView(view) {
    let effectsView = document.getElementById('fx-effects-view');
    let presetsView = document.getElementById('fx-presets-view');
    if (!effectsView || !presetsView) return;
    effectsView.style.display = view === 'effects' ? '' : 'none';
    presetsView.style.display = view === 'presets' ? '' : 'none';
    document.querySelectorAll('.fx-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    if (view === 'presets' && !document.getElementById('fx-preset-grid').children.length) {
        buildPresetPanel();
    }
}

// ---------------------------------------------------------------------------
// Post Process list — Effecto-style active effects list with eye toggles
// ---------------------------------------------------------------------------
function updatePostProcessList() {
    let container = document.getElementById('fx-pp-list');
    let wrapper = document.getElementById('fx-postprocess');
    if (!container || !wrapper) return;

    if (activeEffects.size === 0) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = '';
    container.innerHTML = '';

    activeEffects.forEach(name => {
        let cfg = FX_UI_CONFIG[name];
        let label = cfg ? cfg.label : name.toUpperCase();
        let item = document.createElement('div');
        item.className = 'fx-pp-item';
        let catColor = FX_CAT_COLORS[FX_CATEGORIES[name]] || '#666';
        item.style.setProperty('--pp-cat-color', catColor);
        item.innerHTML = `<span class="fx-pp-drag">⁞⁞</span>` +
            `<button class="fx-pp-settings" title="Settings" data-effect="${name}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></button>` +
            `<span class="fx-pp-name">${label}</span>` +
            `<button class="fx-pp-eye visible" title="Toggle visibility" data-effect="${name}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>` +
            `<button class="fx-pp-remove" title="Remove" data-effect="${name}">&mdash;</button>`;
        container.appendChild(item);
    });

    // Wire up eye toggles
    container.querySelectorAll('.fx-pp-eye').forEach(btn => {
        btn.addEventListener('click', () => {
            let eff = btn.dataset.effect;
            activeEffects.delete(eff);
            updateEffectCardStates();
            updateFxOnButton();
            updateDropdownMarkers();
            updatePostProcessList();
        });
    });

    // Wire up settings buttons (navigate to effect)
    container.querySelectorAll('.fx-pp-settings').forEach(btn => {
        btn.addEventListener('click', () => {
            let eff = btn.dataset.effect;
            let cat = FX_CATEGORIES[eff];
            if (cat) switchFxCategory(cat);
            selectFxEffect(eff);
            let sel = document.getElementById('fx-effect-select');
            if (sel) sel.value = eff;
        });
    });

    // Wire up remove buttons
    container.querySelectorAll('.fx-pp-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            let eff = btn.dataset.effect;
            activeEffects.delete(eff);
            updateEffectCardStates();
            updateFxOnButton();
            updateDropdownMarkers();
            updatePostProcessList();
        });
    });
}

function updateDropdownMarkers() {
    let sel = document.getElementById('fx-effect-select');
    if (!sel) return;
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
    buildPresetPanel();

    // ── VIEW SWITCHER (Effects | Presets) ──
    document.querySelectorAll('.fx-view-btn').forEach(btn => {
        btn.addEventListener('click', () => switchFxView(btn.dataset.view));
    });

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

// ============================================================================
// NEW EFFECTS v2 (25 effects)
// ============================================================================

// --- COLOR: Threshold ---
function applyThreshold() {
    let level = thresholdLevel;
    let inv = thresholdInvert;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            let val = lum > level ? 255 : 0;
            if (inv) val = 255 - val;
            pixels[idx] = pixels[idx+1] = pixels[idx+2] = val;
        }
    }
}

// --- COLOR: Exposure ---
function applyExposure() {
    let ev = exposureEV / 10; // -3 to +3
    let mult = Math.pow(2, ev);
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            pixels[idx]   = Math.min(255, Math.max(0, Math.round(pixels[idx] * mult)));
            pixels[idx+1] = Math.min(255, Math.max(0, Math.round(pixels[idx+1] * mult)));
            pixels[idx+2] = Math.min(255, Math.max(0, Math.round(pixels[idx+2] * mult)));
        }
    }
}

// --- COLOR: Color Temperature ---
function applyColorTemp() {
    let t = colortempValue / 100; // -1 to 1
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let rShift = t > 0 ? t * 40 : 0;
    let bShift = t < 0 ? -t * 40 : 0;
    let gShift = -Math.abs(t) * 10;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            pixels[idx]   = Math.min(255, Math.max(0, pixels[idx] + rShift));
            pixels[idx+1] = Math.min(255, Math.max(0, pixels[idx+1] + gShift));
            pixels[idx+2] = Math.min(255, Math.max(0, pixels[idx+2] + bShift));
        }
    }
}

// --- COLOR: RGB Gain ---
function applyRGBGain() {
    let rG = rgbGainR / 100, gG = rgbGainG / 100, bG = rgbGainB / 100;
    let gamma = rgbGainGamma;
    let invGamma = gamma > 0 ? 1 / gamma : 1;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            pixels[idx]   = Math.min(255, Math.round(Math.pow(pixels[idx] / 255 * rG, invGamma) * 255));
            pixels[idx+1] = Math.min(255, Math.round(Math.pow(pixels[idx+1] / 255 * gG, invGamma) * 255));
            pixels[idx+2] = Math.min(255, Math.round(Math.pow(pixels[idx+2] / 255 * bG, invGamma) * 255));
        }
    }
}

// --- COLOR: Levels ---
function applyLevels() {
    let iB = levelsInBlack, iW = levelsInWhite, g = levelsGamma;
    let oB = levelsOutBlack, oW = levelsOutWhite;
    let iRange = Math.max(1, iW - iB);
    let oRange = oW - oB;
    let invG = g > 0 ? 1 / g : 1;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    // Build LUT for speed
    let lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        let v = (i - iB) / iRange;
        v = Math.max(0, Math.min(1, v));
        v = Math.pow(v, invG);
        lut[i] = Math.round(oB + v * oRange);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            pixels[idx] = lut[pixels[idx]];
            pixels[idx+1] = lut[pixels[idx+1]];
            pixels[idx+2] = lut[pixels[idx+2]];
        }
    }
}

// --- COLOR: Color Balance ---
function applyColorBalance() {
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let sr = colorbalShadowR * 0.5, sg = colorbalShadowG * 0.5, sb = colorbalShadowB * 0.5;
    let mr = colorbalMidR * 0.5, mg = colorbalMidG * 0.5, mb = colorbalMidB * 0.5;
    let hr = colorbalHiR * 0.5, hg = colorbalHiG * 0.5, hb = colorbalHiB * 0.5;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = (0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2]) / 255;
            // Shadow weight peaks at lum=0, mid at lum=0.5, hi at lum=1
            let sw = Math.max(0, 1 - lum * 3);
            let mw = 1 - Math.abs(lum - 0.5) * 4; mw = Math.max(0, mw);
            let hw = Math.max(0, lum * 3 - 2);
            pixels[idx]   = Math.min(255, Math.max(0, Math.round(pixels[idx] + sr*sw + mr*mw + hr*hw)));
            pixels[idx+1] = Math.min(255, Math.max(0, Math.round(pixels[idx+1] + sg*sw + mg*mw + hg*hw)));
            pixels[idx+2] = Math.min(255, Math.max(0, Math.round(pixels[idx+2] + sb*sw + mb*mw + hb*hw)));
        }
    }
}

// --- COLOR: Color Matrix ---
function applyColorMatrix() {
    if (colmatrixPreset === 'none') return;
    let matrices = {
        'sepia-warm': [0.45,0.75,0.2, 0.35,0.70,0.17, 0.27,0.53,0.13],
        'cross': [1.2,-0.1,0.1, -0.1,1.0,0.2, -0.1,0.3,1.1],
        'infrared': [0.0,1.2,0.0, 0.0,0.0,0.8, 1.0,0.0,0.0],
        'nightvision': [0.2,0.7,0.1, 0.3,1.0,0.3, 0.0,0.3,0.1]
    };
    let m = matrices[colmatrixPreset];
    if (!m) return;
    let intensity = colmatrixIntensity / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            let nr = m[0]*r + m[1]*g + m[2]*b;
            let ng = m[3]*r + m[4]*g + m[5]*b;
            let nb = m[6]*r + m[7]*g + m[8]*b;
            pixels[idx]   = Math.min(255, Math.max(0, Math.round(r*(1-intensity) + nr*intensity)));
            pixels[idx+1] = Math.min(255, Math.max(0, Math.round(g*(1-intensity) + ng*intensity)));
            pixels[idx+2] = Math.min(255, Math.max(0, Math.round(b*(1-intensity) + nb*intensity)));
        }
    }
}

// --- DISTORTION: Blur/Sharp ---
function applyBlurSharp() {
    let amount = blursharpAmount;
    if (amount === 0) return;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let rad = Math.max(1, Math.round(Math.abs(amount) / 20));
    // Box blur
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            for (let ky = -rad; ky <= rad; ky++) {
                let ny = y + ky;
                if (ny < sy || ny >= ey) continue;
                for (let kx = -rad; kx <= rad; kx++) {
                    let nx = x + kx;
                    if (nx < sx || nx >= ex) continue;
                    let i = (nx + ny * totalW) * 4;
                    sr += original[i]; sg += original[i+1]; sb += original[i+2]; cnt++;
                }
            }
            let idx = (x + y * totalW) * 4;
            if (amount > 0) {
                // Blur: replace with average
                let t = amount / 100;
                pixels[idx]   = Math.round(original[idx]*(1-t) + (sr/cnt)*t);
                pixels[idx+1] = Math.round(original[idx+1]*(1-t) + (sg/cnt)*t);
                pixels[idx+2] = Math.round(original[idx+2]*(1-t) + (sb/cnt)*t);
            } else {
                // Sharpen: unsharp mask
                let t = -amount / 100;
                pixels[idx]   = Math.min(255, Math.max(0, Math.round(original[idx] + (original[idx] - sr/cnt) * t * 3)));
                pixels[idx+1] = Math.min(255, Math.max(0, Math.round(original[idx+1] + (original[idx+1] - sg/cnt) * t * 3)));
                pixels[idx+2] = Math.min(255, Math.max(0, Math.round(original[idx+2] + (original[idx+2] - sb/cnt) * t * 3)));
            }
        }
    }
}

// --- DISTORTION: Modulate ---
function applyModulate() {
    let freq = modulateFreq * 0.01;
    let amp = modulateAmp * 0.5;
    let spd = modulateSpeed;
    let dir = modulateDir;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let t = frameCount * spd * 0.05;
    let ampD = amp * d;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let ox = 0, oy = 0;
            if (dir === 'horizontal' || dir === 'both') {
                ox = Math.round(Math.sin(y * freq + t) * ampD);
            }
            if (dir === 'vertical' || dir === 'both') {
                oy = Math.round(Math.sin(x * freq + t * 1.3) * ampD);
            }
            let srcX = Math.max(sx, Math.min(ex-1, x + ox));
            let srcY = Math.max(sy, Math.min(ey-1, y + oy));
            let dstIdx = (x + y * totalW) * 4;
            let srcIdx = (srcX + srcY * totalW) * 4;
            pixels[dstIdx] = original[srcIdx];
            pixels[dstIdx+1] = original[srcIdx+1];
            pixels[dstIdx+2] = original[srcIdx+2];
        }
    }
}

// --- DISTORTION: Ripple ---
function applyRipple() {
    let freq = rippleFreq;
    let amp = rippleAmp;
    let spd = rippleSpeed;
    let damp = rippleDamping / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let cx = (sx + ex) / 2, cy = (sy + ey) / 2;
    let maxR = Math.sqrt((ex-sx)*(ex-sx) + (ey-sy)*(ey-sy)) / 2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let t = frameCount * spd * 0.1;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let dx = x - cx, dy = y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            let dampFactor = damp > 0 ? Math.exp(-dist / maxR * damp * 3) : 1;
            let wave = Math.sin(dist * freq * 0.05 - t) * amp * d * 0.3 * dampFactor;
            let angle = Math.atan2(dy, dx);
            let srcX = Math.max(sx, Math.min(ex-1, Math.round(x + Math.cos(angle) * wave)));
            let srcY = Math.max(sy, Math.min(ey-1, Math.round(y + Math.sin(angle) * wave)));
            let dstIdx = (x + y * totalW) * 4;
            let srcIdx = (srcX + srcY * totalW) * 4;
            pixels[dstIdx] = original[srcIdx];
            pixels[dstIdx+1] = original[srcIdx+1];
            pixels[dstIdx+2] = original[srcIdx+2];
        }
    }
}

// --- DISTORTION: Swirl ---
function applySwirl() {
    let angle = swirlAngle * Math.PI / 180;
    let radius = swirlRadius / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let cx = (sx + ex) / 2, cy = (sy + ey) / 2;
    let maxR = Math.min(ex-sx, ey-sy) / 2 * radius;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let dx = x - cx, dy = y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < maxR) {
                let pct = (maxR - dist) / maxR;
                let theta = pct * pct * angle;
                let cosT = Math.cos(theta), sinT = Math.sin(theta);
                let srcX = Math.round(cosT * dx - sinT * dy + cx);
                let srcY = Math.round(sinT * dx + cosT * dy + cy);
                srcX = Math.max(sx, Math.min(ex-1, srcX));
                srcY = Math.max(sy, Math.min(ey-1, srcY));
                let dstIdx = (x + y * totalW) * 4;
                let srcIdx = (srcX + srcY * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            }
        }
    }
}

// --- DISTORTION: Reed Glass ---
function applyReedGlass() {
    let ribW = Math.max(2, reedWidth);
    let dist = reedDistortion;
    let chromatic = reedChromatic;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let ribWD = ribW * d;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let ribPos = ((x - sx) % ribWD) / ribWD; // 0-1 within rib
            let offset = Math.round(Math.sin(ribPos * Math.PI) * dist * d * 0.3);
            let dstIdx = (x + y * totalW) * 4;
            if (chromatic) {
                // Per-channel offset for chromatic dispersion
                let rX = Math.max(sx, Math.min(ex-1, x + offset));
                let gX = Math.max(sx, Math.min(ex-1, x + Math.round(offset * 0.7)));
                let bX = Math.max(sx, Math.min(ex-1, x + Math.round(offset * 0.4)));
                pixels[dstIdx]   = original[(rX + y * totalW) * 4];
                pixels[dstIdx+1] = original[(gX + y * totalW) * 4 + 1];
                pixels[dstIdx+2] = original[(bX + y * totalW) * 4 + 2];
            } else {
                let srcX = Math.max(sx, Math.min(ex-1, x + offset));
                let srcIdx = (srcX + y * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            }
        }
    }
}

// --- DISTORTION: Polar to Rectangular ---
function applyPolar2Rect() {
    let rot = polar2rectRotation * Math.PI / 180;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let rw = ex - sx, rh = ey - sy;
    let cx = sx + rw/2, cy = sy + rh/2;
    let maxR = Math.min(rw, rh) / 2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let nx = (x - sx) / rw; // 0-1
            let ny = (y - sy) / rh; // 0-1
            let angle = nx * Math.PI * 2 + rot;
            let radius = ny * maxR;
            let srcX = Math.round(cx + radius * Math.cos(angle));
            let srcY = Math.round(cy + radius * Math.sin(angle));
            let dstIdx = (x + y * totalW) * 4;
            if (srcX >= sx && srcX < ex && srcY >= sy && srcY < ey) {
                let srcIdx = (srcX + srcY * totalW) * 4;
                pixels[dstIdx] = original[srcIdx];
                pixels[dstIdx+1] = original[srcIdx+1];
                pixels[dstIdx+2] = original[srcIdx+2];
            } else {
                pixels[dstIdx] = pixels[dstIdx+1] = pixels[dstIdx+2] = 0;
            }
        }
    }
}

// --- DISTORTION: Rectangular to Polar ---
function applyRect2Polar() {
    let rot = rect2polarRotation * Math.PI / 180;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let rw = ex - sx, rh = ey - sy;
    let cx = sx + rw/2, cy = sy + rh/2;
    let maxR = Math.min(rw, rh) / 2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let dx = x - cx, dy = y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            let angle = Math.atan2(dy, dx) - rot;
            if (angle < 0) angle += Math.PI * 2;
            let srcX = Math.round(sx + (angle / (Math.PI * 2)) * rw);
            let srcY = Math.round(sy + (dist / maxR) * rh);
            srcX = Math.max(sx, Math.min(ex-1, srcX));
            srcY = Math.max(sy, Math.min(ey-1, srcY));
            let dstIdx = (x + y * totalW) * 4;
            let srcIdx = (srcX + srcY * totalW) * 4;
            pixels[dstIdx] = original[srcIdx];
            pixels[dstIdx+1] = original[srcIdx+1];
            pixels[dstIdx+2] = original[srcIdx+2];
        }
    }
}

// --- DISTORTION: Radial Blur ---
function applyRadialBlur() {
    let intensity = radblurIntensity / 100;
    let samples = 8;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let cx = (sx+ex)/2, cy = (sy+ey)/2;
    let maxOff = intensity * 20;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y += 2) {
        for (let x = sx; x < ex; x += 2) {
            let dx = x - cx, dy = y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            let angle = Math.atan2(dy, dx);
            let sr = 0, sg = 0, sb = 0;
            for (let s = 0; s < samples; s++) {
                let t = (s / (samples-1) - 0.5) * maxOff * d;
                let a2 = angle + t * 0.01;
                let sX = Math.max(sx, Math.min(ex-1, Math.round(cx + dist * Math.cos(a2))));
                let sY = Math.max(sy, Math.min(ey-1, Math.round(cy + dist * Math.sin(a2))));
                let i = (sX + sY * totalW) * 4;
                sr += original[i]; sg += original[i+1]; sb += original[i+2];
            }
            sr = Math.round(sr/samples); sg = Math.round(sg/samples); sb = Math.round(sb/samples);
            for (let oy = 0; oy < 2 && (y+oy) < ey; oy++) {
                for (let ox = 0; ox < 2 && (x+ox) < ex; ox++) {
                    let idx = ((x+ox) + (y+oy) * totalW) * 4;
                    pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                }
            }
        }
    }
}

// --- DISTORTION: Zoom Blur ---
function applyZoomBlur() {
    let intensity = zoomblurIntensity / 100;
    let samples = 8;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let cx = (sx+ex)/2, cy = (sy+ey)/2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y += 2) {
        for (let x = sx; x < ex; x += 2) {
            let dx = x - cx, dy = y - cy;
            let sr = 0, sg = 0, sb = 0;
            for (let s = 0; s < samples; s++) {
                let scale = 1 + (s / (samples-1) - 0.5) * intensity * 0.15;
                let sX = Math.max(sx, Math.min(ex-1, Math.round(cx + dx * scale)));
                let sY = Math.max(sy, Math.min(ey-1, Math.round(cy + dy * scale)));
                let i = (sX + sY * totalW) * 4;
                sr += original[i]; sg += original[i+1]; sb += original[i+2];
            }
            sr = Math.round(sr/samples); sg = Math.round(sg/samples); sb = Math.round(sb/samples);
            for (let oy = 0; oy < 2 && (y+oy) < ey; oy++) {
                for (let ox = 0; ox < 2 && (x+ox) < ex; ox++) {
                    let idx = ((x+ox) + (y+oy) * totalW) * 4;
                    pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                }
            }
        }
    }
}

// --- DISTORTION: Circular Blur ---
function applyCircBlur() {
    let intensity = circblurIntensity / 100;
    let samples = 8;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let cx = (sx+ex)/2, cy = (sy+ey)/2;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    for (let y = sy; y < ey; y += 2) {
        for (let x = sx; x < ex; x += 2) {
            let dx = x - cx, dy = y - cy;
            let dist = Math.sqrt(dx*dx + dy*dy);
            let baseAngle = Math.atan2(dy, dx);
            let sr = 0, sg = 0, sb = 0;
            let spread = intensity * 0.08;
            for (let s = 0; s < samples; s++) {
                let a = baseAngle + (s / (samples-1) - 0.5) * spread;
                let sX = Math.max(sx, Math.min(ex-1, Math.round(cx + dist * Math.cos(a))));
                let sY = Math.max(sy, Math.min(ey-1, Math.round(cy + dist * Math.sin(a))));
                let i = (sX + sY * totalW) * 4;
                sr += original[i]; sg += original[i+1]; sb += original[i+2];
            }
            sr = Math.round(sr/samples); sg = Math.round(sg/samples); sb = Math.round(sb/samples);
            for (let oy = 0; oy < 2 && (y+oy) < ey; oy++) {
                for (let ox = 0; ox < 2 && (x+ox) < ex; ox++) {
                    let idx = ((x+ox) + (y+oy) * totalW) * 4;
                    pixels[idx] = sr; pixels[idx+1] = sg; pixels[idx+2] = sb;
                }
            }
        }
    }
}

// --- DISTORTION: Elastic Grid ---
function applyElasticGrid() {
    let gridSz = Math.max(4, elgridSize);
    let warpAmt = elgridWarp * 0.3;
    let spd = elgridSpeed;
    let animated = elgridAnimated;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let rw = ex - sx, rh = ey - sy;
    let cellW = rw / gridSz, cellH = rh / gridSz;
    let original = new Uint8Array(pixels.length);
    for (let y = sy; y < ey; y++) {
        let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
        original.set(pixels.subarray(start, end), start);
    }
    let t = animated ? frameCount * spd * 0.02 : 0;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let nx = (x - sx) / rw, ny = (y - sy) / rh;
            let ox = Math.sin(ny * gridSz * 0.7 + t) * Math.cos(nx * gridSz * 0.5 + t * 0.7) * warpAmt * d;
            let oy = Math.cos(nx * gridSz * 0.6 + t * 1.1) * Math.sin(ny * gridSz * 0.8 + t * 0.5) * warpAmt * d;
            let srcX = Math.max(sx, Math.min(ex-1, Math.round(x + ox)));
            let srcY = Math.max(sy, Math.min(ey-1, Math.round(y + oy)));
            let dstIdx = (x + y * totalW) * 4;
            let srcIdx = (srcX + srcY * totalW) * 4;
            pixels[dstIdx] = original[srcIdx];
            pixels[dstIdx+1] = original[srcIdx+1];
            pixels[dstIdx+2] = original[srcIdx+2];
        }
    }
}

// --- PATTERN: Y2K Blue ---
function applyY2KBlue() {
    let blueShift = y2kBlueShift / 100;
    let glowAmt = y2kGlow / 100;
    let grainAmt = y2kGrain / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2];
            let lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // Electric blue tint
            let tr = lum * (1 - blueShift * 0.7);
            let tg = lum * (1 - blueShift * 0.3);
            let tb = Math.min(255, lum + blueShift * 80);
            // Glow (lighten highlights)
            if (glowAmt > 0 && lum > 150) {
                let gf = (lum - 150) / 105 * glowAmt;
                tr = tr + (255 - tr) * gf * 0.3;
                tg = tg + (255 - tg) * gf * 0.5;
                tb = tb + (255 - tb) * gf * 0.7;
            }
            // Grain
            if (grainAmt > 0) {
                let n = (Math.random() - 0.5) * grainAmt * 40;
                tr += n; tg += n; tb += n;
            }
            pixels[idx]   = Math.max(0, Math.min(255, Math.round(tr)));
            pixels[idx+1] = Math.max(0, Math.min(255, Math.round(tg)));
            pixels[idx+2] = Math.max(0, Math.min(255, Math.round(tb)));
        }
    }
}

// --- PATTERN: Print Stamp (hybrid) ---
function applyPrintStamp() {
    let dotSz = printstampDotSize;
    let contrast = printstampContrast / 50; // 0-2
    let grainAmt = printstampGrain / 100;
    let d = pixelDensity();
    let totalW = width * d;
    // Sample pixel data
    let dots = [];
    for (let gy = videoY; gy < videoY + videoH; gy += dotSz) {
        for (let gx = videoX; gx < videoX + videoW; gx += dotSz) {
            let px = Math.floor((gx + dotSz/2) * d);
            let py = Math.floor((gy + dotSz/2) * d);
            let idx = (px + py * totalW) * 4;
            if (idx < 0 || idx >= pixels.length - 3) continue;
            let lum = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            dots.push({ x: gx + dotSz/2, y: gy + dotSz/2, lum });
        }
    }
    push();
    noStroke();
    // Paper background with optional grain
    let paperR = 245, paperG = 240, paperB = 230;
    fill(paperR, paperG, paperB);
    rectMode(CORNER);
    rect(videoX, videoY, videoW, videoH);
    // Draw dots
    fill(20, 15, 10);
    let maxR = dotSz * 0.48;
    for (let dot of dots) {
        let bri = dot.lum / 255;
        bri = 0.5 + (bri - 0.5) * contrast;
        bri = Math.max(0, Math.min(1, bri));
        let sz = (1 - bri) * maxR;
        if (sz < 0.3) continue;
        // Add grain jitter
        let jx = grainAmt > 0 ? (Math.random()-0.5) * grainAmt * 2 : 0;
        let jy = grainAmt > 0 ? (Math.random()-0.5) * grainAmt * 2 : 0;
        ellipse(dot.x + jx, dot.y + jy, sz*2, sz*2);
    }
    // Paper grain overlay
    if (grainAmt > 0) {
        for (let i = 0; i < grainAmt * 500; i++) {
            let gx = videoX + Math.random() * videoW;
            let gy = videoY + Math.random() * videoH;
            fill(0, Math.random() * 30 * grainAmt);
            ellipse(gx, gy, 1, 1);
        }
    }
    pop();
}

// --- OVERLAY: NTSC ---
function applyNTSC() {
    let chromaBleed = ntscChromaBleed / 100;
    let instability = ntscInstability / 100;
    let noiseAmt = ntscNoise / 100;
    let rolling = ntscRolling;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    // Chroma bleeding: horizontal smear of color channels
    if (chromaBleed > 0) {
        let bleedPx = Math.round(chromaBleed * 8 * d);
        let original = new Uint8Array(pixels.length);
        for (let y = sy; y < ey; y++) {
            let start = (sx + y * totalW) * 4, end = (ex + y * totalW) * 4;
            original.set(pixels.subarray(start, end), start);
        }
        for (let y = sy; y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + y * totalW) * 4;
                // Smear red right, blue left
                let rSrc = Math.min(ex-1, x + bleedPx);
                let bSrc = Math.max(sx, x - bleedPx);
                pixels[idx] = Math.round(original[idx] * 0.5 + original[(rSrc + y * totalW) * 4] * 0.5);
                pixels[idx+2] = Math.round(original[idx+2] * 0.5 + original[(bSrc + y * totalW) * 4 + 2] * 0.5);
            }
        }
    }
    // Color instability: per-frame hue/sat jitter
    if (instability > 0) {
        let hueShift = (Math.random() - 0.5) * instability * 30;
        for (let y = sy; y < ey; y += 2) {
            for (let x = sx; x < ex; x += 2) {
                let idx = (x + y * totalW) * 4;
                pixels[idx]   = Math.min(255, Math.max(0, pixels[idx] + hueShift));
                pixels[idx+1] = Math.min(255, Math.max(0, pixels[idx+1] - hueShift * 0.5));
            }
        }
    }
    // Static noise
    if (noiseAmt > 0) {
        for (let y = sy; y < ey; y += 2) {
            for (let x = sx; x < ex; x += 2) {
                if (Math.random() > noiseAmt * 0.4) continue;
                let idx = (x + y * totalW) * 4;
                let n = (Math.random() - 0.5) * noiseAmt * 80;
                pixels[idx] = Math.min(255, Math.max(0, pixels[idx] + n));
                pixels[idx+1] = Math.min(255, Math.max(0, pixels[idx+1] + n));
                pixels[idx+2] = Math.min(255, Math.max(0, pixels[idx+2] + n));
            }
        }
    }
    // Rolling bar
    if (rolling) {
        let barY = (frameCount * 3) % (ey - sy) + sy;
        let barH = Math.round((ey-sy) * 0.08);
        for (let y = barY; y < barY + barH && y < ey; y++) {
            for (let x = sx; x < ex; x++) {
                let idx = (x + y * totalW) * 4;
                pixels[idx] = Math.min(255, pixels[idx] + 30);
                pixels[idx+1] = Math.min(255, pixels[idx+1] + 30);
                pixels[idx+2] = Math.min(255, pixels[idx+2] + 30);
            }
        }
    }
}

// --- OVERLAY: Stripe ---
function applyStripe() {
    let density = stripeDensity;
    let angle = stripeAngle * Math.PI / 180;
    let thick = stripeThickness;
    let opacity = stripeOpacity / 100;
    let mode = stripeMode;
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(videoX, videoY, videoW, videoH);
    drawingContext.clip();
    stroke(0, opacity * 255);
    strokeWeight(thick);
    noFill();
    if (mode === 'circular') {
        let cx = videoX + videoW/2, cy = videoY + videoH/2;
        let maxR = Math.max(videoW, videoH);
        for (let r = density; r < maxR; r += density) {
            noFill();
            ellipse(cx, cy, r*2, r*2);
        }
    } else {
        let cosA = Math.cos(angle), sinA = Math.sin(angle);
        let cx = videoX + videoW/2, cy = videoY + videoH/2;
        let maxDim = Math.max(videoW, videoH) * 1.5;
        for (let i = -maxDim; i < maxDim; i += density) {
            let x1 = cx + i * cosA - maxDim * sinA;
            let y1 = cy + i * sinA + maxDim * cosA;
            let x2 = cx + i * cosA + maxDim * sinA;
            let y2 = cy + i * sinA - maxDim * cosA;
            line(x1, y1, x2, y2);
        }
    }
    drawingContext.restore();
    pop();
}

// --- OVERLAY: Paper Scan ---
function applyPaperScan() {
    let intensity = paperscanIntensity / 100;
    let fiberSc = paperscanFiber;
    let warmth = paperscanWarmth / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let amp = intensity * 40;
    for (let y = sy; y < ey; y += fiberSc) {
        for (let x = sx; x < ex; x += fiberSc) {
            // Fiber noise: directional (mostly horizontal)
            let hNoise = (Math.random() - 0.5) * amp;
            let vNoise = (Math.random() - 0.5) * amp * 0.3;
            let n = hNoise + vNoise;
            // Warmth tint
            let wr = warmth * 8, wg = warmth * 4, wb = -warmth * 4;
            for (let dy = 0; dy < fiberSc && (y+dy) < ey; dy++) {
                for (let dx = 0; dx < fiberSc && (x+dx) < ex; dx++) {
                    let idx = ((x+dx) + (y+dy) * totalW) * 4;
                    pixels[idx]   = Math.min(255, Math.max(0, pixels[idx] + n + wr));
                    pixels[idx+1] = Math.min(255, Math.max(0, pixels[idx+1] + n + wg));
                    pixels[idx+2] = Math.min(255, Math.max(0, pixels[idx+2] + n + wb));
                }
            }
        }
    }
}

// --- OVERLAY: Xerox ---
function applyXerox() {
    let contrast = xeroxContrast / 100;
    let noiseAmt = xeroxNoise / 100;
    let darkness = xeroxDarkness / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let thresh = 128 - (contrast - 0.5) * 80 + darkness * 40;
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            // Add toner noise
            if (noiseAmt > 0) {
                lum += (Math.random() - 0.5) * noiseAmt * 60;
            }
            let val = lum > thresh ? 255 : 0;
            // Second noise layer for paper texture
            if (noiseAmt > 0 && val === 255) {
                val -= Math.random() * noiseAmt * 20;
            }
            pixels[idx] = pixels[idx+1] = pixels[idx+2] = Math.max(0, Math.min(255, Math.round(val)));
        }
    }
}

// --- OVERLAY: Grunge ---
function applyGrunge() {
    let tint = typeof hexToRGBArray === 'function' ? hexToRGBArray(grungeTint) : [204,102,119];
    let posterLevels = Math.max(2, grungePosterize);
    let grainAmt = grungeGrain / 100;
    let d = pixelDensity(), totalW = width * d;
    let sx = Math.floor(videoX * d), ex = Math.floor((videoX + videoW) * d);
    let sy = Math.floor(videoY * d), ey = Math.floor((videoY + videoH) * d);
    let step = 255 / (posterLevels - 1);
    for (let y = sy; y < ey; y++) {
        for (let x = sx; x < ex; x++) {
            let idx = (x + y * totalW) * 4;
            let lum = 0.299 * pixels[idx] + 0.587 * pixels[idx+1] + 0.114 * pixels[idx+2];
            // Posterize
            lum = Math.round(lum / step) * step;
            // Grain
            if (grainAmt > 0) {
                lum += (Math.random() - 0.5) * grainAmt * 80;
            }
            lum = Math.max(0, Math.min(255, lum));
            let lumN = lum / 255;
            // Tint
            pixels[idx]   = Math.round(tint[0] * lumN);
            pixels[idx+1] = Math.round(tint[1] * lumN);
            pixels[idx+2] = Math.round(tint[2] * lumN);
        }
    }
}
