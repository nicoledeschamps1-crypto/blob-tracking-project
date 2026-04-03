// ══════════════════════════════════════════
// SECTION: TIMELINE (blob-timeline.js)
// Timeline segments, waveform, beat detection,
// playhead, drag/resize, lane assignment,
// zoom/pan, ruler, segment management
// ══════════════════════════════════════════

let _rulerRedrawPending = false;

// ── Timeline Interpolation ──
const TL_DEFAULT_FADE = 0.3;

function segEnvelope(seg, currentTime) {
    let fadeIn = seg.fadeIn ?? TL_DEFAULT_FADE;
    let fadeOut = seg.fadeOut ?? TL_DEFAULT_FADE;
    let maxFade = (seg.endTime - seg.startTime) / 2;
    fadeIn = Math.min(fadeIn, maxFade);
    fadeOut = Math.min(fadeOut, maxFade);
    let elapsed = currentTime - seg.startTime;
    let remaining = seg.endTime - currentTime;
    let env = 1.0;
    if (fadeIn > 0 && elapsed < fadeIn) env = Math.min(env, elapsed / fadeIn);
    if (fadeOut > 0 && remaining < fadeOut) env = Math.min(env, remaining / fadeOut);
    return env;
}

function lerpParam(baseline, target, env) {
    return baseline + (target - baseline) * env;
}

// ── Segment keyboard shortcuts (capture phase — fires before p5/browser) ──
window.addEventListener('keydown', (e) => {
    let tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable) return;
    if (typeof _helpVisible !== 'undefined' && _helpVisible) return;

    let cmd = e.metaKey || e.ctrlKey;

    // Undo (Cmd+Z)
    if (cmd && e.key === 'z' && !e.shiftKey && typeof tlUndo === 'function') {
        e.preventDefault(); e.stopPropagation();
        tlUndo();
        return;
    }
    // Redo (Cmd+Shift+Z)
    if (cmd && e.key === 'z' && e.shiftKey && typeof tlRedo === 'function') {
        e.preventDefault(); e.stopPropagation();
        tlRedo();
        return;
    }

    if (typeof selectedSegments === 'undefined') return;

    // Delete selected segments (Backspace or Delete)
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedSegments.size > 0) {
        e.preventDefault(); e.stopPropagation();
        tlSaveState();
        timelineSegments = timelineSegments.filter(s => !selectedSegments.has(s.id));
        selectedSegments.clear();
        syncSelectedSegment();
        assignLanes();
        renderTimelineSegments();
        return;
    }

    // Copy (Cmd+C)
    if (cmd && e.key === 'c' && selectedSegments.size > 0) {
        e.preventDefault(); e.stopPropagation();
        clipboardSegments = timelineSegments
            .filter(s => selectedSegments.has(s.id))
            .map(s => JSON.parse(JSON.stringify(s)));
        return;
    }

    // Paste (Cmd+V)
    if (cmd && e.key === 'v' && typeof clipboardSegments !== 'undefined' && clipboardSegments.length > 0) {
        e.preventDefault(); e.stopPropagation();
        let tlDur = getTimelineDuration();
        if (tlDur > 0) {
            tlSaveState();
            let currentTime = (tlRulerMode === 'audio' && audioElement && audioLoaded)
                ? audioElement.currentTime : (videoEl ? videoEl.time() : 0);
            let earliest = Math.min(...clipboardSegments.map(s => s.startTime));
            let newSegs = [];
            for (let clip of clipboardSegments) {
                let offset = clip.startTime - earliest;
                let dur = clip.endTime - clip.startTime;
                newSegs.push({
                    ...clip,
                    id: nextSegId++,
                    startTime: currentTime + offset,
                    endTime: Math.min(currentTime + offset + dur, tlDur),
                    params: JSON.parse(JSON.stringify(clip.params)),
                    lane: 0,
                    synced: undefined
                });
            }
            timelineSegments.push(...newSegs);
            selectedSegments.clear();
            newSegs.forEach(s => selectedSegments.add(s.id));
            syncSelectedSegment();
            assignLanes(); renderTimelineSegments();
        }
        return;
    }

    // Duplicate (Cmd+D)
    if (cmd && e.key === 'd' && selectedSegments.size > 0) {
        e.preventDefault(); e.stopPropagation();
        let tlDur = getTimelineDuration();
        if (!tlDur) return;
        tlSaveState();
        let newSegs = [];
        for (let seg of timelineSegments) {
            if (selectedSegments.has(seg.id)) {
                let dur = seg.endTime - seg.startTime;
                newSegs.push({
                    ...seg,
                    id: nextSegId++,
                    startTime: seg.endTime,
                    endTime: Math.min(seg.endTime + dur, tlDur),
                    params: JSON.parse(JSON.stringify(seg.params)),
                    lane: 0,
                    synced: undefined
                });
            }
        }
        timelineSegments.push(...newSegs);
        selectedSegments.clear();
        newSegs.forEach(s => selectedSegments.add(s.id));
        syncSelectedSegment();
        assignLanes(); renderTimelineSegments();
        return;
    }
}, true);  // <-- capture phase

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
    nextSegId = Math.max(nextSegId, maxId + 1); // Never decrease — prevents ID collisions with redo stack
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
    nextSegId = Math.max(nextSegId, maxId + 1); // Never decrease — prevents ID collisions
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
    renderSongOverview();
    updateAudioSectionIndicator();
    if (typeof renderAudioSyncSublanes === 'function') renderAudioSyncSublanes();
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
        fadeIn: TL_DEFAULT_FADE,
        fadeOut: TL_DEFAULT_FADE,
        params: [...paramBaseline],
        lane: 0,
        color: '#A899C2'
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
    // Never add OFF blobs — default to BLUE if mode is OFF
    let segMode = _userMode === 0 ? 1 : _userMode;
    let seg = {
        id: nextSegId++,
        type: 'blob',
        effect: 'blob',
        modeValue: segMode,
        customHue: _userCustomHue,
        startTime: startTime,
        endTime: endTime,
        fadeIn: TL_DEFAULT_FADE,
        fadeOut: TL_DEFAULT_FADE,
        params: [...paramBaseline],
        lane: 0,
        color: BLOB_SEG_COLOR
    };
    tlSaveState();
    timelineSegments.push(seg);
    // Auto-select the new blob segment for editing
    selectedSegments.clear();
    selectedSegments.add(seg.id);
    syncSelectedSegment();
    assignLanes();
    renderTimelineSegments();
    let container = ui.tlTrackInner || ui.tlTrack;
    let newEl = container.querySelector(`.timeline-segment[data-id="${seg.id}"]`);
    if (newEl) {
        newEl.classList.add('just-added');
        setTimeout(() => newEl.classList.remove('just-added'), 500);
    }
}

function addTimelineSegmentAt(effectName, startTime) {
    let tlDur = getTimelineDuration();
    if (!tlDur) return;
    let endTime = Math.min(startTime + 5, tlDur);
    let seg = {
        id: nextSegId++,
        type: 'fx',
        effect: effectName,
        startTime: startTime,
        endTime: endTime,
        fadeIn: TL_DEFAULT_FADE,
        fadeOut: TL_DEFAULT_FADE,
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

    // Auto-scroll when zoomed: smooth drift to keep playhead visible
    if (tlZoom > 1 && videoPlaying) {
        let vr = getVisibleTimeRange();
        let headPos = (currentTime - vr.start) / vr.duration; // 0..1 within viewport
        if (headPos > 0.85 || headPos < 0.05 || currentTime < vr.start || currentTime > vr.end) {
            let targetOffset = currentTime - vr.duration * 0.25;
            tlScrollOffset += (targetOffset - tlScrollOffset) * 0.15; // ease toward target
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

    // Update audio sync sub-lane playheads
    if (typeof updateSublanePlayheads === 'function') updateSublanePlayheads();
}

function formatTime(s) {
    let m = Math.floor(s / 60);
    let sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
}

function parseTimeInput(str) {
    str = str.trim();
    let parts = str.split(':');
    if (parts.length === 2) {
        let m = parseInt(parts[0]) || 0;
        let s = parseFloat(parts[1]) || 0;
        return m * 60 + s;
    }
    return parseFloat(str) || 0;
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
    updateAudioSectionIndicator();
}

function updateAudioSectionIndicator() {
    let el = document.getElementById('tl-audio-section');
    if (!el) return;
    if (!audioLoaded || audioDuration <= 0 || videoDuration <= 0) {
        el.classList.add('hidden');
        return;
    }
    el.classList.remove('hidden');
    let audioStart = Math.max(0, -audioOffset);
    let audioEnd = Math.min(audioDuration, videoDuration - audioOffset);
    document.getElementById('tl-audio-start').textContent = formatTime(audioStart);
    document.getElementById('tl-audio-end').textContent = formatTime(Math.max(audioStart, audioEnd));
    document.getElementById('tl-audio-total').textContent = formatTime(audioDuration);
    updateSongOverviewWindow();
}

function getAudioTimeForVideo(videoTime) {
    return videoTime - audioOffset;
}

function showTimeline() {
    ui.tlContainer.classList.remove('hidden');
    // Cache height for draw loop (avoids per-frame reflow from offsetHeight)
    requestAnimationFrame(() => {
        window._cachedTimelineHeight = ui.tlContainer ? ui.tlContainer.offsetHeight : 0;
    });
}
function hideTimeline() {
    ui.tlContainer.classList.add('hidden');
    window._cachedTimelineHeight = 0;
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

    // Adaptive tick interval — finer at high zoom
    let majorInterval;
    if (vr.duration < 1.5) majorInterval = 0.25;
    else if (vr.duration < 3) majorInterval = 0.5;
    else if (vr.duration < 5) majorInterval = 1;
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
    _overviewCanvasDrawn = false;
    // Clear stale beat markers from previous audio
    if (_cachedBeatMarkers && _cachedBeatMarkers.length > 0) {
        _cachedBeatMarkers.forEach(el => el.remove());
        _cachedBeatMarkers = [];
        _cachedBeatKey = '';
    }
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

// ── Audio Sync Sub-Lanes ──────────────────────────────────────────────────
let _sublaneCache = {};      // { effectName: { canvas, ctx, muteBtn, playhead } }
let _sublaneRegionDrag = null;

function renderAudioSyncSublanes() {
    let container = document.getElementById('tl-audio-sublanes');
    if (!container) return;

    // Gather enabled effects
    let enabled = [];
    if (typeof fxAudioSync !== 'undefined') {
        for (let [name, cfg] of Object.entries(fxAudioSync)) {
            if (cfg.enabled) enabled.push(name);
        }
    }

    if (enabled.length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    // Build/update sub-lane DOM elements
    let existing = container.querySelectorAll('.tl-audio-sublane');
    let existingMap = {};
    existing.forEach(el => { existingMap[el.dataset.effect] = el; });

    // Remove stale lanes
    existing.forEach(el => {
        if (!enabled.includes(el.dataset.effect)) {
            el.remove();
            delete _sublaneCache[el.dataset.effect];
        }
    });

    let vr = getVisibleTimeRange();
    let dur = getTimelineDuration();
    if (!dur) return;

    enabled.forEach(effectName => {
        let lane = existingMap[effectName];
        if (!lane) {
            lane = _createSublane(effectName);
            container.appendChild(lane);
        }
        _drawSublaneWaveform(effectName, vr, dur);
        _drawSublaneRegions(effectName, vr, dur);
        _updateSublanePlayhead(effectName, vr);
    });
}

function _createSublane(effectName) {
    let lane = document.createElement('div');
    lane.className = 'tl-audio-sublane';
    lane.dataset.effect = effectName;

    let cfg = fxAudioSync[effectName];
    let catColor = '#8B45E8';
    if (typeof FX_CAT_COLORS !== 'undefined' && typeof FX_CATEGORIES !== 'undefined') {
        catColor = FX_CAT_COLORS[FX_CATEGORIES[effectName]] || catColor;
    }
    lane.style.borderLeft = '2px solid ' + catColor;

    // Label + mute
    let label = document.createElement('div');
    label.className = 'tl-sublane-label';
    let muteBtn = document.createElement('button');
    muteBtn.className = 'tl-sublane-mute';
    muteBtn.textContent = '\u266A'; // music note
    muteBtn.title = 'Toggle audio sync';
    muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cfg.enabled = !cfg.enabled;
        muteBtn.classList.toggle('muted', !cfg.enabled);
        // Sync FX panel toggle
        let panelToggle = document.getElementById('fx-async-toggle-' + effectName);
        if (panelToggle) panelToggle.checked = cfg.enabled;
        let section = document.getElementById('fx-audio-sync-' + effectName);
        if (section) {
            section.classList.toggle('collapsed', !cfg.enabled);
            let lbl = section.querySelector('.sync-label');
            if (lbl) lbl.classList.toggle('active', cfg.enabled);
        }
        if (typeof _saveFxAudioSync === 'function') _saveFxAudioSync();
        renderAudioSyncSublanes();
    });
    let nameSpan = document.createElement('span');
    let uiCfg = typeof FX_UI_CONFIG !== 'undefined' ? FX_UI_CONFIG[effectName] : null;
    nameSpan.textContent = uiCfg ? uiCfg.label : effectName.toUpperCase();
    nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:38px';
    label.appendChild(muteBtn);
    label.appendChild(nameSpan);
    lane.appendChild(label);

    // Canvas
    let canvas = document.createElement('canvas');
    canvas.className = 'tl-sublane-canvas';
    canvas.height = 20;
    lane.appendChild(canvas);

    // Playhead indicator
    let playhead = document.createElement('div');
    playhead.className = 'tl-sublane-playhead';
    lane.appendChild(playhead);

    _sublaneCache[effectName] = { canvas, ctx: null, muteBtn, playhead, lane };

    // Phase 3: region creation via click-drag on canvas
    _setupSublaneRegionDrag(effectName, canvas);

    return lane;
}

function _drawSublaneWaveform(effectName, vr, dur) {
    let cache = _sublaneCache[effectName];
    if (!cache) return;
    let canvas = cache.canvas;
    let rect = canvas.parentElement.getBoundingClientRect();
    let w = Math.max(rect.width - 60, 100); // minus label width
    canvas.width = w;
    let ctx = canvas.getContext('2d');
    cache.ctx = ctx;
    ctx.clearRect(0, 0, w, 20);

    let cfg = fxAudioSync[effectName];
    let catColor = '#8B45E8';
    if (typeof FX_CAT_COLORS !== 'undefined' && typeof FX_CATEGORIES !== 'undefined') {
        catColor = FX_CAT_COLORS[FX_CATEGORIES[effectName]] || catColor;
    }

    // Use pre-analyzed waveform data if available
    let waveData = null;
    if (typeof tlWaveform !== 'undefined' && tlWaveform && tlWaveform.length > 0) {
        let bandKey = cfg.band === 'kick' ? 'bass' : cfg.band === 'hats' ? 'high' :
                      cfg.band === 'vocal' ? 'mid' : cfg.band === 'bass' ? 'bass' : 'full';
        waveData = tlWaveform.map(w => w[bandKey] || w.full || 0);
    }

    if (!waveData || waveData.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = '8px sans-serif';
        ctx.fillText('no audio', w/2 - 18, 13);
        return;
    }

    // Determine if regions exist for opacity handling
    let hasRegions = cfg.regions && cfg.regions.length > 0;

    // Draw waveform bars
    let barCount = Math.min(w, waveData.length);
    let samplesPerBar = waveData.length / barCount;
    let visStart = vr.start / dur;
    let visEnd = vr.end / dur;

    ctx.fillStyle = catColor;
    for (let i = 0; i < barCount; i++) {
        let t = visStart + (i / barCount) * (visEnd - visStart);
        let sampleIdx = Math.floor(t * waveData.length);
        if (sampleIdx < 0 || sampleIdx >= waveData.length) continue;
        let val = waveData[sampleIdx];
        let h = Math.sqrt(val) * 18;
        let barTime = t * dur;

        // Regions: dim waveform outside active regions
        if (hasRegions) {
            let inRegion = cfg.regions.some(r => barTime >= r.startTime && barTime <= r.endTime);
            ctx.globalAlpha = inRegion ? 0.7 : 0.15;
        } else {
            ctx.globalAlpha = 0.5;
        }

        ctx.fillRect(i, 20 - h, 1, h);
    }
    ctx.globalAlpha = 1;
}

function _drawSublaneRegions(effectName, vr, dur) {
    let cache = _sublaneCache[effectName];
    if (!cache) return;
    let lane = cache.lane;
    let cfg = fxAudioSync[effectName];
    if (!cfg.regions || cfg.regions.length === 0) return;

    // Remove old region overlays
    lane.querySelectorAll('.tl-sublane-region').forEach(el => el.remove());

    let catColor = '#8B45E8';
    if (typeof FX_CAT_COLORS !== 'undefined' && typeof FX_CATEGORIES !== 'undefined') {
        catColor = FX_CAT_COLORS[FX_CATEGORIES[effectName]] || catColor;
    }

    let canvasRect = cache.canvas.getBoundingClientRect();
    let canvasW = cache.canvas.width;
    let labelW = 60;

    cfg.regions.forEach((region, idx) => {
        let startPct = (region.startTime - vr.start) / (vr.end - vr.start);
        let endPct = (region.endTime - vr.start) / (vr.end - vr.start);
        if (endPct < 0 || startPct > 1) return;
        startPct = Math.max(0, startPct);
        endPct = Math.min(1, endPct);

        let left = labelW + startPct * canvasW;
        let width = (endPct - startPct) * canvasW;

        let div = document.createElement('div');
        div.className = 'tl-sublane-region';
        div.dataset.regionIdx = idx;
        div.style.left = left + 'px';
        div.style.width = Math.max(4, width) + 'px';
        div.style.background = catColor.replace(')', ',0.15)').replace('rgb', 'rgba');
        div.style.borderColor = catColor;

        // Resize handles
        div.innerHTML = '<div class="region-handle region-handle-left"></div><div class="region-handle region-handle-right"></div>';

        // Double-click to delete region
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            cfg.regions.splice(idx, 1);
            if (typeof _saveFxAudioSync === 'function') _saveFxAudioSync();
            renderAudioSyncSublanes();
        });

        lane.appendChild(div);
    });
}

function _updateSublanePlayhead(effectName, vr) {
    let cache = _sublaneCache[effectName];
    if (!cache || !cache.playhead) return;

    let now = 0;
    if (typeof audioElement !== 'undefined' && audioElement && audioElement.currentTime) now = audioElement.currentTime;
    else if (typeof videoEl !== 'undefined' && videoEl) now = videoEl.time();

    let pct = (now - vr.start) / (vr.end - vr.start);
    if (pct < 0 || pct > 1) {
        cache.playhead.style.display = 'none';
        return;
    }
    cache.playhead.style.display = '';
    let canvasW = cache.canvas.width;
    cache.playhead.style.left = (60 + pct * canvasW) + 'px';

    // Energy glow
    let cfg = fxAudioSync[effectName];
    let alpha = cfg ? Math.min(1, cfg.smoothedValue * 1.5) : 0.6;
    cache.playhead.style.background = `rgba(255,255,255,${alpha})`;
}

// Phase 3: region drag creation on sub-lane canvas
function _setupSublaneRegionDrag(effectName, canvas) {
    let dragState = null;

    // Clean up previous document listeners for this effect to prevent leaks
    let cache = _sublaneCache[effectName];
    if (cache && cache._docMoveHandler) {
        document.removeEventListener('mousemove', cache._docMoveHandler);
        document.removeEventListener('mouseup', cache._docUpHandler);
    }

    const onMove = (e) => {
        if (!dragState) return;
        let x = e.clientX - dragState.rect.left;
        let vr = dragState.vr;
        dragState.currentTime = vr.start + (x / dragState.rect.width) * (vr.end - vr.start);
        dragState.currentTime = Math.max(0, Math.min(getTimelineDuration(), dragState.currentTime));

        // Draw temporary selection
        let cache = _sublaneCache[effectName];
        if (cache && cache.ctx) {
            _drawSublaneWaveform(effectName, vr, getTimelineDuration());
            let ctx = cache.ctx;
            let w = cache.canvas.width;
            let s = Math.min(dragState.startTime, dragState.currentTime);
            let en = Math.max(dragState.startTime, dragState.currentTime);
            let x1 = ((s - vr.start) / (vr.end - vr.start)) * w;
            let x2 = ((en - vr.start) / (vr.end - vr.start)) * w;
            ctx.fillStyle = 'rgba(139,69,232,0.25)';
            ctx.fillRect(x1, 0, x2 - x1, 20);
        }
    };

    const onUp = () => {
        if (!dragState) return;
        let s = Math.min(dragState.startTime, dragState.currentTime);
        let en = Math.max(dragState.startTime, dragState.currentTime);
        // Minimum 0.2s region
        if (en - s >= 0.2) {
            let cfg = _ensureFxAudioSync(effectName);
            cfg.regions.push({ startTime: s, endTime: en });
            if (typeof _saveFxAudioSync === 'function') _saveFxAudioSync();
        }
        dragState = null;
        renderAudioSyncSublanes();
    };

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        let rect = canvas.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let vr = getVisibleTimeRange();
        let startTime = vr.start + (x / rect.width) * (vr.end - vr.start);
        dragState = { startTime, currentTime: startTime, rect, vr };
        e.preventDefault();
    });

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    // Store references for cleanup on next call — ensure cache entry exists
    if (!_sublaneCache[effectName]) _sublaneCache[effectName] = {};
    _sublaneCache[effectName]._docMoveHandler = onMove;
    _sublaneCache[effectName]._docUpHandler = onUp;
}

// Update sub-lane playheads (called from updateTimelinePlayhead)
function updateSublanePlayheads() {
    if (typeof fxAudioSync === 'undefined') return;
    let vr = getVisibleTimeRange();
    for (let name of Object.keys(_sublaneCache)) {
        _updateSublanePlayhead(name, vr);
    }
}

// ── Mini Song Overview Bar ──────────────────

let _overviewCanvasDrawn = false;

function renderSongOverview() {
    let container = document.getElementById('tl-song-overview');
    let canvas = document.getElementById('tl-overview-canvas');
    if (!container || !canvas) return;

    if (!audioLoaded || !tlWaveform || tlWaveform.length === 0 || audioDuration <= 0 || videoDuration <= 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    // Only redraw canvas when needed (waveform is static)
    if (!_overviewCanvasDrawn) {
        let rect = container.getBoundingClientRect();
        let dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        let ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);

        ctx.fillStyle = 'rgba(200, 200, 200, 0.35)';
        let barCount = Math.min(Math.floor(rect.width), tlWaveform.length);
        let barW = rect.width / barCount;
        for (let i = 0; i < barCount; i++) {
            let idx = Math.floor(i / barCount * tlWaveform.length);
            let val = Math.sqrt(tlWaveform[idx].full);
            let barH = val * rect.height * 0.9;
            ctx.fillRect(i * barW, rect.height - barH, Math.max(barW, 1), barH);
        }
        _overviewCanvasDrawn = true;
    }

    updateSongOverviewWindow();
}

function updateSongOverviewWindow() {
    let windowEl = document.getElementById('tl-overview-window');
    let container = document.getElementById('tl-song-overview');
    if (!windowEl || !container || audioDuration <= 0 || videoDuration <= 0) return;

    let audioStart = Math.max(0, -audioOffset);
    let audioEnd = Math.min(audioDuration, videoDuration - audioOffset);
    let leftPct = (audioStart / audioDuration) * 100;
    let widthPct = ((audioEnd - audioStart) / audioDuration) * 100;
    windowEl.style.left = leftPct + '%';
    windowEl.style.width = Math.max(widthPct, 0.5) + '%';
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
        let modeName = (seg.modeValue !== undefined && MODE_NAMES[seg.modeValue]) ? MODE_NAMES[seg.modeValue] : '';
        return 'BLOB' + (modeName ? ' [' + modeName + ']' : '') + ' Q:' + Math.round(p[0]) + ' S:' + Math.round(p[4]) + ' R:' + Math.round(p[5]) + ' ' + formatTime(seg.startTime) + '-' + formatTime(seg.endTime);
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
    if (typeof updateEmptyHint === 'function') updateEmptyHint();
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
            // Refocus canvas so keyboard shortcuts (Delete, arrows) work
            if (p5Canvas) p5Canvas.focus();
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
            let blobMode = (seg.modeValue !== undefined && MODE_NAMES[seg.modeValue]) ? ' [' + MODE_NAMES[seg.modeValue] + ']' : '';
            let label = seg.type === 'blob'
                ? 'BLOB' + blobMode + ' — Q:' + Math.round(seg.params[0]) + ' S:' + Math.round(seg.params[4]) + ' R:' + Math.round(seg.params[5])
                : seg.type === 'mode'
                ? 'Mode: ' + (MODE_NAMES[seg.modeValue] || 'MODE')
                : 'FX: ' + seg.effect.toUpperCase();
            let time = formatTime(seg.startTime) + ' → ' + formatTime(seg.endTime) + ' (' + (seg.endTime - seg.startTime).toFixed(1) + 's)';
            var strong = document.createElement('strong');
            strong.textContent = label;
            tooltip.replaceChildren(strong, document.createElement('br'), document.createTextNode(time));
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
        let _dragStateSaved = false;
        function onMove(e) {
            if (!_dragStateSaved) { tlSaveState(); _dragStateSaved = true; }
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
        : (videoEl ? videoEl.time() : 0);
    let active = timelineSegments.filter(s => currentTime >= s.startTime && currentTime < s.endTime);

    // Reset to user's live mode so overrides revert when segments end
    currentMode = _userMode;
    customHue = _userCustomHue;

    let blobSegs = active.filter(s => s.type === 'blob');
    let modeSegs = active.filter(s => s.type === 'mode');
    let fxSegs = active.filter(s => s.type !== 'mode' && s.type !== 'blob');
    let hasBlobsOnTimeline = timelineSegments.some(s => s.type === 'blob');

    // When no blob/mode segments active, restore from stable baseline
    // paramOwner is already USER here (reset at top of draw), so restore unconditionally
    if (blobSegs.length === 0 && modeSegs.length === 0) {
        for (let i = 0; i < paramBaseline.length; i++) {
            if (paramOwner[i] <= PARAM_SRC_USER) paramValues[i] = paramBaseline[i];
        }
        // PULSE: suppress blobs between blob segments (on/off pulsing)
        if (hasBlobsOnTimeline) {
            currentMode = 0;
        }
    }

    // Apply blob segments with envelope lerp (last one wins)
    if (blobSegs.length > 0) {
        let blobSeg = blobSegs[blobSegs.length - 1];
        let env = segEnvelope(blobSeg, currentTime);
        if (blobSeg.params && Array.isArray(blobSeg.params)) {
            for (let i = 0; i < blobSeg.params.length; i++) {
                paramValues[i] = lerpParam(paramBaseline[i], blobSeg.params[i], env);
                paramOwner[i] = PARAM_SRC_TIMELINE;
            }
        }
        // Discrete values snap at envelope > 0.5
        if (env > 0.5) {
            if (blobSeg.modeValue !== undefined) currentMode = blobSeg.modeValue;
            if (blobSeg.customHue !== undefined) customHue = blobSeg.customHue;
        }
    }

    // Apply mode segments with envelope lerp (last one wins)
    if (modeSegs.length > 0) {
        let modeSeg = modeSegs[modeSegs.length - 1];
        let env = segEnvelope(modeSeg, currentTime);
        if (env > 0.5) currentMode = modeSeg.modeValue;
        if (modeSeg.params && Array.isArray(modeSeg.params)) {
            for (let i = 0; i < modeSeg.params.length; i++) {
                paramValues[i] = lerpParam(paramBaseline[i], modeSeg.params[i], env);
                paramOwner[i] = PARAM_SRC_TIMELINE;
            }
        }
    }

    // Apply FX effect segments with envelope lerp
    if (fxSegs.length === 0) return;
    const catOrder = ['color', 'distortion', 'pattern', 'overlay'];
    fxSegs.sort((a, b) => catOrder.indexOf(FX_CATEGORIES[a.effect]) - catOrder.indexOf(FX_CATEGORIES[b.effect]));
    const drawOnly = new Set(['grid', 'scanlines', 'vignette']);

    // Batch pixel-based effects into a single loadPixels/updatePixels cycle
    let pixelsLoaded = false;
    let needsPixelUpdate = false;
    for (let seg of fxSegs) {
        let saved = captureEffectParams(seg.effect);
        let env = segEnvelope(seg, currentTime);
        // Build interpolated params: lerp from current toward segment values
        let lerpedParams = {};
        let fxMap = FX_PARAM_MAP[seg.effect];
        if (fxMap) {
            for (let p of fxMap) {
                let tgt = seg.params[p.v];
                let cur = saved[p.v];
                if (tgt !== undefined && typeof tgt === 'number' && typeof cur === 'number') {
                    lerpedParams[p.v] = lerpParam(cur, tgt, env);
                } else {
                    lerpedParams[p.v] = (env > 0.5 && tgt !== undefined) ? tgt : cur;
                }
            }
        }
        restoreEffectParams(seg.effect, lerpedParams);
        // Skip CPU function for effects handled by GPU shader pipeline
        let isGPU = typeof SHADER_EFFECT_REGISTRY !== 'undefined' && SHADER_EFFECT_REGISTRY[seg.effect] &&
                     typeof shaderFX !== 'undefined' && shaderFX.ready && shaderFX.enabled;
        if (!isGPU) {
            let fn = EFFECT_FN_MAP[seg.effect];
            if (fn) {
                if (!drawOnly.has(seg.effect)) {
                    if (!pixelsLoaded) { loadPixels(); pixelsLoaded = true; }
                    needsPixelUpdate = true;
                } else if (needsPixelUpdate) {
                    updatePixels(); needsPixelUpdate = false;
                }
                fn();
            }
        }
        restoreEffectParams(seg.effect, saved);
    }
    if (needsPixelUpdate) updatePixels();
}

// ── Beat-Synced Blob Generator ──────────────────

function detectBandPeaks(band, sensitivity, startRange, endRange) {
    if (!tlWaveform || tlWaveform.length === 0) {
        console.log('[SYNC] No waveform data — load audio first');
        return [];
    }

    // Step 1: Find ALL local maxima within the time range
    let candidates = [];
    for (let i = 2; i < tlWaveform.length - 2; i++) {
        let t = tlWaveform[i].time;
        if (startRange !== undefined && t < startRange) continue;
        if (endRange !== undefined && t > endRange) continue;
        let val = tlWaveform[i][band];
        if (val > tlWaveform[i-1][band] && val > tlWaveform[i+1][band] &&
            val > tlWaveform[i-2][band] && val > tlWaveform[i+2][band]) {
            candidates.push({ time: t, val: val, idx: i });
        }
    }

    if (candidates.length === 0) {
        console.log('[SYNC] No local maxima in band=' + band + ' range=[' + (startRange||0).toFixed(1) + ',' + (endRange||'end') + ']');
        return [];
    }

    // Step 2: Sort by amplitude (strongest first)
    candidates.sort((a, b) => b.val - a.val);

    // Step 3: Threshold — keep top % based on sensitivity
    // sens 1 = top 10%, sens 10 = top 80%
    let keepRatio = 0.10 + (sensitivity - 1) * 0.078; // 10%→80%
    let totalCandidates = candidates.length;
    let maxKeep = Math.max(1, Math.floor(totalCandidates * keepRatio));
    candidates = candidates.slice(0, maxKeep);

    // Step 4: Filter for minimum spacing (stronger peaks win)
    let minSpacing = 0.25 - (sensitivity - 1) * 0.02; // sens 1→0.25s, 10→0.07s
    minSpacing = Math.max(minSpacing, 0.06);

    // Sort back by time
    candidates.sort((a, b) => a.time - b.time);

    let peaks = [];
    for (let c of candidates) {
        if (peaks.length === 0 || c.time - peaks[peaks.length - 1] >= minSpacing) {
            peaks.push(c.time);
        }
    }

    console.log('[SYNC] band=' + band + ' sens=' + sensitivity + ' range=[' + (startRange||0).toFixed(1) + '-' + (endRange||'end') + '] candidates=' + maxKeep + '/' + totalCandidates + ' peaks=' + peaks.length);
    return peaks;
}

function generateSyncedBlobs(sensitivity, duration) {
    let bandMap = { full: 'full', kick: 'bass', vocal: 'mid', hats: 'high' };
    let band = bandMap[tlBandView] || 'full';
    let tlDur = getTimelineDuration();
    if (!tlDur) { console.log('[SYNC] No timeline duration'); return 0; }

    // Guard: no waveform data yet
    if (!tlWaveform || tlWaveform.length === 0) {
        console.log('[SYNC] No waveform data — load audio first');
        return 0;
    }

    // Figure out which audio time range maps to the timeline
    let audioStart, audioEnd;
    if (tlRulerMode === 'audio') {
        audioStart = 0; audioEnd = tlDur;
    } else {
        audioStart = Math.max(0, -audioOffset);
        audioEnd = Math.min(audioDuration || Infinity, tlDur - audioOffset);
    }
    if (audioEnd <= audioStart) {
        console.log('[SYNC] Audio does not overlap video at current offset');
        return 0;
    }

    // Detect peaks only within the playable audio range
    let peaks = detectBandPeaks(band, sensitivity, audioStart, audioEnd);

    if (peaks.length === 0) {
        return 0;
    }

    tlSaveState();

    // Remove previously generated blobs (keeps manually placed ones)
    timelineSegments = timelineSegments.filter(s => !s.synced);
    selectedSegments.clear();
    syncSelectedSegment();

    // Convert peak times to timeline times first
    let peakStarts = [];
    for (let peakTime of peaks) {
        let startTime = (tlRulerMode === 'audio') ? peakTime : peakTime + audioOffset;
        if (startTime >= 0 && startTime < tlDur) peakStarts.push(startTime);
    }
    peakStarts.sort((a, b) => a - b);

    // Compute median gap between peaks to auto-scale pulse duration
    let gaps = [];
    for (let i = 1; i < peakStarts.length; i++) {
        gaps.push(peakStarts[i] - peakStarts[i - 1]);
    }
    gaps.sort((a, b) => a - b);
    let medianGap = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 1;
    // Pulse = 35% of median gap, capped by user duration, min 0.05s
    let pulseDur = Math.max(0.05, Math.min(duration, medianGap * 0.35));

    let count = 0;
    for (let i = 0; i < peakStarts.length; i++) {
        let startTime = peakStarts[i];
        // Use pulse duration, but also ensure no overlap with next peak
        let segDur = pulseDur;
        if (i < peakStarts.length - 1) {
            let gap = peakStarts[i + 1] - startTime;
            // Never exceed 50% of the gap to next beat
            segDur = Math.min(segDur, gap * 0.5);
            segDur = Math.max(segDur, 0.05);
        }
        let endTime = Math.min(startTime + segDur, tlDur);
        // If user mode is OFF, default to BLUE (1) so blobs are actually visible
        let segMode = _userMode === 0 ? 1 : _userMode;
        timelineSegments.push({
            id: nextSegId++,
            type: 'blob',
            effect: 'blob',
            synced: true,
            modeValue: segMode,
            customHue: _userCustomHue,
            startTime: startTime,
            endTime: endTime,
            fadeIn: TL_DEFAULT_FADE,
            fadeOut: TL_DEFAULT_FADE,
            params: [...paramBaseline],
            lane: 0,
            color: BLOB_SEG_COLOR
        });
        count++;
    }
    // All synced segments go on same lane since they no longer overlap
    // (assignLanes will still separate any actual overlaps)
    assignLanes();
    renderTimelineSegments();
    return count;
}

function countSyncPeaks(sensitivity) {
    let bandMap = { full: 'full', kick: 'bass', vocal: 'mid', hats: 'high' };
    let band = bandMap[tlBandView] || 'full';
    let tlDur = getTimelineDuration();
    if (!tlDur) return 0;
    let audioStart, audioEnd;
    if (tlRulerMode === 'audio') {
        audioStart = 0; audioEnd = tlDur;
    } else {
        audioStart = Math.max(0, -audioOffset);
        audioEnd = Math.min(audioDuration || Infinity, tlDur - audioOffset);
    }
    if (audioEnd <= audioStart) return 0;
    return detectBandPeaks(band, sensitivity, audioStart, audioEnd).length;
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

    // ⚡ SYNC button + config row
    let syncBtn = document.getElementById('tl-btn-sync');
    let syncRow = document.getElementById('tl-sync-row');
    let syncSens = document.getElementById('tl-sync-sens');
    let syncDur = document.getElementById('tl-sync-dur');
    let syncSensVal = document.getElementById('tl-sync-sens-val');
    let syncDurVal = document.getElementById('tl-sync-dur-val');
    let syncCount = document.getElementById('tl-sync-count');
    let syncBandLabel = document.getElementById('tl-sync-band');
    let syncGenerate = document.getElementById('tl-sync-generate');

    let _syncPreviewTimer = null;
    window._updateSyncPreview = function() {
        if (!syncRow || syncRow.classList.contains('hidden')) return;
        clearTimeout(_syncPreviewTimer);
        _syncPreviewTimer = setTimeout(() => {
            if (!tlWaveform || tlWaveform.length === 0) {
                if (syncCount) syncCount.textContent = 'no audio';
                return;
            }
            let count = countSyncPeaks(parseInt(syncSens.value));
            if (syncCount) syncCount.textContent = count;
            if (syncBandLabel) syncBandLabel.textContent = tlBandView.toUpperCase();
        }, 80);
    };
    function updateSyncPreview() { window._updateSyncPreview(); }

    if (syncBtn && syncRow) {
        syncBtn.addEventListener('click', () => {
            syncRow.classList.toggle('hidden');
            syncBtn.classList.toggle('active');
            if (!syncRow.classList.contains('hidden')) updateSyncPreview();
        });
    }
    if (syncSens) {
        syncSens.addEventListener('input', () => {
            syncSensVal.textContent = syncSens.value;
            updateSyncPreview();
        });
    }
    if (syncDur) {
        syncDur.addEventListener('input', () => {
            syncDurVal.textContent = parseFloat(syncDur.value).toFixed(1) + 's';
        });
    }
    if (syncGenerate) {
        syncGenerate.addEventListener('click', () => {
            if (!tlWaveform || tlWaveform.length === 0) {
                if (syncCount) syncCount.textContent = 'no audio';
                return;
            }
            let sens = parseInt(syncSens.value);
            let dur = parseFloat(syncDur.value);
            let count = generateSyncedBlobs(sens, dur);
            if (syncCount) syncCount.textContent = count > 0 ? count + ' placed' : '0 peaks';
        });
    }

    // Timeline band selector — also update sync preview
    ui.tlBandButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tlBandView = e.target.dataset.band;
            ui.tlBandButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTimelineWaveform();
            updateSyncPreview();
        });
    });

    // Timeline ruler toggle (VIDEO | AUDIO)
    ui.tlRulerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tlRulerMode = e.target.dataset.ruler;
            ui.tlRulerButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            refreshTimeline();
            updateSyncPreview();
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

    // Timeline empty-state action buttons
    const tlAddBtn = document.getElementById('tl-add-effect-btn');
    if (tlAddBtn) {
        tlAddBtn.addEventListener('click', () => {
            if (typeof switchSection === 'function') switchSection('create');
        });
    }
    const tlSyncBtn = document.getElementById('tl-sync-beats-btn');
    if (tlSyncBtn) {
        tlSyncBtn.addEventListener('click', () => {
            if (syncBtn) syncBtn.click();
        });
    }

    // Zoom slider
    if (ui.tlZoomSlider) {
        ui.tlZoomSlider.addEventListener('input', (e) => {
            tlZoom = parseFloat(e.target.value);
            _tlTargetZoom = tlZoom;
            clampScroll();
            refreshTimeline();
        });
    }

    // Ctrl/Cmd+scroll or pinch = zoom, scroll = pan
    let trackEl = ui.tlTrackInner || ui.tlTrack;
    let _tlTargetZoom = tlZoom;
    let _tlZoomAnimId = null;

    function animateZoom(targetZoom, anchorRatio) {
        _tlTargetZoom = Math.max(1, Math.min(50, targetZoom));
        if (_tlZoomAnimId) return; // already animating
        function step() {
            let diff = _tlTargetZoom - tlZoom;
            if (Math.abs(diff) < 0.01) {
                tlZoom = _tlTargetZoom;
                _tlZoomAnimId = null;
            } else {
                tlZoom += diff * 0.3; // ease toward target
                _tlZoomAnimId = requestAnimationFrame(step);
            }
            let newVisDur = getTimelineDuration() / tlZoom;
            tlScrollOffset = _tlZoomAnchorTime - anchorRatio * newVisDur;
            clampScroll();
            if (ui.tlZoomSlider) ui.tlZoomSlider.value = Math.min(tlZoom, 50);
            refreshTimeline();
        }
        _tlZoomAnimId = requestAnimationFrame(step);
    }

    let _tlZoomAnchorTime = 0;

    trackEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            // Zoom centered on cursor — smooth animated
            let rect = trackEl.getBoundingClientRect();
            let cursorRatio = (e.clientX - rect.left) / rect.width;
            _tlZoomAnchorTime = percentToTime(cursorRatio * 100);
            // Trackpad pinch sends small deltas; mouse wheel sends large — normalize
            let zoomFactor = Math.abs(e.deltaY) < 10
                ? 1 - e.deltaY * 0.02   // trackpad pinch (fine)
                : 1 - e.deltaY * 0.004; // mouse wheel (coarse)
            animateZoom(_tlTargetZoom * zoomFactor, cursorRatio);
        } else {
            // Horizontal pan
            if (_tlWheelRAF) return;
            _tlWheelRAF = requestAnimationFrame(() => {
                _tlWheelRAF = null;
                let panAmount = (e.deltaX || e.deltaY) * 0.05 * (getTimelineDuration() / tlZoom);
                tlScrollOffset += panAmount;
                clampScroll();
                refreshTimeline();
            });
        }
    }, { passive: false });

    // Double-click zoom slider = reset to 1x
    if (ui.tlZoomSlider) {
        ui.tlZoomSlider.addEventListener('dblclick', () => {
            tlZoom = 1; _tlTargetZoom = 1;
            tlScrollOffset = 0;
            ui.tlZoomSlider.value = 1;
            refreshTimeline();
        });
    }

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
                if (window._updateSyncPreview) window._updateSyncPreview();
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
    window.addEventListener('resize', () => {
        if (tlWaveform) { _overviewCanvasDrawn = false; refreshTimeline(); }
    });

    // ── Audio Section Indicator + Start Time Input ──
    let audioSectionEl = document.getElementById('tl-audio-section');
    let audioStartInput = document.getElementById('tl-audio-start-input');
    if (audioSectionEl && audioStartInput) {
        audioSectionEl.addEventListener('click', (e) => {
            if (e.target === audioStartInput) return;
            let currentStart = Math.max(0, -audioOffset);
            audioStartInput.value = formatTime(currentStart);
            audioStartInput.classList.remove('hidden');
            audioStartInput.focus();
            audioStartInput.select();
        });

        function commitStartTime() {
            let newStart = parseTimeInput(audioStartInput.value);
            newStart = Math.max(0, Math.min(newStart, Math.max(0, audioDuration - 1)));
            audioOffset = -newStart;
            audioStartInput.classList.add('hidden');
            updateOffsetLabel();
            _overviewCanvasDrawn = false;
            refreshTimeline();
            if (audioElement && audioLoaded && videoPlaying) {
                audioElement.currentTime = Math.max(0, getAudioTimeForVideo(videoEl.time()));
            }
        }

        audioStartInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commitStartTime(); audioStartInput.blur(); }
            if (e.key === 'Escape') { audioStartInput.classList.add('hidden'); }
        });
        audioStartInput.addEventListener('blur', commitStartTime);
    }

    // ── Mini Song Overview — drag window ──
    let overviewContainer = document.getElementById('tl-song-overview');
    let overviewWindowEl = document.getElementById('tl-overview-window');
    if (overviewContainer && overviewWindowEl) {
        overviewWindowEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            let rect = overviewContainer.getBoundingClientRect();
            let startX = e.clientX;
            let origOffset = audioOffset;

            function onDrag(ev) {
                let dx = (ev.clientX - startX) / rect.width;
                let timeDelta = dx * audioDuration;
                audioOffset = origOffset - timeDelta;
                updateOffsetLabel();
                renderTimelineWaveform();
            }
            function onUp() {
                document.removeEventListener('mousemove', onDrag);
                document.removeEventListener('mouseup', onUp);
                if (audioElement && audioLoaded && videoPlaying) {
                    audioElement.currentTime = Math.max(0, getAudioTimeForVideo(videoEl.time()));
                }
            }
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onUp);
        });

        overviewContainer.addEventListener('mousedown', (e) => {
            if (e.target === overviewWindowEl) return;
            let rect = overviewContainer.getBoundingClientRect();
            let clickRatio = (e.clientX - rect.left) / rect.width;
            let clickAudioTime = clickRatio * audioDuration;
            let windowDur = Math.min(videoDuration, audioDuration);
            let newStart = clickAudioTime - windowDur / 2;
            newStart = Math.max(0, Math.min(newStart, Math.max(0, audioDuration - windowDur)));
            audioOffset = -newStart;
            updateOffsetLabel();
            refreshTimeline();
            if (audioElement && audioLoaded && videoPlaying) {
                audioElement.currentTime = Math.max(0, getAudioTimeForVideo(videoEl.time()));
            }
        });
    }

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
