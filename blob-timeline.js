// ══════════════════════════════════════════
// SECTION: TIMELINE (blob-timeline.js)
// Timeline segments, waveform, beat detection,
// playhead, drag/resize, lane assignment,
// zoom/pan, ruler, segment management
// ══════════════════════════════════════════

let _rulerRedrawPending = false;

// ── Undo/Redo Stack ─────────────────────
const TL_UNDO_MAX = 50;
let tlUndoStack = [];
let tlRedoStack = [];

function tlSaveState() {
    tlUndoStack.push(JSON.stringify(timelineSegments));
    if (tlUndoStack.length > TL_UNDO_MAX) tlUndoStack.shift();
    tlRedoStack = [];
}

function tlUndo() {
    if (tlUndoStack.length === 0) return;
    tlRedoStack.push(JSON.stringify(timelineSegments));
    timelineSegments = JSON.parse(tlUndoStack.pop());
    let maxId = 0;
    for (let s of timelineSegments) if (s.id > maxId) maxId = s.id;
    nextSegId = maxId + 1;
    selectedSegments.clear();
    syncSelectedSegment();
    assignLanes();
    renderTimelineSegments();
}

function tlRedo() {
    if (tlRedoStack.length === 0) return;
    tlUndoStack.push(JSON.stringify(timelineSegments));
    timelineSegments = JSON.parse(tlRedoStack.pop());
    let maxId = 0;
    for (let s of timelineSegments) if (s.id > maxId) maxId = s.id;
    nextSegId = maxId + 1;
    selectedSegments.clear();
    syncSelectedSegment();
    assignLanes();
    renderTimelineSegments();
}

// ── Zoom/Pan Helpers ─────────────────────

function getVisibleTimeRange() {
    let dur = getTimelineDuration();
    if (!dur) return { start: 0, end: 0, duration: 0 };
    let visibleDur = dur / tlZoom;
    let start = tlScrollOffset;
    let end = start + visibleDur;
    return { start, end, duration: visibleDur };
}

function timeToPercent(time) {
    let vr = getVisibleTimeRange();
    if (vr.duration <= 0) return 0;
    return ((time - vr.start) / vr.duration) * 100;
}

function percentToTime(pct) {
    let vr = getVisibleTimeRange();
    return vr.start + (pct / 100) * vr.duration;
}

function clampScroll() {
    let dur = getTimelineDuration();
    if (!dur) return;
    let maxOffset = dur - (dur / tlZoom);
    tlScrollOffset = Math.max(0, Math.min(tlScrollOffset, maxOffset));
}

function refreshTimeline() {
    renderTimelineRuler();
    renderTimelineWaveform();
    renderTimelineSegments();
    updateScrollIndicator();
}

// ── Core Timeline Functions ──────────────

function addModeSegmentAt(modeValue, startTime) {
    let tlDur = getTimelineDuration();
    if (!tlDur) return;
    let endTime = Math.min(startTime + 5, tlDur);
    let seg = {
        id: nextSegId++,
        type: 'mode',
        effect: 'mode:' + modeValue,
        modeValue: modeValue,
        startTime: startTime,
        endTime: endTime,
        params: [...paramValues], // snapshot core params
        lane: 0,
        color: '#aaaaaa'
    };
    tlSaveState();
    timelineSegments.push(seg);
    assignLanes();
    renderTimelineSegments();
    let container = ui.tlTrackInner || ui.tlTrack;
    let newEl = container.querySelector(`.timeline-segment[data-id="${seg.id}"]`);
    if (newEl) {
        newEl.classList.add('just-added');
        setTimeout(() => newEl.classList.remove('just-added'), 500);
    }
}

function addBlobSegmentAt(startTime) {
    let tlDur = getTimelineDuration();
    if (!tlDur) return;
    let endTime = Math.min(startTime + 5, tlDur);
    let seg = {
        id: nextSegId++,
        type: 'blob',
        effect: 'blob',
        startTime: startTime,
        endTime: endTime,
        params: [...paramValues],
        lane: 0,
        color: BLOB_SEG_COLOR
    };
    tlSaveState();
    timelineSegments.push(seg);
    assignLanes();
    renderTimelineSegments();
    let container = ui.tlTrackInner || ui.tlTrack;
    let newEl = container.querySelector(`.timeline-segment[data-id="${seg.id}"]`);
    if (newEl) {
        newEl.classList.add('just-added');
        setTimeout(() => newEl.classList.remove('just-added'), 500);
    }
    // Auto-select the new blob segment for editing
    selectedSegments.clear();
    selectedSegments.add(seg.id);
    syncSelectedSegment();
    renderTimelineSegments();
}

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
    tlSaveState();
    timelineSegments.push(seg);
    assignLanes();
    renderTimelineSegments();
    let container = ui.tlTrackInner || ui.tlTrack;
    let newEl = container.querySelector(`.timeline-segment[data-id="${seg.id}"]`);
    if (newEl) {
        newEl.classList.add('just-added');
        setTimeout(() => newEl.classList.remove('just-added'), 500);
    }
}

function seekToTimelinePosition(clientX) {
    let tlDur = getTimelineDuration();
    if (!tlDur || !videoEl) return;
    let container = ui.tlTrackInner || ui.tlTrack;
    let rect = container.getBoundingClientRect();
    let ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let seekTime = percentToTime(ratio * 100);
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
    let pct = timeToPercent(currentTime);
    ui.tlPlayhead.style.left = Math.max(0, Math.min(100, pct)) + '%';
    ui.tlTime.textContent = formatTime(currentTime) + ' / ' + formatTime(tlDur);

    // Update ruler playhead indicator (throttled to ~15fps)
    if (!_rulerRedrawPending) {
        _rulerRedrawPending = true;
        setTimeout(() => { _rulerRedrawPending = false; renderTimelineRuler(); }, 66);
    }

    // Auto-scroll when zoomed: keep playhead in view
    if (tlZoom > 1 && videoPlaying) {
        let vr = getVisibleTimeRange();
        if (currentTime > vr.start + vr.duration * 0.9 || currentTime < vr.start) {
            tlScrollOffset = currentTime - vr.duration * 0.2;
            clampScroll();
            refreshTimeline();
        }
    }

    // Toggle active class on segments (lightweight, no re-render)
    let container = ui.tlTrackInner || ui.tlTrack;
    container.querySelectorAll('.timeline-segment').forEach(el => {
        let seg = timelineSegments.find(s => s.id == el.dataset.id);
        if (seg) el.classList.toggle('active', currentTime >= seg.startTime && currentTime <= seg.endTime);
    });
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

// ── Time Ruler ───────────────────────────

function renderTimelineRuler() {
    let canvas = ui.tlRulerCanvas;
    if (!canvas) return;
    let parent = canvas.parentElement;
    if (!parent) return;
    let rect = parent.getBoundingClientRect();
    let dpr = window.devicePixelRatio || 1;
    let rulerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-ruler-height')) || 22;
    canvas.width = rect.width * dpr;
    canvas.height = rulerH * dpr;
    canvas.style.width = rect.width + 'px';
    let ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rulerH);

    let vr = getVisibleTimeRange();
    if (vr.duration <= 0) return;

    // Adaptive tick interval
    let majorInterval;
    if (vr.duration < 5) majorInterval = 1;
    else if (vr.duration < 15) majorInterval = 2;
    else if (vr.duration < 30) majorInterval = 5;
    else if (vr.duration < 120) majorInterval = 10;
    else majorInterval = 30;
    let minorInterval = majorInterval / 5;

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px Roboto Mono, monospace';
    ctx.textAlign = 'center';

    let firstTick = Math.floor(vr.start / minorInterval) * minorInterval;
    for (let t = firstTick; t <= vr.end; t += minorInterval) {
        let x = ((t - vr.start) / vr.duration) * rect.width;
        let isMajor = Math.abs(t % majorInterval) < 0.01 || Math.abs(t % majorInterval - majorInterval) < 0.01;
        ctx.beginPath();
        ctx.moveTo(x, isMajor ? 4 : rulerH - 6);
        ctx.lineTo(x, rulerH);
        ctx.lineWidth = isMajor ? 1 : 0.5;
        ctx.stroke();
        if (isMajor && t >= 0) {
            ctx.fillText(formatTime(t), x, rulerH - 8);
        }
    }

    // Draw playhead indicator on ruler
    let currentTime;
    if (tlRulerMode === 'audio' && audioElement && audioLoaded) {
        currentTime = audioElement.currentTime;
    } else {
        currentTime = videoEl ? videoEl.time() : 0;
    }
    let phX = ((currentTime - vr.start) / vr.duration) * rect.width;
    if (phX >= 0 && phX <= rect.width) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(phX - 4, rulerH);
        ctx.lineTo(phX + 4, rulerH);
        ctx.lineTo(phX, rulerH - 5);
        ctx.closePath();
        ctx.fill();
    }
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
            refreshTimeline();
        }, function(err) {
            console.error('Audio decode failed:', err);
            ui.audioName.innerText = 'decode error — try another file';
        });
    };
    reader.readAsArrayBuffer(file);
}

function renderTimelineWaveform() {
    let canvas = ui.tlWaveformCanvas;
    let container = ui.tlTrackInner || ui.tlTrack;
    if (!canvas || !tlWaveform || tlWaveform.length === 0) return;
    let rect = container.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    let ctx = canvas.getContext('2d');
    let w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let audioDur = tlWaveform[tlWaveform.length - 1].time;
    let vr = getVisibleTimeRange();
    if (vr.duration <= 0) return;

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
        let tlTime = vr.start + (i / barCount) * vr.duration;
        let audioTime = tlTime - audioOffset;
        if (audioTime < 0 || audioTime > audioDur) continue;
        let idx = Math.floor(audioTime / audioDur * tlWaveform.length);
        idx = Math.max(0, Math.min(idx, tlWaveform.length - 1));
        let val = tlWaveform[idx][bandKey];
        val = Math.sqrt(val);
        let barH = val * h * 0.92;
        ctx.fillRect(i * barW, h - barH, Math.max(barW, 1), barH);
    }

    // Draw beat markers (zoom-aware)
    let beatKey = tlBeats.length + '|' + audioOffset.toFixed(2) + '|' + vr.start.toFixed(2) + '|' + vr.duration.toFixed(2);
    if (beatKey !== _cachedBeatKey) {
        _cachedBeatKey = beatKey;
        _cachedBeatMarkers.forEach(el => el.remove());
        _cachedBeatMarkers = [];
        for (let beatTime of tlBeats) {
            let tlBeatTime = beatTime + audioOffset;
            if (tlBeatTime < vr.start || tlBeatTime > vr.end) continue;
            let pct = timeToPercent(tlBeatTime);
            let marker = document.createElement('div');
            marker.className = 'tl-beat-marker';
            marker.style.left = pct + '%';
            container.appendChild(marker);
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

function segLabel(seg) {
    if (seg.type === 'blob') {
        let p = seg.params;
        return 'BLOB Q:' + Math.round(p[0]) + ' S:' + Math.round(p[4]) + ' R:' + Math.round(p[5]) + ' ' + formatTime(seg.startTime) + '-' + formatTime(seg.endTime);
    }
    if (seg.type === 'mode') {
        return (MODE_NAMES[seg.modeValue] || 'MODE') + ' ' + formatTime(seg.startTime) + '-' + formatTime(seg.endTime);
    }
    return seg.effect.toUpperCase() + ' ' + formatTime(seg.startTime) + '-' + formatTime(seg.endTime);
}

function syncSelectedSegment() {
    selectedSegment = selectedSegments.size > 0
        ? timelineSegments.find(s => selectedSegments.has(s.id)) || null
        : null;

    // Blob segment editing: sync sliders to segment params
    let banner = document.getElementById('blob-edit-banner');
    if (selectedSegment && selectedSegment.type === 'blob') {
        editingBlobSeg = selectedSegment;
        // Load segment params into sliders
        for (let i = 0; i < editingBlobSeg.params.length; i++) {
            if (ui.sliders[i]) {
                ui.sliders[i].value = editingBlobSeg.params[i];
                if (ui.inputs[i]) {
                    ui.inputs[i].value = Number.isInteger(editingBlobSeg.params[i])
                        ? editingBlobSeg.params[i]
                        : editingBlobSeg.params[i].toFixed(1);
                }
            }
        }
        if (banner) banner.classList.add('visible');
    } else {
        if (editingBlobSeg) {
            // Restore live params to sliders
            editingBlobSeg = null;
            for (let i = 0; i < paramValues.length; i++) {
                if (ui.sliders[i]) {
                    ui.sliders[i].value = paramValues[i];
                    if (ui.inputs[i]) {
                        ui.inputs[i].value = Number.isInteger(paramValues[i])
                            ? paramValues[i]
                            : paramValues[i].toFixed(1);
                    }
                }
            }
        }
        if (banner) banner.classList.remove('visible');
    }
}

function renderTimelineSegments() {
    let container = ui.tlTrackInner || ui.tlTrack;
    container.querySelectorAll('.timeline-segment').forEach(el => el.remove());
    container.querySelectorAll('.tl-lane-line').forEach(el => el.remove());
    let tlDur = getTimelineDuration();
    if (!tlDur) return;

    let vr = getVisibleTimeRange();
    let lanePitch = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tl-lane-pitch')) || 32;

    // Find max lane for lane lines
    let maxLane = 0;
    for (let seg of timelineSegments) {
        if (seg.lane > maxLane) maxLane = seg.lane;
    }

    // Draw lane separator lines
    for (let i = 1; i <= maxLane; i++) {
        let line = document.createElement('div');
        line.className = 'tl-lane-line';
        line.style.top = (i * lanePitch) + 'px';
        container.appendChild(line);
    }

    for (let seg of timelineSegments) {
        // Skip segments entirely outside visible range
        if (seg.endTime < vr.start || seg.startTime > vr.end) continue;

        let el = document.createElement('div');
        el.className = 'timeline-segment';
        el.dataset.id = seg.id;
        el.dataset.type = seg.type || 'effect';
        let left = timeToPercent(seg.startTime);
        let w = ((seg.endTime - seg.startTime) / vr.duration) * 100;
        el.style.left = left + '%';
        el.style.width = Math.max(w, 0.5) + '%';
        el.style.top = (seg.lane * lanePitch + 2) + 'px';
        el.style.background = seg.color;
        el.textContent = segLabel(seg);
        if (selectedSegments.has(seg.id)) el.classList.add('selected');

        // Left/right resize handles
        let hl = document.createElement('div');
        hl.className = 'seg-handle seg-handle-left';
        let hr = document.createElement('div');
        hr.className = 'seg-handle seg-handle-right';
        el.appendChild(hl);
        el.appendChild(hr);

        // Click to select (multi-select with Shift/Cmd)
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                if (selectedSegments.has(seg.id)) selectedSegments.delete(seg.id);
                else selectedSegments.add(seg.id);
            } else {
                selectedSegments.clear();
                selectedSegments.add(seg.id);
            }
            syncSelectedSegment();
            renderTimelineSegments();
        });

        // Double-click to delete
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            tlSaveState();
            if (selectedSegments.has(seg.id) && selectedSegments.size > 1) {
                timelineSegments = timelineSegments.filter(s => !selectedSegments.has(s.id));
                selectedSegments.clear();
            } else {
                timelineSegments = timelineSegments.filter(s => s.id !== seg.id);
                selectedSegments.delete(seg.id);
            }
            syncSelectedSegment();
            assignLanes();
            renderTimelineSegments();
        });

        // Hover tooltip
        el.addEventListener('mouseenter', (e) => {
            let tooltip = document.getElementById('tl-tooltip');
            if (!tooltip) return;
            let label = seg.type === 'blob'
                ? 'BLOB — Q:' + Math.round(seg.params[0]) + ' S:' + Math.round(seg.params[4]) + ' R:' + Math.round(seg.params[5])
                : seg.type === 'mode'
                ? 'Mode: ' + (MODE_NAMES[seg.modeValue] || 'MODE')
                : 'FX: ' + seg.effect.toUpperCase();
            let time = formatTime(seg.startTime) + ' → ' + formatTime(seg.endTime) + ' (' + (seg.endTime - seg.startTime).toFixed(1) + 's)';
            tooltip.innerHTML = '<strong>' + label + '</strong><br>' + time;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 12) + 'px';
            tooltip.style.top = (e.clientY - 30) + 'px';
        });
        el.addEventListener('mousemove', (e) => {
            let tooltip = document.getElementById('tl-tooltip');
            if (tooltip && tooltip.style.display !== 'none') {
                tooltip.style.left = (e.clientX + 12) + 'px';
                tooltip.style.top = (e.clientY - 30) + 'px';
            }
        });
        el.addEventListener('mouseleave', () => {
            let tooltip = document.getElementById('tl-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        });

        // Drag to move/resize
        setupSegmentDrag(el, seg);
        container.appendChild(el);
    }
}

function setupSegmentDrag(el, seg) {
    let dragType = null;
    let startX, origStart, origEnd;
    let origPositions = null; // For multi-drag

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
        // Store positions of all selected segments for multi-drag
        if (selectedSegments.has(seg.id) && selectedSegments.size > 1) {
            origPositions = new Map();
            for (let s of timelineSegments) {
                if (selectedSegments.has(s.id)) {
                    origPositions.set(s.id, { startTime: s.startTime, endTime: s.endTime });
                }
            }
        } else {
            origPositions = null;
        }
        startDrag();
    });

    function startDrag() {
        tlSaveState();
        function onMove(e) {
            let container = ui.tlTrackInner || ui.tlTrack;
            let rect = container.getBoundingClientRect();
            let vr = getVisibleTimeRange();
            let tlDur = getTimelineDuration();
            let dx = (e.clientX - startX) / rect.width * vr.duration;

            let didSnap = false;
            if (dragType === 'move') {
                if (origPositions && selectedSegments.has(seg.id)) {
                    // Multi-drag: move all selected segments
                    for (let [id, orig] of origPositions) {
                        let s = timelineSegments.find(ts => ts.id === id);
                        if (!s) continue;
                        let dur = orig.endTime - orig.startTime;
                        let newStart = Math.max(0, Math.min(orig.startTime + dx, tlDur - dur));
                        let snapped = snapToBeat(newStart);
                        if (snapped !== newStart) didSnap = true;
                        s.startTime = snapped;
                        s.endTime = s.startTime + dur;
                    }
                } else {
                    let dur = origEnd - origStart;
                    let newStart = Math.max(0, Math.min(origStart + dx, tlDur - dur));
                    let snapped = snapToBeat(newStart);
                    if (snapped !== newStart) didSnap = true;
                    seg.startTime = snapped;
                    seg.endTime = snapped + dur;
                }
            } else if (dragType === 'left') {
                let newStart = Math.max(0, Math.min(origStart + dx, seg.endTime - 0.1));
                let snapped = snapToBeat(newStart);
                if (snapped !== newStart) didSnap = true;
                seg.startTime = snapped;
            } else if (dragType === 'right') {
                let newEnd = Math.max(seg.startTime + 0.1, Math.min(origEnd + dx, tlDur));
                let snapped = snapToBeat(newEnd);
                if (snapped !== newEnd) didSnap = true;
                seg.endTime = snapped;
            }

            // CSS-only update during drag (zoom-aware)
            if (origPositions && dragType === 'move') {
                // Update all dragged segments visually
                let container2 = ui.tlTrackInner || ui.tlTrack;
                for (let [id, _] of origPositions) {
                    let s = timelineSegments.find(ts => ts.id === id);
                    let sEl = container2.querySelector(`.timeline-segment[data-id="${id}"]`);
                    if (s && sEl) {
                        sEl.style.left = timeToPercent(s.startTime) + '%';
                        sEl.style.width = Math.max(((s.endTime - s.startTime) / vr.duration) * 100, 0.5) + '%';
                        sEl.textContent = segLabel(s);
                        sEl.classList.toggle('snapped', didSnap);
                    }
                }
            } else {
                el.style.left = timeToPercent(seg.startTime) + '%';
                el.style.width = Math.max(((seg.endTime - seg.startTime) / vr.duration) * 100, 0.5) + '%';
                el.textContent = segLabel(seg);
                el.classList.toggle('snapped', didSnap);
            }
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            origPositions = null;
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

    // Apply blob segments: override paramValues (last one wins)
    let blobSegs = active.filter(s => s.type === 'blob');
    if (blobSegs.length > 0) {
        let blobSeg = blobSegs[blobSegs.length - 1];
        if (blobSeg.params && Array.isArray(blobSeg.params)) {
            for (let i = 0; i < blobSeg.params.length; i++) {
                paramValues[i] = blobSeg.params[i];
            }
        }
    }

    // Apply mode segments: last one wins (override currentMode + params)
    let modeSegs = active.filter(s => s.type === 'mode');
    if (modeSegs.length > 0) {
        let modeSeg = modeSegs[modeSegs.length - 1]; // last = highest priority
        currentMode = modeSeg.modeValue;
        if (modeSeg.params && Array.isArray(modeSeg.params)) {
            for (let i = 0; i < modeSeg.params.length; i++) {
                paramValues[i] = modeSeg.params[i];
            }
        }
    }

    // Apply effect segments (exclude mode and blob segments)
    let fxSegs = active.filter(s => s.type !== 'mode' && s.type !== 'blob');
    if (fxSegs.length === 0) return;
    const catOrder = ['color', 'distortion', 'pattern', 'overlay'];
    fxSegs.sort((a, b) => catOrder.indexOf(FX_CATEGORIES[a.effect]) - catOrder.indexOf(FX_CATEGORIES[b.effect]));
    const drawOnly = new Set(['grid', 'scanlines', 'vignette']);
    for (let seg of fxSegs) {
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

let _tlWheelRAF = null;

function setupTimelineUIListeners() {
    // Timeline transport controls
    ui.tlBtnPlay.addEventListener('click', togglePlay);
    ui.tlBtnRestart.addEventListener('click', restartVideo);
    ui.tlBtnRecord.addEventListener('click', toggleRecording);

    // + BLOB button
    let addBlobBtn = document.getElementById('tl-btn-add-blob');
    if (addBlobBtn) {
        addBlobBtn.addEventListener('click', () => {
            let tlDur = getTimelineDuration();
            if (!tlDur) return;
            let currentTime;
            if (tlRulerMode === 'audio' && audioElement && audioLoaded) {
                currentTime = audioElement.currentTime;
            } else {
                currentTime = videoEl ? videoEl.time() : 0;
            }
            addBlobSegmentAt(currentTime);
        });
    }

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
            refreshTimeline();
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

    // Zoom slider
    if (ui.tlZoomSlider) {
        ui.tlZoomSlider.addEventListener('input', (e) => {
            tlZoom = parseFloat(e.target.value);
            clampScroll();
            refreshTimeline();
        });
    }

    // Ctrl+scroll = zoom, scroll = pan
    let trackEl = ui.tlTrackInner || ui.tlTrack;
    trackEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (_tlWheelRAF) return; // debounce
        _tlWheelRAF = requestAnimationFrame(() => {
            _tlWheelRAF = null;
            if (e.ctrlKey || e.metaKey) {
                // Zoom centered on cursor
                let rect = trackEl.getBoundingClientRect();
                let cursorRatio = (e.clientX - rect.left) / rect.width;
                let cursorTime = percentToTime(cursorRatio * 100);
                tlZoom = Math.max(1, Math.min(20, tlZoom * (1 - e.deltaY * 0.005)));
                let newVisDur = getTimelineDuration() / tlZoom;
                tlScrollOffset = cursorTime - cursorRatio * newVisDur;
                clampScroll();
                if (ui.tlZoomSlider) ui.tlZoomSlider.value = tlZoom;
            } else {
                // Horizontal pan
                let panAmount = (e.deltaX || e.deltaY) * 0.05 * (getTimelineDuration() / tlZoom);
                tlScrollOffset += panAmount;
                clampScroll();
            }
            refreshTimeline();
        });
    }, { passive: false });

    // Ruler click = scrub
    if (ui.tlRulerCanvas) {
        ui.tlRulerCanvas.addEventListener('mousedown', (e) => {
            tlDragging = true;
            seekToTimelinePosition(e.clientX);
        });
    }

    // Timeline track — merged mousedown for waveform drag + scrub
    trackEl.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('timeline-segment') || e.target.classList.contains('seg-handle')) return;

        // Deselect segments when clicking empty track
        if (selectedSegments.size > 0) {
            selectedSegments.clear();
            syncSelectedSegment();
            renderTimelineSegments();
        }

        // Alt+click on waveform = drag audio offset
        if (e.altKey && tlWaveform && tlWaveform.length > 0 &&
            (e.target === ui.tlWaveformCanvas || e.target === trackEl)) {
            e.preventDefault();
            waveformDragging = true;
            let startX = e.clientX;
            let origOffset = audioOffset;
            let rect = trackEl.getBoundingClientRect();
            let vr = getVisibleTimeRange();

            function onWfMove(ev) {
                let dx = (ev.clientX - startX) / rect.width * vr.duration;
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
        if (tlDragging) {
            seekToTimelinePosition(e.clientX);
            let tooltip = document.getElementById('tl-tooltip');
            if (tooltip) {
                let container = ui.tlTrackInner || ui.tlTrack;
                let rect = container.getBoundingClientRect();
                let ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                let scrubTime = percentToTime(ratio * 100);
                tooltip.textContent = formatTime(scrubTime);
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 10) + 'px';
                tooltip.style.top = (rect.top - 25) + 'px';
            }
        }
    });
    document.addEventListener('mouseup', () => {
        tlDragging = false;
        let tooltip = document.getElementById('tl-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });

    // Re-render on resize
    window.addEventListener('resize', () => { if (tlWaveform) refreshTimeline(); });

    // Resize handle
    setupTimelineResize();
}

// ── Scroll Position Indicator ───────────

function updateScrollIndicator() {
    let el = document.getElementById('tl-scroll-indicator');
    if (!el) return;
    if (tlZoom <= 1) { el.classList.remove('visible'); return; }
    el.classList.add('visible');
    let vp = el.querySelector('.viewport');
    let dur = getTimelineDuration();
    if (!dur || !vp) return;
    let vpWidth = (1 / tlZoom) * 100;
    let vpLeft = (tlScrollOffset / dur) * 100;
    vp.style.left = Math.max(0, vpLeft) + '%';
    vp.style.width = Math.min(vpWidth, 100) + '%';
}

// ── Resizable Timeline Height ───────────

function setupTimelineResize() {
    let handle = document.getElementById('tl-resize-handle');
    let container = ui.tlContainer;
    if (!handle || !container) return;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        let startY = e.clientY;
        let startH = container.getBoundingClientRect().height;

        function onMove(ev) {
            let dy = startY - ev.clientY;
            let newH = Math.max(180, Math.min(500, startH + dy));
            container.style.height = newH + 'px';
            refreshTimeline();
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
