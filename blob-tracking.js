// ══════════════════════════════════════════
// SECTION: TRACKING (blob-tracking.js)
// Point tracking, line drawing, point info display
// ══════════════════════════════════════════

// ── PERFORMANCE (Tier 4) ─────────────────
let _cachedCandidates = null; // reuse candidates when video is paused

// 4A: Adaptive grid resolution — coarser scan when fewer blobs needed
function adaptiveGridSize(w) {
    let baseGrid = w > 1280 ? 30 : 15;
    let q = paramValues[0];
    if (q <= 10) return baseGrid * 2;       // few blobs → coarse scan
    if (q >= 80) return max(8, baseGrid - 5); // many blobs → fine scan
    return baseGrid;
}

// 4C: Spatial hash for fast neighbor lookup when >50 blobs
function buildSpatialHash(blobs, cellSize) {
    let grid = {};
    for (let i = 0; i < blobs.length; i++) {
        let b = blobs[i];
        if (b.state === 'expired') continue;
        let cx = Math.floor(b.posicao.x / cellSize);
        let cy = Math.floor(b.posicao.y / cellSize);
        let key = cx + ',' + cy;
        if (!grid[key]) grid[key] = [];
        grid[key].push(i);
    }
    return grid;
}

function spatialHashNeighbors(grid, x, y, cellSize) {
    let cx = Math.floor(x / cellSize);
    let cy = Math.floor(y / cellSize);
    let result = [];
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            let key = (cx + dx) + ',' + (cy + dy);
            if (grid[key]) {
                for (let idx of grid[key]) result.push(idx);
            }
        }
    }
    return result;
}

// Fisher-Yates shuffle — O(n), unbiased (replaces sort(() => Math.random() - 0.5))
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        let tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

// ── CANDIDATE DEDUP (Tier 2) ─────────────
// Merge candidates within _dedupRadius pixels — reduces noise before matching
function dedupCandidates(candidates, radius) {
    if (radius <= 0 || candidates.length === 0) return candidates;
    let used = new Uint8Array(candidates.length);
    let merged = [];
    let r2 = radius * radius;
    for (let i = 0; i < candidates.length; i++) {
        if (used[i]) continue;
        let sumX = candidates[i].x, sumY = candidates[i].y;
        let cr = red(candidates[i].c), cg = green(candidates[i].c), cb = blue(candidates[i].c);
        let count = 1;
        used[i] = 1;
        for (let j = i + 1; j < candidates.length; j++) {
            if (used[j]) continue;
            let dx = candidates[j].x - candidates[i].x;
            let dy = candidates[j].y - candidates[i].y;
            if (dx * dx + dy * dy <= r2) {
                sumX += candidates[j].x; sumY += candidates[j].y;
                cr += red(candidates[j].c); cg += green(candidates[j].c); cb += blue(candidates[j].c);
                count++;
                used[j] = 1;
            }
        }
        merged.push(new CandidatePoint(
            Math.round(sumX / count), Math.round(sumY / count),
            color(cr / count, cg / count, cb / count)
        ));
    }
    return merged;
}

// ── DBSCAN CLUSTERING (Tier 3D) ──────────
// Standard DBSCAN on candidate points — returns cluster centroids
function dbscanCluster(candidates, eps, minPts) {
    let n = candidates.length;
    if (n === 0) return candidates;
    let labels = new Int16Array(n); // 0=unvisited, -1=noise, >0=cluster ID
    let eps2 = eps * eps;
    let clusterId = 0;

    function regionQuery(idx) {
        let neighbors = [];
        let px = candidates[idx].x, py = candidates[idx].y;
        for (let j = 0; j < n; j++) {
            let dx = candidates[j].x - px, dy = candidates[j].y - py;
            if (dx * dx + dy * dy <= eps2) neighbors.push(j);
        }
        return neighbors;
    }

    for (let i = 0; i < n; i++) {
        if (labels[i] !== 0) continue;
        let neighbors = regionQuery(i);
        if (neighbors.length < minPts) {
            labels[i] = -1; // noise
            continue;
        }
        clusterId++;
        labels[i] = clusterId;
        let seed = neighbors.slice();
        for (let si = 0; si < seed.length; si++) {
            let qi = seed[si];
            if (labels[qi] === -1) labels[qi] = clusterId;
            if (labels[qi] !== 0) continue;
            labels[qi] = clusterId;
            let qNeighbors = regionQuery(qi);
            if (qNeighbors.length >= minPts) {
                for (let nn of qNeighbors) {
                    if (labels[nn] === 0 || labels[nn] === -1) seed.push(nn);
                }
            }
        }
    }

    // Build centroids from clusters
    let clusters = {};
    for (let i = 0; i < n; i++) {
        let lbl = labels[i];
        if (lbl <= 0) continue; // skip noise
        if (!clusters[lbl]) clusters[lbl] = { sx: 0, sy: 0, sr: 0, sg: 0, sb: 0, count: 0 };
        let cl = clusters[lbl];
        cl.sx += candidates[i].x; cl.sy += candidates[i].y;
        cl.sr += red(candidates[i].c); cl.sg += green(candidates[i].c); cl.sb += blue(candidates[i].c);
        cl.count++;
    }
    let result = [];
    for (let lbl in clusters) {
        let cl = clusters[lbl];
        result.push(new CandidatePoint(
            Math.round(cl.sx / cl.count), Math.round(cl.sy / cl.count),
            color(cl.sr / cl.count, cl.sg / cl.count, cl.sb / cl.count)
        ));
    }
    return result;
}

// ── BLOB PERSISTENCE MATCHING (Tier 1+2) ─────────────
// Greedy nearest-neighbor matching — O(n*m) with early cutoff
// Converts candidates to screen coords, matches against existing PersistentBlobs,
// handles state machine (new→active→lost→expired), populates trackedPoints[]
function matchAndUpdateBlobs(candidates, numPoints, blobVarLevel) {
    // Pick top numPoints from shuffled candidates
    let picked = candidates.slice(0, numPoints);

    // Convert to screen coords
    let screenCandidates = [];
    for (let i = 0; i < picked.length; i++) {
        let sc = videoToScreenCoords(picked[i].x, picked[i].y);
        screenCandidates.push({ x: sc.x, y: sc.y, c: picked[i].c, used: false });
    }

    let maxDist = _maxMoveDistance;
    let maxDist2 = maxDist * maxDist;

    // Reset match flags
    for (let b of _persistentBlobs) b.matchedThisFrame = false;

    // Build distance pairs (blob index, candidate index, dist2)
    // 4C: Use spatial hash when >50 blobs for O(n) instead of O(n*m)
    let pairs = [];
    if (_persistentBlobs.length > 50) {
        let hash = buildSpatialHash(_persistentBlobs, maxDist);
        for (let ci = 0; ci < screenCandidates.length; ci++) {
            let nearIdxs = spatialHashNeighbors(hash, screenCandidates[ci].x, screenCandidates[ci].y, maxDist);
            for (let bi of nearIdxs) {
                let blob = _persistentBlobs[bi];
                let dx = blob.posicao.x - screenCandidates[ci].x;
                let dy = blob.posicao.y - screenCandidates[ci].y;
                let d2 = dx * dx + dy * dy;
                if (d2 <= maxDist2) pairs.push({ bi, ci, d2 });
            }
        }
    } else {
        for (let bi = 0; bi < _persistentBlobs.length; bi++) {
            let blob = _persistentBlobs[bi];
            if (blob.state === 'expired') continue;
            for (let ci = 0; ci < screenCandidates.length; ci++) {
                let dx = blob.posicao.x - screenCandidates[ci].x;
                let dy = blob.posicao.y - screenCandidates[ci].y;
                let d2 = dx * dx + dy * dy;
                if (d2 <= maxDist2) pairs.push({ bi, ci, d2 });
            }
        }
    }

    // Sort by distance — closest matches first
    pairs.sort((a, b) => a.d2 - b.d2);

    // Greedy assignment — no double matching
    let usedBlobs = new Set();
    let usedCands = new Set();
    for (let pair of pairs) {
        if (usedBlobs.has(pair.bi) || usedCands.has(pair.ci)) continue;
        let blob = _persistentBlobs[pair.bi];
        let cand = screenCandidates[pair.ci];

        // Save previous position for velocity
        blob.prevPos.set(blob.posicao.x, blob.posicao.y);

        // EMA smoothing (Tier 2)
        let sm = _blobSmoothing;
        if (sm > 0) {
            blob.posicao.x = lerp(cand.x, blob.posicao.x, sm);
            blob.posicao.y = lerp(cand.y, blob.posicao.y, sm);
            blob.width = lerp(blob.width, blob.width, sm); // size stays stable
            blob.height = lerp(blob.height, blob.height, sm);
            // Color smoothing — only when close (prevents muddy blending on jumps)
            if (pair.d2 < maxDist2 * 0.25) {
                let cr = red(cand.c), cg = green(cand.c), cb = blue(cand.c);
                let or = red(blob.cor), og = green(blob.cor), ob = blue(blob.cor);
                blob.cor = color(lerp(cr, or, sm), lerp(cg, og, sm), lerp(cb, ob, sm));
            } else {
                blob.cor = cand.c;
            }
        } else {
            blob.posicao.x = cand.x;
            blob.posicao.y = cand.y;
            blob.cor = cand.c;
        }

        // Velocity (Tier 2) — byproduct of persistence
        blob.velocity.set(blob.posicao.x - blob.prevPos.x, blob.posicao.y - blob.prevPos.y);

        blob.brightness = brightness(blob.cor);
        blob.state = 'active';
        blob.lostFrames = 0;
        blob.age++;
        blob.matchedThisFrame = true;

        // Trail (for Tier 3, pre-wired)
        if (_persistenceEnabled) {
            blob.trail.push({ x: blob.posicao.x, y: blob.posicao.y });
            if (blob.trail.length > _trailLength) blob.trail.shift();
        }

        usedBlobs.add(pair.bi);
        usedCands.add(pair.ci);
    }

    // Unmatched existing blobs → lost
    for (let bi = 0; bi < _persistentBlobs.length; bi++) {
        let blob = _persistentBlobs[bi];
        if (blob.matchedThisFrame || blob.state === 'expired') continue;
        blob.lostFrames++;
        let maxLost = _reviveEnabled ? Math.max(_persistDuration, _reviveTime) : _persistDuration;
        if (blob.lostFrames > maxLost) {
            blob.state = 'expired';
        } else {
            blob.state = 'lost';
        }
    }

    // ── REVIVAL PASS ──────────────────────────
    if (_reviveEnabled) {
        let revDist2 = _reviveDistance * _reviveDistance;
        let revivePairs = [];

        for (let bi = 0; bi < _persistentBlobs.length; bi++) {
            let blob = _persistentBlobs[bi];
            if (blob.state !== 'lost' || blob.lostFrames > _reviveTime) continue;

            for (let ci = 0; ci < screenCandidates.length; ci++) {
                if (usedCands.has(ci)) continue;
                let cand = screenCandidates[ci];
                let dx = blob.posicao.x - cand.x;
                let dy = blob.posicao.y - cand.y;
                let d2 = dx * dx + dy * dy;
                if (d2 > revDist2) continue;

                let candBri = brightness(cand.c);
                let briDiff = Math.abs((blob.brightness || 50) - candBri) / 100;
                if (briDiff > _reviveAreaDiff) continue;

                revivePairs.push({ bi, ci, d2, briDiff });
            }
        }

        revivePairs.sort((a, b) => a.d2 - b.d2 || a.briDiff - b.briDiff);

        let usedReviveBlobs = new Set();
        for (let pair of revivePairs) {
            if (usedReviveBlobs.has(pair.bi) || usedCands.has(pair.ci)) continue;

            let blob = _persistentBlobs[pair.bi];
            let cand = screenCandidates[pair.ci];

            blob.prevPos.set(blob.posicao.x, blob.posicao.y);
            blob.posicao.x = cand.x;
            blob.posicao.y = cand.y;
            blob.cor = cand.c;
            blob.brightness = brightness(cand.c);
            blob.velocity.set(cand.x - blob.prevPos.x, cand.y - blob.prevPos.y);
            blob.state = 'active';
            blob.lostFrames = 0;
            blob.matchedThisFrame = true;
            blob.age++;
            blob.reviveFlash = 15;
            blob.reviveCount++;

            if (_trailEnabled) {
                blob.trail.push({ x: blob.posicao.x, y: blob.posicao.y });
                if (blob.trail.length > _trailLength) blob.trail.shift();
            }

            usedReviveBlobs.add(pair.bi);
            usedCands.add(pair.ci);
        }
    }

    // Unmatched candidates → new blobs
    for (let ci = 0; ci < screenCandidates.length; ci++) {
        if (usedCands.has(ci)) continue;
        let cand = screenCandidates[ci];
        let newBlob = new PersistentBlob(cand.x, cand.y, cand.c, blobVarLevel, _nextBlobId++);
        _persistentBlobs.push(newBlob);
    }

    // Remove expired blobs; hard cap
    _persistentBlobs = _persistentBlobs.filter(b => b.state !== 'expired');
    let hardCap = numPoints * 3;
    if (_persistentBlobs.length > hardCap) {
        // Keep newest (highest ID) — sort by age desc, trim
        _persistentBlobs.sort((a, b) => b.age - a.age);
        _persistentBlobs.length = hardCap;
    }

    // Tick down revive flash counters
    for (let blob of _persistentBlobs) {
        if (blob.reviveFlash > 0) blob.reviveFlash--;
    }

    // Populate trackedPoints from persistent blobs
    trackedPoints = [];
    for (let blob of _persistentBlobs) {
        if (blob.age >= _minBlobAge) {
            trackedPoints.push(blob); // PersistentBlob is superset of TrackedPoint
        }
    }
}

function trackPoints() {
    trackedPoints = [];
    if (currentMode === 0 || !videoLoaded || !videoPlaying) return;

    // FACE LANDMARK modes (EYES=15, LIPS=16, FACE=17) — uses MediaPipe landmarks but needs pixel data for color sampling
    if (currentMode >= 15 && currentMode <= 17) {
        // Use offscreen canvas for color sampling instead of p5's heavyweight loadPixels()
        const vid = videoEl.elt;
        if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;
        if (!window._mpFaceCanvas) window._mpFaceCanvas = document.createElement('canvas');
        const fc = window._mpFaceCanvas;
        if (fc.width !== vid.videoWidth || fc.height !== vid.videoHeight) {
            fc.width = vid.videoWidth; fc.height = vid.videoHeight;
        }
        if (!window._mpFaceCtx) window._mpFaceCtx = fc.getContext('2d', { willReadFrequently: true });
        window._mpFaceCtx.drawImage(vid, 0, 0);

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
                // Reuse offscreen canvas already drawn above for color sampling
                const ts = performance.now();
                const result = window.mpFaceLandmarker.detectForVideo(fc, ts);
                if (!window._faceDetectCount) window._faceDetectCount = 0;
                window._faceDetectCount++;
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

        // Get pixel data from offscreen canvas for color sampling (avoids p5 loadPixels)
        const _facePixelData = window._mpFaceCtx.getImageData(0, 0, w, h).data;

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

                // Sample pixel color from offscreen canvas
                let idx = (vx + vy * w) * 4;
                let r = _facePixelData[idx], g = _facePixelData[idx + 1], b = _facePixelData[idx + 2];
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

        shuffleArray(candidates);
        if (_dedupRadius > 0) candidates = dedupCandidates(candidates, _dedupRadius);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];

        if (_persistenceEnabled) {
            matchAndUpdateBlobs(candidates, numPoints, blobVarLevel);
        } else {
            for (let i = 0; i < numPoints; i++) {
                let c = candidates[i];
                let sc = videoToScreenCoords(c.x, c.y);
                trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
            }
        }
        return;
    }

    // MASK mode: AI re-segmentation — use mask directly for blob placement
    if (currentMode === 14 && maskReady && maskSegData && maskClickNorm) {
        videoEl.loadPixels();
        if (videoEl.pixels.length === 0) return;
        const w = videoEl.width, h = videoEl.height;

        // Adaptive re-segmentation: interval adjusts based on centroid drift
        maskFrameCount++;
        if (maskFrameCount >= maskResegInterval && window.mpSegmenterReady) {
            maskFrameCount = 0;
            maskSegmentWithPoint(maskClickNorm.x, maskClickNorm.y, false, 'replace');
        }

        // Use current mask to generate blob candidates
        let gridSize = adaptiveGridSize(w);
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

        shuffleArray(candidates);
        if (_dedupRadius > 0) candidates = dedupCandidates(candidates, _dedupRadius);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];
        if (_persistenceEnabled) {
            matchAndUpdateBlobs(candidates, numPoints, blobVarLevel);
        } else {
            for (let i = 0; i < numPoints; i++) {
                let c = candidates[i];
                let sc = videoToScreenCoords(c.x, c.y);
                trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
            }
        }
        return;
    }

    // BG SUB mode (19): detect pixels differing from captured reference frame
    if (currentMode === 19) {
        videoEl.loadPixels();
        if (videoEl.pixels.length === 0 || !_bgRefFrame) return;
        const w = videoEl.width, h = videoEl.height;
        let gridSize = adaptiveGridSize(w);
        let threshold = map(paramValues[1], 0, 100, 80, 10); // spectrum controls threshold
        let candidates = [];
        for (let y = 0; y < h; y += gridSize) {
            for (let x = 0; x < w; x += gridSize) {
                if (_roiEnabled && _roiRect) {
                    if (x < _roiRect.x1 || x > _roiRect.x2 || y < _roiRect.y1 || y > _roiRect.y2) continue;
                }
                let idx = (x + y * w) * 4;
                let dr = videoEl.pixels[idx] - _bgRefFrame[idx];
                let dg = videoEl.pixels[idx+1] - _bgRefFrame[idx+1];
                let db = videoEl.pixels[idx+2] - _bgRefFrame[idx+2];
                let dist = Math.sqrt(dr*dr + dg*dg + db*db);
                if (dist > threshold) {
                    candidates.push(new CandidatePoint(x, y, color(videoEl.pixels[idx], videoEl.pixels[idx+1], videoEl.pixels[idx+2])));
                }
            }
        }
        shuffleArray(candidates);
        if (_clusterEnabled && candidates.length > 0) candidates = dbscanCluster(candidates, _clusterEps, _clusterMinPts);
        if (_dedupRadius > 0) candidates = dedupCandidates(candidates, _dedupRadius);
        let quantityLevel = paramValues[0];
        let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
        numPoints = min(numPoints, candidates.length);
        let blobVarLevel = paramValues[6];
        if (_persistenceEnabled) {
            matchAndUpdateBlobs(candidates, numPoints, blobVarLevel);
        } else {
            for (let i = 0; i < numPoints; i++) {
                let c = candidates[i];
                let sc = videoToScreenCoords(c.x, c.y);
                trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
            }
        }
        return;
    }

    // Pixel-based tracking modes (1-13) need pixel data
    // 4B: Skip loadPixels for paused video — reuse cached candidates (except temporal modes 3, 12)
    let usePauseCache = !videoPlaying && _cachedCandidates && currentMode !== 3 && currentMode !== 12;

    let candidates = [];
    let spectrum, w, h, gridSize, newGridPixels;

    if (usePauseCache) {
        candidates = _cachedCandidates;
    } else {
        videoEl.loadPixels();
        if (videoEl.pixels.length === 0) return;
    }

    spectrum = map(paramValues[1], 0, 100, 0, 70);
    w = videoEl.width; h = videoEl.height;
    gridSize = adaptiveGridSize(w);
    newGridPixels = {};

    if (usePauseCache) {
        // Skip grid scan — go straight to output
    } else {

    for (let y = 0; y < h; y += gridSize) {
        for (let x = 0; x < w; x += gridSize) {
            if (_roiEnabled && _roiRect) {
                if (x < _roiRect.x1 || x > _roiRect.x2 || y < _roiRect.y1 || y > _roiRect.y2) continue;
            }
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
    } // end if (!usePauseCache) grid scan
    prevGridPixels = newGridPixels;
    _cachedCandidates = candidates.slice(); // 4B: cache for paused reuse
    if (_clusterEnabled && candidates.length > 0) candidates = dbscanCluster(candidates, _clusterEps, _clusterMinPts);
    shuffleArray(candidates);
    if (_dedupRadius > 0) candidates = dedupCandidates(candidates, _dedupRadius);
    let quantityLevel = paramValues[0];
    let numPoints = (quantityLevel <= 10) ? floor(quantityLevel) : floor(map(quantityLevel, 11, 100, 11, candidates.length));
    numPoints = min(numPoints, candidates.length);
    let blobVarLevel = paramValues[6];

    if (_persistenceEnabled) {
        matchAndUpdateBlobs(candidates, numPoints, blobVarLevel);
    } else {
        for (let i = 0; i < numPoints; i++) {
            let c = candidates[i];
            let sc = videoToScreenCoords(c.x, c.y);
            trackedPoints.push(new TrackedPoint(sc.x, sc.y, c.c, blobVarLevel));
        }
    }
}

function drawHeatmap() {
    if (!activeVizModes.has(15)) return;
    // Lazy-init offscreen canvas
    if (!_heatmapCanvas || _heatmapCanvas.width !== width || _heatmapCanvas.height !== height) {
        _heatmapCanvas = document.createElement('canvas');
        _heatmapCanvas.width = width;
        _heatmapCanvas.height = height;
        _heatmapCtx = _heatmapCanvas.getContext('2d');
        _heatmapCtx.fillStyle = 'black';
        _heatmapCtx.fillRect(0, 0, width, height);
    }
    // Fade existing heatmap (decay)
    _heatmapCtx.globalCompositeOperation = 'source-over';
    _heatmapCtx.fillStyle = `rgba(0,0,0,${1 - _heatmapDecay})`;
    _heatmapCtx.fillRect(0, 0, width, height);

    // Add bright dots at each tracked point
    _heatmapCtx.globalCompositeOperation = 'lighter';
    for (let p of trackedPoints) {
        let r = red(p.cor), g = green(p.cor), b = blue(p.cor);
        let gradient = _heatmapCtx.createRadialGradient(p.posicao.x, p.posicao.y, 0, p.posicao.x, p.posicao.y, 20);
        gradient.addColorStop(0, `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},0.6)`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        _heatmapCtx.fillStyle = gradient;
        _heatmapCtx.fillRect(p.posicao.x - 20, p.posicao.y - 20, 40, 40);
    }

    // Composite onto main canvas with additive blending
    drawingContext.save();
    drawingContext.globalCompositeOperation = 'lighter';
    drawingContext.globalAlpha = 0.7;
    drawingContext.drawImage(_heatmapCanvas, 0, 0);
    drawingContext.restore();
}

function drawTrails() {
    if (!_trailEnabled || !_persistenceEnabled || _persistentBlobs.length === 0) return;
    noFill();
    for (let blob of _persistentBlobs) {
        if (blob.trail.length < 2 || blob.state === 'expired') continue;
        let r = red(blob.cor), g = green(blob.cor), b = blue(blob.cor);
        let len = min(blob.trail.length, _trailLength);
        let startIdx = blob.trail.length - len;
        beginShape();
        for (let i = startIdx; i < blob.trail.length; i++) {
            let t = (i - startIdx) / (len - 1); // 0=oldest, 1=newest
            let alpha = t * _trailOpacity * 255;
            let weight = 0.5 + t * 2.5;
            stroke(r, g, b, alpha);
            strokeWeight(weight);
            vertex(blob.trail[i].x, blob.trail[i].y);
        }
        endShape();
    }
}

function drawLines() {
    if (trackedPoints.length < 2) return;
    let opacity = map(paramValues[2], 0, 100, 0, 255);
    let c = color(lineColor);
    let lr = red(c), lg = green(c), lb = blue(c);
    stroke(lr, lg, lb, opacity);
    strokeWeight(lineWeight);
    noFill();
    if (lineDashed) drawingContext.setLineDash([8, 4]);

    if (connectionMode === 'hub') {
        // All lines route through canvas center
        let cx = width / 2, cy = height / 2;
        for (let p of trackedPoints) {
            line(p.posicao.x, p.posicao.y, cx, cy);
        }
    } else if (connectionMode === 'web') {
        // Connect nearby blobs (constellation/web look)
        let maxD = Math.min(width, height) * 0.3;
        let pts = trackedPoints;
        let len = Math.min(pts.length, 80); // cap for perf
        for (let i = 0; i < len; i++) {
            for (let j = i + 1; j < len; j++) {
                let dx = pts[i].posicao.x - pts[j].posicao.x;
                let dy = pts[i].posicao.y - pts[j].posicao.y;
                let d = Math.sqrt(dx*dx + dy*dy);
                if (d < maxD) {
                    let a = map(d, 0, maxD, opacity, 0);
                    stroke(lr, lg, lb, a);
                    line(pts[i].posicao.x, pts[i].posicao.y, pts[j].posicao.x, pts[j].posicao.y);
                }
            }
        }
    } else {
        // Chain mode (default — connect in point order)
        let curvatureLevel = lineStraight ? 0 : paramValues[3];
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

    if (lineDashed) drawingContext.setLineDash([]);
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
        else if (vizMode === 14) { // ID (persistent blob ID)
            if (_persistenceEnabled && p.id !== undefined) {
                push();
                fill(0, 255, 200, 220); noStroke(); textSize(13); textStyle(BOLD);
                text(`#${p.id}`, offsetX, curY);
                textStyle(NORMAL);
                // Show state indicator
                if (p.state === 'lost') {
                    fill(255, 100, 100, 180); textSize(8);
                    text('LOST', offsetX + 40, curY);
                } else if (p.state === 'new') {
                    fill(100, 255, 100, 180); textSize(8);
                    text('NEW', offsetX + 40, curY);
                } else if (p.reviveFlash > 0) {
                    fill(255, 200, 0, 180); textSize(8);
                    text('REVIVED', offsetX + 40, curY);
                }
                pop();
                curY += 16;
            }
        }
        else if (vizMode === 13) { // VEL (velocity vectors)
            if (_persistenceEnabled && p.velocity) {
                push();
                let speed = p.velocity.mag();
                if (speed > 0.5) {
                    stroke(0, 255, 200, 180); strokeWeight(2); noFill();
                    let arrowLen = speed * 3;
                    let ax = p.posicao.x + p.velocity.x / speed * arrowLen;
                    let ay = p.posicao.y + p.velocity.y / speed * arrowLen;
                    line(p.posicao.x, p.posicao.y, ax, ay);
                    // Arrowhead
                    let angle = atan2(p.velocity.y, p.velocity.x);
                    let headLen = min(8, arrowLen * 0.3);
                    line(ax, ay, ax - headLen * cos(angle - 0.4), ay - headLen * sin(angle - 0.4));
                    line(ax, ay, ax - headLen * cos(angle + 0.4), ay - headLen * sin(angle + 0.4));
                }
                noStroke(); fill(0, 255, 200, 180); textSize(9);
                text(`${speed.toFixed(1)}px/f`, offsetX, curY);
                pop();
                curY += 14;
            }
        }
    }
}

// ── BLOB STYLE RENDERING ──────────────────────────

function drawBlobStyle(p, w, h, tbc, alpha, weight) {
    let r = red(tbc), g = green(tbc), b = blue(tbc);
    let a = alpha !== undefined ? alpha : 255;
    let wt = weight || trackBoxWeight;
    let px = p.posicao.x, py = p.posicao.y;

    switch (blobStyle) {
        case 'lframe':   _drawLFrame(px, py, w, h, r, g, b, a, wt); break;
        case 'xframe':   _drawXFrame(px, py, w, h, r, g, b, a, wt); break;
        case 'scope':    _drawScope(px, py, w, h, r, g, b, a, wt); break;
        case 'win2k':    _drawWin2K(px, py, w, h, r, g, b, a, wt, p); break;
        case 'grid':     _drawGrid(px, py, w, h, r, g, b, a, wt); break;
        case 'dash':     _drawDash(px, py, w, h, r, g, b, a, wt); break;
        case 'glow':     _drawGlow(px, py, w, h, r, g, b, a, wt); break;
        case 'particle': _drawParticleSpawn(px, py, r, g, b); break;
        case 'label':    _drawLabel(px, py, w, h, r, g, b, a, wt, p); break;
        case 'label2':   _drawLabel2(px, py, w, h, r, g, b, a, wt, p); break;
        case 'backdrop': _drawBackdrop(px, py, w, h, r, g, b, a); break;
        default: // box
            stroke(r, g, b, a); noFill(); strokeWeight(wt); rectMode(CENTER);
            rect(px, py, w, h);
    }
}

function _drawLFrame(px, py, w, h, r, g, b, a, wt) {
    let x1 = px - w/2, y1 = py - h/2;
    let x2 = px + w/2, y2 = py + h/2;
    let len = Math.min(w, h) * 0.25;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    // Top-left
    line(x1, y1, x1 + len, y1); line(x1, y1, x1, y1 + len);
    // Top-right
    line(x2, y1, x2 - len, y1); line(x2, y1, x2, y1 + len);
    // Bottom-left
    line(x1, y2, x1 + len, y2); line(x1, y2, x1, y2 - len);
    // Bottom-right
    line(x2, y2, x2 - len, y2); line(x2, y2, x2, y2 - len);
}

function _drawXFrame(px, py, w, h, r, g, b, a, wt) {
    let hw = w/2, hh = h/2;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    // Diagonals from corners
    line(px - hw, py - hh, px + hw, py + hh);
    line(px + hw, py - hh, px - hw, py + hh);
    // Center diamond
    let d = Math.min(w, h) * 0.15;
    line(px - d, py, px, py - d); line(px, py - d, px + d, py);
    line(px + d, py, px, py + d); line(px, py + d, px - d, py);
}

function _drawScope(px, py, w, h, r, g, b, a, wt) {
    let rad = Math.min(w, h) / 2;
    stroke(r, g, b, a); strokeWeight(wt); noFill();
    ellipse(px, py, rad * 2, rad * 2);
    // Crosshair with gap
    let ext = rad * 1.3, gap = rad * 0.3;
    line(px - ext, py, px - gap, py); line(px + gap, py, px + ext, py);
    line(px, py - ext, px, py - gap); line(px, py + gap, px, py + ext);
    // Tick marks
    let tk = rad * 0.1;
    strokeWeight(wt * 0.6);
    line(px - rad, py - tk, px - rad, py + tk);
    line(px + rad, py - tk, px + rad, py + tk);
    line(px - tk, py - rad, px + tk, py - rad);
    line(px - tk, py + rad, px + tk, py + rad);
    // Center dot
    fill(r, g, b, a); noStroke(); circle(px, py, 3);
}

function _drawWin2K(px, py, w, h, r, g, b, a, wt, pt) {
    // Enforce minimum size for Win2K chrome
    w = Math.max(w, 80); h = Math.max(h, 50);
    let ctx = drawingContext;
    let x = px - w/2, y = py - h/2;
    let titleH = Math.min(20, Math.max(14, h * 0.18));
    ctx.save();

    // Outer 3D raised border
    ctx.lineWidth = 1;
    // Highlight (top-left)
    ctx.strokeStyle = '#FFFFFF';
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    // Shadow (bottom-right)
    ctx.strokeStyle = '#404040';
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.stroke();
    // Inner highlight
    ctx.strokeStyle = '#D4D0C8';
    ctx.beginPath(); ctx.moveTo(x+1, y+h-1); ctx.lineTo(x+1, y+1); ctx.lineTo(x+w-1, y+1); ctx.stroke();
    // Inner shadow
    ctx.strokeStyle = '#808080';
    ctx.beginPath(); ctx.moveTo(x+w-1, y+1); ctx.lineTo(x+w-1, y+h-1); ctx.lineTo(x+1, y+h-1); ctx.stroke();

    // Title bar gradient (classic Windows 2000 blue)
    let grad = ctx.createLinearGradient(x+2, 0, x+w-2, 0);
    grad.addColorStop(0, '#0A246A');
    grad.addColorStop(1, '#A6CAF0');
    ctx.fillStyle = grad;
    ctx.fillRect(x+2, y+2, w-4, titleH);

    // Title text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + Math.round(titleH * 0.65) + 'px Tahoma, "MS Sans Serif", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let title = pt.dynamicWord || ('blob_' + Math.round(px) + '.exe');
    ctx.fillText(title, x+4, y+2+titleH/2, w-50);

    // Window buttons: close, maximize, minimize
    let bs = Math.min(titleH - 4, 14);
    let by = y + 2 + (titleH - bs) / 2;
    // Close (X)
    let bx = x + w - 4 - bs;
    _win2kButton(ctx, bx, by, bs);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx+3, by+3); ctx.lineTo(bx+bs-3, by+bs-3);
    ctx.moveTo(bx+bs-3, by+3); ctx.lineTo(bx+3, by+bs-3);
    ctx.stroke();
    // Maximize
    bx -= bs + 2;
    _win2kButton(ctx, bx, by, bs);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1;
    ctx.strokeRect(bx+3, by+3, bs-6, bs-6);
    ctx.fillStyle = '#000000'; ctx.fillRect(bx+3, by+3, bs-6, 2);
    // Minimize
    bx -= bs + 2;
    _win2kButton(ctx, bx, by, bs);
    ctx.fillStyle = '#000000'; ctx.fillRect(bx+3, by+bs-5, bs-6, 2);

    // Client area background (semi-transparent gray)
    ctx.fillStyle = 'rgba(192,192,192,0.15)';
    ctx.fillRect(x+2, y+2+titleH, w-4, h-4-titleH);

    ctx.restore();
}

function _win2kButton(ctx, x, y, sz) {
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(x, y, sz, sz);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y+sz); ctx.lineTo(x, y); ctx.lineTo(x+sz, y); ctx.stroke();
    ctx.strokeStyle = '#808080';
    ctx.beginPath(); ctx.moveTo(x+sz, y); ctx.lineTo(x+sz, y+sz); ctx.lineTo(x, y+sz); ctx.stroke();
}

function _drawGrid(px, py, w, h, r, g, b, a, wt) {
    let x1 = px - w/2, y1 = py - h/2;
    stroke(r, g, b, a); strokeWeight(wt); noFill(); rectMode(CORNER);
    rect(x1, y1, w, h);
    // 3×3 grid lines
    stroke(r, g, b, a * 0.4); strokeWeight(wt * 0.5);
    for (let i = 1; i < 3; i++) {
        let gx = x1 + (w * i / 3);
        let gy = y1 + (h * i / 3);
        line(gx, y1, gx, y1 + h);
        line(x1, gy, x1 + w, gy);
    }
    // Center crosshair
    stroke(r, g, b, a * 0.6); strokeWeight(wt * 0.3);
    let cx = px, cy = py, m = Math.min(w, h) * 0.08;
    line(cx - m, cy, cx + m, cy); line(cx, cy - m, cx, cy + m);
}

function _drawDash(px, py, w, h, r, g, b, a, wt) {
    let ctx = drawingContext;
    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.lineWidth = wt;
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.restore();
}

function _drawGlow(px, py, w, h, r, g, b, a, wt) {
    let ctx = drawingContext;
    ctx.save();
    ctx.shadowColor = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.shadowBlur = Math.max(15, Math.min(w, h) * 0.3);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';
    ctx.lineWidth = wt;
    // Draw twice for stronger glow
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.strokeRect(px - w/2, py - h/2, w, h);
    ctx.restore();
}

function _drawParticleSpawn(px, py, r, g, b) {
    if (_blobParticles.length < _MAX_PARTICLES) {
        for (let i = 0; i < 2; i++) {
            let angle = Math.random() * Math.PI * 2;
            let speed = 0.5 + Math.random() * 2;
            _blobParticles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                decay: 0.008 + Math.random() * 0.02,
                r: r, g: g, b: b,
                sz: 2 + Math.random() * 4
            });
        }
    }
}

function _updateBlobParticles() {
    let ctx = drawingContext;
    for (let i = _blobParticles.length - 1; i >= 0; i--) {
        let pt = _blobParticles[i];
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.02; // slight gravity
        pt.life -= pt.decay;
        if (pt.life <= 0) { _blobParticles.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(' + pt.r + ',' + pt.g + ',' + pt.b + ',' + (pt.life * 0.8) + ')';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.sz * pt.life, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ── LABEL style — blob ID text at center with background rect ──
function _drawLabel(px, py, w, h, r, g, b, a, wt, pt) {
    let ctx = drawingContext;
    ctx.save();
    let idText = '#' + (pt.id !== undefined ? pt.id : '?');
    let fontSize = Math.max(10, Math.min(w, h) * 0.35);
    ctx.font = 'bold ' + Math.round(fontSize) + 'px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let tm = ctx.measureText(idText);
    let padX = 6, padY = 3;
    let bgW = tm.width + padX * 2;
    let bgH = fontSize + padY * 2;
    // Background rect
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px - bgW / 2, py - bgH / 2, bgW, bgH);
    // Text
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a / 255) + ')';
    ctx.fillText(idText, px, py);
    ctx.restore();
}

// ── LABEL2 style — pill chip with ID + coordinates ──────────
function _drawLabel2(px, py, w, h, r, g, b, a, wt, pt) {
    let ctx = drawingContext;
    ctx.save();
    let idText = '#' + (pt.id !== undefined ? pt.id : '?');
    let coordText = Math.round(px) + ',' + Math.round(py);
    let label = idText + '  ' + coordText;
    let fontSize = Math.max(11, Math.min(w, h) * 0.3);
    ctx.font = '600 ' + Math.round(fontSize) + 'px "Commit Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let tm = ctx.measureText(label);
    let padX = 10, padY = 5;
    let bgW = tm.width + padX * 2;
    let bgH = fontSize + padY * 2;
    let rad = bgH / 2; // pill radius
    // Pill background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.moveTo(px - bgW / 2 + rad, py - bgH / 2);
    ctx.lineTo(px + bgW / 2 - rad, py - bgH / 2);
    ctx.arcTo(px + bgW / 2, py - bgH / 2, px + bgW / 2, py, rad);
    ctx.arcTo(px + bgW / 2, py + bgH / 2, px + bgW / 2 - rad, py + bgH / 2, rad);
    ctx.lineTo(px - bgW / 2 + rad, py + bgH / 2);
    ctx.arcTo(px - bgW / 2, py + bgH / 2, px - bgW / 2, py, rad);
    ctx.arcTo(px - bgW / 2, py - bgH / 2, px - bgW / 2 + rad, py - bgH / 2, rad);
    ctx.closePath();
    ctx.fill();
    // Pill border
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a / 255 * 0.6) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Text
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a / 255) + ')';
    ctx.fillText(label, px, py + 1);
    ctx.restore();
}

// ── BACKDROP style — semi-transparent filled rectangle ──────
function _drawBackdrop(px, py, w, h, r, g, b, a) {
    let ctx = drawingContext;
    ctx.save();
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a / 255 * 0.4) + ')';
    ctx.fillRect(px - w / 2, py - h / 2, w, h);
    // Subtle border
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (a / 255 * 0.2) + ')';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - w / 2, py - h / 2, w, h);
    ctx.restore();
}
