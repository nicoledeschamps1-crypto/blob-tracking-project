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
        floatFreqData = new Float32Array(audioAnalyser.frequencyBinCount);
        prevFloatFreqData = new Float32Array(audioAnalyser.frequencyBinCount);
        resetBandDetectors();
        audioLoaded = true;
        updateButtonStates();
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

    // Full-range splits for MIX mode (frequency-based, not linear bin %)
    // bass: 20-250Hz, mid: 250-4000Hz, treble: 4000Hz+
    const bassEnd = Math.floor(250 / nyquist * binCount);
    const midEnd = Math.floor(4000 / nyquist * binCount);
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

    // Multi-band beat detection (spectral flux)
    updateMultiBandBeats();

    // Always update meter
    ui.audioMeterFill.style.width = (smoothOverall * 100) + '%';
}

function resetBandDetectors() {
    for (let b in bandDetectors) {
        bandDetectors[b].fluxHistory = [];
        bandDetectors[b].lastBeat = 0;
        bandDetectors[b].intensity = 0;
    }
    beatIntensity = 0;
    bpmBeatTimes = [];
    bpmValue = 0;
}

function getActiveBandDetector() {
    // Map user's selected freq range to the closest band detector
    const midFreq = (freqLow + freqHigh) / 2;
    if (midFreq < 200) return bandDetectors.kick;
    if (midFreq < 6000) return bandDetectors.snare;
    return bandDetectors.hat;
}

function updateMultiBandBeats() {
    if (!audioAnalyser || !floatFreqData) return;

    audioAnalyser.getFloatFrequencyData(floatFreqData);

    const binCount = floatFreqData.length;
    const nyquist = audioContext.sampleRate / 2;
    const now = millis();

    for (let name in bandDetectors) {
        let band = bandDetectors[name];
        let lowBin = Math.floor(band.low / nyquist * binCount);
        let highBin = Math.floor(band.high / nyquist * binCount);
        lowBin = Math.max(0, Math.min(lowBin, binCount - 1));
        highBin = Math.max(lowBin + 1, Math.min(highBin, binCount));
        let bandWidth = highBin - lowBin;

        // Spectral flux (half-wave rectified)
        // For narrow bands (<20 bins, e.g. kick), use sum instead of average
        // to avoid diluting the signal across too few bins
        // HFC weighting for hat band: weight by bin position (higher bins = more weight)
        let flux = 0;
        if (band.hfc) {
            // High Frequency Content: weight each bin by its relative position in band
            for (let i = lowBin; i < highBin; i++) {
                let diff = floatFreqData[i] - prevFloatFreqData[i];
                if (diff > 0) {
                    let weight = (i - lowBin + 1) / bandWidth;
                    flux += diff * weight;
                }
            }
        } else {
            for (let i = lowBin; i < highBin; i++) {
                let diff = floatFreqData[i] - prevFloatFreqData[i];
                if (diff > 0) flux += diff;
            }
        }
        if (bandWidth >= 20) flux /= bandWidth;

        band.fluxHistory.push(flux);
        if (band.fluxHistory.length > FLUX_HISTORY_SIZE) band.fluxHistory.shift();

        // Adaptive threshold: mean + FLUX_SENSITIVITY * stddev
        // Need at least 20 frames (~333ms) for stable statistics
        if (band.fluxHistory.length >= 20) {
            let sum = 0;
            for (let v of band.fluxHistory) sum += v;
            let mean = sum / band.fluxHistory.length;
            let sqSum = 0;
            for (let v of band.fluxHistory) sqSum += (v - mean) * (v - mean);
            let stddev = Math.sqrt(sqSum / band.fluxHistory.length);
            let threshold = mean + FLUX_SENSITIVITY * stddev;

            if (flux > threshold && now - band.lastBeat > band.cooldown) {
                band.intensity = 1.0;
                band.lastBeat = now;

                // BPM detection from kick beats
                if (name === 'kick') {
                    bpmBeatTimes.push(now);
                    if (bpmBeatTimes.length > 20) bpmBeatTimes.shift();
                    if (bpmBeatTimes.length >= 4) {
                        let intervals = [];
                        for (let k = 1; k < bpmBeatTimes.length; k++) {
                            let iv = bpmBeatTimes[k] - bpmBeatTimes[k-1];
                            if (iv > 300 && iv < 2000) intervals.push(iv);
                        }
                        if (intervals.length >= 6) {
                            let iSum = 0;
                            for (let iv of intervals) iSum += iv;
                            bpmValue = 60000 / (iSum / intervals.length);
                        }
                    }
                }
            } else {
                band.intensity *= (band.decay ?? beatDecayValue);
            }
        } else {
            band.intensity *= (band.decay ?? beatDecayValue);
        }
    }

    // Copy current → previous
    prevFloatFreqData.set(floatFreqData);

    // Backward compat: beatIntensity = max of all band intensities
    beatIntensity = Math.max(
        bandDetectors.kick.intensity,
        bandDetectors.snare.intensity,
        bandDetectors.hat.intensity
    );
}

function applyAudioSync() {
    if (!audioSync) { pulseIntensity *= 0.85; return; }

    // Sync is ON but audio isn't ready/playing — hold at base values
    if (!audioLoaded || !audioPlaying) {
        if (audioBaseValues[0] !== undefined) paramValues[0] = audioBaseValues[0];
        if (audioBaseValues[1] !== undefined) paramValues[1] = audioBaseValues[1];
        if (audioBaseValues[5] !== undefined) paramValues[5] = audioBaseValues[5];
        if (audioBaseValues[6] !== undefined) paramValues[6] = audioBaseValues[6];
        if (++_syncUIFrameCount % 8 === 0) syncUI();
        return;
    }

    // Sensitivity: 0→0, 50→1.5, 100→3.0 — boosted so audio drives fuller range
    const sens = (paramValues[7] / 50) * 1.5;
    const target = audioSyncTarget;
    const kick = bandDetectors.kick.intensity;
    const snare = bandDetectors.snare.intensity;
    const hat = bandDetectors.hat.intensity;
    const activeBand = getActiveBandDetector();

    if (target === 'qty') {
        let val = smoothBand * sens + activeBand.intensity * 1.0 * sens;
        paramValues[0] = map(constrain(val, 0, 1), 0, 1, syncMinQty, syncMaxQty);
    }

    else if (target === 'size') {
        let val = smoothBand * sens + activeBand.intensity * 1.0 * sens;
        paramValues[6] = map(constrain(val, 0, 1), 0, 1, syncMinSize, syncMaxSize);
    }

    else if (target === 'color') {
        let val = smoothBand * sens + activeBand.intensity * 0.8 * sens;
        paramValues[1] = constrain(val * 100, 0, 100);
    }

    else if (target === 'pulse') {
        // Pulse: drive pulseIntensity from active band detector
        let val = smoothBand * 0.3 * sens + activeBand.intensity * 1.0 * sens;
        pulseIntensity = constrain(val, 0, 1);
    }

    else if (target === 'flash') {
        // Flash is handled in draw()
    }

    else if (target === 'rate') {
        let val = smoothBand * sens + activeBand.intensity * 1.0 * sens;
        // Invert: high energy → low rate (fast), low energy → high rate (slow)
        paramValues[5] = map(constrain(val, 0, 1), 0, 1, syncMaxRate, syncMinRate);
    }

    else if (target === 'all') {
        // MIX: kick → qty, overall → size, mid+snare+hat → color
        let qtyVal = kick * 1.0 * sens + smoothBand * 0.3 * sens;
        paramValues[0] = map(constrain(qtyVal, 0, 1), 0, 1, syncMinQty, syncMaxQty);

        let sizeVal = smoothOverall * sens + snare * 0.5 * sens;
        paramValues[6] = map(constrain(sizeVal, 0, 1), 0, 1, syncMinSize, syncMaxSize);

        let colorVal = smoothMid * 0.5 * sens + snare * 0.3 * sens + hat * 0.3 * sens;
        paramValues[1] = constrain(colorVal * 100, 0, 100);
    }

    // Decay pulse when not in pulse mode
    if (target !== 'pulse') pulseIntensity *= 0.85;

    // BPM Lock: override rate to match detected tempo (works with any target)
    if (bpmLocked && bpmValue > 0) {
        let beatPeriod = 60000 / bpmValue;
        paramValues[5] = constrain(beatPeriod / 10, syncMinRate, syncMaxRate);
    }

    // Hard cutoff — only zero out if user's floor allows it
    if (syncMinQty === 0 && paramValues[0] < 2) paramValues[0] = 0;

    if (++_syncUIFrameCount % 8 === 0) {
        syncUI();
        let bpmDisplay = document.getElementById('bpm-display');
        if (bpmDisplay) {
            bpmDisplay.textContent = bpmValue > 0 ? Math.round(bpmValue) + ' BPM' : '— BPM';
            bpmDisplay.style.color = bpmLocked && bpmValue > 0 ? '#00B894' : 'var(--text-muted)';
        }
    }
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
<span class="label">BEAT</span>        ${beatIntensity.toFixed(3)} ${barW(beatIntensity)}  ${beatIntensity > 0.5 ? '<span class="val">■ HIT</span>' : ''}  decay:${beatDecayValue.toFixed(2)}
<span class="label">BANDS</span>
  kick:  ${bandDetectors.kick.intensity.toFixed(3)} ${barW(bandDetectors.kick.intensity)}  ${bandDetectors.kick.intensity > 0.5 ? '<span class="val">■</span>' : ''}
  snare: ${bandDetectors.snare.intensity.toFixed(3)} ${barW(bandDetectors.snare.intensity)}  ${bandDetectors.snare.intensity > 0.5 ? '<span class="val">■</span>' : ''}
  hat:   ${bandDetectors.hat.intensity.toFixed(3)} ${barW(bandDetectors.hat.intensity)}  ${bandDetectors.hat.intensity > 0.5 ? '<span class="val">■</span>' : ''}
<span class="label">AUTO-GAIN MAX</span>
  band:${autoGainMax.band.toFixed(3)}  bass:${autoGainMax.bass.toFixed(3)}  mid:${autoGainMax.mid.toFixed(3)}  tre:${autoGainMax.treble.toFixed(3)}
<span class="label">BPM</span>        ${bpmValue > 0 ? bpmValue.toFixed(1) : '—'}  locked: <span class="${bpmLocked ? 'val' : 'off'}">${bpmLocked}</span>
<span class="label">SYNC → ${audioSyncTarget.toUpperCase()}</span>
  qty:${paramValues[0].toFixed(1)}  spec:${paramValues[1].toFixed(1)}  blobVar:${paramValues[6].toFixed(1)}  rate:${paramValues[5].toFixed(1)}
  qtyRange:${syncMinQty}-${syncMaxQty}  sizeRange:${syncMinSize}-${syncMaxSize}  rateRange:${syncMinRate}-${syncMaxRate}
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
                    5: paramValues[5], 6: paramValues[6]
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
        kick:  { low: 40,   high: 200 },
        bass:  { low: 40,   high: 300 },
        vocal: { low: 300,  high: 5000 },
        hats:  { low: 6000, high: 20000 },
        full:  { low: 20,   high: 20000 }
    };
    const presetThresholds = {
        kick: 8, bass: 15, vocal: 25, hats: 15, full: 5
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
            autoGainMax = { band: AUTO_GAIN_FLOOR, bass: AUTO_GAIN_FLOOR, mid: AUTO_GAIN_FLOOR, treble: AUTO_GAIN_FLOOR };
            smoothBand = 0;
            resetBandDetectors();
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

    // Sync range sliders
    let syncMinQtySlider = document.getElementById('sync-min-qty');
    let syncMaxQtySlider = document.getElementById('sync-max-qty');
    let syncMinSizeSlider = document.getElementById('sync-min-size');
    let syncMaxSizeSlider = document.getElementById('sync-max-size');

    function updateSyncReadouts() {
        let qr = document.getElementById('sync-qty-readout');
        let sr = document.getElementById('sync-size-readout');
        let rr = document.getElementById('sync-rate-readout');
        if (qr) qr.textContent = syncMinQty + ' – ' + syncMaxQty;
        if (sr) sr.textContent = syncMinSize + ' – ' + syncMaxSize;
        if (rr) rr.textContent = syncMinRate + ' – ' + syncMaxRate;
    }

    if (syncMinQtySlider) {
        syncMinQtySlider.addEventListener('input', (e) => {
            syncMinQty = parseInt(e.target.value);
            if (syncMinQty > syncMaxQty) { syncMaxQty = syncMinQty; syncMaxQtySlider.value = syncMaxQty; }
            updateSyncReadouts();
        });
    }
    if (syncMaxQtySlider) {
        syncMaxQtySlider.addEventListener('input', (e) => {
            syncMaxQty = parseInt(e.target.value);
            if (syncMaxQty < syncMinQty) { syncMinQty = syncMaxQty; syncMinQtySlider.value = syncMinQty; }
            updateSyncReadouts();
        });
    }
    if (syncMinSizeSlider) {
        syncMinSizeSlider.addEventListener('input', (e) => {
            syncMinSize = parseInt(e.target.value);
            if (syncMinSize > syncMaxSize) { syncMaxSize = syncMinSize; syncMaxSizeSlider.value = syncMaxSize; }
            updateSyncReadouts();
        });
    }
    if (syncMaxSizeSlider) {
        syncMaxSizeSlider.addEventListener('input', (e) => {
            syncMaxSize = parseInt(e.target.value);
            if (syncMaxSize < syncMinSize) { syncMinSize = syncMaxSize; syncMinSizeSlider.value = syncMinSize; }
            updateSyncReadouts();
        });
    }

    // Rate range sliders
    let syncMinRateSlider = document.getElementById('sync-min-rate');
    let syncMaxRateSlider = document.getElementById('sync-max-rate');
    if (syncMinRateSlider) {
        syncMinRateSlider.addEventListener('input', (e) => {
            syncMinRate = parseInt(e.target.value);
            if (syncMinRate > syncMaxRate) { syncMaxRate = syncMinRate; syncMaxRateSlider.value = syncMaxRate; }
            updateSyncReadouts();
        });
    }
    if (syncMaxRateSlider) {
        syncMaxRateSlider.addEventListener('input', (e) => {
            syncMaxRate = parseInt(e.target.value);
            if (syncMaxRate < syncMinRate) { syncMinRate = syncMaxRate; syncMinRateSlider.value = syncMinRate; }
            updateSyncReadouts();
        });
    }

    // BPM Lock toggle
    ui.bpmLockButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            bpmLocked = (e.target.dataset.value === 'on');
            updateButtonStates();
        });
    });

    // Beat decay slider
    let beatDecaySlider = document.getElementById('slider-beat-decay');
    let beatDecayInput = document.getElementById('val-beat-decay');
    if (beatDecaySlider) {
        beatDecaySlider.addEventListener('input', (e) => {
            beatDecayValue = parseInt(e.target.value) / 100;
            if (beatDecayInput) beatDecayInput.value = parseInt(e.target.value);
        });
    }
    if (beatDecayInput) {
        beatDecayInput.addEventListener('change', (e) => {
            let v = constrain(parseInt(e.target.value) || 82, 70, 95);
            beatDecayValue = v / 100;
            if (beatDecaySlider) beatDecaySlider.value = v;
            e.target.value = v;
            e.target.blur();
        });
        beatDecayInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
    }
}
