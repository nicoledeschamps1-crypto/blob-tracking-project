// ══════════════════════════════════════════
// SECTION: TIMELINE (blob-timeline.js)
// Timeline segments, waveform, beat detection,
// playhead, drag/resize, lane assignment
// ══════════════════════════════════════════

function addTimelineSegmentAt(effectName, startTime) {
    let tlDur = getTimelineDuration();
    if (!tlDur) return;
    let endTime = Math.min(startTime + 5, tlDur);
    let seg = {
        id: nextSegId++,
        effect: effectName,
        startTime: startTime,
        endTime: endTime,
        params: captureEffectParams(effectName),
        lane: 0,
        color: FX_CAT_COLORS[FX_CATEGORIES[effectName]] || '#888'
    };
    timelineSegments.push(seg);
    assignLanes();
    renderTimelineSegments();
    let newEl = ui.tlTrack.querySelector(`.timeline-segment[data-id="${seg.id}"]`);
    if (newEl) {
        newEl.classList.add('just-added');
        setTimeout(() => newEl.classList.remove('just-added'), 500);
    }
}

function seekToTimelinePosition(clientX) {
    let tlDur = getTimelineDuration();
    if (!tlDur || !videoEl) return;
    let rect = ui.tlTrack.getBoundingClientRect();
    let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let seekTime = ratio * tlDur;
    if (tlRulerMode === 'audio') {
        let videoTime = seekTime + audioOffset;
        if (videoDuration > 0) videoTime = ((videoTime % videoDuration) + videoDuration) % videoDuration;
        else videoTime = 0;
        videoEl.time(videoTime);
        if (audioElement && audioLoaded) audioElement.currentTime = Math.max(0, seekTime);
    } else {
        videoEl.time(Math.min(seekTime, videoDuration || seekTime));
        if (audioElement && audioLoaded) audioElement.currentTime = Math.max(0, getAudioTimeForVideo(seekTime));
    }
}

function updateTimelinePlayhead() {
    let tlDur = getTimelineDuration();
    if (!ui.tlPlayhead || !tlDur) return;
    let currentTime;
    if (tlRulerMode === 'audio' && audioElement && audioLoaded) {
        currentTime = audioElement.currentTime;
    } else {
        currentTime = videoEl.time();
    }
    let ratio = Math.max(0, Math.min(1, currentTime / tlDur));
    ui.tlPlayhead.style.left = (ratio * 100) + '%';
    ui.tlTime.textContent = formatTime(currentTime) + ' / ' + formatTime(tlDur);
}

function formatTime(s) {
    let m = Math.floor(s / 60);
    let sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

function getTimelineDuration() {
    if (tlRulerMode === 'audio' && audioDuration > 0) return audioDuration;
    return videoDuration || audioDuration;
}

function updateOffsetLabel() {
    if (!ui.tlOffsetLabel) return;
    if (Math.abs(audioOffset) < 0.05) {
        ui.tlOffsetLabel.classList.add('hidden');
    } else {
        ui.tlOffsetLabel.classList.remove('hidden');
        let sign = audioOffset >= 0 ? '+' : '';
        ui.tlOffsetLabel.textContent = 'OFFSET: ' + sign + audioOffset.toFixed(1) + 's';
    }
}

function getAudioTimeForVideo(videoTime) {
    return videoTime - audioOffset;
}

function showTimeline() {
    ui.tlContainer.classList.remove('hidden');
}
function hideTimeline() {
    ui.tlContainer.classList.add('hidden');
}

// ── Audio Waveform Analysis for Timeline ───

function analyzeAudioForTimeline(file) {
    let reader = new FileReader();
    reader.onload = function(e) {
        initAudioContext();
        audioContext.decodeAudioData(e.target.result.slice(0), function(buffer) {
            let sr = buffer.sampleRate;
            let raw = buffer.getChannelData(0);
            if (buffer.numberOfChannels > 1) {
                let ch2 = buffer.getChannelData(1);
                let mono = new Float32Array(raw.length);
                for (let i = 0; i < raw.length; i++) mono[i] = (raw[i] + ch2[i]) * 0.5;
                raw = mono;
            }

            let winSize = Math.floor(sr * 0.02); // 20ms windows
            let numWins = Math.floor(raw.length / winSize);

            // Low-pass filter for bass (~200Hz cutoff)
            let alpha1 = (1.0 / sr) / ((1.0 / (200 * 2 * Math.PI)) + (1.0 / sr));
            let bassF = new Float32Array(raw.length);
            bassF[0] = raw[0] * alpha1;
            for (let i = 1; i < raw.length; i++) bassF[i] = bassF[i-1] + alpha1 * (raw[i] - bassF[i-1]);

            // Low-pass at 4000Hz (everything below = bass+mid)
            let alpha2 = (1.0 / sr) / ((1.0 / (4000 * 2 * Math.PI)) + (1.0 / sr));
            let midLowF = new Float32Array(raw.length);
            midLowF[0] = raw[0] * alpha2;
            for (let i = 1; i < raw.length; i++) midLowF[i] = midLowF[i-1] + alpha2 * (raw[i] - midLowF[i-1]);

            // Compute RMS per window for each band
            tlWaveform = [];
            for (let w = 0; w < numWins; w++) {
                let s = w * winSize, e = s + winSize;
                let fullR = 0, bassR = 0, midR = 0, highR = 0;
                for (let i = s; i < e; i++) {
                    fullR += raw[i] * raw[i];
                    bassR += bassF[i] * bassF[i];
                    let mid = midLowF[i] - bassF[i];
                    midR += mid * mid;
                    let high = raw[i] - midLowF[i];
                    highR += high * high;
                }
                tlWaveform.push({
                    time: (s + winSize / 2) / sr,
                    full: Math.sqrt(fullR / winSize),
                    bass: Math.sqrt(bassR / winSize),
                    mid: Math.sqrt(midR / winSize),
                    high: Math.sqrt(highR / winSize)
                });
            }

            // Normalize each band to 0-1
            let mx = { full: 0, bass: 0, mid: 0, high: 0 };
            for (let w of tlWaveform) {
                mx.full = Math.max(mx.full, w.full);
                mx.bass = Math.max(mx.bass, w.bass);
                mx.mid = Math.max(mx.mid, w.mid);
                mx.high = Math.max(mx.high, w.high);
            }
            for (let w of tlWaveform) {
                w.full = mx.full > 0 ? w.full / mx.full : 0;
                w.bass = mx.bass > 0 ? w.bass / mx.bass : 0;
                w.mid = mx.mid > 0 ? w.mid / mx.mid : 0;
                w.high = mx.high > 0 ? w.high / mx.high : 0;
            }

            // Beat detection — peaks in bass energy
            tlBeats = [];
            let bw = Math.floor(0.3 / 0.02); // 300ms lookback
            for (let i = bw; i < tlWaveform.length - 2; i++) {
                let avg = 0;
                for (let j = i - bw; j < i; j++) avg += tlWaveform[j].bass;
                avg /= bw;
                if (tlWaveform[i].bass > avg * 1.5 && tlWaveform[i].bass > 0.15) {
                    let isPeak = true;
                    for (let j = Math.max(0, i - 4); j <= Math.min(tlWaveform.length - 1, i + 4); j++) {
                        if (j !== i && tlWaveform[j].bass > tlWaveform[i].bass) { isPeak = false; break; }
                    }
                    if (isPeak && (tlBeats.length === 0 || tlWaveform[i].time - tlBeats[tlBeats.length - 1] > 0.18)) {
                        tlBeats.push(tlWaveform[i].time);
                    }
                }
            }

            audioDuration = buffer.duration;
            renderTimelineWaveform();
        }, function(err) {
            console.error('Audio decode failed:', err);
            ui.audioName.innerText = 'decode error — try another file';
        });
    };
    reader.readAsArrayBuffer(file);
}

function renderTimelineWaveform() {
    let canvas = ui.tlWaveformCanvas;
    if (!canvas || !tlWaveform || tlWaveform.length === 0) return;
    let rect = ui.tlTrack.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    let ctx = canvas.getContext('2d');
    let w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let audioDur = tlWaveform[tlWaveform.length - 1].time;
    let dur = getTimelineDuration();
    if (dur <= 0) return;

    let colors = {
        full: 'rgba(200, 200, 200, 0.55)',
        kick: 'rgba(231, 76, 60, 0.65)',
        vocal: 'rgba(108, 92, 231, 0.6)',
        hats: 'rgba(46, 204, 113, 0.55)'
    };
    let bandKey = tlBandView === 'kick' ? 'bass' : tlBandView === 'vocal' ? 'mid' : tlBandView === 'hats' ? 'high' : 'full';
    let color = colors[tlBandView] || colors.full;

    ctx.fillStyle = color;
    let barCount = Math.min(w, tlWaveform.length);
    let barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
        let tlTime = (i / barCount) * dur;
        let audioTime = tlTime - audioOffset;
        if (audioTime < 0 || audioTime > audioDur) continue;
        let idx = Math.floor(audioTime / audioDur * tlWaveform.length);
        idx = Math.max(0, Math.min(idx, tlWaveform.length - 1));
        let val = tlWaveform[idx][bandKey];
        val = Math.sqrt(val);
        let barH = val * h * 0.92;
        ctx.fillRect(i * barW, h - barH, Math.max(barW, 1), barH);
    }

    // Draw beat markers (cached)
    let beatKey = tlBeats.length + '|' + audioOffset.toFixed(2) + '|' + dur.toFixed(2);
    if (beatKey !== _cachedBeatKey) {
        _cachedBeatKey = beatKey;
        _cachedBeatMarkers.forEach(el => el.remove());
        _cachedBeatMarkers = [];
        for (let beatTime of tlBeats) {
            let tlBeatTime = beatTime + audioOffset;
            if (tlBeatTime < 0 || tlBeatTime > dur) continue;
            let pct = (tlBeatTime / dur) * 100;
            let marker = document.createElement('div');
            marker.className = 'tl-beat-marker';
            marker.style.left = pct + '%';
            ui.tlTrack.appendChild(marker);
            _cachedBeatMarkers.push(marker);
        }
    }
}

function snapToBeat(time) {
    if (tlBeats.length === 0) return time;
    let closest = time;
    let minDist = BEAT_SNAP_MS / 1000;
    for (let bt of tlBeats) {
        let tlBeatTime = bt + audioOffset;
        let dist = Math.abs(tlBeatTime - time);
        if (dist < minDist) {
            minDist = dist;
            closest = tlBeatTime;
        }
    }
    return closest;
}

// ── Timeline Segments ───

function captureEffectParams(effectName) {
    let params = {};
    let map = FX_PARAM_MAP[effectName];
    if (map) map.forEach(p => { params[p.v] = p.g(); });
    return params;
}

function restoreEffectParams(effectName, params) {
    let map = FX_PARAM_MAP[effectName];
    if (map) map.forEach(p => { if (params[p.v] !== undefined) p.s(params[p.v]); });
}

function assignLanes() {
    timelineSegments.sort((a, b) => a.startTime - b.startTime);
    let lanes = [];
    for (let seg of timelineSegments) {
        let placed = false;
        for (let i = 0; i < lanes.length; i++) {
            if (seg.startTime >= lanes[i]) {
                seg.lane = i;
                lanes[i] = seg.endTime;
                placed = true;
                break;
            }
        }
        if (!placed) {
            seg.lane = lanes.length;
            lanes.push(seg.endTime);
        }
    }
}

function renderTimelineSegments() {
    ui.tlTrack.querySelectorAll('.timeline-segment').forEach(el => el.remove());
    let tlDur = getTimelineDuration();
    if (!tlDur) return;
    for (let seg of timelineSegments) {
        let el = document.createElement('div');
        el.className = 'timeline-segment';
        el.dataset.id = seg.id;
        let left = (seg.startTime / tlDur) * 100;
        let w = ((seg.endTime - seg.startTime) / tlDur) * 100;
        el.style.left = left + '%';
        el.style.width = Math.max(w, 0.5) + '%';
        el.style.top = (seg.lane * 20 + 2) + 'px';
        el.style.background = seg.color;
        el.textContent = seg.effect.toUpperCase().slice(0, 6);
        if (selectedSegment && selectedSegment.id === seg.id) el.classList.add('selected');
        // Left/right resize handles
        let hl = document.createElement('div');
        hl.className = 'seg-handle seg-handle-left';
        let hr = document.createElement('div');
        hr.className = 'seg-handle seg-handle-right';
        el.appendChild(hl);
        el.appendChild(hr);
        // Click to select
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedSegment = seg;
            renderTimelineSegments();
        });
        // Double-click to delete
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            timelineSegments = timelineSegments.filter(s => s.id !== seg.id);
            if (selectedSegment && selectedSegment.id === seg.id) selectedSegment = null;
            assignLanes();
            renderTimelineSegments();
        });
        // Drag to move
        setupSegmentDrag(el, seg);
        ui.tlTrack.appendChild(el);
    }
}

function setupSegmentDrag(el, seg) {
    let dragType = null;
    let startX, origStart, origEnd;

    el.querySelector('.seg-handle-left').addEventListener('mousedown', (e) => {
        e.stopPropagation();
        dragType = 'left';
        startX = e.clientX;
        origStart = seg.startTime;
        origEnd = seg.endTime;
        startDrag();
    });
    el.querySelector('.seg-handle-right').addEventListener('mousedown', (e) => {
        e.stopPropagation();
        dragType = 'right';
        startX = e.clientX;
        origStart = seg.startTime;
        origEnd = seg.endTime;
        startDrag();
    });
    el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('seg-handle')) return;
        e.stopPropagation();
        dragType = 'move';
        startX = e.clientX;
        origStart = seg.startTime;
        origEnd = seg.endTime;
        startDrag();
    });

    function startDrag() {
        function onMove(e) {
            let rect = ui.tlTrack.getBoundingClientRect();
            let tlDur = getTimelineDuration();
            let dx = (e.clientX - startX) / rect.width * tlDur;
            if (dragType === 'move') {
                let dur = origEnd - origStart;
                let newStart = Math.max(0, Math.min(origStart + dx, tlDur - dur));
                newStart = snapToBeat(newStart);
                seg.startTime = newStart;
                seg.endTime = newStart + dur;
            } else if (dragType === 'left') {
                let newStart = Math.max(0, Math.min(origStart + dx, seg.endTime - 0.1));
                seg.startTime = snapToBeat(newStart);
            } else if (dragType === 'right') {
                let newEnd = Math.max(seg.startTime + 0.1, Math.min(origEnd + dx, tlDur));
                seg.endTime = snapToBeat(newEnd);
            }
            // CSS-only update during drag
            let left = (seg.startTime / tlDur) * 100;
            let w = ((seg.endTime - seg.startTime) / tlDur) * 100;
            el.style.left = left + '%';
            el.style.width = Math.max(w, 0.5) + '%';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            assignLanes();
            renderTimelineSegments();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }
}

// ── Timeline Effect Application ───

function applyTimelineEffects() {
    if (timelineSegments.length === 0) return;
    let currentTime = (tlRulerMode === 'audio' && audioElement && audioLoaded)
        ? audioElement.currentTime
        : videoEl.time();
    let active = timelineSegments.filter(s => currentTime >= s.startTime && currentTime <= s.endTime);
    if (active.length === 0) return;
    // Sort by pipeline order
    const catOrder = ['color', 'distortion', 'pattern', 'overlay'];
    active.sort((a, b) => catOrder.indexOf(FX_CATEGORIES[a.effect]) - catOrder.indexOf(FX_CATEGORIES[b.effect]));
    const drawOnly = new Set(['grid', 'scanlines', 'vignette']);
    for (let seg of active) {
        let saved = captureEffectParams(seg.effect);
        restoreEffectParams(seg.effect, seg.params);
        let fn = EFFECT_FN_MAP[seg.effect];
        if (fn) {
            if (!drawOnly.has(seg.effect)) loadPixels();
            fn();
            if (!drawOnly.has(seg.effect)) updatePixels();
        }
        restoreEffectParams(seg.effect, saved);
    }
}

// ── TIMELINE UI LISTENERS ──────────────────────

function setupTimelineUIListeners() {
    // Timeline transport controls
    ui.tlBtnPlay.addEventListener('click', togglePlay);
    ui.tlBtnRestart.addEventListener('click', restartVideo);
    ui.tlBtnRecord.addEventListener('click', toggleRecording);

    // Timeline band selector
    ui.tlBandButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tlBandView = e.target.dataset.band;
            ui.tlBandButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTimelineWaveform();
        });
    });

    // Timeline ruler toggle (VIDEO | AUDIO)
    ui.tlRulerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tlRulerMode = e.target.dataset.ruler;
            ui.tlRulerButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTimelineWaveform();
            renderTimelineSegments();
        });
    });

    // Loop mode selector
    ui.tlLoopButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            loopMode = e.target.dataset.loop;
            ui.tlLoopButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            if (audioElement) audioElement.loop = (loopMode === 'loop');
        });
    });

    // Timeline track — merged mousedown for waveform drag + scrub
    ui.tlTrack.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('timeline-segment') || e.target.classList.contains('seg-handle')) return;

        // Alt+click on waveform = drag audio offset
        if (e.altKey && tlWaveform && tlWaveform.length > 0 &&
            (e.target === ui.tlWaveformCanvas || e.target === ui.tlTrack)) {
            e.preventDefault();
            waveformDragging = true;
            let startX = e.clientX;
            let origOffset = audioOffset;
            let rect = ui.tlTrack.getBoundingClientRect();
            let tlDur = getTimelineDuration();

            function onWfMove(ev) {
                let dx = (ev.clientX - startX) / rect.width * tlDur;
                audioOffset = origOffset + dx;
                updateOffsetLabel();
                renderTimelineWaveform();
            }
            function onWfUp() {
                waveformDragging = false;
                document.removeEventListener('mousemove', onWfMove);
                document.removeEventListener('mouseup', onWfUp);
            }
            document.addEventListener('mousemove', onWfMove);
            document.addEventListener('mouseup', onWfUp);
            return;
        }

        // Normal click = scrub
        if (waveformDragging) return;
        tlDragging = true;
        seekToTimelinePosition(e.clientX);
    });
    document.addEventListener('mousemove', (e) => {
        if (tlDragging) seekToTimelinePosition(e.clientX);
    });
    document.addEventListener('mouseup', () => { tlDragging = false; });

    // FX card drag to timeline (drag events handled by setupFxUIListeners)
    // Re-render waveform on resize
    window.addEventListener('resize', () => { if (tlWaveform) renderTimelineWaveform(); });
}
