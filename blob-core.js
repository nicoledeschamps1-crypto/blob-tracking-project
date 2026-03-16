// ══════════════════════════════════════════
// SECTION: CORE (blob-core.js)
// Globals, classes, p5 lifecycle, UI core, playback,
// file/webcam handlers, recording, input handlers
// ══════════════════════════════════════════

// ── GLOBAL STATE ──────────────────────────

let videoEl = null;
let videoLoaded = false;
let videoPlaying = false;
let usingWebcam = false;

const wordBank = [
  "sussurros", "lágrimas", "melancolia", "céu", "ondas", "profundidade",
  "paixão", "coração", "fogo", "amor", "sangue", "rubis",
  "esperança", "folhas", "vida", "primavera", "natureza", "brotos",
  "luz", "sol", "alegria", "trigo", "calor", "raios",
  "mistério", "noite", "sonhos", "cosmos", "alma", "magia", "renasce"
];

const specialChars = "ㄱㄴㄷㄹㅁㅂㅅㅈㅊㅋㅌㅍイカクケコシスソテトナニヌノハヒフヘマミメモヤユヨラリルロワヲンгптшиилнхкевзсмяч".split('');

let showLines = false;
let currentMode = 1;
let currentParam = 0;

const DEFAULT_CONFIG = {
    parametros: [15, 30, 40, 3, 20, 4, 40, 50],
    modo: 1,
    linhas: false,
    viz: 1
};

let paramValues = [...DEFAULT_CONFIG.parametros];

const navOrder = [0, 1, 4, 5, 6, 2, 3, 7];
let navIndex = 0;

let trackedPoints = [];
let lastX = 0;
let lastTrackTime = 0;
let prevGridPixels = {};
let customHue = 195;
let flickerScores = {};
let p5Canvas = null;
let bgDim = 0;
let productInfo = { brand: '', name: '', material: '', price: '', size: '' };
let activeVizModes = new Set([1]);
let activeEffects = new Set();
let fxLayerAll = false;
let asciiCellSize = 10;
let asciiColorMode = 'mono';
let asciiCharSet = 'classic';
let asciiInvert = false;
const ASCII_CHARSETS = {
    classic: ' .,:;+*?%S#@',
    blocks: ' ░▒▓█',
    dots: ' ·•●○',
    binary: '01',
    braille: '⠀⠁⠂⠄⠈⠐⠠⡀⠃⠅⠆⠉⠊⠑⠒⠔⠘⠤⠰⡁⡂⡄⡈⡐⡠⣀',
    symbols: ' -=+*#%@',
    katakana: ' ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'
};
let chromaOffset = 5;
let atkinsonColorMode = 'bw';
let scanIntensity = 50;
let scanCount = 300;
let vigIntensity = 50;
let vigRadius = 70;
let grainIntensity = 35;
let grainSize = 15;
let grainColorMode = 'mono';
let bloomIntensity = 40;
let bloomRadius = 50;
let bloomThreshold = 50;
let tintPreset = 'green';
let tintIntensity = 70;
let sepiaIntensity = 70;
let pixelSize = 8;
let waveAmp = 20;
let waveFreq = 5;
let waveSpeed = 2;
let glitchIntensity = 30;
let glitchFreq = 20;
let glitchMode = 'shift';
let jitterIntensity = 20;
let jitterBlockSize = 2;
let jitterMode = 'random';
let halfSpacing = 6;
let halfColorMode = 'bw';
let ditherColorMode = 'bw';
let pxsortLo = 30;
let pxsortHi = 220;
let pxsortDir = 'horizontal';
let noiseIntensity = 25;
let noiseScale = 1;
let noiseColorMode = 'mono';
let curveIntensity = 30;
let curveDirection = 'barrel';
let briValue = 0;
let conValue = 100;
let satValue = 100;
let gridScale = 20;
let gridWidth = 1;
let gridOpacity = 30;
let dotsAngle = 45;
let dotsScale = 6;
let mblurIntensity = 30;
let mblurAngle = 0;
let palettePreset = 'noir';
let paletteIntensity = 80;

let videoX, videoY, videoW, videoH;
let currentVideoUrl = null;

// MASK tracking state (MediaPipe AI re-segmentation per frame)
let maskSelecting = false;
let maskReady = false;
let maskSegData = null;
let maskConfData = null;       // Float32Array — raw confidence values [0,1]
let maskSegW = 0;
let maskSegH = 0;
let maskOverlay = null;
let maskClickNorm = null;
let maskFrameCount = 0;
let maskSegInFlight = false;
let maskIndicatorStart = 0;
let maskPoints = [];            // click history: [{x, y, type: 'add'|'subtract'}]
let maskPrevCentroid = null;    // previous centroid for adaptive re-seg
let maskResegInterval = 3;      // adaptive: 2-6 frames
const MASK_RESEG_EVERY = 3;
const MASK_SOFT_THRESHOLD = 0.3;
const MASK_FEATHER = 0.3;

// Timeline state
let timelineSegments = [];
let videoDuration = 0;
let audioDuration = 0;
let selectedSegment = null;
let selectedSegments = new Set();
let clipboardSegments = [];
let tlZoom = 1;
let tlScrollOffset = 0;
let tlDragging = false;
let fxDragState = null;
let tlWaveform = null;
let tlBeats = [];
let tlBandView = 'full';
const BEAT_SNAP_MS = 150;
let tlRulerMode = 'video';
let audioOffset = 0;
let loopMode = 'through';
let waveformDragging = false;
let _cachedBeatMarkers = [];
let _cachedBeatKey = '';

const MODE_NAMES = {
    0:'OFF', 1:'BLUE', 2:'RED', 3:'MOT', 4:'SKIN', 5:'CUST',
    6:'BRI', 7:'DARK', 8:'EDGE', 9:'CHRM', 10:'WARM', 11:'COOL',
    12:'FLKR', 13:'INV', 14:'MASK'
};
let modeDragState = null;
const BLOB_SEG_COLOR = '#00CEC9';
let editingBlobSeg = null; // when a blob segment is selected, sliders edit its params

const FX_CATEGORIES = {
    sepia:'color', tint:'color', palette:'color', bricon:'color',
    chroma:'distortion', curve:'distortion', wave:'distortion', jitter:'distortion', mblur:'distortion',
    bloom:'pattern', dither:'pattern', atkinson:'pattern', halftone:'pattern', pxsort:'pattern', pixel:'pattern',
    ascii:'overlay', glitch:'overlay', noise:'overlay', grain:'overlay', dots:'overlay', grid:'overlay', scanlines:'overlay', vignette:'overlay'
};
const FX_CAT_COLORS = { color:'#6C5CE7', distortion:'#00B894', pattern:'#FDCB6E', overlay:'#E17055' };
const FX_PARAM_MAP = {
    sepia: [{v:'sepiaIntensity',g:()=>sepiaIntensity,s:v=>sepiaIntensity=v}],
    tint: [{v:'tintPreset',g:()=>tintPreset,s:v=>tintPreset=v},{v:'tintIntensity',g:()=>tintIntensity,s:v=>tintIntensity=v}],
    palette: [{v:'palettePreset',g:()=>palettePreset,s:v=>palettePreset=v},{v:'paletteIntensity',g:()=>paletteIntensity,s:v=>paletteIntensity=v}],
    bricon: [{v:'briValue',g:()=>briValue,s:v=>briValue=v},{v:'conValue',g:()=>conValue,s:v=>conValue=v},{v:'satValue',g:()=>satValue,s:v=>satValue=v}],
    chroma: [{v:'chromaOffset',g:()=>chromaOffset,s:v=>chromaOffset=v}],
    curve: [{v:'curveIntensity',g:()=>curveIntensity,s:v=>curveIntensity=v},{v:'curveDirection',g:()=>curveDirection,s:v=>curveDirection=v}],
    wave: [{v:'waveAmp',g:()=>waveAmp,s:v=>waveAmp=v},{v:'waveFreq',g:()=>waveFreq,s:v=>waveFreq=v},{v:'waveSpeed',g:()=>waveSpeed,s:v=>waveSpeed=v}],
    jitter: [{v:'jitterIntensity',g:()=>jitterIntensity,s:v=>jitterIntensity=v},{v:'jitterBlockSize',g:()=>jitterBlockSize,s:v=>jitterBlockSize=v},{v:'jitterMode',g:()=>jitterMode,s:v=>jitterMode=v}],
    mblur: [{v:'mblurIntensity',g:()=>mblurIntensity,s:v=>mblurIntensity=v},{v:'mblurAngle',g:()=>mblurAngle,s:v=>mblurAngle=v}],
    bloom: [{v:'bloomIntensity',g:()=>bloomIntensity,s:v=>bloomIntensity=v},{v:'bloomRadius',g:()=>bloomRadius,s:v=>bloomRadius=v},{v:'bloomThreshold',g:()=>bloomThreshold,s:v=>bloomThreshold=v}],
    dither: [{v:'ditherColorMode',g:()=>ditherColorMode,s:v=>ditherColorMode=v}],
    atkinson: [{v:'atkinsonColorMode',g:()=>atkinsonColorMode,s:v=>atkinsonColorMode=v}],
    halftone: [{v:'halfSpacing',g:()=>halfSpacing,s:v=>halfSpacing=v},{v:'halfColorMode',g:()=>halfColorMode,s:v=>halfColorMode=v}],
    pxsort: [{v:'pxsortLo',g:()=>pxsortLo,s:v=>pxsortLo=v},{v:'pxsortHi',g:()=>pxsortHi,s:v=>pxsortHi=v},{v:'pxsortDir',g:()=>pxsortDir,s:v=>pxsortDir=v}],
    pixel: [{v:'pixelSize',g:()=>pixelSize,s:v=>pixelSize=v}],
    ascii: [{v:'asciiCellSize',g:()=>asciiCellSize,s:v=>asciiCellSize=v},{v:'asciiColorMode',g:()=>asciiColorMode,s:v=>asciiColorMode=v},{v:'asciiCharSet',g:()=>asciiCharSet,s:v=>asciiCharSet=v},{v:'asciiInvert',g:()=>asciiInvert,s:v=>asciiInvert=v}],
    glitch: [{v:'glitchIntensity',g:()=>glitchIntensity,s:v=>glitchIntensity=v},{v:'glitchFreq',g:()=>glitchFreq,s:v=>glitchFreq=v},{v:'glitchMode',g:()=>glitchMode,s:v=>glitchMode=v}],
    noise: [{v:'noiseIntensity',g:()=>noiseIntensity,s:v=>noiseIntensity=v},{v:'noiseScale',g:()=>noiseScale,s:v=>noiseScale=v},{v:'noiseColorMode',g:()=>noiseColorMode,s:v=>noiseColorMode=v}],
    grain: [{v:'grainIntensity',g:()=>grainIntensity,s:v=>grainIntensity=v},{v:'grainSize',g:()=>grainSize,s:v=>grainSize=v},{v:'grainColorMode',g:()=>grainColorMode,s:v=>grainColorMode=v}],
    dots: [{v:'dotsAngle',g:()=>dotsAngle,s:v=>dotsAngle=v},{v:'dotsScale',g:()=>dotsScale,s:v=>dotsScale=v}],
    grid: [{v:'gridScale',g:()=>gridScale,s:v=>gridScale=v},{v:'gridWidth',g:()=>gridWidth,s:v=>gridWidth=v},{v:'gridOpacity',g:()=>gridOpacity,s:v=>gridOpacity=v}],
    scanlines: [{v:'scanIntensity',g:()=>scanIntensity,s:v=>scanIntensity=v},{v:'scanCount',g:()=>scanCount,s:v=>scanCount=v}],
    vignette: [{v:'vigIntensity',g:()=>vigIntensity,s:v=>vigIntensity=v},{v:'vigRadius',g:()=>vigRadius,s:v=>vigRadius=v}]
};
const EFFECT_FN_MAP = {
    sepia:()=>applySepia(), tint:()=>applyTint(), palette:()=>applyPalette(), bricon:()=>applyBriCon(),
    chroma:()=>applyChromatic(), curve:()=>applyCurve(), wave:()=>applyWave(), jitter:()=>applyJitter(), mblur:()=>applyMblur(),
    bloom:()=>applyBloom(), dither:()=>applyDithering(), atkinson:()=>applyAtkinson(), halftone:()=>applyHalftone(), pxsort:()=>applyPixelSort(), pixel:()=>applyPixelate(),
    ascii:()=>applyASCII(), glitch:()=>applyGlitch(), noise:()=>applyNoise(), grain:()=>applyGrain(), dots:()=>applyDots(), grid:()=>applyGrid(), scanlines:()=>applyScanlines(), vignette:()=>applyVignette()
};
let nextSegId = 1;

// Audio state
let audioContext = null;
let audioSource = null;
let audioAnalyser = null;
let audioElement = null;
let audioLoaded = false;
let audioPlaying = false;
let audioSync = false;
let audioSyncTarget = 'all';
let frequencyData = null;
let audioGainNode = null;
let audioObjectUrl = null;

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let lastRecordedBlob = null;
let lastRecordedExt = 'webm';
let recordingAudioDest = null;

// Audio base values (snapshot of params when sync turns on)
let audioBaseValues = {};

// Frequency range (Hz) for the band picker
let freqLow = 20;
let freqHigh = 20000;
let audioThreshold = 10;
let releaseSpeed = 40;
let autoGainEnabled = false;

const ui = {
    fileInput: document.getElementById('videoUpload'),
    webcamBtn: document.getElementById('webcam-btn'),
    fileName: document.getElementById('file-name'),
    toggleBtn: document.getElementById('toggle-btn'),
    toggleBtnRight: document.getElementById('toggle-btn-right'),
    uiControls: document.getElementById('ui-controls'),
    uiControlsRight: document.getElementById('ui-controls-right'),
    btnPlay: document.getElementById('btn-play'),
    btnRestart: document.getElementById('btn-restart'),
    btnRecord: document.getElementById('btn-record'),
    btnSave: document.getElementById('btn-save'),
    audioUpload: document.getElementById('audioUpload'),
    audioName: document.getElementById('audio-name'),
    audioMeterFill: document.getElementById('audio-meter-fill'),
    modeButtons: document.querySelectorAll('#mode-buttons .selector-btn'),
    vizButtons: document.querySelectorAll('#viz-buttons .selector-btn'),
    fxCards: document.querySelectorAll('.fx-card'),
    fxLayerButtons: document.querySelectorAll('#fx-layer-buttons .selector-btn'),
    lineButtons: document.querySelectorAll('#line-buttons .selector-btn'),
    syncButtons: document.querySelectorAll('#sync-buttons .selector-btn'),
    syncTargetButtons: document.querySelectorAll('#sync-target-buttons .selector-btn'),
    freqPresetButtons: document.querySelectorAll('#freq-preset-buttons .selector-btn'),
    autogainButtons: document.querySelectorAll('#autogain-buttons .selector-btn'),
    bpmLockButtons: document.querySelectorAll('#bpm-lock-buttons .selector-btn'),
    customColorGroup: document.getElementById('custom-color-group'),
    customColorPicker: document.getElementById('custom-color-picker'),
    btnPhoto: document.getElementById('btn-photo'),
    bgDimSlider: document.getElementById('slider-bgdim'),
    bgDimInput: document.getElementById('val-bgdim'),
    freqLowSlider: document.getElementById('slider-8'),
    freqLowInput: document.getElementById('val-8'),
    freqHighSlider: document.getElementById('slider-9'),
    freqHighInput: document.getElementById('val-9'),
    // Timeline
    tlContainer: document.getElementById('timeline-container'),
    tlTrack: document.getElementById('timeline-track'),
    tlTrackInner: document.getElementById('tl-track-inner'),
    tlRulerCanvas: document.getElementById('tl-ruler'),
    tlZoomSlider: document.getElementById('tl-zoom-slider'),
    tlPlayhead: document.getElementById('timeline-playhead'),
    tlTime: document.getElementById('timeline-time'),
    tlBtnPlay: document.getElementById('tl-btn-play'),
    tlBtnRestart: document.getElementById('tl-btn-restart'),
    tlBtnRecord: document.getElementById('tl-btn-record'),
    tlGhost: document.getElementById('timeline-ghost'),
    tlDragHint: document.getElementById('tl-drag-hint'),
    tlWaveformCanvas: document.getElementById('tl-waveform'),
    tlBandButtons: document.querySelectorAll('#tl-band-selector .tl-band-btn'),
    tlRulerButtons: document.querySelectorAll('#tl-ruler-selector .tl-band-btn'),
    tlLoopButtons: document.querySelectorAll('#tl-loop-selector .tl-band-btn'),
    tlOffsetLabel: document.getElementById('tl-offset-label'),
    dragGhost: document.getElementById('drag-ghost'),
    sliders: {},
    inputs: {},
    groups: {}
};

// Smoothed audio energy (persists across frames)
let smoothBass = 0, smoothMid = 0, smoothTreble = 0, smoothOverall = 0, smoothBand = 0;

// Auto-gain: track rolling max per band for normalization
let autoGainMax = { band: 0.01, bass: 0.01, mid: 0.01, treble: 0.01 };
const AUTO_GAIN_DECAY = 0.993;
const AUTO_GAIN_FLOOR = 0.05;

// Debug panel visibility (toggle with 'D' key)
let debugVisible = false;
let _syncUIFrameCount = 0;

// Beat detection state
let beatIntensity = 0;
let beatDecayValue = 0.82;

// Multi-band spectral flux detection
let floatFreqData = null;
let prevFloatFreqData = null;
let bandDetectors = {
    kick:  { low: 40, high: 200,    fluxHistory: [], lastBeat: 0, intensity: 0, cooldown: 200, decay: 0.82 },
    snare: { low: 200, high: 5000,  fluxHistory: [], lastBeat: 0, intensity: 0, cooldown: 120, decay: 0.82 },
    hat:   { low: 6000, high: 20000, fluxHistory: [], lastBeat: 0, intensity: 0, cooldown: 60,  decay: 0.65, hfc: true }
};
const FLUX_HISTORY_SIZE = 43;
const FLUX_SENSITIVITY = 1.5;

// Pulse sync
let pulseIntensity = 0;

// Audio sync range controls
let syncMinQty = 0;
let syncMaxQty = 100;
let syncMinSize = 0;
let syncMaxSize = 100;
let syncMinRate = 5;
let syncMaxRate = 80;

// BPM detection & lock
let bpmLocked = false;
let bpmValue = 0;
let bpmBeatTimes = [];

// ── CLASSES ───────────────────────────────

class CandidatePoint {
    constructor(x, y, c) { this.x = x; this.y = y; this.c = c; }
}

class TrackedPoint {
    constructor(x, y, c, blobVarLevel) {
        this.posicao = createVector(x, y);
        this.cor = c;
        this.brightness = brightness(c);
        let sizeScale = map(paramValues[4], 0, 100, 0.3, 5);
        let baseHeight = (11 + (this.brightness / 100.0) * 30) * sizeScale;
        let baseWidth = 11 * sizeScale;
        let maxVariation = map(blobVarLevel, 0, 100, 0, 145) * sizeScale;
        let offsetX = random(-maxVariation, maxVariation);
        let offsetY = random(-maxVariation, maxVariation);
        this.width = max(2, baseWidth + offsetX);
        this.height = max(2, baseHeight + offsetY);
        this.pulseOffset = random(0, 0.4);
        this.dynamicWord = generateSpecialCode();
    }
}

function generateSpecialCode() {
    const rWord = () => wordBank[floor(random(wordBank.length))];
    const rChar = () => specialChars[floor(random(specialChars.length))];
    const rBit = () => floor(random(2));
    let type = floor(random(4));
    switch (type) {
        case 0: return `${rWord()} ${rChar()}${rBit()}`;
        case 1: return `${rBit()}${rChar()}${rChar()} .${rWord()}`;
        case 2: return `${rChar()}.${rWord()}.${rChar()}`;
        case 3: return `${rWord()}-${rChar()}-${rWord()}`;
    }
    return "";
}

// ── P5 LIFECYCLE ──────────────────────────

function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    p5Canvas = canvas.elt;
    canvas.elt.addEventListener('contextmenu', (e) => e.preventDefault());
    background(0);
    textFont('Helvetica Neue');
    textSize(11);

    // Initialize all UI listeners (split across modules)
    setupCoreUIListeners();
    setupFxUIListeners();
    setupAudioUIListeners();
    setupTimelineUIListeners();
    setupMaskUIListeners();

    updateButtonStates();
    currentParam = navOrder[0];
}

function draw() {
    background(0);
    handleContinuousInput();
    updateSmoothedAudio();
    applyAudioSync();

    // Update audio meter even if sync is off
    if (audioLoaded && audioPlaying && !audioSync) {
        ui.audioMeterFill.style.width = (smoothOverall * 100) + '%';
    }

    if (videoLoaded && videoEl) {
        if (videoEl.width === 0) return;

        let videoRatio = videoEl.width / videoEl.height;
        let dispW = width;
        let dispH = height;

        if ((dispW / dispH) > videoRatio) {
            videoH = dispH;
            videoW = videoH * videoRatio;
        } else {
            videoW = dispW;
            videoH = videoW / videoRatio;
        }

        videoX = (dispW - videoW) / 2;
        videoY = (dispH - videoH) / 2;

        videoX = Math.max(0, videoX);
        videoY = Math.max(0, videoY);
        videoW = Math.min(videoW, dispW);
        videoH = Math.min(videoH, dispH);

        image(videoEl, videoX, videoY, videoW, videoH);

        // MASK AI segmentation overlay — brief flash on selection
        if (currentMode === 14 && maskOverlay) {
            push();
            // Fade overlay out over 1.5s after auto-finalize
            if (maskReady && maskIndicatorStart > 0) {
                let elapsed = millis() - maskIndicatorStart;
                if (elapsed < 1500) {
                    tint(255, map(elapsed, 0, 1500, 255, 0));
                    image(maskOverlay, videoX, videoY, videoW, videoH);
                } else {
                    maskOverlay.remove(); maskOverlay = null;
                }
            } else {
                image(maskOverlay, videoX, videoY, videoW, videoH);
            }
            pop();
        }
        // MASK crosshair cursor — show when hovering video in MASK mode
        if (currentMode === 14 && mouseX >= videoX && mouseX <= videoX + videoW && mouseY >= videoY && mouseY <= videoY + videoH) {
            push();
            let cursorAlpha = maskReady ? 80 : 200;
            stroke(0, 255, 128, cursorAlpha);
            strokeWeight(1);
            let cx = mouseX, cy = mouseY;
            line(cx - 12, cy, cx - 4, cy);
            line(cx + 4, cy, cx + 12, cy);
            line(cx, cy - 12, cx, cy - 4);
            line(cx, cy + 4, cx, cy + 12);
            noFill();
            ellipse(cx, cy, 8, 8);
            pop();
        }

        // MASK tracking indicator — brief flash then fade out
        if (currentMode === 14 && maskReady && maskClickNorm) {
            if (typeof maskIndicatorStart === 'undefined' || maskIndicatorStart === 0) {
                maskIndicatorStart = millis();
            }
            let elapsed = millis() - maskIndicatorStart;
            let fadeDuration = 2000;
            if (elapsed < fadeDuration) {
                let alpha = map(elapsed, 0, fadeDuration, 200, 0);
                push();
                let px = videoX + maskClickNorm.x * videoW;
                let py = videoY + maskClickNorm.y * videoH;
                noFill();
                stroke(0, 255, 128, alpha);
                strokeWeight(1);
                ellipse(px, py, 12, 12);
                line(px - 8, py, px - 3, py);
                line(px + 3, py, px + 8, py);
                line(px, py - 8, px, py - 3);
                line(px, py + 3, px, py + 8);
                noStroke();
                fill(0, 255, 128, alpha);
                textSize(9);
                textAlign(LEFT, BOTTOM);
                text('MASK', px + 8, py - 4);
                pop();
            }
        }

        // Background dim overlay
        if (bgDim > 0) {
            push();
            noStroke();
            fill(0, bgDim * 2.55);
            rectMode(CORNER);
            rect(0, 0, width, height);
            pop();
        }

        // VIDEO mode: apply effects to video only (before blobs)
        if (!fxLayerAll) {
            applyActiveEffects();
            if (timelineSegments.length > 0) applyTimelineEffects();
        }

        let timeInterval = map(paramValues[5], 0, 100, 0, 1000);
        if (millis() - lastTrackTime >= timeInterval) {
            trackPoints();
            lastTrackTime = millis();
        }

        // Clip all blob/line drawing to the video frame
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(videoX, videoY, videoW, videoH);
        drawingContext.clip();

        if (showLines && trackedPoints.length > 1) drawLines();

        for (let p of trackedPoints) {
            // Pulse scaling: each blob swells based on pulseIntensity with random delay
            let pScale = 1.0;
            if (pulseIntensity > 0.01) {
                let delayed = constrain(pulseIntensity - p.pulseOffset, 0, 1);
                pScale = 1.0 + 0.2 * delayed;
            }
            let pw = p.width * pScale;
            let ph = p.height * pScale;

            if (activeVizModes.has(10)) {
                // ZOOM — magnified video crop inside blob
                push();
                let srcX = map(p.posicao.x, videoX, videoX + videoW, 0, videoEl.width);
                let srcY = map(p.posicao.y, videoY, videoY + videoH, 0, videoEl.height);
                let sampleR = 20;
                let zW = max(pw, 30);
                let zH = max(ph, 30);
                image(videoEl, p.posicao.x - zW/2, p.posicao.y - zH/2, zW, zH,
                      srcX - sampleR, srcY - sampleR, sampleR * 2, sampleR * 2);
                noFill(); stroke(255, 120); strokeWeight(1);
                rectMode(CENTER);
                rect(p.posicao.x, p.posicao.y, zW, zH);
                pop();
            } else {
                stroke(150); noFill(); strokeWeight(1.2); rectMode(CENTER);
                rect(p.posicao.x, p.posicao.y, pw, ph);
            }
            drawPointInfo(p);
        }

        drawingContext.restore(); // end clip

        // ALL mode: apply effects to everything including blobs
        if (fxLayerAll) {
            applyActiveEffects();
            if (timelineSegments.length > 0) applyTimelineEffects();
        }

        // Update timeline playhead
        if (getTimelineDuration() > 0) updateTimelinePlayhead();
    }
    // Flash overlay on beat (FLASH sync target only — too intense in MIX)
    if (audioSync && audioSyncTarget === 'flash' && beatIntensity > 0.02) {
        push();
        noStroke();
        fill(255, beatIntensity * 160);
        rectMode(CORNER);
        rect(0, 0, width, height);
        pop();
    }

    cursor();
    renderMiniSpectrum();
    if (debugVisible && frameCount % 10 === 0) renderDebug();
}

// ── CORE UI LISTENERS ─────────────────────

function setupCoreUIListeners() {

    [0, 1, 2, 3, 4, 5, 6, 7].forEach(idx => {
        ui.sliders[idx] = document.getElementById(`slider-${idx}`);
        ui.inputs[idx] = document.getElementById(`val-${idx}`);
        ui.groups[idx] = document.getElementById(`group-${idx}`);

        if (!ui.sliders[idx]) return;

        ui.sliders[idx].addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            if (editingBlobSeg) {
                editingBlobSeg.params[idx] = val;
                renderTimelineSegments();
            } else {
                paramValues[idx] = val;
            }
            if (ui.inputs[idx]) ui.inputs[idx].value = val;
            currentParam = idx;
            navIndex = navOrder.indexOf(idx);
        });

        if (ui.inputs[idx]) {
            ui.inputs[idx].addEventListener('change', (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 0;
                val = constrain(val, 0, 100);

                if (editingBlobSeg) {
                    editingBlobSeg.params[idx] = val;
                    renderTimelineSegments();
                } else {
                    paramValues[idx] = val;
                }
                ui.sliders[idx].value = val;
                e.target.value = val;
                e.target.blur();

                currentParam = idx;
                navIndex = navOrder.indexOf(idx);
            });

            ui.inputs[idx].addEventListener('keydown', (e) => { e.stopPropagation(); });
        }
    });

    ui.modeButtons.forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            modeDragState = {
                mode: parseInt(btn.dataset.value),
                startX: e.clientX,
                startY: e.clientY,
                dragging: false
            };
        });
        btn.addEventListener('click', (e) => {
            if (modeDragState && modeDragState.dragging) return; // was a drag, not a click
            currentMode = parseInt(e.target.dataset.value);
            if (currentMode === 3) prevGridPixels = {};
            if (currentMode === 12) flickerScores = {};
            ui.customColorGroup.style.display = (currentMode === 5 || currentMode === 13) ? '' : 'none';
            if (currentMode === 14) {
                enterMaskSelecting();
            } else {
                exitMaskMode();
            }
            updateButtonStates();
        });
    });

    // Mode button drag to timeline
    document.addEventListener('mousemove', (e) => {
        if (!modeDragState) return;
        let dx = e.clientX - modeDragState.startX;
        let dy = e.clientY - modeDragState.startY;
        if (!modeDragState.dragging && (dx*dx + dy*dy) > 36) {
            modeDragState.dragging = true;
            ui.dragGhost.textContent = MODE_NAMES[modeDragState.mode] || 'MODE';
            ui.dragGhost.style.display = 'block';
            ui.dragGhost.style.background = '#aaa';
        }
        if (modeDragState.dragging) {
            ui.dragGhost.style.left = (e.clientX + 12) + 'px';
            ui.dragGhost.style.top = (e.clientY + 12) + 'px';
            let tlInner = ui.tlTrackInner || ui.tlTrack;
            let tlRect = tlInner.getBoundingClientRect();
            let overTl = e.clientX >= tlRect.left && e.clientX <= tlRect.right &&
                         e.clientY >= tlRect.top - 20 && e.clientY <= tlRect.bottom + 20;
            tlInner.classList.toggle('drag-over', overTl);
            ui.tlDragHint.classList.toggle('drop-active', overTl);
            if (overTl && getTimelineDuration() > 0) {
                let ratio = Math.max(0, Math.min(1, (e.clientX - tlRect.left) / tlRect.width));
                let vr = getVisibleTimeRange();
                let segW = Math.min(5, vr.duration) / vr.duration * 100;
                ui.tlGhost.style.left = (ratio * 100) + '%';
                ui.tlGhost.style.width = segW + '%';
                ui.tlGhost.style.background = '#aaa';
                ui.tlGhost.style.opacity = '0.35';
                ui.tlGhost.classList.add('visible');
            } else {
                ui.tlGhost.classList.remove('visible');
            }
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (!modeDragState) return;
        if (modeDragState.dragging) {
            ui.dragGhost.style.display = 'none';
            let tlInner = ui.tlTrackInner || ui.tlTrack;
            tlInner.classList.remove('drag-over');
            ui.tlDragHint.classList.remove('drop-active');
            ui.tlGhost.classList.remove('visible');
            let tlRect = tlInner.getBoundingClientRect();
            let overTl = e.clientX >= tlRect.left && e.clientX <= tlRect.right &&
                         e.clientY >= tlRect.top - 20 && e.clientY <= tlRect.bottom + 20;
            let tlDur = getTimelineDuration();
            if (overTl && tlDur > 0) {
                let ratio = Math.max(0, Math.min(1, (e.clientX - tlRect.left) / tlRect.width));
                let dropTime = snapToBeat(percentToTime(ratio * 100));
                addModeSegmentAt(modeDragState.mode, dropTime);
            }
        }
        modeDragState = null;
    });

    // Custom color picker
    ui.customColorPicker.addEventListener('input', (e) => {
        let hex = e.target.value;
        let r = parseInt(hex.slice(1,3), 16);
        let g = parseInt(hex.slice(3,5), 16);
        let b = parseInt(hex.slice(5,7), 16);
        let c = color(r, g, b);
        customHue = hue(c);
    });

    ui.vizButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            let val = parseInt(e.target.dataset.value);
            if (val === 7) {
                activeVizModes.clear();
            } else {
                if (activeVizModes.has(val)) activeVizModes.delete(val);
                else activeVizModes.add(val);
            }
            updateButtonStates();
        });
    });

    ui.lineButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            showLines = (e.target.dataset.value === 'on');
            updateButtonStates();
        });
    });

    // FX Layer toggle
    ui.fxLayerButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            fxLayerAll = (e.target.dataset.value === 'all');
            updateButtonStates();
        });
    });

    ui.fileInput.addEventListener('change', handleFile, false);
    ui.webcamBtn.addEventListener('click', toggleWebcam);

    ui.btnPlay.addEventListener('click', togglePlay);
    ui.btnRestart.addEventListener('click', restartVideo);
    ui.btnRecord.addEventListener('click', toggleRecording);
    ui.btnSave.addEventListener('click', saveRecording);
    ui.btnPhoto.addEventListener('click', saveScreenshot);

    // Background dim slider
    ui.bgDimSlider.addEventListener('input', (e) => {
        bgDim = parseInt(e.target.value);
        ui.bgDimInput.value = bgDim;
    });
    ui.bgDimInput.addEventListener('change', (e) => {
        bgDim = constrain(parseInt(e.target.value) || 0, 0, 100);
        ui.bgDimSlider.value = bgDim;
        e.target.value = bgDim;
        e.target.blur();
    });
    ui.bgDimInput.addEventListener('keydown', (e) => { e.stopPropagation(); });

    // Product info fields
    ['brand', 'name', 'material', 'price', 'size'].forEach(field => {
        let el = document.getElementById('product-' + field);
        el.addEventListener('input', (e) => { productInfo[field] = e.target.value; });
        el.addEventListener('keydown', (e) => { e.stopPropagation(); });
    });

    ui.toggleBtn.addEventListener('click', () => {
        ui.uiControls.classList.toggle('collapsed');
        ui.toggleBtn.classList.toggle('rotated');
        if (ui.tlContainer) {
            ui.tlContainer.style.left = ui.uiControls.classList.contains('collapsed') ? '24px' : '320px';
        }
    });

    ui.toggleBtnRight.addEventListener('click', () => {
        ui.uiControlsRight.classList.toggle('collapsed');
        ui.toggleBtnRight.classList.toggle('rotated');
        if (ui.tlContainer) {
            ui.tlContainer.style.right = ui.uiControlsRight.classList.contains('collapsed') ? '24px' : '320px';
        }
    });
}

// ── STATE UPDATE ──────────────────────────

function updateButtonStates() {

    ui.modeButtons.forEach(btn => {
        if (parseInt(btn.dataset.value) === currentMode) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    ui.vizButtons.forEach(btn => {
        let val = parseInt(btn.dataset.value);
        if (val === 7) {
            if (activeVizModes.size === 0) btn.classList.add('active');
            else btn.classList.remove('active');
        } else {
            if (activeVizModes.has(val)) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    // Mask controls visibility
    document.getElementById('mask-controls-group').style.display = (currentMode === 14) ? '' : 'none';
    if (currentMode === 14) {
        let statusEl = document.getElementById('mask-status');
        let hintEl = document.getElementById('mask-hint');
        if (!maskReady && !maskSegData) {
            statusEl.textContent = 'CLICK SUBJECT';
            statusEl.style.color = '#FDCB6E';
            hintEl.textContent = 'Click object to track. \u21E7+click adds, \u2325+click removes.';
        } else if (maskReady) {
            statusEl.textContent = 'TRACKING';
            statusEl.style.color = '#00B894';
            hintEl.textContent = 'Click to re-target. \u21E7+click adds. \u2325+click removes.';
        }
    }

    ui.lineButtons.forEach(btn => {
        const isMsgOn = btn.dataset.value === 'on';
        if (showLines === isMsgOn) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Progressive disclosure: audio controls visibility
    let acg = document.getElementById('audio-controls-group');
    if (acg) acg.style.display = audioLoaded ? '' : 'none';
    let am = document.getElementById('audio-meter');
    if (am) am.style.display = audioLoaded ? '' : 'none';
    let ms = document.getElementById('mini-spectrum');
    if (ms) ms.style.display = audioLoaded ? '' : 'none';

    ui.syncButtons.forEach(btn => {
        const isSyncOn = btn.dataset.value === 'on';
        if (audioSync === isSyncOn) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    let scg = document.getElementById('sync-controls-group');
    if (scg) scg.style.display = audioSync ? '' : 'none';
    let srg = document.getElementById('sync-range-group');
    if (srg) srg.style.display = audioSync ? '' : 'none';

    ui.syncTargetButtons.forEach(btn => {
        if (btn.dataset.value === audioSyncTarget) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    ui.bpmLockButtons.forEach(btn => {
        const isOn = btn.dataset.value === 'on';
        if (bpmLocked === isOn) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    let bpmDisplay = document.getElementById('bpm-display');
    if (bpmDisplay) {
        bpmDisplay.textContent = bpmValue > 0 ? Math.round(bpmValue) + ' BPM' : '— BPM';
        bpmDisplay.style.color = bpmLocked && bpmValue > 0 ? '#00B894' : 'var(--text-muted)';
    }

    // Freq presets — highlight matching preset or none if custom
    const presetMap = {
        kick:  [30, 150], bass: [60, 300], vocal: [800, 4000],
        hats:  [7500, 16000], full: [20, 20000]
    };
    ui.freqPresetButtons.forEach(btn => {
        let p = presetMap[btn.dataset.value];
        if (p && freqLow === p[0] && freqHigh === p[1]) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    ui.autogainButtons.forEach(btn => {
        const isOn = btn.dataset.value === 'on';
        if (autoGainEnabled === isOn) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Effect cards
    updateEffectCardStates();

    // FX Layer toggle
    ui.fxLayerButtons.forEach(btn => {
        let isAll = btn.dataset.value === 'all';
        if (fxLayerAll === isAll) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Keep FX param groups in sync with active effects
    updateFxParamVisibility();
}

function updateFxParamVisibility() {
    const map = {
        ascii: 'fx-params-ascii', chroma: 'fx-params-chroma', atkinson: 'fx-params-atkinson',
        scanlines: 'fx-params-scanlines', vignette: 'fx-params-vignette', grain: 'fx-params-grain',
        bloom: 'fx-params-bloom', tint: 'fx-params-tint', sepia: 'fx-params-sepia',
        pixel: 'fx-params-pixel', wave: 'fx-params-wave', glitch: 'fx-params-glitch',
        jitter: 'fx-params-jitter', noise: 'fx-params-noise', curve: 'fx-params-curve',
        bricon: 'fx-params-bricon', grid: 'fx-params-grid', dots: 'fx-params-dots',
        mblur: 'fx-params-mblur', palette: 'fx-params-palette',
        halftone: 'fx-params-halftone', dither: 'fx-params-dither', pxsort: 'fx-params-pxsort'
    };
    for (let [fx, id] of Object.entries(map)) {
        let el = document.getElementById(id);
        if (el) el.classList.toggle('visible', activeEffects.has(fx));
    }
}

function updateEffectCardStates() {
    ui.fxCards.forEach(card => {
        let name = card.dataset.effect;
        let cat = card.dataset.cat;
        card.classList.remove('active-color', 'active-distortion', 'active-pattern', 'active-overlay');
        if (activeEffects.has(name)) {
            card.classList.add('active-' + cat);
        }
    });
}

// ── PLAYBACK ──────────────────────────────

function togglePlay() {
    if (videoEl && videoLoaded) {
        videoPlaying = !videoPlaying;
        let pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        let playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        if (videoPlaying) {
             videoEl.loop();
             ui.btnPlay.innerHTML = pauseIcon;
             ui.tlBtnPlay.innerHTML = pauseIcon;
             if (audioElement && audioLoaded) {
                 let audioTime = getAudioTimeForVideo(videoEl.time());
                 if (audioTime >= 0) {
                     audioElement.currentTime = audioTime;
                     audioElement.play().catch(() => { audioPlaying = false; });
                     audioPlaying = true;
                 }
             }
        } else {
             videoEl.pause();
             ui.btnPlay.innerHTML = playIcon;
             ui.tlBtnPlay.innerHTML = playIcon;
             if (audioElement && audioLoaded) { audioElement.pause(); audioPlaying = false; }
        }
    }
}

function restartVideo() {
    if (videoEl) {
        videoEl.time(0);
        if (audioElement && audioLoaded) {
            audioElement.currentTime = Math.max(0, getAudioTimeForVideo(0));
            if (audioElement.ended || audioElement.paused) {
                audioElement.play().catch(() => { audioPlaying = false; });
                audioPlaying = true;
            }
        }
        if(!videoPlaying) togglePlay();
    }
}

function syncUI() {
    // Don't overwrite sliders while editing a blob segment
    if (editingBlobSeg) { updateButtonStates(); return; }
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(idx => {
        if(ui.sliders[idx]) {
            ui.sliders[idx].value = paramValues[idx];
            if (document.activeElement !== ui.inputs[idx]) {
                if (Number.isInteger(paramValues[idx])) {
                    ui.inputs[idx].value = paramValues[idx];
                } else {
                    ui.inputs[idx].value = paramValues[idx].toFixed(1);
                }
            }
        }
    });
    updateButtonStates();
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

// ── FILE / WEBCAM HANDLERS ────────────────

function toggleWebcam() {
    if (usingWebcam) {
        stopWebcam();
    } else {
        startWebcam();
    }
}

function startWebcam() {
    if (videoEl) { videoEl.stop(); videoEl.remove(); videoEl = null; }
    usingWebcam = true;
    videoLoaded = false;
    videoDuration = 0;
    hideTimeline();
    ui.webcamBtn.classList.add('active');
    ui.fileName.innerText = 'webcam active';
    currentMode = 1;

    videoEl = createCapture(VIDEO, () => {
        videoEl.hide();
        videoLoaded = true;
        videoPlaying = true;
        updateButtonStates();
        let pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        ui.btnPlay.innerHTML = pauseIcon;
        ui.tlBtnPlay.innerHTML = pauseIcon;
    });
}

function stopWebcam() {
    if (videoEl) {
        if (videoEl.elt && videoEl.elt.srcObject) {
            videoEl.elt.srcObject.getTracks().forEach(t => t.stop());
        }
        videoEl.remove();
        videoEl = null;
    }
    usingWebcam = false;
    videoLoaded = false;
    videoPlaying = false;
    ui.webcamBtn.classList.remove('active');
    ui.fileName.innerText = 'mp4 or mov';
    let playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    ui.btnPlay.innerHTML = playIcon;
    ui.tlBtnPlay.innerHTML = playIcon;
}

function handleFile(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('video/')) {
        if (usingWebcam) stopWebcam();
        if (videoEl) { videoEl.stop(); videoEl.remove(); }
        ui.fileName.innerText = file.name;
        if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = URL.createObjectURL(file);
        const url = currentVideoUrl;

        videoEl = createVideo(url, () => {
            videoEl.volume(0); videoEl.loop(); videoEl.hide();
            videoLoaded = true; videoPlaying = true;
            currentMode = 1;
            updateButtonStates();
            let pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            ui.btnPlay.innerHTML = pauseIcon;
            ui.tlBtnPlay.innerHTML = pauseIcon;
            // Keep audio in sync with video — handles offset and loop modes
            videoEl.elt.addEventListener('timeupdate', () => {
                if (!audioElement || !audioLoaded || !videoPlaying) return;
                let videoTime = videoEl.elt.currentTime;
                let expectedAudioTime = getAudioTimeForVideo(videoTime);

                if (loopMode === 'loop') {
                    if (expectedAudioTime < 0) {
                        if (audioElement.currentTime > 0.5) audioElement.currentTime = 0;
                    } else if (audioDuration > 0) {
                        expectedAudioTime = ((expectedAudioTime % audioDuration) + audioDuration) % audioDuration;
                        let drift = Math.abs(audioElement.currentTime - expectedAudioTime);
                        if (drift > 0.2) audioElement.currentTime = expectedAudioTime;
                    }
                } else if (loopMode === 'through') {
                    if (audioElement.ended && videoEl.elt.currentTime < 1) {
                        let audioTime = getAudioTimeForVideo(0);
                        audioElement.currentTime = Math.max(0, audioTime);
                        audioElement.play().catch(() => { audioPlaying = false; });
                        audioPlaying = true;
                    } else if (audioElement.paused && !audioElement.ended) {
                        // Was paused externally, leave it
                    } else if (audioElement.ended && videoPlaying) {
                        audioPlaying = false;
                    }
                } else if (loopMode === 'once') {
                    let shorter = Math.min(videoDuration || Infinity, audioDuration || Infinity);
                    if (videoTime >= shorter - 0.1) {
                        videoEl.pause();
                        audioElement.pause();
                        videoPlaying = false;
                        audioPlaying = false;
                        let playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
                        ui.btnPlay.innerHTML = playIcon;
                        ui.tlBtnPlay.innerHTML = playIcon;
                    }
                }
            });
            // Capture duration for timeline
            videoEl.elt.addEventListener('loadedmetadata', () => {
                videoDuration = videoEl.elt.duration;
                showTimeline();
                renderTimelineSegments();
            });
            // Fallback if metadata already loaded
            if (videoEl.elt.duration) {
                videoDuration = videoEl.elt.duration;
                showTimeline();
            }
        });
    }
}

// ── CONTINUOUS INPUT ──────────────────────

function handleContinuousInput() {
    if (document.activeElement.tagName === 'INPUT') return;
    if (keyIsDown(65)) changeValue(-0.5);
    if (keyIsDown(68)) changeValue(0.5);
}

function changeValue(amount) {
    if (typeof currentParam === 'undefined') return;
    let newVal = paramValues[currentParam] + amount;
    newVal = constrain(newVal, 0, 100);
    paramValues[currentParam] = newVal;
    syncUI();
}

// ── RECORDING ─────────────────────────────

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    initAudioContext();
    const canvas = p5Canvas;
    const canvasStream = canvas.captureStream(30);

    let combinedStream;
    if (audioLoaded && audioContext && audioGainNode) {
        recordingAudioDest = audioContext.createMediaStreamDestination();
        audioGainNode.connect(recordingAudioDest);
        const audioTrack = recordingAudioDest.stream.getAudioTracks()[0];
        combinedStream = new MediaStream([...canvasStream.getVideoTracks(), audioTrack]);
    } else {
        combinedStream = canvasStream;
    }

    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,opus')
        ? 'video/mp4;codecs=avc1,opus'
        : MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                    ? 'video/webm;codecs=vp8,opus'
                    : 'video/webm';

    mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        lastRecordedBlob = new Blob(recordedChunks, { type: mimeType });
        lastRecordedExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        recordedChunks = [];
        ui.btnSave.style.borderColor = '#e5e5e5';
    };

    mediaRecorder.start(100);
    isRecording = true;
    ui.btnRecord.classList.add('recording');
    ui.btnRecord.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg> Stop`;
    ui.tlBtnRecord.classList.add('recording');
    ui.tlBtnRecord.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>`;
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    if (recordingAudioDest && audioGainNode) {
        try { audioGainNode.disconnect(recordingAudioDest); } catch(e) {}
        recordingAudioDest = null;
    }
    isRecording = false;
    ui.btnRecord.classList.remove('recording');
    ui.btnRecord.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg> Record`;
    ui.tlBtnRecord.classList.remove('recording');
    ui.tlBtnRecord.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>`;
}

function saveRecording() {
    if (!lastRecordedBlob) {
        ui.btnSave.style.borderColor = '#ff4444';
        setTimeout(() => { ui.btnSave.style.borderColor = ''; }, 600);
        return;
    }
    const url = URL.createObjectURL(lastRecordedBlob);
    const a = document.createElement('a');
    a.href = url;
    let d = new Date();
    let ts = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
    a.download = `blob-tracking-${ts}.${lastRecordedExt || 'webm'}`;
    a.click();
    URL.revokeObjectURL(url);
}

function saveScreenshot() {
    if (!p5Canvas) return;
    let sx = Math.round(videoX * pixelDensity());
    let sy = Math.round(videoY * pixelDensity());
    let sw = Math.round(videoW * pixelDensity());
    let sh = Math.round(videoH * pixelDensity());
    sw = Math.min(sw, p5Canvas.width - sx);
    sh = Math.min(sh, p5Canvas.height - sy);
    if (sw <= 0 || sh <= 0) return;
    let ctx = p5Canvas.getContext('2d');
    let imageData = ctx.getImageData(sx, sy, sw, sh);
    let cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    cropCanvas.getContext('2d').putImageData(imageData, 0, 0);
    cropCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        let d = new Date();
        let ts = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
        a.download = `blob-tracking-${ts}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

// ── KEYBOARD / MOUSE INPUT ────────────────

function keyPressed() {
    if (document.activeElement.tagName === 'INPUT') return;

    let changed = false;

    if (key === ' ') { togglePlay(); return false; }
    if (key === 'r' || key === 'R') { restartVideo(); return false; }

    if (key === 'w' || key === 'W') {
        navIndex = (navIndex - 1 + navOrder.length) % navOrder.length;
        currentParam = navOrder[navIndex];
        return false;
    }
    if (key === 's' || key === 'S') {
        navIndex = (navIndex + 1) % navOrder.length;
        currentParam = navOrder[navIndex];
        return false;
    }

    if (key === 'z' || key === 'Z' || key === '1') { exitMaskMode(); currentMode = 1; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === 'x' || key === 'X' || key === '2') { exitMaskMode(); currentMode = 2; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '0') { exitMaskMode(); currentMode = 0; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '3') { exitMaskMode(); currentMode = 3; prevGridPixels = {}; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '4') { exitMaskMode(); currentMode = 4; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '5') { exitMaskMode(); currentMode = 5; ui.customColorGroup.style.display = ''; changed = true; }
    if (key === '6') { exitMaskMode(); currentMode = 6; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '7') { exitMaskMode(); currentMode = 7; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '8') { exitMaskMode(); currentMode = 8; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '9') { exitMaskMode(); currentMode = 9; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === 'm' || key === 'M') { currentMode = 14; enterMaskSelecting(); changed = true; }
    if (key === 'l' || key === 'L') { showLines = !showLines; changed = true; }

    if (keyCode === ESCAPE && currentMode === 14) {
        exitMaskMode();
        currentMode = 1;
        ui.customColorGroup.style.display = 'none';
        changed = true;
    }

    if (key === 't' || key === 'T') {
        audioSync = !audioSync;
        if (audioSync) {
            audioBaseValues = { 0: paramValues[0], 1: paramValues[1], 5: paramValues[5], 6: paramValues[6] };
        }
        changed = true;
    }

    if (key === 'g' || key === 'G') {
        debugVisible = !debugVisible;
        let dp = document.getElementById('debug-panel');
        if (dp) dp.classList.toggle('visible', debugVisible);
        return false;
    }

    if (key === 'f' || key === 'F') {
        const presetOrder = ['kick', 'bass', 'vocal', 'hats', 'full'];
        const presetValues = {
            kick: { low: 40, high: 200 }, bass: { low: 40, high: 300 },
            vocal: { low: 300, high: 5000 }, hats: { low: 6000, high: 20000 },
            full: { low: 20, high: 20000 }
        };
        const presetThresh = { kick: 8, bass: 15, vocal: 25, hats: 15, full: 5 };
        let curIdx = presetOrder.findIndex(p => {
            let pv = presetValues[p];
            return freqLow === pv.low && freqHigh === pv.high;
        });
        let nextIdx = (curIdx + 1) % presetOrder.length;
        let nextName = presetOrder[nextIdx];
        let next = presetValues[nextName];
        freqLow = next.low; freqHigh = next.high;
        ui.freqLowSlider.value = freqLow; ui.freqLowInput.value = freqLow;
        ui.freqHighSlider.value = freqHigh; ui.freqHighInput.value = freqHigh;
        audioThreshold = presetThresh[nextName];
        document.getElementById('slider-10').value = audioThreshold;
        document.getElementById('val-10').value = audioThreshold;
        autoGainMax = { band: AUTO_GAIN_FLOOR, bass: AUTO_GAIN_FLOOR, mid: AUTO_GAIN_FLOOR, treble: AUTO_GAIN_FLOOR };
        smoothBand = 0;
        resetBandDetectors();
        changed = true;
    }

    // Undo (Cmd+Z) — works regardless of selection
    if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17)) && (key === 'z' || key === 'Z') && !e.shiftKey) {
        tlUndo();
        return false;
    }
    // Redo (Cmd+Shift+Z) — works regardless of selection
    if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17)) && (key === 'z' || key === 'Z') && e.shiftKey) {
        tlRedo();
        return false;
    }

    // Segment management (when segments selected, override arrow seek)
    if (selectedSegments.size > 0) {
        let tlDur = getTimelineDuration();

        // Arrow nudge
        if (keyCode === LEFT_ARROW && tlDur) {
            let delta = keyIsDown(SHIFT) ? -1 : -0.1;
            for (let seg of timelineSegments) {
                if (selectedSegments.has(seg.id)) {
                    let dur = seg.endTime - seg.startTime;
                    seg.startTime = Math.max(0, seg.startTime + delta);
                    seg.endTime = seg.startTime + dur;
                }
            }
            assignLanes(); renderTimelineSegments();
            return false;
        }
        if (keyCode === RIGHT_ARROW && tlDur) {
            let delta = keyIsDown(SHIFT) ? 1 : 0.1;
            for (let seg of timelineSegments) {
                if (selectedSegments.has(seg.id)) {
                    let dur = seg.endTime - seg.startTime;
                    seg.startTime = Math.min(tlDur - dur, seg.startTime + delta);
                    seg.endTime = seg.startTime + dur;
                }
            }
            assignLanes(); renderTimelineSegments();
            return false;
        }

        // Delete (Backspace or Delete)
        if (keyCode === BACKSPACE || keyCode === 46) {
            tlSaveState();
            timelineSegments = timelineSegments.filter(s => !selectedSegments.has(s.id));
            selectedSegments.clear();
            syncSelectedSegment();
            assignLanes();
            renderTimelineSegments();
            return false;
        }

        // Duplicate (Cmd+D)
        if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17)) && (key === 'd' || key === 'D')) {
            tlSaveState();
            let newSegs = [];
            for (let seg of timelineSegments) {
                if (selectedSegments.has(seg.id)) {
                    let dur = seg.endTime - seg.startTime;
                    let newSeg = {
                        id: nextSegId++,
                        effect: seg.effect,
                        startTime: seg.endTime,
                        endTime: Math.min(seg.endTime + dur, tlDur),
                        params: JSON.parse(JSON.stringify(seg.params)),
                        lane: 0,
                        color: seg.color
                    };
                    newSegs.push(newSeg);
                }
            }
            timelineSegments.push(...newSegs);
            selectedSegments.clear();
            newSegs.forEach(s => selectedSegments.add(s.id));
            syncSelectedSegment();
            assignLanes(); renderTimelineSegments();
            return false;
        }

        // Copy (Cmd+C)
        if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17)) && (key === 'c' || key === 'C')) {
            clipboardSegments = timelineSegments
                .filter(s => selectedSegments.has(s.id))
                .map(s => JSON.parse(JSON.stringify(s)));
            return false;
        }
    }

    // Paste (Cmd+V) — works even without selection
    if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17)) && (key === 'v' || key === 'V') && clipboardSegments.length > 0) {
        tlSaveState();
        let currentTime = (tlRulerMode === 'audio' && audioElement && audioLoaded)
            ? audioElement.currentTime : (videoEl ? videoEl.time() : 0);
        let tlDur = getTimelineDuration();
        if (tlDur > 0) {
            let earliest = Math.min(...clipboardSegments.map(s => s.startTime));
            let newSegs = [];
            for (let clip of clipboardSegments) {
                let offset = clip.startTime - earliest;
                let dur = clip.endTime - clip.startTime;
                let newSeg = {
                    id: nextSegId++,
                    effect: clip.effect,
                    startTime: currentTime + offset,
                    endTime: Math.min(currentTime + offset + dur, tlDur),
                    params: JSON.parse(JSON.stringify(clip.params)),
                    lane: 0,
                    color: clip.color
                };
                newSegs.push(newSeg);
            }
            timelineSegments.push(...newSegs);
            selectedSegments.clear();
            newSegs.forEach(s => selectedSegments.add(s.id));
            syncSelectedSegment();
            assignLanes(); renderTimelineSegments();
        }
        return false;
    }

    if (keyCode === LEFT_ARROW && videoLoaded && videoDuration > 0) {
        let t = Math.max(0, videoEl.time() - 5);
        videoEl.time(t);
        if (audioElement && audioLoaded) audioElement.currentTime = Math.max(0, getAudioTimeForVideo(t));
        return false;
    }
    if (keyCode === RIGHT_ARROW && videoLoaded && videoDuration > 0) {
        let t = Math.min(videoDuration, videoEl.time() + 5);
        videoEl.time(t);
        if (audioElement && audioLoaded) audioElement.currentTime = Math.max(0, getAudioTimeForVideo(t));
        return false;
    }

    if (key === 'q' || key === 'Q') {
        const targets = ['all', 'qty', 'size', 'color', 'flash', 'pulse', 'rate'];
        let curIdx = targets.indexOf(audioSyncTarget);
        audioSyncTarget = targets[(curIdx + 1) % targets.length];
        changed = true;
    }

    if (key === 'b' || key === 'B') {
        bpmLocked = !bpmLocked;
        changed = true;
    }

    if(changed) syncUI();
}

function mouseDragged() {
    if (mouseButton === RIGHT && mouseX > 0) {
        let delta = (mouseX - lastX) * 0.2;
        if (currentParam !== 4) {
            paramValues[currentParam] = constrain(paramValues[currentParam] + delta, 0, 100);
            syncUI();
        }
        lastX = mouseX;
        return false;
    }
    return true;
}

function mousePressed() {
    if (mouseButton === RIGHT) { lastX = mouseX; return; }
    if (currentMode === 14 && mouseButton === LEFT) {
        if (mouseX >= videoX && mouseX <= videoX + videoW && mouseY >= videoY && mouseY <= videoY + videoH) {
            if (window.mpSegmenterReady) {
                let modType = null;
                if (keyIsDown(SHIFT)) modType = 'add';
                else if (keyIsDown(ALT)) modType = 'subtract';
                runMaskSegmentation(mouseX, mouseY, modType);
            }
            return false;
        }
    }
}
