// ══════════════════════════════════════════
// SECTION: AUDIO (blob-audio.js)
// Audio context, playback, energy analysis, sync,
// mini spectrum, debug panel
// ══════════════════════════════════════════

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') audioContext.resume();
}

function handleAudioFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    initAudioContext();

    // Clean up previous
    if (audioElement) { audioElement.pause(); audioElement.remove(); }
    if (audioSource) { try { audioSource.disconnect(); } catch(e){} }
    if (audioAnalyser) { try { audioAnalyser.disconnect(); } catch(e){} }
    if (audioGainNode) { try { audioGainNode.disconnect(); } catch(e){} }
    if (audioObjectUrl) { URL.revokeObjectURL(audioObjectUrl); }

    ui.audioName.innerText = file.name;
    const url = URL.createObjectURL(file);
    audioObjectUrl = url;

    // Pre-analyze audio for timeline waveform
    analyzeAudioForTimeline(file);

    // Reset auto-gain for new audio source
    autoGainMax = { band: 0.01, bass: 0.01, mid: 0.01, treble: 0.01 };

    audioElement = new Audio();
    audioElement.src = url;
    audioElement.loop = (loopMode === 'loop');

    // Track when audio ends
    audioElement.addEventListener('ended', () => {
        audioPlaying = false;
        if (loopMode === 'once' && videoEl) {
            videoEl.pause();
            videoPlaying = false;
            let playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
            ui.btnPlay.innerHTML = playIcon;
            ui.tlBtnPlay.innerHTML = playIcon;
        }
    });

    audioElement.addEventListener('canplaythrough', () => {
        if (audioContext.state === 'suspended') audioContext.resume();
        audioSource = audioContext.createMediaElementSource(audioElement);
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 4096;
        audioAnalyser.smoothingTimeConstant = 0;
        audioGainNode = audioContext.createGain();

        audioSource.connect(audioAnalyser);
        audioAnalyser.connect(audioGainNode);
        audioGainNode.connect(audioContext.destination);

        frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
        audioLoaded = true;
        if (audioElement.duration && isFinite(audioElement.duration)) {
            audioDuration = audioElement.duration;
        }

        // Only auto-play audio if video is currently playing
        if (videoPlaying) {
            let startTime = getAudioTimeForVideo(videoEl ? videoEl.time() : 0);
            if (startTime >= 0) {
                audioElement.currentTime = startTime;
                audioElement.play().catch(() => { audioPlaying = false; });
                audioPlaying = true;
            }
        }
    }, { once: true });
}

function getAudioEnergy() {
    if (!audioAnalyser || !frequencyData) return { band: 0, bass: 0, mid: 0, treble: 0, overall: 0 };
    audioAnalyser.getByteFrequencyData(frequencyData);

    const binCount = frequencyData.length;
    const sampleRate = audioContext.sampleRate;
    const nyquist = sampleRate / 2;

    // Selected band energy (the one that drives sync)
    let lowBin = Math.floor(freqLow / nyquist * binCount);
    let highBin = Math.floor(freqHigh / nyquist * binCount);
    lowBin = Math.max(0, Math.min(lowBin, binCount - 1));
    highBin = Math.max(lowBin + 1, Math.min(highBin, binCount));

    let bandSum = 0;
    for (let i = lowBin; i < highBin; i++) {
        bandSum += frequencyData[i];
    }
    let band = bandSum / ((highBin - lowBin) * 255);

    // Full-range splits for MIX mode
    const bassEnd = Math.floor(binCount * 0.15);
    const midEnd = Math.floor(binCount * 0.5);
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < binCount; i++) {
        if (i < bassEnd) bass += frequencyData[i];
        else if (i < midEnd) mid += frequencyData[i];
        else treble += frequencyData[i];
    }
    bass /= (bassEnd * 255);
    mid /= ((midEnd - bassEnd) * 255);
    treble /= ((binCount - midEnd) * 255);
    let overall = (bass + mid + treble) / 3;

    // Auto-gain: only apply if enabled
    if (autoGainEnabled) {
        autoGainMax.band = Math.max(autoGainMax.band * AUTO_GAIN_DECAY, band, AUTO_GAIN_FLOOR);
        autoGainMax.bass = Math.max(autoGainMax.bass * AUTO_GAIN_DECAY, bass, AUTO_GAIN_FLOOR);
        autoGainMax.mid = Math.max(autoGainMax.mid * AUTO_GAIN_DECAY, mid, AUTO_GAIN_FLOOR);
        autoGainMax.treble = Math.max(autoGainMax.treble * AUTO_GAIN_DECAY, treble, AUTO_GAIN_FLOOR);

        band = band / autoGainMax.band;
        bass = bass / autoGainMax.bass;
        mid = mid / autoGainMax.mid;
        treble = treble / autoGainMax.treble;
    }
    overall = (bass + mid + treble) / 3;

    // Apply threshold gate
    let gate = Math.min(audioThreshold / 100, 0.99);
    let gateScale = 1 / (1 - gate);
    band = band > gate ? (band - gate) * gateScale : 0;
    bass = bass > gate ? (bass - gate) * gateScale : 0;
    mid = mid > gate ? (mid - gate) * gateScale : 0;
    treble = treble > gate ? (treble - gate) * gateScale : 0;
    overall = (bass + mid + treble) / 3;

    return { band, bass, mid, treble, overall };
}

function updateSmoothedAudio() {
    if (!audioLoaded || !audioPlaying) {
        smoothBass = lerp(smoothBass, 0, 0.05);
        smoothMid = lerp(smoothMid, 0, 0.05);
        smoothTreble = lerp(smoothTreble, 0, 0.05);
        smoothOverall = lerp(smoothOverall, 0, 0.05);
        smoothBand = lerp(smoothBand, 0, 0.05);
        return;
    }
    const raw = getAudioEnergy();
    let attackRate = 0.55;
    let releaseRate = map(releaseSpeed, 0, 100, 0.03, 0.5);
    smoothBass = lerp(smoothBass, raw.bass, raw.bass > smoothBass ? attackRate : releaseRate);
    smoothMid = lerp(smoothMid, raw.mid, raw.mid > smoothMid ? attackRate : releaseRate);
    smoothTreble = lerp(smoothTreble, raw.treble, raw.treble > smoothTreble ? attackRate : releaseRate);
    smoothOverall = lerp(smoothOverall, raw.overall, raw.overall > smoothOverall ? attackRate : releaseRate);
    smoothBand = lerp(smoothBand, raw.band, raw.band > smoothBand ? attackRate : releaseRate);

    // Beat detection
    beatIntensity *= BEAT_DECAY;
    if (beatHistory.length > 0) {
        let avg = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
        if (raw.band > avg * BEAT_THRESHOLD_MULT && raw.band > 0.15 && millis() - lastBeatTime > BEAT_COOLDOWN) {
            beatIntensity = 1.0;
            lastBeatTime = millis();
        }
    }
    beatHistory.push(raw.band);
    if (beatHistory.length > BEAT_HISTORY_SIZE) beatHistory.shift();

    // Always update meter
    ui.audioMeterFill.style.width = (smoothOverall * 100) + '%';
}

function applyAudioSync() {
    if (!audioSync) return;

    // Sync is ON but audio isn't ready/playing — hold at base values
    if (!audioLoaded || !audioPlaying) {
        if (audioBaseValues[0] !== undefined) paramValues[0] = audioBaseValues[0];
        if (audioBaseValues[1] !== undefined) paramValues[1] = audioBaseValues[1];
        if (audioBaseValues[6] !== undefined) paramValues[6] = audioBaseValues[6];
        if (++_syncUIFrameCount % 8 === 0) syncUI();
        return;
    }

    const sens = paramValues[7] / 50;
    const base = audioBaseValues;
    const target = audioSyncTarget;
    const beat = beatIntensity;

    if (target === 'qty') {
        let baseQty = base[0] || 15;
        let scaled = smoothBand * baseQty * sens;
        let beatBoost = beat * 35 * sens;
        paramValues[0] = constrain(scaled + beatBoost, 0, 100);
    }

    else if (target === 'size') {
        let baseBlob = base[6] || 40;
        let scaled = smoothBand * baseBlob * sens;
        let beatBoost = beat * 40 * sens;
        paramValues[6] = constrain(scaled + beatBoost, 0, 100);
    }

    else if (target === 'color') {
        let baseSpec = base[1] || 30;
        let scaled = smoothBand * baseSpec * sens;
        let beatBoost = beat * 30 * sens;
        paramValues[1] = constrain(scaled + beatBoost, 0, 100);
    }

    else if (target === 'flash') {
        // Flash is handled in draw()
    }

    else if (target === 'all') {
        let baseQty = base[0] || 15;
        paramValues[0] = constrain(smoothBass * baseQty * sens + beat * 25 * sens, 0, 100);
        paramValues[6] = constrain(smoothOverall * (base[6] || 40) * sens + beat * 20 * sens, 0, 100);
        paramValues[1] = constrain(smoothMid * (base[1] || 30) * sens + beat * 15 * sens, 0, 100);
    }

    // Hard cutoff
    if (paramValues[0] < 2) paramValues[0] = 0;

    if (++_syncUIFrameCount % 8 === 0) syncUI();
}

function renderMiniSpectrum() {
    let canvas = document.getElementById('mini-spectrum');
    if (!canvas || !audioAnalyser || !frequencyData) return;
    let ctx = canvas.getContext('2d');
    let w = canvas.width;
    let h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    audioAnalyser.getByteFrequencyData(frequencyData);
    const binCount = frequencyData.length;
    const sampleRate = audioContext ? audioContext.sampleRate : 44100;
    const nyquist = sampleRate / 2;

    const numBars = 64;
    const minFreq = 20;
    const maxFreq = nyquist;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const barW = w / numBars;

    const selLowBin = Math.floor(freqLow / nyquist * binCount);
    const selHighBin = Math.floor(freqHigh / nyquist * binCount);

    for (let i = 0; i < numBars; i++) {
        let freqStart = Math.pow(10, logMin + (logMax - logMin) * (i / numBars));
        let freqEnd = Math.pow(10, logMin + (logMax - logMin) * ((i + 1) / numBars));
        let binStart = Math.floor(freqStart / nyquist * binCount);
        let binEnd = Math.floor(freqEnd / nyquist * binCount);
        binStart = Math.max(0, Math.min(binStart, binCount - 1));
        binEnd = Math.max(binStart + 1, Math.min(binEnd, binCount));

        let sum = 0;
        for (let j = binStart; j < binEnd; j++) sum += frequencyData[j];
        let avg = sum / ((binEnd - binStart) * 255);
        let barH = avg * h;

        let inRange = binStart >= selLowBin && binEnd <= selHighBin;
        if (inRange) {
            ctx.fillStyle = beatIntensity > 0.3 ? '#fff' : '#e5e5e5';
        } else {
            ctx.fillStyle = '#444';
        }
        ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    }
}

function renderDebug() {
    let dp = document.getElementById('debug-panel');
    if (!dp) return;

    let sRate = audioContext ? audioContext.sampleRate : '—';
    let bins = audioAnalyser ? audioAnalyser.frequencyBinCount : '—';
    let nyq = audioContext ? (audioContext.sampleRate / 2) : 0;
    let lowBin = nyq ? Math.floor(freqLow / nyq * bins) : '—';
    let highBin = nyq ? Math.floor(freqHigh / nyq * bins) : '—';

    let rawBand = 0;
    if (audioAnalyser && frequencyData) {
        audioAnalyser.getByteFrequencyData(frequencyData);
        let lb = Math.max(0, Math.min(parseInt(lowBin), bins - 1));
        let hb = Math.max(lb + 1, Math.min(parseInt(highBin), bins));
        let sum = 0;
        for (let i = lb; i < hb; i++) sum += frequencyData[i];
        rawBand = sum / ((hb - lb) * 255);
    }

    let barW = (val) => `<span class="debug-bar" style="width:${Math.round(val * 200)}px"></span>`;

    dp.innerHTML = `
<span class="label">AUDIO STATE</span>
  loaded: <span class="${audioLoaded ? 'val' : 'off'}">${audioLoaded}</span>  playing: <span class="${audioPlaying ? 'val' : 'off'}">${audioPlaying}</span>  sync: <span class="${audioSync ? 'val' : 'off'}">${audioSync}</span>
<span class="label">AUDIO CONTEXT</span>
  sampleRate: <span class="val">${sRate}</span>  bins: <span class="val">${bins}</span>  state: <span class="val">${audioContext ? audioContext.state : '—'}</span>
<span class="label">FREQ RANGE</span>
  ${freqLow} Hz → ${freqHigh} Hz  (bins ${lowBin}–${highBin})
<span class="label">RAW BAND</span>   ${rawBand.toFixed(3)} ${barW(rawBand)}
<span class="label">SMOOTHED</span>   ${smoothBand.toFixed(3)} ${barW(smoothBand)}
<span class="label">THRESHOLD</span>  ${audioThreshold}/100  gate: ${(audioThreshold/100).toFixed(2)}
<span class="label">GATED BAND</span> ${Math.max(0, rawBand > audioThreshold/100 ? (rawBand - audioThreshold/100)/(1 - audioThreshold/100) : 0).toFixed(3)}
<span class="label">FULL SPLITS</span>
  bass:   ${smoothBass.toFixed(3)} ${barW(smoothBass)}
  mid:    ${smoothMid.toFixed(3)} ${barW(smoothMid)}
  treble: ${smoothTreble.toFixed(3)} ${barW(smoothTreble)}
<span class="label">BEAT</span>        ${beatIntensity.toFixed(3)} ${barW(beatIntensity)}  ${beatIntensity > 0.5 ? '<span class="val">■ HIT</span>' : ''}
<span class="label">AUTO-GAIN MAX</span>
  band:${autoGainMax.band.toFixed(3)}  bass:${autoGainMax.bass.toFixed(3)}  mid:${autoGainMax.mid.toFixed(3)}  tre:${autoGainMax.treble.toFixed(3)}
<span class="label">SYNC → ${audioSyncTarget.toUpperCase()}</span>
  qty:${paramValues[0].toFixed(1)}  spec:${paramValues[1].toFixed(1)}  blobVar:${paramValues[6].toFixed(1)}  rate:${paramValues[5].toFixed(1)}
`;
}

// ── AUDIO UI LISTENERS ──────────────────────

function setupAudioUIListeners() {
    ui.audioUpload.addEventListener('change', handleAudioFile, false);

    ui.syncButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            audioSync = (e.target.dataset.value === 'on');
            if (audioSync) {
                audioBaseValues = {
                    0: paramValues[0], 1: paramValues[1],
                    6: paramValues[6]
                };
            }
            updateButtonStates();
        });
    });

    ui.syncTargetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            audioSyncTarget = e.target.dataset.value;
            updateButtonStates();
        });
    });

    // Threshold slider
    let threshSlider = document.getElementById('slider-10');
    let threshInput = document.getElementById('val-10');
    threshSlider.addEventListener('input', (e) => {
        audioThreshold = parseInt(e.target.value);
        threshInput.value = audioThreshold;
    });
    threshInput.addEventListener('change', (e) => {
        audioThreshold = constrain(parseInt(e.target.value) || 0, 0, 100);
        threshSlider.value = audioThreshold;
        e.target.value = audioThreshold;
        e.target.blur();
    });
    threshInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    // Release speed slider
    let releaseSlider = document.getElementById('slider-11');
    let releaseInput = document.getElementById('val-11');
    releaseSlider.addEventListener('input', (e) => {
        releaseSpeed = parseInt(e.target.value);
        releaseInput.value = releaseSpeed;
    });
    releaseInput.addEventListener('change', (e) => {
        releaseSpeed = constrain(parseInt(e.target.value) || 0, 0, 100);
        releaseSlider.value = releaseSpeed;
        e.target.value = releaseSpeed;
        e.target.blur();
    });
    releaseInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    // Auto-gain toggle
    ui.autogainButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            autoGainEnabled = (e.target.dataset.value === 'on');
            if (!autoGainEnabled) {
                autoGainMax = { band: 0.01, bass: 0.01, mid: 0.01, treble: 0.01 };
            }
            updateButtonStates();
        });
    });

    // Frequency range presets
    const freqPresets = {
        kick:  { low: 20,   high: 120 },
        bass:  { low: 60,   high: 300 },
        vocal: { low: 800,  high: 4000 },
        hats:  { low: 5000, high: 16000 },
        full:  { low: 20,   high: 20000 }
    };
    const presetThresholds = {
        kick: 15, bass: 15, vocal: 30, hats: 20, full: 5
    };

    ui.freqPresetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            let presetName = e.target.dataset.value;
            let preset = freqPresets[presetName];
            freqLow = preset.low;
            freqHigh = preset.high;
            ui.freqLowSlider.value = freqLow;
            ui.freqLowInput.value = freqLow;
            ui.freqHighSlider.value = freqHigh;
            ui.freqHighInput.value = freqHigh;
            audioThreshold = presetThresholds[presetName];
            threshSlider.value = audioThreshold;
            threshInput.value = audioThreshold;
            autoGainMax.band = AUTO_GAIN_FLOOR;
            smoothBand = 0;
            beatHistory = [];
            updateButtonStates();
        });
    });

    // Freq low slider
    ui.freqLowSlider.addEventListener('input', (e) => {
        freqLow = parseInt(e.target.value);
        if (freqLow > freqHigh) { freqHigh = freqLow; ui.freqHighSlider.value = freqHigh; ui.freqHighInput.value = freqHigh; }
        ui.freqLowInput.value = freqLow;
        updateButtonStates();
    });
    ui.freqLowInput.addEventListener('change', (e) => {
        freqLow = constrain(parseInt(e.target.value) || 20, 20, 20000);
        if (freqLow > freqHigh) { freqHigh = freqLow; ui.freqHighSlider.value = freqHigh; ui.freqHighInput.value = freqHigh; }
        ui.freqLowSlider.value = freqLow;
        e.target.value = freqLow;
        e.target.blur();
        updateButtonStates();
    });
    ui.freqLowInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    // Freq high slider
    ui.freqHighSlider.addEventListener('input', (e) => {
        freqHigh = parseInt(e.target.value);
        if (freqHigh < freqLow) { freqLow = freqHigh; ui.freqLowSlider.value = freqLow; ui.freqLowInput.value = freqLow; }
        ui.freqHighInput.value = freqHigh;
        updateButtonStates();
    });
    ui.freqHighInput.addEventListener('change', (e) => {
        freqHigh = constrain(parseInt(e.target.value) || 20000, 20, 20000);
        if (freqHigh < freqLow) { freqLow = freqHigh; ui.freqLowSlider.value = freqLow; ui.freqLowInput.value = freqLow; }
        ui.freqHighSlider.value = freqHigh;
        e.target.value = freqHigh;
        e.target.blur();
        updateButtonStates();
    });
    ui.freqHighInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
}
