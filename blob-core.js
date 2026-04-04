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
let lineColor = '#ffffff';
let lineWeight = 1;
let lineStraight = false;
let lineDashed = false;
let connectionMode = 'chain'; // chain, hub, web
let blobStyle = 'box'; // box, lframe, xframe, scope, win2k, grid, dash, glow, particle, label, label2, backdrop
let _blobParticles = [];
const _MAX_PARTICLES = 500;
let trackBoxColor = '#969696'; // default gray tracking box color
let trackBoxWeight = 1.2;      // box stroke weight
let currentMode = 0;      // start with tracking OFF — user enables explicitly
let _userMode = 0;        // user's UI-selected mode (survives timeline overrides)
let _userCustomHue = 195; // user's UI-selected custom hue
let currentParam = 0;

const DEFAULT_CONFIG = {
    parametros: [15, 30, 40, 3, 20, 4, 40, 50],
    modo: 1,
    linhas: false,
    viz: 1
};

let paramValues = [...DEFAULT_CONFIG.parametros];

// Parameter ownership priority: USER > TIMELINE > AUDIO
const PARAM_SRC_USER = 0;
const PARAM_SRC_AUDIO = 1;
const PARAM_SRC_TIMELINE = 2;
let paramOwner = new Uint8Array(8);
let paramOwnerPrev = new Uint8Array(8);
let paramBaseline = [...DEFAULT_CONFIG.parametros];

const navOrder = [0, 1, 4, 5, 6, 2, 3, 7];
let navIndex = 0;
let _videoLoadGen = 0;

let trackedPoints = [];
let lastX = 0;
let lastTrackTime = 0;
let prevGridPixels = {};
let customHue = 195;
let flickerScores = {};
let p5Canvas = null;
let bgDim = 0;

// ── BLOB PERSISTENCE (Tier 1+2) ─────────
let _persistentBlobs = [];      // PersistentBlob[] master list
let _nextBlobId = 1;            // monotonic counter
let _persistenceEnabled = false; // master toggle (false = legacy)
let _maxMoveDistance = 80;       // px threshold for ID matching
let _persistDuration = 30;       // frames to keep lost blobs
let _minBlobAge = 0;             // frames before blob visible
let _blobSmoothing = 0.4;       // EMA factor (0=none, 1=frozen)
let _dedupRadius = 0;            // merge candidates within this px (0=off)
let _bgRefFrame = null;          // Uint8Array — captured BG reference
let _bgThreshold = 30;           // RGB distance threshold for BG sub
let _clusterEnabled = false;     // DBSCAN post-processing toggle
let _clusterEps = 25;            // DBSCAN epsilon (px)
let _clusterMinPts = 3;          // DBSCAN minimum points per cluster
let _roiEnabled = false;         // region of interest toggle
let _roiRect = null;             // {x1,y1,x2,y2} in video coords
let _roiDrawing = false;         // currently drawing ROI
let _roiStart = null;            // drag start point
let _heatmapCanvas = null;       // offscreen heatmap accumulator
let _heatmapCtx = null;
let _heatmapDecay = 0.95;        // per-frame fade factor
let _trailEnabled = false;       // draw motion path trails
let _trailLength = 30;           // max trail points per blob
let _trailOpacity = 0.5;         // trail base opacity
let _reviveEnabled = false;
let _reviveTime = 30;           // frames lost blob stays revivable
let _reviveDistance = 120;       // max px for revival match
let _reviveAreaDiff = 0.5;      // max brightness difference (0-1)

let productInfo = { brand: '', name: '', material: '', price: '', size: '' };
let activeVizModes = new Set([1]);
let activeEffects = new Set();
let hiddenEffects = new Set(); // effects toggled off via Layers eye but not removed
let currentPreset = null; // currently applied preset name (null = none)
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
let grainIntensity = 50;
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
let datamoshDecay = 20, datamoshThreshold = 40, datamoshIntensity = 75, datamoshMode = 'melt';
let pxsortgpuLo = 30, pxsortgpuHi = 220, pxsortgpuDir = 'horizontal';
let noiseIntensity = 35;
let noiseScale = 3;
let noiseColorMode = 'mono';
let curveIntensity = 30;
let curveDirection = 'barrel';
let curveFringe = 0;
let briValue = 0;
let conValue = 100;
let satValue = 100;
let gridScale = 20;
let gridWidth = 2;
let gridOpacity = 50;
let dotsAngle = 45;
let dotsScale = 10;
let dotsOpacity = 100;
let mblurIntensity = 30;
let mblurAngle = 0;
let palettePreset = 'noir';
let paletteIntensity = 80;

// ── NEW ENRICHED EFFECT PARAMS ──
// Halftone enriched
let halfAngle = 0;
let halfContrast = 50;
let halfSpread = 0;
let halfShape = 'circle';
let halfInkColor = '#000000';
let halfPaperColor = '#ffffff';
let halfInverted = false;

// Dither enriched
let ditherAlgorithm = 'bayer4';
let ditherPalette = 'bw';
let ditherColorCount = 2;
let ditherPixelation = 1;
let ditherStrength = 100;

// Atkinson enriched
let atkinsonThreshold = 128;
let atkinsonSpread = 100;
let atkinsonStrength = 100;

// Bloom enriched
let bloomSpread = 50;
let bloomBlendMode = 'additive';
let bloomExposure = 100;

// Glitch enriched
let glitchChannelShift = 50;
let glitchBlockSize = 50;
let glitchSeed = 0;
let glitchSpeed = 50;

// Tint enriched
let tintCustomColor = '#00ff00';

// ── NEW EFFECTS ──
// CRT Screen
let crtScanWeight = 2;
let crtCurvature = 30;
let crtGlow = 50;
let crtChroma = 3;
let crtStatic = 20;

// Thermal
let thermalIntensity = 80;

// Emboss
let embossAngle = 135;
let embossStrength = 50;

// LED Screen
let ledCellSize = 8;
let ledGap = 2;
let ledGlow = 30;
let ledBrightness = 100;

// Gradient Map
let gradColor1 = '#000033';
let gradColor2 = '#ff6600';
let gradIntensity = 80;

// Duotone
let duoShadow = '#1a1a2e';
let duoHighlight = '#e94560';
let duoIntensity = 80;

// RGB Shift
let rgbShiftRX = 5;
let rgbShiftRY = 0;
let rgbShiftBX = -5;
let rgbShiftBY = 0;
let rgbShiftIntensity = 70;

// Master FX toggle
let masterFxEnabled = true;

// ── LAYER SYSTEM ──
let blobsVisible = true;
let blobsOpacity = 1.0;
let fxMasterOpacity = 1.0;
let maskOverlayVisible = true;
let beatFlashVisible = true;
let _fxOpacityBuf = null;
let _blobOpacityBuf = null;

// ── NEW EFFECTS v2 ──
// Threshold
let thresholdLevel = 128;
let thresholdInvert = false;

// Exposure
let exposureEV = 0;

// Color Temperature
let colortempValue = 0;

// RGB Gain
let rgbGainR = 100;
let rgbGainG = 100;
let rgbGainB = 100;
let rgbGainGamma = 1.0;

// Levels
let levelsInBlack = 0;
let levelsInWhite = 255;
let levelsGamma = 1.0;
let levelsOutBlack = 0;
let levelsOutWhite = 255;

// Color Balance
let colorbalShadowR = 0;
let colorbalShadowG = 0;
let colorbalShadowB = 0;
let colorbalMidR = 0;
let colorbalMidG = 0;
let colorbalMidB = 0;
let colorbalHiR = 0;
let colorbalHiG = 0;
let colorbalHiB = 0;

// Color Matrix
let colmatrixPreset = 'none';
let colmatrixIntensity = 80;

// Blur/Sharp
let blursharpAmount = 0;

// Modulate
let modulateFreq = 10;
let modulateAmp = 20;
let modulateSpeed = 1;
let modulateDir = 'horizontal';

// Ripple
let rippleFreq = 5;
let rippleAmp = 15;
let rippleSpeed = 2;
let rippleDamping = 0;

// Swirl
let swirlAngle = 90;
let swirlRadius = 70;

// Reed Glass
let reedWidth = 10;
let reedDistortion = 20;
let reedChromatic = false;

// Polar to Rect
let polar2rectRotation = 0;

// Rect to Polar
let rect2polarRotation = 0;

// Radial Blur
let radblurIntensity = 30;

// Zoom Blur
let zoomblurIntensity = 30;

// Circular Blur
let circblurIntensity = 30;

// Elastic Grid
let elgridSize = 12;
let elgridWarp = 30;
let elgridSpeed = 1;
let elgridAnimated = true;

// Print Stamp
let printstampDotSize = 6;
let printstampContrast = 60;
let printstampGrain = 40;

// Y2K Blue
let y2kBlueShift = 70;
let y2kGlow = 40;
let y2kGrain = 30;

// NTSC
let ntscChromaBleed = 50;
let ntscInstability = 30;
let ntscNoise = 20;
let ntscRolling = false;

// Stripe
let stripeDensity = 10;
let stripeAngle = 0;
let stripeThickness = 2;
let stripeOpacity = 50;
let stripeMode = 'linear';

// Paper Scan
let paperscanIntensity = 40;
let paperscanFiber = 3;
let paperscanWarmth = 30;

// Xerox
let xeroxContrast = 60;
let xeroxNoise = 40;
let xeroxDarkness = 50;

// Grunge
let grungeTint = '#cc6677';
let grungePosterize = 3;
let grungeGrain = 50;

// ── IMPROVEMENT PARAMS for existing effects ──
let sepiaWarmth = 0;
let thermalPalette = 'default';
let gradColor3 = '#888888';
let gradMidpoint = 50;
let chromaMode = 'linear';
let waveMode = 'horizontal';
let embossColor = false;
let bloomAnamorphic = false;
let noiseAlgo = 'random';
let vigColor = '#000000';
let crtPhosphor = 'none';
let ledShape = 'square';
let scanVertical = false;
let pixelMode = 'square';

// ── CONSTRAINT SYSTEMS-INSPIRED EFFECTS ──
// Sift (Light Prism)
let siftLayers = 8;
let siftOffsetX = 4;
let siftOffsetY = 2;
let siftIntensity = 50;
// Smart Pixelate (content-aware)
let smartpxThreshold = 15;
let smartpxSize = 8;
// Slide Stretch
let slideDividers = 3;
let slideStretch = 40;
let slideAngle = 0; // 0=vertical, 90=horizontal
// Corner Pin
let cornerpinPreset = 'perspective';
let cornerpinIntensity = 50;
// Cellular Automata
let automataRule = 'decay';
let automataSpeed = 5;
let automataThreshold = 128;
// Pixel Flow
let flowAngle = 0;
let flowSpeed = 3;
let flowDecay = 70;
// Phase 3 effects
let kaleidSegments = 6, kaleidRotation = 0;
let feedbackDecay = 85, feedbackZoom = 8, feedbackRotation = 2, feedbackHueShift = 15;
let timewarpSpeed = 50, timewarpDir = 'horizontal';
let flowfieldScale = 4, flowfieldStrength = 30, flowfieldSpeed = 1;
let freezeRate = 15;
let _freezeCounter = 0;

let videoX, videoY, videoW, videoH;
let currentVideoUrl = null;

// ── COORDINATE HELPERS ──
function videoToScreenCoords(vx, vy) {
    let sx = map(vx, 0, videoEl.width, videoX, videoX + videoW);
    if (usingWebcam && _currentFacingMode === 'user') sx = 2 * videoX + videoW - sx;
    return { x: sx, y: map(vy, 0, videoEl.height, videoY, videoY + videoH) };
}
function screenToVideoCoords(sx, sy) {
    let vx = map(sx, videoX, videoX + videoW, 0, videoEl.width);
    if (usingWebcam && _currentFacingMode === 'user') vx = videoEl.width - vx;
    return { x: vx, y: map(sy, videoY, videoY + videoH, 0, videoEl.height) };
}

// Video zoom/pan state
let vidZoom = 1;
let vidPanX = 0;
let vidPanY = 0;

// Zoom features
let zoomSmooth = true;           // smooth animated transitions
let zoomTargetLevel = 1;         // target zoom for smooth lerp
let zoomTargetPanX = 0;
let zoomTargetPanY = 0;
let autoFollow = false;          // auto-follow tracked region
let autoFollowSpeed = 0.08;      // follow lerp speed
let kenBurnsEnabled = false;     // Ken Burns cinematic auto-zoom
let kenBurnsSpeed = 0.3;         // KB animation speed
let kenBurnsTime = 0;            // KB phase accumulator
let kenBurnsMinZoom = 1.0;      // KB minimum zoom
let kenBurnsMaxZoom = 2.5;      // KB maximum zoom
let kenBurnsPanAmt = 0.15;      // KB pan amount (fraction)
let preKBZoom = 1;              // saved zoom before KB
let preKBPanX = 0;              // saved panX before KB
let preKBPanY = 0;              // saved panY before KB
let kenBurnsReturning = false;  // smooth return to pre-KB state
let splitZoomEnabled = false;    // split view (normal + zoomed)
let splitZoomLevel = 3;          // zoom level for the zoomed half
let splitFxEnabled = true;       // apply effects to split view half
let splitVizZoom = false;        // show zoom viz blobs on split half
let splitPosition = 50;          // split divider position 0-100%
let splitMirrorFlip = false;     // swap left/right sides
let splitFxSide = 'both';        // which side effects apply to: 'left'|'right'|'both'
let splitShape = 'rect';         // zoom side clip shape: rect|rounded|circle|pill
let _splitDrag = null;           // drag state for split divider
let _asciiSampler = null;        // offscreen canvas for ASCII viz sampling
// _thermoSampler removed — CPU THERMO viz removed in favor of GPU THERMAL region effect
let _vizRecordQueue = [];        // viz mode render data for recording at native res
let _splitBuf = null;            // offscreen canvas for dual FX compositing
let depthBlurEnabled = false;    // depth-of-field vignette blur at edges
let depthBlurStrength = 40;      // blur vignette width in pixels
let pipEnabled = false;          // picture-in-picture overview map
let vizZoomLevel = 3;            // zoom viz magnification (-8 to 8, negative = zoom out)
let vizZoomBox = false;          // show colored box on zoom viz blobs

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
    0:'Off', 1:'Blue', 2:'Red', 3:'Motion', 4:'Skin', 5:'Custom',
    6:'Bright', 7:'Dark', 8:'Edge', 9:'Chroma', 10:'Warm', 11:'Cool',
    12:'Flicker', 13:'Invert', 14:'Mask', 15:'Eyes', 16:'Lips', 17:'Face',
    19:'BG Sub'
};

// Face landmark tracking state (MediaPipe Face Landmarker)
let faceLandmarkCache = null;   // cached landmark results
let faceDetectFrame = 0;        // frame counter for throttled detection
const FACE_DETECT_INTERVAL = 3; // detect every 3rd frame to reduce CPU load (smoothing fills gaps)

// Landmark smoothing (EMA — exponential moving average)
let smoothedLandmarks = null;   // smoothed landmark positions per face
const LANDMARK_SMOOTH = 0.35;   // 0 = no smoothing, 1 = frozen (0.35 = responsive + stable)

// Landmark index groups for face feature modes
const FACE_EYES_INDICES = [
    // Left eye contour
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
    // Right eye contour
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
    // Left iris
    468, 469, 470, 471, 472,
    // Right iris
    473, 474, 475, 476, 477,
    // Left eyebrow
    70, 63, 105, 66, 107, 55, 65, 52, 53, 46,
    // Right eyebrow
    300, 293, 334, 296, 336, 285, 295, 282, 283, 276
];

const FACE_LIPS_INDICES = [
    // Outer lip
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
    // Inner lip
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324,
    // Chin / jaw near lips
    152, 148, 176, 149, 150, 136, 172, 58, 132, 377, 400, 378, 379, 365, 397, 288, 361
];
let modeDragState = null;
const BLOB_SEG_COLOR = '#00CEC9';
let editingBlobSeg = null; // when a blob segment is selected, sliders edit its params

const FX_CATEGORIES = {
    sepia:'color', tint:'color', palette:'color', bricon:'color', thermal:'color', gradmap:'color', duotone:'color',
    threshold:'color', exposure:'color', colortemp:'color', rgbgain:'color', levels:'color', colorbal:'color', colmatrix:'color',
    chroma:'distortion', rgbshift:'distortion', curve:'distortion', wave:'distortion', jitter:'distortion', mblur:'distortion', emboss:'distortion',
    blursharp:'distortion', modulate:'distortion', ripple:'distortion', swirl:'distortion', reedglass:'distortion', polar2rect:'distortion', rect2polar:'distortion', radblur:'distortion', zoomblur:'distortion', circblur:'distortion', elgrid:'distortion',
    bloom:'pattern', dither:'pattern', atkinson:'pattern', halftone:'pattern', pxsort:'pattern', pixel:'pattern', led:'pattern',
    printstamp:'pattern', y2kblue:'pattern', pxsortgpu:'pattern',
    ascii:'overlay', glitch:'overlay', noise:'overlay', grain:'overlay', dots:'overlay', grid:'overlay', scanlines:'overlay', vignette:'overlay', crt:'overlay',
    ntsc:'overlay', stripe:'overlay', paperscan:'overlay', xerox:'overlay', grunge:'overlay', datamosh:'overlay',
    sift:'overlay', smartpixel:'pattern', slidestretch:'distortion', cornerpin:'distortion', automata:'overlay', pixelflow:'distortion',
    kaleid:'distortion', feedback:'overlay', timewarp:'overlay', flowfield:'distortion', freeze:'overlay'
};
const FX_CAT_COLORS = { color:'#6C5CE7', distortion:'#00B894', pattern:'#FDCB6E', overlay:'#E17055' };
const FX_PARAM_MAP = {
    sepia: [{v:'sepiaIntensity',g:()=>sepiaIntensity,s:v=>sepiaIntensity=v},{v:'sepiaWarmth',g:()=>sepiaWarmth,s:v=>sepiaWarmth=v}],
    tint: [{v:'tintPreset',g:()=>tintPreset,s:v=>tintPreset=v},{v:'tintIntensity',g:()=>tintIntensity,s:v=>tintIntensity=v},{v:'tintCustomColor',g:()=>tintCustomColor,s:v=>tintCustomColor=v}],
    palette: [{v:'palettePreset',g:()=>palettePreset,s:v=>palettePreset=v},{v:'paletteIntensity',g:()=>paletteIntensity,s:v=>paletteIntensity=v}],
    bricon: [{v:'briValue',g:()=>briValue,s:v=>briValue=v},{v:'conValue',g:()=>conValue,s:v=>conValue=v},{v:'satValue',g:()=>satValue,s:v=>satValue=v}],
    chroma: [{v:'chromaOffset',g:()=>chromaOffset,s:v=>chromaOffset=v},{v:'chromaMode',g:()=>chromaMode,s:v=>chromaMode=v}],
    curve: [{v:'curveIntensity',g:()=>curveIntensity,s:v=>curveIntensity=v},{v:'curveDirection',g:()=>curveDirection,s:v=>curveDirection=v},{v:'curveFringe',g:()=>curveFringe,s:v=>curveFringe=v}],
    wave: [{v:'waveAmp',g:()=>waveAmp,s:v=>waveAmp=v},{v:'waveFreq',g:()=>waveFreq,s:v=>waveFreq=v},{v:'waveSpeed',g:()=>waveSpeed,s:v=>waveSpeed=v},{v:'waveMode',g:()=>waveMode,s:v=>waveMode=v}],
    jitter: [{v:'jitterIntensity',g:()=>jitterIntensity,s:v=>jitterIntensity=v},{v:'jitterBlockSize',g:()=>jitterBlockSize,s:v=>jitterBlockSize=v},{v:'jitterMode',g:()=>jitterMode,s:v=>jitterMode=v}],
    mblur: [{v:'mblurIntensity',g:()=>mblurIntensity,s:v=>mblurIntensity=v},{v:'mblurAngle',g:()=>mblurAngle,s:v=>mblurAngle=v}],
    bloom: [{v:'bloomIntensity',g:()=>bloomIntensity,s:v=>bloomIntensity=v},{v:'bloomRadius',g:()=>bloomRadius,s:v=>bloomRadius=v},{v:'bloomThreshold',g:()=>bloomThreshold,s:v=>bloomThreshold=v},{v:'bloomSpread',g:()=>bloomSpread,s:v=>bloomSpread=v},{v:'bloomBlendMode',g:()=>bloomBlendMode,s:v=>bloomBlendMode=v},{v:'bloomExposure',g:()=>bloomExposure,s:v=>bloomExposure=v},{v:'bloomAnamorphic',g:()=>bloomAnamorphic,s:v=>bloomAnamorphic=v}],
    dither: [{v:'ditherColorMode',g:()=>ditherColorMode,s:v=>ditherColorMode=v},{v:'ditherAlgorithm',g:()=>ditherAlgorithm,s:v=>ditherAlgorithm=v},{v:'ditherPalette',g:()=>ditherPalette,s:v=>ditherPalette=v},{v:'ditherColorCount',g:()=>ditherColorCount,s:v=>ditherColorCount=v},{v:'ditherPixelation',g:()=>ditherPixelation,s:v=>ditherPixelation=v},{v:'ditherStrength',g:()=>ditherStrength,s:v=>ditherStrength=v}],
    atkinson: [{v:'atkinsonColorMode',g:()=>atkinsonColorMode,s:v=>atkinsonColorMode=v},{v:'atkinsonThreshold',g:()=>atkinsonThreshold,s:v=>atkinsonThreshold=v},{v:'atkinsonSpread',g:()=>atkinsonSpread,s:v=>atkinsonSpread=v},{v:'atkinsonStrength',g:()=>atkinsonStrength,s:v=>atkinsonStrength=v}],
    halftone: [{v:'halfSpacing',g:()=>halfSpacing,s:v=>halfSpacing=v},{v:'halfColorMode',g:()=>halfColorMode,s:v=>halfColorMode=v},{v:'halfAngle',g:()=>halfAngle,s:v=>halfAngle=v},{v:'halfContrast',g:()=>halfContrast,s:v=>halfContrast=v},{v:'halfSpread',g:()=>halfSpread,s:v=>halfSpread=v},{v:'halfShape',g:()=>halfShape,s:v=>halfShape=v},{v:'halfInkColor',g:()=>halfInkColor,s:v=>halfInkColor=v},{v:'halfPaperColor',g:()=>halfPaperColor,s:v=>halfPaperColor=v},{v:'halfInverted',g:()=>halfInverted,s:v=>halfInverted=v}],
    pxsort: [{v:'pxsortLo',g:()=>pxsortLo,s:v=>pxsortLo=v},{v:'pxsortHi',g:()=>pxsortHi,s:v=>pxsortHi=v},{v:'pxsortDir',g:()=>pxsortDir,s:v=>pxsortDir=v}],
    datamosh: [{v:'datamoshDecay',g:()=>datamoshDecay,s:v=>datamoshDecay=v},{v:'datamoshThreshold',g:()=>datamoshThreshold,s:v=>datamoshThreshold=v},{v:'datamoshIntensity',g:()=>datamoshIntensity,s:v=>datamoshIntensity=v},{v:'datamoshMode',g:()=>datamoshMode,s:v=>datamoshMode=v}],
    pxsortgpu: [{v:'pxsortgpuLo',g:()=>pxsortgpuLo,s:v=>pxsortgpuLo=v},{v:'pxsortgpuHi',g:()=>pxsortgpuHi,s:v=>pxsortgpuHi=v},{v:'pxsortgpuDir',g:()=>pxsortgpuDir,s:v=>pxsortgpuDir=v}],
    pixel: [{v:'pixelSize',g:()=>pixelSize,s:v=>pixelSize=v},{v:'pixelMode',g:()=>pixelMode,s:v=>pixelMode=v}],
    ascii: [{v:'asciiCellSize',g:()=>asciiCellSize,s:v=>asciiCellSize=v},{v:'asciiColorMode',g:()=>asciiColorMode,s:v=>asciiColorMode=v},{v:'asciiCharSet',g:()=>asciiCharSet,s:v=>asciiCharSet=v},{v:'asciiInvert',g:()=>asciiInvert,s:v=>asciiInvert=v}],
    glitch: [{v:'glitchIntensity',g:()=>glitchIntensity,s:v=>glitchIntensity=v},{v:'glitchFreq',g:()=>glitchFreq,s:v=>glitchFreq=v},{v:'glitchMode',g:()=>glitchMode,s:v=>glitchMode=v},{v:'glitchChannelShift',g:()=>glitchChannelShift,s:v=>glitchChannelShift=v},{v:'glitchBlockSize',g:()=>glitchBlockSize,s:v=>glitchBlockSize=v},{v:'glitchSeed',g:()=>glitchSeed,s:v=>glitchSeed=v},{v:'glitchSpeed',g:()=>glitchSpeed,s:v=>glitchSpeed=v}],
    noise: [{v:'noiseIntensity',g:()=>noiseIntensity,s:v=>noiseIntensity=v},{v:'noiseScale',g:()=>noiseScale,s:v=>noiseScale=v},{v:'noiseColorMode',g:()=>noiseColorMode,s:v=>noiseColorMode=v},{v:'noiseAlgo',g:()=>noiseAlgo,s:v=>noiseAlgo=v}],
    grain: [{v:'grainIntensity',g:()=>grainIntensity,s:v=>grainIntensity=v},{v:'grainSize',g:()=>grainSize,s:v=>grainSize=v},{v:'grainColorMode',g:()=>grainColorMode,s:v=>grainColorMode=v}],
    dots: [{v:'dotsAngle',g:()=>dotsAngle,s:v=>dotsAngle=v},{v:'dotsScale',g:()=>dotsScale,s:v=>dotsScale=v},{v:'dotsOpacity',g:()=>dotsOpacity,s:v=>dotsOpacity=v}],
    grid: [{v:'gridScale',g:()=>gridScale,s:v=>gridScale=v},{v:'gridWidth',g:()=>gridWidth,s:v=>gridWidth=v},{v:'gridOpacity',g:()=>gridOpacity,s:v=>gridOpacity=v}],
    scanlines: [{v:'scanIntensity',g:()=>scanIntensity,s:v=>scanIntensity=v},{v:'scanCount',g:()=>scanCount,s:v=>scanCount=v},{v:'scanVertical',g:()=>scanVertical,s:v=>scanVertical=v}],
    vignette: [{v:'vigIntensity',g:()=>vigIntensity,s:v=>vigIntensity=v},{v:'vigRadius',g:()=>vigRadius,s:v=>vigRadius=v},{v:'vigColor',g:()=>vigColor,s:v=>vigColor=v}],
    // New effects
    thermal: [{v:'thermalIntensity',g:()=>thermalIntensity,s:v=>thermalIntensity=v},{v:'thermalPalette',g:()=>thermalPalette,s:v=>thermalPalette=v}],
    gradmap: [{v:'gradColor1',g:()=>gradColor1,s:v=>gradColor1=v},{v:'gradColor2',g:()=>gradColor2,s:v=>gradColor2=v},{v:'gradColor3',g:()=>gradColor3,s:v=>gradColor3=v},{v:'gradMidpoint',g:()=>gradMidpoint,s:v=>gradMidpoint=v},{v:'gradIntensity',g:()=>gradIntensity,s:v=>gradIntensity=v}],
    duotone: [{v:'duoShadow',g:()=>duoShadow,s:v=>duoShadow=v},{v:'duoHighlight',g:()=>duoHighlight,s:v=>duoHighlight=v},{v:'duoIntensity',g:()=>duoIntensity,s:v=>duoIntensity=v}],
    rgbshift: [{v:'rgbShiftRX',g:()=>rgbShiftRX,s:v=>rgbShiftRX=v},{v:'rgbShiftRY',g:()=>rgbShiftRY,s:v=>rgbShiftRY=v},{v:'rgbShiftBX',g:()=>rgbShiftBX,s:v=>rgbShiftBX=v},{v:'rgbShiftBY',g:()=>rgbShiftBY,s:v=>rgbShiftBY=v},{v:'rgbShiftIntensity',g:()=>rgbShiftIntensity,s:v=>rgbShiftIntensity=v}],
    emboss: [{v:'embossAngle',g:()=>embossAngle,s:v=>embossAngle=v},{v:'embossStrength',g:()=>embossStrength,s:v=>embossStrength=v},{v:'embossColor',g:()=>embossColor,s:v=>embossColor=v}],
    led: [{v:'ledCellSize',g:()=>ledCellSize,s:v=>ledCellSize=v},{v:'ledGap',g:()=>ledGap,s:v=>ledGap=v},{v:'ledGlow',g:()=>ledGlow,s:v=>ledGlow=v},{v:'ledBrightness',g:()=>ledBrightness,s:v=>ledBrightness=v},{v:'ledShape',g:()=>ledShape,s:v=>ledShape=v}],
    crt: [{v:'crtScanWeight',g:()=>crtScanWeight,s:v=>crtScanWeight=v},{v:'crtCurvature',g:()=>crtCurvature,s:v=>crtCurvature=v},{v:'crtGlow',g:()=>crtGlow,s:v=>crtGlow=v},{v:'crtChroma',g:()=>crtChroma,s:v=>crtChroma=v},{v:'crtStatic',g:()=>crtStatic,s:v=>crtStatic=v},{v:'crtPhosphor',g:()=>crtPhosphor,s:v=>crtPhosphor=v}],
    // New effects v2
    threshold: [{v:'thresholdLevel',g:()=>thresholdLevel,s:v=>thresholdLevel=v},{v:'thresholdInvert',g:()=>thresholdInvert,s:v=>thresholdInvert=v}],
    exposure: [{v:'exposureEV',g:()=>exposureEV,s:v=>exposureEV=v}],
    colortemp: [{v:'colortempValue',g:()=>colortempValue,s:v=>colortempValue=v}],
    rgbgain: [{v:'rgbGainR',g:()=>rgbGainR,s:v=>rgbGainR=v},{v:'rgbGainG',g:()=>rgbGainG,s:v=>rgbGainG=v},{v:'rgbGainB',g:()=>rgbGainB,s:v=>rgbGainB=v},{v:'rgbGainGamma',g:()=>rgbGainGamma,s:v=>rgbGainGamma=v}],
    levels: [{v:'levelsInBlack',g:()=>levelsInBlack,s:v=>levelsInBlack=v},{v:'levelsInWhite',g:()=>levelsInWhite,s:v=>levelsInWhite=v},{v:'levelsGamma',g:()=>levelsGamma,s:v=>levelsGamma=v},{v:'levelsOutBlack',g:()=>levelsOutBlack,s:v=>levelsOutBlack=v},{v:'levelsOutWhite',g:()=>levelsOutWhite,s:v=>levelsOutWhite=v}],
    colorbal: [{v:'colorbalShadowR',g:()=>colorbalShadowR,s:v=>colorbalShadowR=v},{v:'colorbalShadowG',g:()=>colorbalShadowG,s:v=>colorbalShadowG=v},{v:'colorbalShadowB',g:()=>colorbalShadowB,s:v=>colorbalShadowB=v},{v:'colorbalMidR',g:()=>colorbalMidR,s:v=>colorbalMidR=v},{v:'colorbalMidG',g:()=>colorbalMidG,s:v=>colorbalMidG=v},{v:'colorbalMidB',g:()=>colorbalMidB,s:v=>colorbalMidB=v},{v:'colorbalHiR',g:()=>colorbalHiR,s:v=>colorbalHiR=v},{v:'colorbalHiG',g:()=>colorbalHiG,s:v=>colorbalHiG=v},{v:'colorbalHiB',g:()=>colorbalHiB,s:v=>colorbalHiB=v}],
    colmatrix: [{v:'colmatrixPreset',g:()=>colmatrixPreset,s:v=>colmatrixPreset=v},{v:'colmatrixIntensity',g:()=>colmatrixIntensity,s:v=>colmatrixIntensity=v}],
    blursharp: [{v:'blursharpAmount',g:()=>blursharpAmount,s:v=>blursharpAmount=v}],
    modulate: [{v:'modulateFreq',g:()=>modulateFreq,s:v=>modulateFreq=v},{v:'modulateAmp',g:()=>modulateAmp,s:v=>modulateAmp=v},{v:'modulateSpeed',g:()=>modulateSpeed,s:v=>modulateSpeed=v},{v:'modulateDir',g:()=>modulateDir,s:v=>modulateDir=v}],
    ripple: [{v:'rippleFreq',g:()=>rippleFreq,s:v=>rippleFreq=v},{v:'rippleAmp',g:()=>rippleAmp,s:v=>rippleAmp=v},{v:'rippleSpeed',g:()=>rippleSpeed,s:v=>rippleSpeed=v},{v:'rippleDamping',g:()=>rippleDamping,s:v=>rippleDamping=v}],
    swirl: [{v:'swirlAngle',g:()=>swirlAngle,s:v=>swirlAngle=v},{v:'swirlRadius',g:()=>swirlRadius,s:v=>swirlRadius=v}],
    reedglass: [{v:'reedWidth',g:()=>reedWidth,s:v=>reedWidth=v},{v:'reedDistortion',g:()=>reedDistortion,s:v=>reedDistortion=v},{v:'reedChromatic',g:()=>reedChromatic,s:v=>reedChromatic=v}],
    polar2rect: [{v:'polar2rectRotation',g:()=>polar2rectRotation,s:v=>polar2rectRotation=v}],
    rect2polar: [{v:'rect2polarRotation',g:()=>rect2polarRotation,s:v=>rect2polarRotation=v}],
    radblur: [{v:'radblurIntensity',g:()=>radblurIntensity,s:v=>radblurIntensity=v}],
    zoomblur: [{v:'zoomblurIntensity',g:()=>zoomblurIntensity,s:v=>zoomblurIntensity=v}],
    circblur: [{v:'circblurIntensity',g:()=>circblurIntensity,s:v=>circblurIntensity=v}],
    elgrid: [{v:'elgridSize',g:()=>elgridSize,s:v=>elgridSize=v},{v:'elgridWarp',g:()=>elgridWarp,s:v=>elgridWarp=v},{v:'elgridSpeed',g:()=>elgridSpeed,s:v=>elgridSpeed=v},{v:'elgridAnimated',g:()=>elgridAnimated,s:v=>elgridAnimated=v}],
    printstamp: [{v:'printstampDotSize',g:()=>printstampDotSize,s:v=>printstampDotSize=v},{v:'printstampContrast',g:()=>printstampContrast,s:v=>printstampContrast=v},{v:'printstampGrain',g:()=>printstampGrain,s:v=>printstampGrain=v}],
    y2kblue: [{v:'y2kBlueShift',g:()=>y2kBlueShift,s:v=>y2kBlueShift=v},{v:'y2kGlow',g:()=>y2kGlow,s:v=>y2kGlow=v},{v:'y2kGrain',g:()=>y2kGrain,s:v=>y2kGrain=v}],
    ntsc: [{v:'ntscChromaBleed',g:()=>ntscChromaBleed,s:v=>ntscChromaBleed=v},{v:'ntscInstability',g:()=>ntscInstability,s:v=>ntscInstability=v},{v:'ntscNoise',g:()=>ntscNoise,s:v=>ntscNoise=v},{v:'ntscRolling',g:()=>ntscRolling,s:v=>ntscRolling=v}],
    stripe: [{v:'stripeDensity',g:()=>stripeDensity,s:v=>stripeDensity=v},{v:'stripeAngle',g:()=>stripeAngle,s:v=>stripeAngle=v},{v:'stripeThickness',g:()=>stripeThickness,s:v=>stripeThickness=v},{v:'stripeOpacity',g:()=>stripeOpacity,s:v=>stripeOpacity=v},{v:'stripeMode',g:()=>stripeMode,s:v=>stripeMode=v}],
    paperscan: [{v:'paperscanIntensity',g:()=>paperscanIntensity,s:v=>paperscanIntensity=v},{v:'paperscanFiber',g:()=>paperscanFiber,s:v=>paperscanFiber=v},{v:'paperscanWarmth',g:()=>paperscanWarmth,s:v=>paperscanWarmth=v}],
    xerox: [{v:'xeroxContrast',g:()=>xeroxContrast,s:v=>xeroxContrast=v},{v:'xeroxNoise',g:()=>xeroxNoise,s:v=>xeroxNoise=v},{v:'xeroxDarkness',g:()=>xeroxDarkness,s:v=>xeroxDarkness=v}],
    grunge: [{v:'grungeTint',g:()=>grungeTint,s:v=>grungeTint=v},{v:'grungePosterize',g:()=>grungePosterize,s:v=>grungePosterize=v},{v:'grungeGrain',g:()=>grungeGrain,s:v=>grungeGrain=v}],
    sift: [{v:'siftLayers',g:()=>siftLayers,s:v=>siftLayers=v},{v:'siftOffsetX',g:()=>siftOffsetX,s:v=>siftOffsetX=v},{v:'siftOffsetY',g:()=>siftOffsetY,s:v=>siftOffsetY=v},{v:'siftIntensity',g:()=>siftIntensity,s:v=>siftIntensity=v}],
    smartpixel: [{v:'smartpxThreshold',g:()=>smartpxThreshold,s:v=>smartpxThreshold=v},{v:'smartpxSize',g:()=>smartpxSize,s:v=>smartpxSize=v}],
    slidestretch: [{v:'slideDividers',g:()=>slideDividers,s:v=>slideDividers=v},{v:'slideStretch',g:()=>slideStretch,s:v=>slideStretch=v},{v:'slideAngle',g:()=>slideAngle,s:v=>slideAngle=v}],
    cornerpin: [{v:'cornerpinPreset',g:()=>cornerpinPreset,s:v=>cornerpinPreset=v},{v:'cornerpinIntensity',g:()=>cornerpinIntensity,s:v=>cornerpinIntensity=v}],
    automata: [{v:'automataRule',g:()=>automataRule,s:v=>automataRule=v},{v:'automataSpeed',g:()=>automataSpeed,s:v=>automataSpeed=v},{v:'automataThreshold',g:()=>automataThreshold,s:v=>automataThreshold=v}],
    pixelflow: [{v:'flowAngle',g:()=>flowAngle,s:v=>flowAngle=v},{v:'flowSpeed',g:()=>flowSpeed,s:v=>flowSpeed=v},{v:'flowDecay',g:()=>flowDecay,s:v=>flowDecay=v}],
    kaleid: [{v:'kaleidSegments',g:()=>kaleidSegments,s:v=>kaleidSegments=v},{v:'kaleidRotation',g:()=>kaleidRotation,s:v=>kaleidRotation=v}],
    feedback: [{v:'feedbackDecay',g:()=>feedbackDecay,s:v=>feedbackDecay=v},{v:'feedbackZoom',g:()=>feedbackZoom,s:v=>feedbackZoom=v},{v:'feedbackRotation',g:()=>feedbackRotation,s:v=>feedbackRotation=v},{v:'feedbackHueShift',g:()=>feedbackHueShift,s:v=>feedbackHueShift=v}],
    timewarp: [{v:'timewarpSpeed',g:()=>timewarpSpeed,s:v=>timewarpSpeed=v},{v:'timewarpDir',g:()=>timewarpDir,s:v=>timewarpDir=v}],
    flowfield: [{v:'flowfieldScale',g:()=>flowfieldScale,s:v=>flowfieldScale=v},{v:'flowfieldStrength',g:()=>flowfieldStrength,s:v=>flowfieldStrength=v},{v:'flowfieldSpeed',g:()=>flowfieldSpeed,s:v=>flowfieldSpeed=v}],
    freeze: [{v:'freezeRate',g:()=>freezeRate,s:v=>freezeRate=v}]
};
const EFFECT_FN_MAP = {
    sepia:()=>applySepia(), tint:()=>applyTint(), palette:()=>applyPalette(), bricon:()=>applyBriCon(),
    thermal:()=>applyThermal(), gradmap:()=>applyGradientMap(), duotone:()=>applyDuotone(),
    chroma:()=>applyChromatic(), rgbshift:()=>applyRGBShift(), curve:()=>applyCurve(), wave:()=>applyWave(), jitter:()=>applyJitter(), mblur:()=>applyMblur(), emboss:()=>applyEmboss(),
    bloom:()=>applyBloom(), dither:()=>applyDithering(), atkinson:()=>applyAtkinson(), halftone:()=>applyHalftone(), pxsort:()=>applyPixelSort(), pixel:()=>applyPixelate(), led:()=>applyLED(),
    ascii:()=>applyASCII(), glitch:()=>applyGlitch(), noise:()=>applyNoise(), grain:()=>applyGrain(), dots:()=>applyDots(), grid:()=>applyGrid(), scanlines:()=>applyScanlines(), vignette:()=>applyVignette(), crt:()=>applyCRT(),
    threshold:()=>applyThreshold(), exposure:()=>applyExposure(), colortemp:()=>applyColorTemp(),
    rgbgain:()=>applyRGBGain(), levels:()=>applyLevels(), colorbal:()=>applyColorBalance(), colmatrix:()=>applyColorMatrix(),
    blursharp:()=>applyBlurSharp(), modulate:()=>applyModulate(), ripple:()=>applyRipple(), swirl:()=>applySwirl(),
    reedglass:()=>applyReedGlass(), polar2rect:()=>applyPolar2Rect(), rect2polar:()=>applyRect2Polar(),
    radblur:()=>applyRadialBlur(), zoomblur:()=>applyZoomBlur(), circblur:()=>applyCircBlur(), elgrid:()=>applyElasticGrid(),
    printstamp:()=>applyPrintStamp(), y2kblue:()=>applyY2KBlue(),
    ntsc:()=>applyNTSC(), stripe:()=>applyStripe(), paperscan:()=>applyPaperScan(), xerox:()=>applyXerox(), grunge:()=>applyGrunge(),
    datamosh:()=>{}, pxsortgpu:()=>{}, kaleid:()=>{}, feedback:()=>{}, timewarp:()=>{}, flowfield:()=>{}, freeze:()=>{},
    sift:()=>applySift(), smartpixel:()=>applySmartPixel(), slidestretch:()=>applySlideStretch(),
    cornerpin:()=>applyCornerPin(), automata:()=>applyCellularAutomata(), pixelflow:()=>applyPixelFlow()
};

// ── SHARED PALETTES (used by Palette, Dither, Gradient effects) ──
const PALETTES = {
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
    ocean: [[10,26,26],[26,58,58],[42,106,90],[74,154,122],[138,218,170]],
    grayscale: [[0,0,0],[64,64,64],[128,128,128],[192,192,192],[255,255,255]],
    bw: [[0,0,0],[255,255,255]]
};

const DUO_PRESETS = {
    midnight: ['#0a0a2e','#4fc3f7'],
    sunset: ['#2d1b69','#ff6b35'],
    forest: ['#1a3a1a','#7ecf7e'],
    ocean: ['#0a2647','#17c3b2'],
    neon: ['#0d0221','#ff2e63'],
    vintage: ['#3e2723','#d4a574']
};

// ── FX DEFAULTS (for reset functionality) ──
const FX_DEFAULTS = {
    sepia: {sepiaIntensity:70,sepiaWarmth:0},
    tint: {tintPreset:'green',tintIntensity:70,tintCustomColor:'#00ff00'},
    palette: {palettePreset:'noir',paletteIntensity:80},
    bricon: {briValue:0,conValue:100,satValue:100},
    chroma: {chromaOffset:5,chromaMode:'linear'},
    curve: {curveIntensity:30,curveDirection:'barrel',curveFringe:0},
    wave: {waveAmp:20,waveFreq:5,waveSpeed:2,waveMode:'horizontal'},
    jitter: {jitterIntensity:20,jitterBlockSize:2,jitterMode:'random'},
    mblur: {mblurIntensity:30,mblurAngle:0},
    bloom: {bloomIntensity:40,bloomRadius:50,bloomThreshold:50,bloomSpread:50,bloomBlendMode:'additive',bloomExposure:100,bloomAnamorphic:false},
    dither: {ditherColorMode:'bw',ditherAlgorithm:'bayer4',ditherPalette:'bw',ditherColorCount:2,ditherPixelation:1,ditherStrength:100},
    atkinson: {atkinsonColorMode:'bw',atkinsonThreshold:128,atkinsonSpread:100,atkinsonStrength:100},
    halftone: {halfSpacing:6,halfColorMode:'bw',halfAngle:0,halfContrast:50,halfSpread:0,halfShape:'circle',halfInkColor:'#000000',halfPaperColor:'#ffffff',halfInverted:false},
    pxsort: {pxsortLo:30,pxsortHi:220,pxsortDir:'horizontal'},
    pixel: {pixelSize:8,pixelMode:'square'},
    ascii: {asciiCellSize:10,asciiColorMode:'mono',asciiCharSet:'classic',asciiInvert:false},
    glitch: {glitchIntensity:30,glitchFreq:20,glitchMode:'shift',glitchChannelShift:50,glitchBlockSize:50,glitchSeed:0,glitchSpeed:50},
    noise: {noiseIntensity:35,noiseScale:3,noiseColorMode:'mono',noiseAlgo:'random'},
    grain: {grainIntensity:50,grainSize:15,grainColorMode:'mono'},
    dots: {dotsAngle:45,dotsScale:10,dotsOpacity:100},
    grid: {gridScale:20,gridWidth:2,gridOpacity:50},
    scanlines: {scanIntensity:50,scanCount:300,scanVertical:false},
    vignette: {vigIntensity:50,vigRadius:70,vigColor:'#000000'},
    thermal: {thermalIntensity:80,thermalPalette:'default'},
    gradmap: {gradColor1:'#000033',gradColor2:'#ff6600',gradColor3:'#888888',gradMidpoint:50,gradIntensity:80},
    duotone: {duoShadow:'#1a1a2e',duoHighlight:'#e94560',duoIntensity:80},
    rgbshift: {rgbShiftRX:5,rgbShiftRY:0,rgbShiftBX:-5,rgbShiftBY:0,rgbShiftIntensity:70},
    emboss: {embossAngle:135,embossStrength:50,embossColor:false},
    led: {ledCellSize:8,ledGap:2,ledGlow:30,ledBrightness:100,ledShape:'square'},
    crt: {crtScanWeight:2,crtCurvature:30,crtGlow:50,crtChroma:3,crtStatic:20,crtPhosphor:'none'},
    threshold: {thresholdLevel:128,thresholdInvert:false},
    exposure: {exposureEV:0},
    colortemp: {colortempValue:0},
    rgbgain: {rgbGainR:100,rgbGainG:100,rgbGainB:100,rgbGainGamma:1.0},
    levels: {levelsInBlack:0,levelsInWhite:255,levelsGamma:1.0,levelsOutBlack:0,levelsOutWhite:255},
    colorbal: {colorbalShadowR:0,colorbalShadowG:0,colorbalShadowB:0,colorbalMidR:0,colorbalMidG:0,colorbalMidB:0,colorbalHiR:0,colorbalHiG:0,colorbalHiB:0},
    colmatrix: {colmatrixPreset:'none',colmatrixIntensity:80},
    blursharp: {blursharpAmount:0},
    modulate: {modulateFreq:10,modulateAmp:20,modulateSpeed:1,modulateDir:'horizontal'},
    ripple: {rippleFreq:5,rippleAmp:15,rippleSpeed:2,rippleDamping:0},
    swirl: {swirlAngle:90,swirlRadius:70},
    reedglass: {reedWidth:10,reedDistortion:20,reedChromatic:false},
    polar2rect: {polar2rectRotation:0},
    rect2polar: {rect2polarRotation:0},
    radblur: {radblurIntensity:30},
    zoomblur: {zoomblurIntensity:30},
    circblur: {circblurIntensity:30},
    elgrid: {elgridSize:12,elgridWarp:30,elgridSpeed:1,elgridAnimated:true},
    printstamp: {printstampDotSize:6,printstampContrast:60,printstampGrain:40},
    y2kblue: {y2kBlueShift:70,y2kGlow:40,y2kGrain:30},
    ntsc: {ntscChromaBleed:50,ntscInstability:30,ntscNoise:20,ntscRolling:false},
    stripe: {stripeDensity:10,stripeAngle:0,stripeThickness:2,stripeOpacity:50,stripeMode:'linear'},
    paperscan: {paperscanIntensity:40,paperscanFiber:3,paperscanWarmth:30},
    xerox: {xeroxContrast:60,xeroxNoise:40,xeroxDarkness:50},
    grunge: {grungeTint:'#cc6677',grungePosterize:3,grungeGrain:50},
    datamosh: {datamoshDecay:20,datamoshThreshold:40,datamoshIntensity:75,datamoshMode:'melt'},
    pxsortgpu: {pxsortgpuLo:30,pxsortgpuHi:220,pxsortgpuDir:'horizontal'},
    sift: {siftLayers:8,siftOffsetX:4,siftOffsetY:2,siftIntensity:50},
    smartpixel: {smartpxThreshold:15,smartpxSize:8},
    slidestretch: {slideDividers:3,slideStretch:40,slideAngle:0},
    cornerpin: {cornerpinPreset:'perspective',cornerpinIntensity:50},
    automata: {automataRule:'decay',automataSpeed:5,automataThreshold:128},
    pixelflow: {flowAngle:0,flowSpeed:3,flowDecay:70},
    kaleid: {kaleidSegments:6,kaleidRotation:0},
    feedback: {feedbackDecay:85,feedbackZoom:8,feedbackRotation:2,feedbackHueShift:15},
    timewarp: {timewarpSpeed:50,timewarpDir:'horizontal'},
    flowfield: {flowfieldScale:4,flowfieldStrength:30,flowfieldSpeed:1},
    freeze: {freezeRate:15}
};

// ── FX_PRESETS — Built-in preset definitions (inspired by effect.app) ──
// Each preset: name, category, description, effects (which effects + parameter values)
const FX_PRESET_CATEGORIES = ['all','film','retro','digital','creative','glitch'];
const FX_PRESET_CAT_LABELS = {all:'All',film:'Film',retro:'Retro',digital:'Digital',creative:'Creative',glitch:'Glitch'};
const FX_PRESET_CAT_COLORS = {all:'#A899C2',film:'#6C5CE7',retro:'#E17055',digital:'#00B894',creative:'#FDCB6E',glitch:'#FD79A8'};
const FX_PRESETS = {
    // ── FILM ──
    noir: {
        name:'Noir', category:'film',
        desc:'Crushed blacks, blown highlights',
        effects:{
            duotone:{duoShadow:'#000000',duoHighlight:'#d0d0d0',duoIntensity:100},
            levels:{levelsInBlack:50,levelsInWhite:195,levelsGamma:0.65,levelsOutBlack:0,levelsOutWhite:240},
            vignette:{vigIntensity:80,vigRadius:35,vigColor:'#000000'},
            grain:{grainIntensity:40,grainSize:12,grainColorMode:'mono'}
        }
    },
    cyanotype: {
        name:'Cyanotype', category:'film',
        desc:'Deep blue sun-print',
        effects:{
            duotone:{duoShadow:'#000820',duoHighlight:'#5588cc',duoIntensity:100},
            levels:{levelsInBlack:20,levelsInWhite:220,levelsGamma:0.75,levelsOutBlack:5,levelsOutWhite:245},
            grain:{grainIntensity:45,grainSize:16,grainColorMode:'mono'},
            vignette:{vigIntensity:65,vigRadius:40,vigColor:'#000011'}
        }
    },
    kodachrome: {
        name:'Kodachrome', category:'film',
        desc:'Saturated warm film stock',
        effects:{
            bricon:{briValue:0,conValue:130,satValue:145},
            colortemp:{colortempValue:25},
            levels:{levelsInBlack:10,levelsInWhite:245,levelsGamma:0.9,levelsOutBlack:5,levelsOutWhite:250},
            grain:{grainIntensity:25,grainSize:10,grainColorMode:'color'},
            vignette:{vigIntensity:45,vigRadius:55,vigColor:'#0a0500'}
        }
    },
    bleach_bypass: {
        name:'Bleach Bypass', category:'film',
        desc:'Silver-retained high-contrast punch',
        effects:{
            bricon:{briValue:-5,conValue:185,satValue:20},
            levels:{levelsInBlack:40,levelsInWhite:200,levelsGamma:0.7,levelsOutBlack:0,levelsOutWhite:250},
            bloom:{bloomIntensity:20,bloomRadius:35,bloomThreshold:50,bloomSpread:40,bloomBlendMode:'screen',bloomExposure:95,bloomAnamorphic:false},
            grain:{grainIntensity:50,grainSize:10,grainColorMode:'mono'},
            colorbal:{colorbalShadowR:0,colorbalShadowG:0,colorbalShadowB:5,colorbalMidR:0,colorbalMidG:0,colorbalMidB:0,colorbalHiR:5,colorbalHiG:0,colorbalHiB:-5},
            vignette:{vigIntensity:65,vigRadius:42,vigColor:'#000000'}
        }
    },
    polaroid: {
        name:'Polaroid', category:'film',
        desc:'Sun-bleached instant camera',
        effects:{
            colortemp:{colortempValue:40},
            levels:{levelsInBlack:0,levelsInWhite:225,levelsGamma:1.25,levelsOutBlack:20,levelsOutWhite:235},
            bricon:{briValue:10,conValue:80,satValue:65},
            bloom:{bloomIntensity:35,bloomRadius:50,bloomThreshold:35,bloomSpread:60,bloomBlendMode:'screen',bloomExposure:110,bloomAnamorphic:false},
            grain:{grainIntensity:40,grainSize:12,grainColorMode:'color'},
            colorbal:{colorbalShadowR:5,colorbalShadowG:10,colorbalShadowB:-10,colorbalMidR:10,colorbalMidG:5,colorbalMidB:-5,colorbalHiR:20,colorbalHiG:10,colorbalHiB:-15},
            vignette:{vigIntensity:70,vigRadius:40,vigColor:'#1a0800'}
        }
    },
    cinema_teal: {
        name:'Cinema Teal', category:'film',
        desc:'Orange & teal blockbuster grade',
        effects:{
            colorbal:{colorbalShadowR:-20,colorbalShadowG:15,colorbalShadowB:40,colorbalMidR:5,colorbalMidG:0,colorbalMidB:0,colorbalHiR:30,colorbalHiG:10,colorbalHiB:-15},
            bricon:{briValue:0,conValue:120,satValue:115},
            levels:{levelsInBlack:15,levelsInWhite:240,levelsGamma:0.9,levelsOutBlack:0,levelsOutWhite:250},
            vignette:{vigIntensity:50,vigRadius:55,vigColor:'#000505'}
        }
    },
    super8: {
        name:'Super 8', category:'film',
        desc:'Grainy 8mm home movie',
        effects:{
            sepia:{sepiaIntensity:35,sepiaWarmth:25},
            grain:{grainIntensity:65,grainSize:22,grainColorMode:'mono'},
            bloom:{bloomIntensity:30,bloomRadius:45,bloomThreshold:40,bloomSpread:55,bloomBlendMode:'additive',bloomExposure:105,bloomAnamorphic:false},
            levels:{levelsInBlack:10,levelsInWhite:225,levelsGamma:1.1,levelsOutBlack:10,levelsOutWhite:245},
            vignette:{vigIntensity:70,vigRadius:40,vigColor:'#0a0500'},
            scanlines:{scanIntensity:12,scanCount:200,scanVertical:false}
        }
    },

    // ── RETRO ──
    vhs: {
        name:'VHS', category:'retro',
        desc:'Trashed VHS tape playback',
        effects:{
            ntsc:{ntscChromaBleed:75,ntscInstability:55,ntscNoise:45,ntscRolling:true},
            rgbshift:{rgbShiftRX:6,rgbShiftRY:2,rgbShiftBX:-5,rgbShiftBY:-1,rgbShiftIntensity:85},
            bloom:{bloomIntensity:35,bloomRadius:50,bloomThreshold:40,bloomSpread:60,bloomBlendMode:'additive',bloomExposure:105,bloomAnamorphic:false},
            noise:{noiseIntensity:25,noiseScale:2,noiseColorMode:'color',noiseAlgo:'random'},
            scanlines:{scanIntensity:20,scanCount:300,scanVertical:false}
        }
    },
    crt_retro: {
        name:'CRT Monitor', category:'retro',
        desc:'Curved phosphor screen',
        effects:{
            crt:{crtScanWeight:4,crtCurvature:40,crtGlow:75,crtChroma:5,crtStatic:20,crtPhosphor:'shadow'},
            bloom:{bloomIntensity:30,bloomRadius:40,bloomThreshold:35,bloomSpread:50,bloomBlendMode:'additive',bloomExposure:100,bloomAnamorphic:false},
            vignette:{vigIntensity:60,vigRadius:45,vigColor:'#000000'}
        }
    },
    y2k_blue: {
        name:'Y2K Blue', category:'retro',
        desc:'Oversaturated early-2000s web',
        effects:{
            y2kblue:{y2kBlueShift:95,y2kGlow:70,y2kGrain:30},
            bloom:{bloomIntensity:40,bloomRadius:55,bloomThreshold:30,bloomSpread:65,bloomBlendMode:'additive',bloomExposure:110,bloomAnamorphic:false}
        }
    },
    gameboy: {
        name:'Game Boy', category:'retro',
        desc:'4-color green LCD screen',
        effects:{
            palette:{palettePreset:'gameboy',paletteIntensity:100},
            dither:{ditherColorMode:'bw',ditherAlgorithm:'bayer4',ditherPalette:'gameboy',ditherColorCount:4,ditherPixelation:4,ditherStrength:85},
            scanlines:{scanIntensity:35,scanCount:200,scanVertical:false},
            vignette:{vigIntensity:40,vigRadius:55,vigColor:'#001a00'},
            bricon:{briValue:5,conValue:130,satValue:100}
        }
    },
    synthwave: {
        name:'Synthwave', category:'retro',
        desc:'Neon pink/purple 80s grid',
        effects:{
            gradmap:{gradColor1:'#0a001a',gradColor2:'#ff44cc',gradColor3:'#6600aa',gradMidpoint:45,gradIntensity:75},
            bloom:{bloomIntensity:65,bloomRadius:70,bloomThreshold:25,bloomSpread:85,bloomBlendMode:'additive',bloomExposure:115,bloomAnamorphic:true},
            scanlines:{scanIntensity:18,scanCount:250,scanVertical:false},
            vignette:{vigIntensity:55,vigRadius:45,vigColor:'#0a001a'}
        }
    },

    // ── DIGITAL ──
    led_matrix: {
        name:'LED Wall', category:'digital',
        desc:'Giant LED display grid',
        effects:{
            led:{ledCellSize:7,ledGap:3,ledGlow:65,ledBrightness:120,ledShape:'circle'},
            bloom:{bloomIntensity:45,bloomRadius:50,bloomThreshold:30,bloomSpread:70,bloomBlendMode:'additive',bloomExposure:110,bloomAnamorphic:false}
        }
    },
    msx_ascii: {
        name:'Terminal', category:'digital',
        desc:'Green phosphor console',
        effects:{
            ascii:{asciiCellSize:6,asciiColorMode:'green',asciiCharSet:'classic',asciiInvert:false},
            scanlines:{scanIntensity:25,scanCount:350,scanVertical:false},
            bloom:{bloomIntensity:40,bloomRadius:45,bloomThreshold:30,bloomSpread:60,bloomBlendMode:'additive',bloomExposure:105,bloomAnamorphic:false},
            noise:{noiseIntensity:15,noiseScale:1,noiseColorMode:'mono',noiseAlgo:'random'},
            vignette:{vigIntensity:55,vigRadius:45,vigColor:'#000500'}
        }
    },
    halftone_print: {
        name:'Halftone', category:'digital',
        desc:'CMYK newspaper print',
        effects:{
            halftone:{halfSpacing:5,halfColorMode:'color',halfAngle:22,halfContrast:80,halfSpread:5,halfShape:'circle',halfInkColor:'#000000',halfPaperColor:'#f5f0e8',halfInverted:false},
            levels:{levelsInBlack:10,levelsInWhite:240,levelsGamma:0.9,levelsOutBlack:0,levelsOutWhite:255}
        }
    },
    pixel_art: {
        name:'Pixel Art', category:'digital',
        desc:'Retro game sprite look',
        effects:{
            pixel:{pixelSize:6,pixelMode:'square'},
            dither:{ditherColorMode:'color',ditherAlgorithm:'bayer4',ditherPalette:'synthwave',ditherColorCount:12,ditherPixelation:3,ditherStrength:60},
            bricon:{briValue:5,conValue:140,satValue:150},
            levels:{levelsInBlack:15,levelsInWhite:240,levelsGamma:0.95,levelsOutBlack:0,levelsOutWhite:255},
            scanlines:{scanIntensity:12,scanCount:250,scanVertical:false}
        }
    },
    dither_1bit: {
        name:'1-Bit Dither', category:'digital',
        desc:'High-contrast graphic poster',
        effects:{
            dither:{ditherColorMode:'bw',ditherAlgorithm:'bayer8',ditherPalette:'bw',ditherColorCount:2,ditherPixelation:2,ditherStrength:100},
            levels:{levelsInBlack:30,levelsInWhite:220,levelsGamma:0.75,levelsOutBlack:0,levelsOutWhite:255},
            bricon:{briValue:5,conValue:150,satValue:100},
            vignette:{vigIntensity:55,vigRadius:45,vigColor:'#000000'},
            scanlines:{scanIntensity:15,scanCount:400,scanVertical:false}
        }
    },
    rgb_hatch: {
        name:'RGB Hatch', category:'digital',
        desc:'Crosshatched color separation',
        effects:{
            rgbshift:{rgbShiftRX:5,rgbShiftRY:0,rgbShiftBX:-5,rgbShiftBY:0,rgbShiftIntensity:75},
            halftone:{halfSpacing:4,halfColorMode:'color',halfAngle:45,halfContrast:85,halfSpread:8,halfShape:'line',halfInkColor:'#000000',halfPaperColor:'#ffffff',halfInverted:false}
        }
    },

    // ── CREATIVE ──
    thermal_cam: {
        name:'Thermal Cam', category:'creative',
        desc:'Infrared heat vision',
        effects:{
            thermal:{thermalIntensity:100,thermalPalette:'iron'},
            bloom:{bloomIntensity:25,bloomRadius:35,bloomThreshold:45,bloomSpread:50,bloomBlendMode:'additive',bloomExposure:100,bloomAnamorphic:false},
            vignette:{vigIntensity:40,vigRadius:55,vigColor:'#000000'}
        }
    },
    night_vision: {
        name:'Night Vision', category:'creative',
        desc:'Military green phosphor',
        effects:{
            thermal:{thermalIntensity:95,thermalPalette:'night'},
            noise:{noiseIntensity:40,noiseScale:1,noiseColorMode:'mono',noiseAlgo:'random'},
            scanlines:{scanIntensity:30,scanCount:450,scanVertical:false},
            vignette:{vigIntensity:75,vigRadius:35,vigColor:'#000000'},
            grain:{grainIntensity:35,grainSize:8,grainColorMode:'mono'}
        }
    },
    neon_glow: {
        name:'Neon Glow', category:'creative',
        desc:'Electric overblown bloom',
        effects:{
            bloom:{bloomIntensity:85,bloomRadius:75,bloomThreshold:20,bloomSpread:90,bloomBlendMode:'additive',bloomExposure:130,bloomAnamorphic:false},
            bricon:{briValue:5,conValue:140,satValue:130},
            vignette:{vigIntensity:60,vigRadius:45,vigColor:'#000000'}
        }
    },
    dreamy: {
        name:'Dreamy', category:'creative',
        desc:'Ethereal halation glow',
        effects:{
            bloom:{bloomIntensity:90,bloomRadius:95,bloomThreshold:15,bloomSpread:100,bloomBlendMode:'screen',bloomExposure:135,bloomAnamorphic:true},
            blursharp:{blursharpAmount:-40},
            exposure:{exposureEV:0.6},
            colortemp:{colortempValue:25},
            colorbal:{colorbalShadowR:10,colorbalShadowG:0,colorbalShadowB:20,colorbalMidR:15,colorbalMidG:5,colorbalMidB:10,colorbalHiR:25,colorbalHiG:15,colorbalHiB:5},
            bricon:{briValue:5,conValue:80,satValue:75},
            vignette:{vigIntensity:50,vigRadius:50,vigColor:'#1a0520'}
        }
    },
    psychedelic: {
        name:'Psychedelic', category:'creative',
        desc:'Acid-trip color warp',
        effects:{
            chroma:{chromaOffset:18,chromaMode:'radial'},
            wave:{waveAmp:25,waveFreq:4,waveSpeed:3,waveMode:'circular'},
            bloom:{bloomIntensity:55,bloomRadius:65,bloomThreshold:30,bloomSpread:75,bloomBlendMode:'additive',bloomExposure:115,bloomAnamorphic:false},
            bricon:{briValue:0,conValue:130,satValue:160}
        }
    },
    cross_process: {
        name:'Cross Process', category:'creative',
        desc:'Wrong chemicals, wild colors',
        effects:{
            colorbal:{colorbalShadowR:-40,colorbalShadowG:30,colorbalShadowB:55,colorbalMidR:20,colorbalMidG:-15,colorbalMidB:-25,colorbalHiR:50,colorbalHiG:25,colorbalHiB:-40},
            bricon:{briValue:8,conValue:155,satValue:145},
            levels:{levelsInBlack:10,levelsInWhite:235,levelsGamma:1.2,levelsOutBlack:10,levelsOutWhite:245},
            bloom:{bloomIntensity:25,bloomRadius:40,bloomThreshold:40,bloomSpread:50,bloomBlendMode:'additive',bloomExposure:110,bloomAnamorphic:false},
            grain:{grainIntensity:30,grainSize:10,grainColorMode:'color'},
            vignette:{vigIntensity:60,vigRadius:45,vigColor:'#050a00'}
        }
    },
    orb: {
        name:'ORB', category:'creative',
        desc:'Pulsing radial energy sphere',
        effects:{
            radblur:{radblurIntensity:70},
            bloom:{bloomIntensity:85,bloomRadius:90,bloomThreshold:15,bloomSpread:100,bloomBlendMode:'additive',bloomExposure:140,bloomAnamorphic:false},
            chroma:{chromaOffset:12,chromaMode:'radial'},
            duotone:{duoShadow:'#050f05',duoHighlight:'#33ff77',duoIntensity:90},
            vignette:{vigIntensity:75,vigRadius:35,vigColor:'#000a00'},
            bricon:{briValue:5,conValue:130,satValue:140}
        }
    },
    underwater: {
        name:'Underwater', category:'creative',
        desc:'Deep ocean blue-green murk',
        effects:{
            colorbal:{colorbalShadowR:-35,colorbalShadowG:10,colorbalShadowB:50,colorbalMidR:-20,colorbalMidG:15,colorbalMidB:30,colorbalHiR:-10,colorbalHiG:20,colorbalHiB:25},
            bloom:{bloomIntensity:40,bloomRadius:60,bloomThreshold:35,bloomSpread:70,bloomBlendMode:'additive',bloomExposure:95,bloomAnamorphic:false},
            wave:{waveAmp:8,waveFreq:2,waveSpeed:1,waveMode:'horizontal'},
            vignette:{vigIntensity:65,vigRadius:40,vigColor:'#000a15'}
        }
    },
    fisheye_warp: {
        name:'Fisheye', category:'creative',
        desc:'Wide-angle lens bulge',
        effects:{
            curve:{curveIntensity:70,curveDirection:'fisheye',curveFringe:50},
            bloom:{bloomIntensity:15,bloomRadius:25,bloomThreshold:55,bloomSpread:35,bloomBlendMode:'additive',bloomExposure:100,bloomAnamorphic:false},
            vignette:{vigIntensity:60,vigRadius:40,vigColor:'#000000'}
        }
    },

    // ── GLITCH ──
    glitch_art: {
        name:'Glitch Art', category:'glitch',
        desc:'Heavy digital corruption',
        effects:{
            glitch:{glitchIntensity:65,glitchFreq:45,glitchMode:'shift',glitchChannelShift:85,glitchBlockSize:50,glitchSeed:0,glitchSpeed:70},
            rgbshift:{rgbShiftRX:10,rgbShiftRY:3,rgbShiftBX:-8,rgbShiftBY:-2,rgbShiftIntensity:90},
            noise:{noiseIntensity:20,noiseScale:1,noiseColorMode:'color',noiseAlgo:'random'}
        }
    },
    data_corrupt: {
        name:'Data Corrupt', category:'glitch',
        desc:'Destroyed file blocks',
        effects:{
            glitch:{glitchIntensity:80,glitchFreq:50,glitchMode:'corrupt',glitchChannelShift:90,glitchBlockSize:65,glitchSeed:0,glitchSpeed:50},
            noise:{noiseIntensity:30,noiseScale:1,noiseColorMode:'color',noiseAlgo:'random'},
            bricon:{briValue:0,conValue:130,satValue:110}
        }
    },
    pixel_drift: {
        name:'Pixel Drift', category:'glitch',
        desc:'Melting downward pixel flow',
        effects:{
            glitch:{glitchIntensity:70,glitchFreq:60,glitchMode:'drift',glitchChannelShift:65,glitchBlockSize:40,glitchSeed:0,glitchSpeed:40},
            bloom:{bloomIntensity:20,bloomRadius:30,bloomThreshold:50,bloomSpread:40,bloomBlendMode:'additive',bloomExposure:100,bloomAnamorphic:false}
        }
    },
    tv_static: {
        name:'TV Static', category:'glitch',
        desc:'Dead channel snow',
        effects:{
            glitch:{glitchIntensity:75,glitchFreq:70,glitchMode:'static',glitchChannelShift:50,glitchBlockSize:55,glitchSeed:0,glitchSpeed:80},
            scanlines:{scanIntensity:25,scanCount:350,scanVertical:false},
            vignette:{vigIntensity:50,vigRadius:50,vigColor:'#000000'}
        }
    },
    slice_n_dice: {
        name:'Slice & Dice', category:'glitch',
        desc:'Sliced strips with gaps',
        effects:{
            glitch:{glitchIntensity:60,glitchFreq:55,glitchMode:'slice',glitchChannelShift:75,glitchBlockSize:45,glitchSeed:0,glitchSpeed:60},
            rgbshift:{rgbShiftRX:6,rgbShiftRY:0,rgbShiftBX:-6,rgbShiftBY:0,rgbShiftIntensity:70},
            bricon:{briValue:0,conValue:115,satValue:90}
        }
    },
    xerox_copy: {
        name:'Xerox Copy', category:'glitch',
        desc:'4th-gen photocopy',
        effects:{
            xerox:{xeroxContrast:80,xeroxNoise:65,xeroxDarkness:65},
            paperscan:{paperscanIntensity:45,paperscanFiber:4,paperscanWarmth:15},
            grain:{grainIntensity:30,grainSize:16,grainColorMode:'mono'}
        }
    },
    emboss_dirt: {
        name:'Emboss Dirt', category:'glitch',
        desc:'Textured relief with grit',
        effects:{
            emboss:{embossAngle:135,embossStrength:75,embossColor:true},
            grunge:{grungeTint:'#886644',grungePosterize:3,grungeGrain:70},
            noise:{noiseIntensity:18,noiseScale:1,noiseColorMode:'mono',noiseAlgo:'random'}
        }
    },

    // ── NEW PRESETS ──
    film_halation: {
        name:'Film Halation', category:'film',
        desc:'Red glow bleed on highlights',
        effects:{
            bloom:{bloomIntensity:70,bloomRadius:80,bloomThreshold:30,bloomSpread:85,bloomBlendMode:'additive',bloomExposure:120,bloomAnamorphic:false},
            chroma:{chromaOffset:8,chromaMode:'radial'},
            colorbal:{colorbalShadowR:0,colorbalShadowG:0,colorbalShadowB:10,colorbalMidR:10,colorbalMidG:0,colorbalMidB:-5,colorbalHiR:35,colorbalHiG:-5,colorbalHiB:-15},
            grain:{grainIntensity:35,grainSize:8,grainColorMode:'color'},
            levels:{levelsInBlack:10,levelsInWhite:235,levelsGamma:0.95,levelsOutBlack:5,levelsOutWhite:248},
            vignette:{vigIntensity:60,vigRadius:42,vigColor:'#0a0000'}
        }
    },
    cyberpunk: {
        name:'Cyberpunk', category:'creative',
        desc:'Neon-soaked dystopia',
        effects:{
            gradmap:{gradColor1:'#000011',gradColor2:'#ff0066',gradColor3:'#6600ff',gradMidpoint:40,gradIntensity:60},
            bloom:{bloomIntensity:75,bloomRadius:70,bloomThreshold:20,bloomSpread:85,bloomBlendMode:'additive',bloomExposure:125,bloomAnamorphic:true},
            chroma:{chromaOffset:10,chromaMode:'radial'},
            bricon:{briValue:0,conValue:145,satValue:140},
            scanlines:{scanIntensity:15,scanCount:300,scanVertical:false},
            vignette:{vigIntensity:65,vigRadius:40,vigColor:'#0a0015'}
        }
    },
    analog_tv: {
        name:'Analog TV', category:'retro',
        desc:'Warm 70s broadcast signal',
        effects:{
            ntsc:{ntscChromaBleed:60,ntscInstability:40,ntscNoise:30,ntscRolling:false},
            crt:{crtScanWeight:3,crtCurvature:35,crtGlow:60,crtChroma:4,crtStatic:15,crtPhosphor:'aperture'},
            colortemp:{colortempValue:20},
            bloom:{bloomIntensity:25,bloomRadius:35,bloomThreshold:45,bloomSpread:50,bloomBlendMode:'screen',bloomExposure:100,bloomAnamorphic:false},
            vignette:{vigIntensity:55,vigRadius:45,vigColor:'#050200'}
        }
    },
    lomography: {
        name:'Lomo', category:'film',
        desc:'Oversaturated tunnel-vision',
        effects:{
            bricon:{briValue:5,conValue:150,satValue:170},
            colortemp:{colortempValue:15},
            levels:{levelsInBlack:25,levelsInWhite:230,levelsGamma:1.05,levelsOutBlack:0,levelsOutWhite:250},
            bloom:{bloomIntensity:30,bloomRadius:40,bloomThreshold:40,bloomSpread:55,bloomBlendMode:'additive',bloomExposure:105,bloomAnamorphic:false},
            vignette:{vigIntensity:85,vigRadius:30,vigColor:'#000000'},
            grain:{grainIntensity:30,grainSize:8,grainColorMode:'color'}
        }
    },
    ink_wash: {
        name:'Ink Wash', category:'creative',
        desc:'Sumi-e watercolor dissolve',
        effects:{
            duotone:{duoShadow:'#0a0a0a',duoHighlight:'#e8e0d0',duoIntensity:100},
            levels:{levelsInBlack:20,levelsInWhite:210,levelsGamma:0.7,levelsOutBlack:10,levelsOutWhite:240},
            grain:{grainIntensity:50,grainSize:18,grainColorMode:'mono'},
            blursharp:{blursharpAmount:-15},
            vignette:{vigIntensity:45,vigRadius:55,vigColor:'#0a0800'}
        }
    },
    matrix: {
        name:'Matrix', category:'retro',
        desc:'Digital rain phosphor green',
        effects:{
            gradmap:{gradColor1:'#000000',gradColor2:'#00ff41',gradColor3:'#003300',gradMidpoint:35,gradIntensity:90},
            scanlines:{scanIntensity:30,scanCount:400,scanVertical:false},
            bloom:{bloomIntensity:50,bloomRadius:55,bloomThreshold:25,bloomSpread:70,bloomBlendMode:'additive',bloomExposure:110,bloomAnamorphic:false},
            noise:{noiseIntensity:20,noiseScale:1,noiseColorMode:'mono',noiseAlgo:'random'},
            vignette:{vigIntensity:60,vigRadius:40,vigColor:'#000500'}
        }
    }
};

// ── FX_UI_CONFIG — UI control definitions for JS-generated FX panel ──
// Single source of truth for effect labels, controls, and DOM IDs.
// Control types: slider, selector, color, shape, swatch, toggle
const FX_UI_CONFIG = {
    sepia: { label:'Sepia', controls:[
        {type:'slider',sid:'slider-sepia-intensity',vid:'val-sepia-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>sepiaIntensity=v},
        {type:'slider',sid:'slider-sepia-warmth',vid:'val-sepia-warmth',label:'Warmth',min:-50,max:50,step:1,setter:v=>sepiaWarmth=v}
    ]},
    tint: { label:'Tint', hasRandomize:true, controls:[
        {type:'selector',cid:'tint-preset-buttons',label:'Preset',setter:v=>tintPreset=v,
         opts:[{v:'green',l:'GREEN'},{v:'amber',l:'AMBER'},{v:'cyan',l:'CYAN'},{v:'blue',l:'BLUE'},{v:'custom',l:'CUSTOM'}]},
        {type:'color',cid:'tint-custom-color',hid:'tint-custom-hex',label:'Custom Color',setter:v=>tintCustomColor=v},
        {type:'slider',sid:'slider-tint-intensity',vid:'val-tint-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>tintIntensity=v}
    ]},
    palette: { label:'Palette', controls:[
        {type:'selector',cid:'palette-preset-buttons',label:'Preset',setter:v=>palettePreset=v,
         opts:[{v:'noir',l:'NOIR'},{v:'terminal',l:'TERM'},{v:'gameboy',l:'GMBOY'},{v:'synthwave',l:'SYNTH'},{v:'cyberpunk',l:'CYBER'},{v:'amber',l:'AMBER'},{v:'arctic',l:'ARTIC'},{v:'rose',l:'ROSE'},{v:'neon',l:'NEON'},{v:'forest',l:'FORST'},{v:'sunset',l:'SUNST'},{v:'ocean',l:'OCEAN'}]},
        {type:'slider',sid:'slider-palette-intensity',vid:'val-palette-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>paletteIntensity=v}
    ]},
    bricon: { label:'Bri/Con', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-bri',vid:'val-bri',label:'Brightness',min:-100,max:100,step:1,setter:v=>briValue=v},
        {type:'slider',sid:'slider-con',vid:'val-con',label:'Contrast',min:0,max:200,step:1,setter:v=>conValue=v},
        {type:'slider',sid:'slider-sat',vid:'val-sat',label:'Saturation',min:0,max:200,step:1,setter:v=>satValue=v}
    ]},
    thermal: { label:'Thermal', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-thermal-intensity',vid:'val-thermal-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>thermalIntensity=v},
        {type:'selector',cid:'thermal-palette-buttons',label:'Palette',setter:v=>thermalPalette=v,
         opts:[{v:'default',l:'DEFAULT'},{v:'iron',l:'IRON'},{v:'rainbow',l:'RAINBOW'},{v:'arctic',l:'ARCTIC'},{v:'night',l:'NIGHT'}]}
    ]},
    gradmap: { label:'Grad Map', hasRandomize:true, controls:[
        {type:'color',cid:'grad-color1',hid:'grad-color1-hex',label:'Shadow',setter:v=>gradColor1=v},
        {type:'color',cid:'grad-color3',hid:'grad-color3-hex',label:'Midtone',setter:v=>gradColor3=v},
        {type:'color',cid:'grad-color2',hid:'grad-color2-hex',label:'Highlight',setter:v=>gradColor2=v},
        {type:'slider',sid:'slider-grad-midpoint',vid:'val-grad-midpoint',label:'Midpoint',min:10,max:90,step:1,setter:v=>gradMidpoint=v},
        {type:'slider',sid:'slider-grad-intensity',vid:'val-grad-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>gradIntensity=v}
    ]},
    duotone: { label:'Duotone', hasRandomize:true, controls:[
        {type:'color',cid:'duo-shadow',hid:'duo-shadow-hex',label:'Shadow',setter:v=>duoShadow=v},
        {type:'color',cid:'duo-highlight',hid:'duo-highlight-hex',label:'Highlight',setter:v=>duoHighlight=v},
        {type:'slider',sid:'slider-duo-intensity',vid:'val-duo-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>duoIntensity=v},
        {type:'selector',cid:'duo-preset-buttons',label:'Preset',setter:v=>{let presets={midnight:['#0a0a2e','#4fc3f7'],sunset:['#2d1b69','#ff6b35'],forest:['#1a3a1a','#7ecf7e'],ocean:['#0a2647','#17c3b2'],neon:['#0d0221','#ff2e63'],vintage:['#3e2723','#d4a574']};if(presets[v]){duoShadow=presets[v][0];duoHighlight=presets[v][1];}},opts:[{v:'midnight',l:'MIDNT'},{v:'sunset',l:'SUNST'},{v:'forest',l:'FORST'},{v:'ocean',l:'OCEAN'},{v:'neon',l:'NEON'},{v:'vintage',l:'VNTGE'}]}
    ]},
    chroma: { label:'Chromatic', controls:[
        {type:'slider',sid:'slider-chroma-offset',vid:'val-chroma-offset',label:'Offset',min:1,max:25,step:1,setter:v=>chromaOffset=v},
        {type:'selector',cid:'chroma-mode-buttons',label:'Mode',setter:v=>chromaMode=v,
         opts:[{v:'linear',l:'LINEAR'},{v:'radial',l:'RADIAL'}]}
    ]},
    rgbshift: { label:'RGB Shift', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-rgbshift-rx',vid:'val-rgbshift-rx',label:'Red X',min:-25,max:25,step:1,setter:v=>rgbShiftRX=v},
        {type:'slider',sid:'slider-rgbshift-ry',vid:'val-rgbshift-ry',label:'Red Y',min:-25,max:25,step:1,setter:v=>rgbShiftRY=v},
        {type:'slider',sid:'slider-rgbshift-bx',vid:'val-rgbshift-bx',label:'Blue X',min:-25,max:25,step:1,setter:v=>rgbShiftBX=v},
        {type:'slider',sid:'slider-rgbshift-by',vid:'val-rgbshift-by',label:'Blue Y',min:-25,max:25,step:1,setter:v=>rgbShiftBY=v},
        {type:'slider',sid:'slider-rgbshift-intensity',vid:'val-rgbshift-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>rgbShiftIntensity=v}
    ]},
    curve: { label:'Lens Curve', controls:[
        {type:'slider',sid:'slider-curve-intensity',vid:'val-curve-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>curveIntensity=v},
        {type:'slider',sid:'slider-curve-fringe',vid:'val-curve-fringe',label:'Chromatic Fringe',min:0,max:100,step:1,setter:v=>curveFringe=v},
        {type:'selector',cid:'curve-dir-buttons',label:'Mode',setter:v=>curveDirection=v,
         opts:[{v:'barrel',l:'BARREL'},{v:'pinch',l:'PINCH'},{v:'fisheye',l:'FISH'},{v:'squeeze',l:'SQUEEZE'},{v:'mustache',l:'MSTCH'}]}
    ]},
    wave: { label:'Wave', controls:[
        {type:'slider',sid:'slider-wave-amp',vid:'val-wave-amp',label:'Amplitude',min:1,max:100,step:1,setter:v=>waveAmp=v},
        {type:'slider',sid:'slider-wave-freq',vid:'val-wave-freq',label:'Frequency',min:1,max:20,step:1,setter:v=>waveFreq=v},
        {type:'slider',sid:'slider-wave-speed',vid:'val-wave-speed',label:'Speed',min:0,max:5,step:0.1,setter:v=>waveSpeed=v},
        {type:'selector',cid:'wave-mode-buttons',label:'Mode',setter:v=>waveMode=v,
         opts:[{v:'horizontal',l:'HORIZ'},{v:'vertical',l:'VERT'},{v:'circular',l:'CIRC'}]}
    ]},
    jitter: { label:'Jitter', controls:[
        {type:'slider',sid:'slider-jitter-intensity',vid:'val-jitter-intensity',label:'Intensity',min:1,max:100,step:1,setter:v=>jitterIntensity=v},
        {type:'slider',sid:'slider-jitter-block',vid:'val-jitter-block',label:'Block Size',min:1,max:16,step:1,setter:v=>jitterBlockSize=v},
        {type:'selector',cid:'jitter-mode-buttons',label:'Mode',setter:v=>jitterMode=v,
         opts:[{v:'random',l:'RANDOM'},{v:'perlin',l:'PERLIN'},{v:'shake',l:'SHAKE'}]}
    ]},
    mblur: { label:'Motion Blur', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-mblur-intensity',vid:'val-mblur-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>mblurIntensity=v},
        {type:'slider',sid:'slider-mblur-angle',vid:'val-mblur-angle',label:'Angle',min:0,max:360,step:1,setter:v=>mblurAngle=v}
    ]},
    emboss: { label:'Emboss', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-emboss-angle',vid:'val-emboss-angle',label:'Angle',min:0,max:360,step:1,setter:v=>embossAngle=v},
        {type:'slider',sid:'slider-emboss-strength',vid:'val-emboss-strength',label:'Strength',min:5,max:100,step:1,setter:v=>embossStrength=v},
        {type:'toggle',tid:'emboss-color-toggle',label:'Preserve Color',setter:v=>embossColor=v}
    ]},
    bloom: { label:'Bloom', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-bloom-intensity',vid:'val-bloom-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>bloomIntensity=v},
        {type:'slider',sid:'slider-bloom-radius',vid:'val-bloom-radius',label:'Radius',min:10,max:100,step:1,setter:v=>bloomRadius=v},
        {type:'slider',sid:'slider-bloom-thresh',vid:'val-bloom-thresh',label:'Threshold',min:0,max:100,step:1,setter:v=>bloomThreshold=v},
        {type:'slider',sid:'slider-bloom-spread',vid:'val-bloom-spread',label:'Spread',min:10,max:100,step:1,setter:v=>bloomSpread=v},
        {type:'slider',sid:'slider-bloom-exposure',vid:'val-bloom-exposure',label:'Exposure',min:50,max:200,step:1,setter:v=>bloomExposure=v},
        {type:'selector',cid:'bloom-blend-buttons',label:'Blend',setter:v=>bloomBlendMode=v,
         opts:[{v:'additive',l:'ADD'},{v:'screen',l:'SCREEN'},{v:'soft',l:'SOFT'}]},
        {type:'toggle',tid:'bloom-anamorphic-toggle',label:'Anamorphic',setter:v=>bloomAnamorphic=v}
    ]},
    dither: { label:'Dither', hasRandomize:true, controls:[
        {type:'selector',cid:'dither-algo-buttons',label:'Algorithm',setter:v=>ditherAlgorithm=v,
         opts:[{v:'bayer2',l:'2x2'},{v:'bayer4',l:'4x4'},{v:'bayer8',l:'8x8'},{v:'floyd',l:'FLOYD'},{v:'ordered',l:'ORDER'}]},
        {type:'selector',cid:'dither-palette-buttons',label:'Palette',setter:v=>ditherPalette=v,
         opts:[{v:'bw',l:'B&W'},{v:'grayscale',l:'GRAY'},{v:'noir',l:'NOIR'},{v:'terminal',l:'TERM'},{v:'gameboy',l:'GMBOY'},{v:'synthwave',l:'SYNTH'},{v:'cyberpunk',l:'CYBER'},{v:'neon',l:'NEON'}]},
        {type:'slider',sid:'slider-dither-count',vid:'val-dither-count',label:'Colors',min:2,max:18,step:1,setter:v=>ditherColorCount=v},
        {type:'slider',sid:'slider-dither-pixelation',vid:'val-dither-pixelation',label:'Pixelation',min:1,max:8,step:1,setter:v=>ditherPixelation=v},
        {type:'slider',sid:'slider-dither-strength',vid:'val-dither-strength',label:'Strength',min:0,max:100,step:1,setter:v=>ditherStrength=v},
        {type:'selector',cid:'dither-color-buttons',label:'Color',setter:v=>ditherColorMode=v,
         opts:[{v:'bw',l:'B&W'},{v:'color',l:'COLOR'}]}
    ]},
    atkinson: { label:'Atkinson', hasRandomize:true, controls:[
        {type:'selector',cid:'atkinson-color-buttons',label:'Color',setter:v=>atkinsonColorMode=v,
         opts:[{v:'bw',l:'B&W'},{v:'color',l:'COLOR'}]},
        {type:'slider',sid:'slider-atkinson-threshold',vid:'val-atkinson-threshold',label:'Threshold',min:0,max:255,step:1,setter:v=>atkinsonThreshold=v},
        {type:'slider',sid:'slider-atkinson-spread',vid:'val-atkinson-spread',label:'Spread',min:0,max:100,step:1,setter:v=>atkinsonSpread=v},
        {type:'slider',sid:'slider-atkinson-strength',vid:'val-atkinson-strength',label:'Strength',min:0,max:100,step:1,setter:v=>atkinsonStrength=v}
    ]},
    halftone: { label:'Halftone', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-half-spacing',vid:'val-half-spacing',label:'Dot Size',min:3,max:20,step:1,setter:v=>halfSpacing=v},
        {type:'slider',sid:'slider-half-angle',vid:'val-half-angle',label:'Angle',min:0,max:360,step:1,setter:v=>halfAngle=v},
        {type:'slider',sid:'slider-half-contrast',vid:'val-half-contrast',label:'Contrast',min:0,max:100,step:1,setter:v=>halfContrast=v},
        {type:'slider',sid:'slider-half-spread',vid:'val-half-spread',label:'Spread',min:0,max:50,step:1,setter:v=>halfSpread=v},
        {type:'shape',cid:'half-shape-buttons',label:'Shape',setter:v=>halfShape=v,
         opts:[{v:'circle',icon:'\u25CF',t:'Circle'},{v:'square',icon:'\u25A0',t:'Square'},{v:'diamond',icon:'\u25C6',t:'Diamond'},{v:'triangle',icon:'\u25B2',t:'Triangle'},{v:'line',icon:'\u2501',t:'Line'}]},
        {type:'swatch',cid:'half-presets',label:'Presets',
         swatches:[
            {ink:'#000000',paper:'#ffffff',t:'Classic'},
            {ink:'#1a1a2e',paper:'#f0e6d3',t:'Newsprint'},
            {ink:'#0d2b45',paper:'#d4c5a9',t:'Navy'},
            {ink:'#2b0033',paper:'#f5e6ff',t:'Purple'},
            {ink:'#003300',paper:'#ccffcc',t:'Matrix'},
            {ink:'#4a0000',paper:'#ffcccc',t:'Rose'},
            {ink:'#ff6600',paper:'#000033',t:'Neon'},
            {ink:'#00ffff',paper:'#0a0a0a',t:'Cyan'},
            {ink:'#ffffff',paper:'#000000',t:'Inverted'},
            {ink:'#ff0066',paper:'#001133',t:'Cyber'},
            {ink:'#ffd700',paper:'#1a0a00',t:'Gold'},
            {ink:'#39ff14',paper:'#0d0d0d',t:'Toxic'}
         ]},
        {type:'color',cid:'half-ink-color',hid:'half-ink-hex',label:'Ink',setter:v=>halfInkColor=v},
        {type:'color',cid:'half-paper-color',hid:'half-paper-hex',label:'Paper',setter:v=>halfPaperColor=v},
        {type:'selector',cid:'half-color-buttons',label:'Color Mode',setter:v=>halfColorMode=v,
         opts:[{v:'bw',l:'B&W'},{v:'color',l:'COLOR'}]},
        {type:'toggle',tid:'half-inverted-toggle',label:'Inverted',setter:v=>halfInverted=v}
    ]},
    pxsort: { label:'Pixel Sort', controls:[
        {type:'slider',sid:'slider-pxsort-lo',vid:'val-pxsort-lo',label:'Low',min:0,max:255,step:1,setter:v=>pxsortLo=v},
        {type:'slider',sid:'slider-pxsort-hi',vid:'val-pxsort-hi',label:'High',min:0,max:255,step:1,setter:v=>pxsortHi=v},
        {type:'selector',cid:'pxsort-dir-buttons',label:'Direction',setter:v=>pxsortDir=v,
         opts:[{v:'horizontal',l:'HORIZ'},{v:'vertical',l:'VERT'}]}
    ]},
    pixel: { label:'Pixelate', controls:[
        {type:'slider',sid:'slider-pixel-size',vid:'val-pixel-size',label:'Size',min:2,max:50,step:1,setter:v=>pixelSize=v},
        {type:'selector',cid:'pixel-mode-buttons',label:'Mode',setter:v=>pixelMode=v,
         opts:[{v:'square',l:'SQUARE'},{v:'hex',l:'HEX'}]}
    ]},
    led: { label:'LED Screen', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-led-cellsize',vid:'val-led-cellsize',label:'Cell Size',min:4,max:20,step:1,setter:v=>ledCellSize=v},
        {type:'slider',sid:'slider-led-gap',vid:'val-led-gap',label:'Gap',min:1,max:5,step:1,setter:v=>ledGap=v},
        {type:'slider',sid:'slider-led-glow',vid:'val-led-glow',label:'Glow',min:0,max:100,step:1,setter:v=>ledGlow=v},
        {type:'slider',sid:'slider-led-brightness',vid:'val-led-brightness',label:'Brightness',min:50,max:150,step:1,setter:v=>ledBrightness=v},
        {type:'selector',cid:'led-shape-buttons',label:'Shape',setter:v=>ledShape=v,
         opts:[{v:'square',l:'SQUARE'},{v:'circle',l:'CIRCLE'}]}
    ]},
    ascii: { label:'ASCII', controls:[
        {type:'slider',sid:'slider-ascii-cell',vid:'val-ascii-cell',label:'Cell Size',min:4,max:24,step:1,setter:v=>asciiCellSize=v},
        {type:'selector',cid:'ascii-charset-buttons',label:'Charset',setter:v=>asciiCharSet=v,
         opts:[{v:'classic',l:'CLASSIC'},{v:'blocks',l:'BLOCKS'},{v:'dots',l:'DOTS'},{v:'binary',l:'BINARY'},{v:'braille',l:'BRAILLE'},{v:'symbols',l:'SYMBOLS'},{v:'katakana',l:'KATA'}]},
        {type:'selector',cid:'ascii-color-buttons',label:'Color',setter:v=>asciiColorMode=v,
         opts:[{v:'mono',l:'MONO'},{v:'color',l:'COLOR'},{v:'green',l:'GREEN'},{v:'amber',l:'AMBER'},{v:'cyan',l:'CYAN'}]},
        {type:'selector',cid:'ascii-invert-buttons',label:'Invert',setter:v=>asciiInvert=(v==='on'),
         opts:[{v:'off',l:'OFF'},{v:'on',l:'ON'}]}
    ]},
    glitch: { label:'Glitch', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-glitch-intensity',vid:'val-glitch-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>glitchIntensity=v},
        {type:'slider',sid:'slider-glitch-freq',vid:'val-glitch-freq',label:'Frequency',min:1,max:100,step:1,setter:v=>glitchFreq=v},
        {type:'slider',sid:'slider-glitch-chshift',vid:'val-glitch-chshift',label:'Ch. Shift',min:0,max:100,step:1,setter:v=>glitchChannelShift=v},
        {type:'slider',sid:'slider-glitch-blocksize',vid:'val-glitch-blocksize',label:'Block Size',min:10,max:100,step:1,setter:v=>glitchBlockSize=v},
        {type:'slider',sid:'slider-glitch-seed',vid:'val-glitch-seed',label:'Seed',min:0,max:999,step:1,setter:v=>glitchSeed=v},
        {type:'slider',sid:'slider-glitch-speed',vid:'val-glitch-speed',label:'Speed',min:0,max:100,step:1,setter:v=>glitchSpeed=v},
        {type:'selector',cid:'glitch-mode-buttons',label:'Style',setter:v=>glitchMode=v,
         opts:[{v:'shift',l:'SHIFT'},{v:'tear',l:'TEAR'},{v:'corrupt',l:'CORRUPT'},{v:'vhs',l:'VHS'},{v:'slice',l:'SLICE'},{v:'drift',l:'DRIFT'},{v:'static',l:'STATIC'}]}
    ]},
    noise: { label:'Noise', controls:[
        {type:'slider',sid:'slider-noise-intensity',vid:'val-noise-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>noiseIntensity=v},
        {type:'slider',sid:'slider-noise-scale',vid:'val-noise-scale',label:'Scale',min:1,max:10,step:1,setter:v=>noiseScale=v},
        {type:'selector',cid:'noise-color-buttons',label:'Color',setter:v=>noiseColorMode=v,
         opts:[{v:'mono',l:'MONO'},{v:'color',l:'COLOR'}]},
        {type:'selector',cid:'noise-algo-buttons',label:'Algorithm',setter:v=>noiseAlgo=v,
         opts:[{v:'random',l:'RANDOM'},{v:'simplex',l:'SIMPLEX'}]}
    ]},
    grain: { label:'Grain', controls:[
        {type:'slider',sid:'slider-grain-intensity',vid:'val-grain-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>grainIntensity=v},
        {type:'slider',sid:'slider-grain-size',vid:'val-grain-size',label:'Size',min:5,max:40,step:1,setter:v=>grainSize=v},
        {type:'selector',cid:'grain-color-buttons',label:'Color',setter:v=>grainColorMode=v,
         opts:[{v:'mono',l:'MONO'},{v:'color',l:'COLOR'}]}
    ]},
    dots: { label:'Dots', controls:[
        {type:'slider',sid:'slider-dots-angle',vid:'val-dots-angle',label:'Angle',min:0,max:360,step:1,setter:v=>dotsAngle=v},
        {type:'slider',sid:'slider-dots-scale',vid:'val-dots-scale',label:'Scale',min:2,max:20,step:1,setter:v=>dotsScale=v},
        {type:'slider',sid:'slider-dots-opacity',vid:'val-dots-opacity',label:'Opacity',min:0,max:100,step:1,setter:v=>dotsOpacity=v}
    ]},
    grid: { label:'Grid', controls:[
        {type:'slider',sid:'slider-grid-scale',vid:'val-grid-scale',label:'Scale',min:5,max:50,step:1,setter:v=>gridScale=v},
        {type:'slider',sid:'slider-grid-width',vid:'val-grid-width',label:'Width',min:1,max:5,step:0.5,setter:v=>gridWidth=v},
        {type:'slider',sid:'slider-grid-opacity',vid:'val-grid-opacity',label:'Opacity',min:5,max:100,step:1,setter:v=>gridOpacity=v}
    ]},
    scanlines: { label:'Scanlines', controls:[
        {type:'slider',sid:'slider-scan-intensity',vid:'val-scan-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>scanIntensity=v},
        {type:'slider',sid:'slider-scan-count',vid:'val-scan-count',label:'Count',min:50,max:800,step:10,setter:v=>scanCount=v},
        {type:'toggle',tid:'scan-vertical-toggle',label:'Vertical',setter:v=>scanVertical=v}
    ]},
    vignette: { label:'Vignette', controls:[
        {type:'slider',sid:'slider-vig-intensity',vid:'val-vig-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>vigIntensity=v},
        {type:'slider',sid:'slider-vig-radius',vid:'val-vig-radius',label:'Radius',min:20,max:100,step:1,setter:v=>vigRadius=v},
        {type:'color',cid:'vig-color',hid:'vig-color-hex',label:'Color',setter:v=>vigColor=v}
    ]},
    crt: { label:'CRT Screen', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-crt-scanweight',vid:'val-crt-scanweight',label:'Scan Weight',min:1,max:5,step:1,setter:v=>crtScanWeight=v},
        {type:'slider',sid:'slider-crt-curvature',vid:'val-crt-curvature',label:'Curvature',min:0,max:100,step:1,setter:v=>crtCurvature=v},
        {type:'slider',sid:'slider-crt-glow',vid:'val-crt-glow',label:'Phosphor Glow',min:0,max:100,step:1,setter:v=>crtGlow=v},
        {type:'slider',sid:'slider-crt-chroma',vid:'val-crt-chroma',label:'Chroma Fringe',min:0,max:10,step:1,setter:v=>crtChroma=v},
        {type:'slider',sid:'slider-crt-static',vid:'val-crt-static',label:'Static Noise',min:0,max:100,step:1,setter:v=>crtStatic=v},
        {type:'selector',cid:'crt-phosphor-buttons',label:'Phosphor',setter:v=>crtPhosphor=v,
         opts:[{v:'none',l:'NONE'},{v:'slot',l:'SLOT'},{v:'aperture',l:'APRT'},{v:'shadow',l:'SHDW'}]}
    ]},
    threshold: { label:'Threshold', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-threshold-level',vid:'val-threshold-level',label:'Level',min:0,max:255,step:1,setter:v=>thresholdLevel=v},
        {type:'toggle',tid:'threshold-invert-toggle',label:'Invert',setter:v=>thresholdInvert=v}
    ]},
    exposure: { label:'Exposure', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-exposure-ev',vid:'val-exposure-ev',label:'EV',min:-30,max:30,step:1,setter:v=>exposureEV=v}
    ]},
    colortemp: { label:'Color Temp', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-colortemp',vid:'val-colortemp',label:'Temperature',min:-100,max:100,step:1,setter:v=>colortempValue=v}
    ]},
    rgbgain: { label:'RGB Gain', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-rgbgain-r',vid:'val-rgbgain-r',label:'Red',min:0,max:200,step:1,setter:v=>rgbGainR=v},
        {type:'slider',sid:'slider-rgbgain-g',vid:'val-rgbgain-g',label:'Green',min:0,max:200,step:1,setter:v=>rgbGainG=v},
        {type:'slider',sid:'slider-rgbgain-b',vid:'val-rgbgain-b',label:'Blue',min:0,max:200,step:1,setter:v=>rgbGainB=v},
        {type:'slider',sid:'slider-rgbgain-gamma',vid:'val-rgbgain-gamma',label:'Gamma',min:2,max:50,step:1,setter:v=>rgbGainGamma=v/10}
    ]},
    levels: { label:'Levels', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-levels-inblack',vid:'val-levels-inblack',label:'In Black',min:0,max:255,step:1,setter:v=>levelsInBlack=v},
        {type:'slider',sid:'slider-levels-inwhite',vid:'val-levels-inwhite',label:'In White',min:0,max:255,step:1,setter:v=>levelsInWhite=v},
        {type:'slider',sid:'slider-levels-gamma',vid:'val-levels-gamma',label:'Gamma',min:2,max:50,step:1,setter:v=>levelsGamma=v/10},
        {type:'slider',sid:'slider-levels-outblack',vid:'val-levels-outblack',label:'Out Black',min:0,max:255,step:1,setter:v=>levelsOutBlack=v},
        {type:'slider',sid:'slider-levels-outwhite',vid:'val-levels-outwhite',label:'Out White',min:0,max:255,step:1,setter:v=>levelsOutWhite=v}
    ]},
    colorbal: { label:'Color Bal', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-colorbal-sr',vid:'val-colorbal-sr',label:'Shadow R',min:-100,max:100,step:1,setter:v=>colorbalShadowR=v},
        {type:'slider',sid:'slider-colorbal-sg',vid:'val-colorbal-sg',label:'Shadow G',min:-100,max:100,step:1,setter:v=>colorbalShadowG=v},
        {type:'slider',sid:'slider-colorbal-sb',vid:'val-colorbal-sb',label:'Shadow B',min:-100,max:100,step:1,setter:v=>colorbalShadowB=v},
        {type:'slider',sid:'slider-colorbal-mr',vid:'val-colorbal-mr',label:'Mid R',min:-100,max:100,step:1,setter:v=>colorbalMidR=v},
        {type:'slider',sid:'slider-colorbal-mg',vid:'val-colorbal-mg',label:'Mid G',min:-100,max:100,step:1,setter:v=>colorbalMidG=v},
        {type:'slider',sid:'slider-colorbal-mb',vid:'val-colorbal-mb',label:'Mid B',min:-100,max:100,step:1,setter:v=>colorbalMidB=v},
        {type:'slider',sid:'slider-colorbal-hr',vid:'val-colorbal-hr',label:'Hi R',min:-100,max:100,step:1,setter:v=>colorbalHiR=v},
        {type:'slider',sid:'slider-colorbal-hg',vid:'val-colorbal-hg',label:'Hi G',min:-100,max:100,step:1,setter:v=>colorbalHiG=v},
        {type:'slider',sid:'slider-colorbal-hb',vid:'val-colorbal-hb',label:'Hi B',min:-100,max:100,step:1,setter:v=>colorbalHiB=v}
    ]},
    colmatrix: { label:'Color Mix', hasRandomize:true, controls:[
        {type:'selector',cid:'colmatrix-preset-buttons',label:'Preset',setter:v=>colmatrixPreset=v,
         opts:[{v:'none',l:'NONE'},{v:'sepia-warm',l:'SEPIA+'},{v:'cross',l:'CROSS'},{v:'infrared',l:'INFRA'},{v:'nightvision',l:'NIGHT'}]},
        {type:'slider',sid:'slider-colmatrix-intensity',vid:'val-colmatrix-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>colmatrixIntensity=v}
    ]},
    blursharp: { label:'Blur/Sharp', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-blursharp',vid:'val-blursharp',label:'Amount',min:-100,max:100,step:1,setter:v=>blursharpAmount=v}
    ]},
    modulate: { label:'Modulate', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-modulate-freq',vid:'val-modulate-freq',label:'Frequency',min:1,max:50,step:1,setter:v=>modulateFreq=v},
        {type:'slider',sid:'slider-modulate-amp',vid:'val-modulate-amp',label:'Amplitude',min:1,max:100,step:1,setter:v=>modulateAmp=v},
        {type:'slider',sid:'slider-modulate-speed',vid:'val-modulate-speed',label:'Speed',min:0,max:50,step:1,setter:v=>modulateSpeed=v/10},
        {type:'selector',cid:'modulate-dir-buttons',label:'Direction',setter:v=>modulateDir=v,
         opts:[{v:'horizontal',l:'HORIZ'},{v:'vertical',l:'VERT'},{v:'both',l:'BOTH'}]}
    ]},
    ripple: { label:'Ripple', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-ripple-freq',vid:'val-ripple-freq',label:'Frequency',min:1,max:20,step:1,setter:v=>rippleFreq=v},
        {type:'slider',sid:'slider-ripple-amp',vid:'val-ripple-amp',label:'Amplitude',min:1,max:50,step:1,setter:v=>rippleAmp=v},
        {type:'slider',sid:'slider-ripple-speed',vid:'val-ripple-speed',label:'Speed',min:0,max:50,step:1,setter:v=>rippleSpeed=v/10},
        {type:'slider',sid:'slider-ripple-damping',vid:'val-ripple-damping',label:'Damping',min:0,max:100,step:1,setter:v=>rippleDamping=v}
    ]},
    swirl: { label:'Swirl', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-swirl-angle',vid:'val-swirl-angle',label:'Angle',min:-360,max:360,step:1,setter:v=>swirlAngle=v},
        {type:'slider',sid:'slider-swirl-radius',vid:'val-swirl-radius',label:'Radius',min:10,max:100,step:1,setter:v=>swirlRadius=v}
    ]},
    reedglass: { label:'Reed Glass', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-reed-width',vid:'val-reed-width',label:'Rib Width',min:2,max:40,step:1,setter:v=>reedWidth=v},
        {type:'slider',sid:'slider-reed-distortion',vid:'val-reed-distortion',label:'Distortion',min:1,max:50,step:1,setter:v=>reedDistortion=v},
        {type:'toggle',tid:'reed-chromatic-toggle',label:'Chromatic',setter:v=>reedChromatic=v}
    ]},
    polar2rect: { label:'Polar\u2192Rect', controls:[
        {type:'slider',sid:'slider-polar2rect-rot',vid:'val-polar2rect-rot',label:'Rotation',min:0,max:360,step:1,setter:v=>polar2rectRotation=v}
    ]},
    rect2polar: { label:'Rect\u2192Polar', controls:[
        {type:'slider',sid:'slider-rect2polar-rot',vid:'val-rect2polar-rot',label:'Rotation',min:0,max:360,step:1,setter:v=>rect2polarRotation=v}
    ]},
    radblur: { label:'Radial Blur', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-radblur-intensity',vid:'val-radblur-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>radblurIntensity=v}
    ]},
    zoomblur: { label:'Zoom Blur', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-zoomblur-intensity',vid:'val-zoomblur-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>zoomblurIntensity=v}
    ]},
    circblur: { label:'Circ Blur', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-circblur-intensity',vid:'val-circblur-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>circblurIntensity=v}
    ]},
    elgrid: { label:'Elastic Grid', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-elgrid-size',vid:'val-elgrid-size',label:'Grid Size',min:4,max:32,step:1,setter:v=>elgridSize=v},
        {type:'slider',sid:'slider-elgrid-warp',vid:'val-elgrid-warp',label:'Warp',min:1,max:100,step:1,setter:v=>elgridWarp=v},
        {type:'slider',sid:'slider-elgrid-speed',vid:'val-elgrid-speed',label:'Speed',min:0,max:50,step:1,setter:v=>elgridSpeed=v/10},
        {type:'toggle',tid:'elgrid-animated-toggle',label:'Animate',setter:v=>elgridAnimated=v}
    ]},
    printstamp: { label:'Print Stamp', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-printstamp-dotsize',vid:'val-printstamp-dotsize',label:'Dot Size',min:2,max:12,step:1,setter:v=>printstampDotSize=v},
        {type:'slider',sid:'slider-printstamp-contrast',vid:'val-printstamp-contrast',label:'Contrast',min:0,max:100,step:1,setter:v=>printstampContrast=v},
        {type:'slider',sid:'slider-printstamp-grain',vid:'val-printstamp-grain',label:'Paper Grain',min:0,max:100,step:1,setter:v=>printstampGrain=v}
    ]},
    y2kblue: { label:'Y2K Blue', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-y2k-blue',vid:'val-y2k-blue',label:'Blue Shift',min:20,max:100,step:1,setter:v=>y2kBlueShift=v},
        {type:'slider',sid:'slider-y2k-glow',vid:'val-y2k-glow',label:'Glow',min:0,max:100,step:1,setter:v=>y2kGlow=v},
        {type:'slider',sid:'slider-y2k-grain',vid:'val-y2k-grain',label:'Grain',min:0,max:100,step:1,setter:v=>y2kGrain=v}
    ]},
    ntsc: { label:'NTSC', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-ntsc-chroma',vid:'val-ntsc-chroma',label:'Chroma Bleed',min:0,max:100,step:1,setter:v=>ntscChromaBleed=v},
        {type:'slider',sid:'slider-ntsc-instability',vid:'val-ntsc-instability',label:'Instability',min:0,max:100,step:1,setter:v=>ntscInstability=v},
        {type:'slider',sid:'slider-ntsc-noise',vid:'val-ntsc-noise',label:'Noise',min:0,max:100,step:1,setter:v=>ntscNoise=v},
        {type:'toggle',tid:'ntsc-rolling-toggle',label:'Rolling',setter:v=>ntscRolling=v}
    ]},
    stripe: { label:'Stripe', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-stripe-density',vid:'val-stripe-density',label:'Density',min:2,max:50,step:1,setter:v=>stripeDensity=v},
        {type:'slider',sid:'slider-stripe-angle',vid:'val-stripe-angle',label:'Angle',min:0,max:360,step:1,setter:v=>stripeAngle=v},
        {type:'slider',sid:'slider-stripe-thickness',vid:'val-stripe-thickness',label:'Thickness',min:1,max:10,step:1,setter:v=>stripeThickness=v},
        {type:'slider',sid:'slider-stripe-opacity',vid:'val-stripe-opacity',label:'Opacity',min:10,max:100,step:1,setter:v=>stripeOpacity=v},
        {type:'selector',cid:'stripe-mode-buttons',label:'Mode',setter:v=>stripeMode=v,
         opts:[{v:'linear',l:'LINEAR'},{v:'circular',l:'CIRCLE'}]}
    ]},
    paperscan: { label:'Paper Scan', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-paperscan-intensity',vid:'val-paperscan-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>paperscanIntensity=v},
        {type:'slider',sid:'slider-paperscan-fiber',vid:'val-paperscan-fiber',label:'Fiber Scale',min:1,max:10,step:1,setter:v=>paperscanFiber=v},
        {type:'slider',sid:'slider-paperscan-warmth',vid:'val-paperscan-warmth',label:'Warmth',min:0,max:100,step:1,setter:v=>paperscanWarmth=v}
    ]},
    xerox: { label:'Xerox', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-xerox-contrast',vid:'val-xerox-contrast',label:'Contrast',min:10,max:100,step:1,setter:v=>xeroxContrast=v},
        {type:'slider',sid:'slider-xerox-noise',vid:'val-xerox-noise',label:'Noise',min:0,max:100,step:1,setter:v=>xeroxNoise=v},
        {type:'slider',sid:'slider-xerox-darkness',vid:'val-xerox-darkness',label:'Darkness',min:0,max:100,step:1,setter:v=>xeroxDarkness=v}
    ]},
    grunge: { label:'Grunge', hasRandomize:true, controls:[
        {type:'color',cid:'grunge-tint',hid:'grunge-tint-hex',label:'Tint',setter:v=>grungeTint=v},
        {type:'slider',sid:'slider-grunge-posterize',vid:'val-grunge-posterize',label:'Posterize',min:2,max:8,step:1,setter:v=>grungePosterize=v},
        {type:'slider',sid:'slider-grunge-grain',vid:'val-grunge-grain',label:'Grain',min:0,max:100,step:1,setter:v=>grungeGrain=v}
    ]},
    datamosh: { label:'Datamosh', hasRandomize:true, controls:[
        {type:'selector',cid:'datamosh-mode-buttons',label:'Mode',setter:v=>datamoshMode=v,
         opts:[{v:'melt',l:'MELT'},{v:'shatter',l:'SHATTER'}]},
        {type:'slider',sid:'slider-datamosh-decay',vid:'val-datamosh-decay',label:'Decay',min:0,max:100,step:1,setter:v=>datamoshDecay=v},
        {type:'slider',sid:'slider-datamosh-threshold',vid:'val-datamosh-threshold',label:'Threshold',min:0,max:100,step:1,setter:v=>datamoshThreshold=v},
        {type:'slider',sid:'slider-datamosh-intensity',vid:'val-datamosh-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>datamoshIntensity=v}
    ]},
    pxsortgpu: { label:'Pixel Sort GPU', controls:[
        {type:'slider',sid:'slider-pxsortgpu-lo',vid:'val-pxsortgpu-lo',label:'Low',min:0,max:255,step:1,setter:v=>pxsortgpuLo=v},
        {type:'slider',sid:'slider-pxsortgpu-hi',vid:'val-pxsortgpu-hi',label:'High',min:0,max:255,step:1,setter:v=>pxsortgpuHi=v},
        {type:'selector',cid:'pxsortgpu-dir-buttons',label:'Direction',setter:v=>pxsortgpuDir=v,
         opts:[{v:'horizontal',l:'HORIZ'},{v:'vertical',l:'VERT'}]}
    ]},
    sift: { label:'Sift', controls:[
        {type:'slider',sid:'slider-sift-layers',vid:'val-sift-layers',label:'Layers',min:2,max:20,step:1,setter:v=>siftLayers=v},
        {type:'slider',sid:'slider-sift-offsetx',vid:'val-sift-offsetx',label:'X Offset',min:-30,max:30,step:1,setter:v=>siftOffsetX=v},
        {type:'slider',sid:'slider-sift-offsety',vid:'val-sift-offsety',label:'Y Offset',min:-30,max:30,step:1,setter:v=>siftOffsetY=v},
        {type:'slider',sid:'slider-sift-intensity',vid:'val-sift-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>siftIntensity=v}
    ]},
    smartpixel: { label:'Smart Pixel', controls:[
        {type:'slider',sid:'slider-smartpx-threshold',vid:'val-smartpx-threshold',label:'Threshold',min:1,max:60,step:1,setter:v=>smartpxThreshold=v},
        {type:'slider',sid:'slider-smartpx-size',vid:'val-smartpx-size',label:'Cell Size',min:4,max:32,step:2,setter:v=>smartpxSize=v}
    ]},
    slidestretch: { label:'Slide Stretch', controls:[
        {type:'slider',sid:'slider-slide-dividers',vid:'val-slide-dividers',label:'Dividers',min:1,max:12,step:1,setter:v=>slideDividers=v},
        {type:'slider',sid:'slider-slide-stretch',vid:'val-slide-stretch',label:'Stretch',min:5,max:200,step:1,setter:v=>slideStretch=v},
        {type:'selector',cid:'slide-angle-buttons',label:'Direction',setter:v=>slideAngle=(v==='horizontal'?90:0),
         opts:[{v:'vertical',l:'VERT'},{v:'horizontal',l:'HORIZ'}]}
    ]},
    cornerpin: { label:'Corner Pin', controls:[
        {type:'selector',cid:'cornerpin-preset-buttons',label:'Preset',setter:v=>cornerpinPreset=v,
         opts:[{v:'perspective',l:'PERSP'},{v:'squeeze',l:'SQUEEZE'},{v:'twist',l:'TWIST'},{v:'trapezoid',l:'TRAPEZ'}]},
        {type:'slider',sid:'slider-cornerpin-intensity',vid:'val-cornerpin-intensity',label:'Intensity',min:0,max:100,step:1,setter:v=>cornerpinIntensity=v}
    ]},
    automata: { label:'Automata', controls:[
        {type:'selector',cid:'automata-rule-buttons',label:'Rule',setter:v=>automataRule=v,
         opts:[{v:'decay',l:'DECAY'},{v:'crystal',l:'CRYSTAL'},{v:'conway',l:'CONWAY'},{v:'growth',l:'GROWTH'}]},
        {type:'slider',sid:'slider-automata-speed',vid:'val-automata-speed',label:'Speed',min:1,max:10,step:1,setter:v=>automataSpeed=v},
        {type:'slider',sid:'slider-automata-threshold',vid:'val-automata-threshold',label:'Threshold',min:20,max:230,step:5,setter:v=>automataThreshold=v}
    ]},
    pixelflow: { label:'Pixel Flow', controls:[
        {type:'slider',sid:'slider-flow-angle',vid:'val-flow-angle',label:'Angle',min:0,max:360,step:5,setter:v=>flowAngle=v},
        {type:'slider',sid:'slider-flow-speed',vid:'val-flow-speed',label:'Speed',min:1,max:20,step:1,setter:v=>flowSpeed=v},
        {type:'slider',sid:'slider-flow-decay',vid:'val-flow-decay',label:'Trail',min:10,max:95,step:1,setter:v=>flowDecay=v}
    ]},
    kaleid: { label:'Kaleidoscope', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-kaleid-seg',vid:'val-kaleid-seg',label:'Segments',min:2,max:32,step:1,setter:v=>kaleidSegments=v},
        {type:'slider',sid:'slider-kaleid-rot',vid:'val-kaleid-rot',label:'Rotation',min:0,max:360,step:1,setter:v=>kaleidRotation=v}
    ]},
    feedback: { label:'Feedback', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-feedback-decay',vid:'val-feedback-decay',label:'Trail',min:10,max:98,step:1,setter:v=>feedbackDecay=v},
        {type:'slider',sid:'slider-feedback-zoom',vid:'val-feedback-zoom',label:'Zoom',min:0,max:20,step:1,setter:v=>feedbackZoom=v},
        {type:'slider',sid:'slider-feedback-rot',vid:'val-feedback-rot',label:'Spin',min:-10,max:10,step:1,setter:v=>feedbackRotation=v},
        {type:'slider',sid:'slider-feedback-hue',vid:'val-feedback-hue',label:'Hue Shift',min:0,max:360,step:5,setter:v=>feedbackHueShift=v}
    ]},
    timewarp: { label:'Time Warp', controls:[
        {type:'slider',sid:'slider-timewarp-speed',vid:'val-timewarp-speed',label:'Speed',min:5,max:100,step:5,setter:v=>timewarpSpeed=v},
        {type:'selector',cid:'timewarp-dir-buttons',label:'Direction',setter:v=>timewarpDir=v,
         opts:[{v:'horizontal',l:'HORIZ'},{v:'vertical',l:'VERT'}]}
    ]},
    flowfield: { label:'Flow Field', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-flowfield-scale',vid:'val-flowfield-scale',label:'Scale',min:1,max:20,step:1,setter:v=>flowfieldScale=v},
        {type:'slider',sid:'slider-flowfield-str',vid:'val-flowfield-str',label:'Strength',min:5,max:100,step:5,setter:v=>flowfieldStrength=v},
        {type:'slider',sid:'slider-flowfield-speed',vid:'val-flowfield-speed',label:'Speed',min:0,max:10,step:1,setter:v=>flowfieldSpeed=v}
    ]},
    freeze: { label:'Freeze', controls:[
        {type:'slider',sid:'slider-freeze-rate',vid:'val-freeze-rate',label:'Hold Frames',min:2,max:60,step:1,setter:v=>freezeRate=v}
    ]}
};

// Section nav state
let currentSection = 'create';

// FX panel state
let currentFxCat = 'color';
let currentViewedEffect = 'sepia';

function getEffectsForCategory(cat) {
    return Object.keys(FX_CATEGORIES).filter(k => FX_CATEGORIES[k] === cat);
}

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

// Per-effect audio sync state
let fxAudioSync = {};
const FX_AUDIO_SYNC_DEFAULTS = {
    enabled: false, band: 'kick', paramIndex: 0,
    sensitivity: 50, threshold: 10, release: 40,
    smoothedValue: 0, _baseValue: null, regions: []
};
function getEnergyForBand(band) {
    switch(band) {
        case 'kick': return smoothBass;
        case 'bass': return smoothBass;
        case 'vocal': return smoothMid;
        case 'hats': return smoothTreble;
        case 'full': default: return smoothOverall;
    }
}
let audioGainNode = null;
let audioObjectUrl = null;

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let lastRecordedBlob = null;
let lastRecordedExt = 'webm';
let recordingAudioDest = null;
let recordingCanvas = null;
let recordingCtx = null;
let recordingStartTime = 0;
let recordingVideoTrack = null;

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
    btnPlay: null, // removed — top bar is sole transport
    btnRestart: null,
    btnRecord: null,
    btnSave: null,
    audioUpload: document.getElementById('audioUpload'),
    audioName: document.getElementById('audio-name'),
    audioMeterFill: document.getElementById('audio-meter-fill'),
    modeButtons: document.querySelectorAll('#group-modes .tracking-grid .selector-btn'),
    vizButtons: document.querySelectorAll('#viz-buttons .selector-btn'),
    fxCards: [], // FX cards replaced by Effecto dropdown — now JS-generated
    fxLayerButtons: document.querySelectorAll('#fx-layer-buttons .selector-btn'),
    lineButtons: document.querySelectorAll('#line-buttons .selector-btn'),
    syncButtons: document.querySelectorAll('#sync-buttons .selector-btn'),
    syncTargetButtons: document.querySelectorAll('#sync-target-buttons .selector-btn'),
    freqPresetButtons: document.querySelectorAll('#freq-preset-buttons .selector-btn'),
    autogainButtons: document.querySelectorAll('#autogain-buttons .selector-btn'),
    bpmLockButtons: document.querySelectorAll('#bpm-lock-buttons .selector-btn'),
    customColorGroup: document.getElementById('custom-color-group'),
    customColorPicker: document.getElementById('custom-color-picker'),
    btnPhoto: null, // removed — top bar is sole transport
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
const AUTO_GAIN_DECAY = 0.993;
const AUTO_GAIN_FLOOR = 0.05;
let autoGainMax = { band: AUTO_GAIN_FLOOR, bass: AUTO_GAIN_FLOOR, mid: AUTO_GAIN_FLOOR, treble: AUTO_GAIN_FLOOR };

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
let syncMinQty = 5;
let syncMaxQty = 50;
let syncMinSize = 10;
let syncMaxSize = 60;
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

class PersistentBlob {
    constructor(x, y, c, blobVarLevel, id) {
        this.id = id;
        this.posicao = createVector(x, y);
        this.prevPos = createVector(x, y);
        this.velocity = createVector(0, 0);
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
        this.age = 0;
        this.state = 'new';       // new | active | lost | expired
        this.lostFrames = 0;
        this.matchedThisFrame = false;
        this.trail = [];
        this.reviveFlash = 0;     // countdown for visual indicator
        this.reviveCount = 0;     // times this blob was revived
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
    pixelDensity(1); // 1x density for fast pixel effects (4x fewer pixels on Retina)
    let canvas = createCanvas(windowWidth, windowHeight);
    resizeCanvas(windowWidth, windowHeight); // force 1x buffer
    p5Canvas = canvas.elt;
    // Lock canvas base resolution on mobile (avoid WebKit memory leak on resize)
    if (_isMobileDevice) { _canvasBaseW = windowWidth; _canvasBaseH = windowHeight; }
    p5Canvas.setAttribute('tabindex', '0');
    p5Canvas.setAttribute('role', 'img');
    p5Canvas.setAttribute('aria-label', 'Hues of Dispositions — live webcam effects canvas');
    canvas.elt.addEventListener('contextmenu', (e) => e.preventDefault());

    // Pause draw loop when tab is hidden (battery/thermal savings on mobile)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { noLoop(); }
        else { loop(); }
    });

    background(0);
    textFont('Helvetica Neue');
    textSize(11);
    restoreLayerState();

    // First-run overlay dismiss
    const froDismiss = document.getElementById('first-run-dismiss');
    const froOverlay = document.getElementById('first-run-overlay');
    if (froDismiss && froOverlay) {
        const dismissFirstRun = () => {
            froOverlay.style.display = 'none';
            localStorage.setItem('hod-onboarded', 'true');
        };
        froDismiss.addEventListener('click', dismissFirstRun);
        froOverlay.addEventListener('click', (e) => {
            if (e.target === froOverlay) dismissFirstRun();
        });
    }

    // Video zoom: scroll on canvas (no modifier = video zoom, Ctrl = timeline zoom)
    canvas.elt.addEventListener('wheel', (e) => {
        // Skip if cursor is over panels or timeline
        let over = document.elementFromPoint(e.clientX, e.clientY);
        if (over && (over.closest('.panel') || over.closest('#timeline-container'))) return;
        e.preventDefault();
        if (kenBurnsEnabled) return; // Ken Burns controls zoom
        let zoomFactor = 1 - e.deltaY * 0.002;
        let newZoom = Math.max(0.25, Math.min(8, (zoomSmooth ? zoomTargetLevel : vidZoom) * zoomFactor));
        let cx = e.clientX, cy = e.clientY;
        if (zoomSmooth) {
            // Smooth mode: set targets, lerp in draw()
            let curZoom = zoomTargetLevel;
            zoomTargetPanX = cx - (cx - zoomTargetPanX) * (newZoom / curZoom);
            zoomTargetPanY = cy - (cy - zoomTargetPanY) * (newZoom / curZoom);
            zoomTargetLevel = newZoom;
            if (zoomTargetLevel >= 0.99 && zoomTargetLevel <= 1.01) { zoomTargetLevel = 1; zoomTargetPanX = 0; zoomTargetPanY = 0; }
            if (zoomTargetLevel < 1) { zoomTargetPanX = 0; zoomTargetPanY = 0; }
        } else {
            // Instant mode: direct zoom
            vidPanX = cx - (cx - vidPanX) * (newZoom / vidZoom);
            vidPanY = cy - (cy - vidPanY) * (newZoom / vidZoom);
            vidZoom = newZoom;
            if (vidZoom >= 0.99 && vidZoom <= 1.01) { vidZoom = 1; vidPanX = 0; vidPanY = 0; }
            if (vidZoom < 1) { vidPanX = 0; vidPanY = 0; }
            zoomTargetLevel = vidZoom; zoomTargetPanX = vidPanX; zoomTargetPanY = vidPanY;
        }
        updateZoomUI();
    }, { passive: false });

    // Double-click canvas to reset zoom
    canvas.elt.addEventListener('dblclick', (e) => {
        let over = document.elementFromPoint(e.clientX, e.clientY);
        if (over && (over.closest('.panel') || over.closest('#timeline-container'))) return;
        zoomTargetLevel = 1; zoomTargetPanX = 0; zoomTargetPanY = 0;
        if (!zoomSmooth) { vidZoom = 1; vidPanX = 0; vidPanY = 0; }
        updateZoomUI();
    });

    // Split divider drag
    canvas.elt.addEventListener('mousedown', (e) => {
        if (!splitZoomEnabled || e.button !== 0) return;
        let splitX = Math.round(width * splitPosition / 100);
        let canvasRect = canvas.elt.getBoundingClientRect();
        let mx = e.clientX - canvasRect.left;
        if (Math.abs(mx - splitX) < 8) {
            e.preventDefault();
            e.stopPropagation();
            _splitDrag = { startX: e.clientX, startPos: splitPosition };
            canvas.elt.style.cursor = 'col-resize';
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (!_splitDrag) return;
        let canvasRect = canvas.elt.getBoundingClientRect();
        let newPos = _splitDrag.startPos + (e.clientX - _splitDrag.startX) / canvasRect.width * 100;
        splitPosition = constrain(newPos, 10, 90);
        let slider = document.getElementById('slider-split-pos');
        let input = document.getElementById('val-split-pos');
        if (slider) slider.value = splitPosition;
        if (input) input.value = Math.round(splitPosition);
    });
    document.addEventListener('mouseup', () => {
        if (_splitDrag) {
            _splitDrag = null;
            canvas.elt.style.cursor = '';
        }
    });

    // Video pan: middle-click drag or left-drag when zoomed (on canvas only)
    let _vidDrag = null;
    canvas.elt.addEventListener('mousedown', (e) => {
        if (_splitDrag) return; // split divider drag takes priority
        if (vidZoom <= 1) return;
        let over = document.elementFromPoint(e.clientX, e.clientY);
        if (over && (over.closest('.panel') || over.closest('#timeline-container'))) return;
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            _vidDrag = { startX: e.clientX, startY: e.clientY, origPanX: vidPanX, origPanY: vidPanY };
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (!_vidDrag) return;
        vidPanX = _vidDrag.origPanX + (e.clientX - _vidDrag.startX);
        vidPanY = _vidDrag.origPanY + (e.clientY - _vidDrag.startY);
    });
    document.addEventListener('mouseup', () => { _vidDrag = null; });

    // Initialize all UI listeners (split across modules)
    setupCoreUIListeners();
    setupFxUIListeners();
    setupAudioUIListeners();
    setupTimelineUIListeners();
    setupMaskUIListeners();

    updateButtonStates();
    currentParam = navOrder[0];

    // Initialize WebGL2 shader pipeline (Phase 0)
    initShaderFX();

    // Initialize Region FX pipeline (per-blob effects)
    if (typeof initRegionFX === 'function') initRegionFX();
}

// Update zoom UI elements
function updateZoomUI() {
    let zl = document.getElementById('zoom-level');
    if (zl) zl.textContent = (zoomSmooth ? zoomTargetLevel : vidZoom).toFixed(2) + 'x';
    let zs = document.getElementById('slider-vid-zoom');
    if (zs) zs.value = zoomSmooth ? zoomTargetLevel : vidZoom;
}

function draw() {
    background(0);
    _vizRecordQueue.length = 0;
    paramOwner.fill(PARAM_SRC_USER);
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

        // Reserve space for timeline if visible (use cached height to avoid per-frame reflow)
        if (window._cachedTimelineHeight > 0) {
            dispH -= window._cachedTimelineHeight + 20; // +20 for bottom gap
        }

        // Fit video into available space (base size before zoom)
        let baseW, baseH;
        if ((dispW / dispH) > videoRatio) {
            baseH = dispH;
            baseW = baseH * videoRatio;
        } else {
            baseW = dispW;
            baseH = baseW / videoRatio;
        }

        // ── Ken Burns: animate zoom and pan cinematically
        if (kenBurnsEnabled && videoPlaying) {
            kenBurnsTime += deltaTime * 0.001 * kenBurnsSpeed;
            let kbZoom = map(Math.sin(kenBurnsTime * 0.5), -1, 1, kenBurnsMinZoom, kenBurnsMaxZoom);
            let kbPanX = Math.sin(kenBurnsTime * 0.3) * baseW * kenBurnsPanAmt;
            let kbPanY = Math.cos(kenBurnsTime * 0.4) * baseH * kenBurnsPanAmt * 0.67;
            zoomTargetLevel = kbZoom;
            zoomTargetPanX = kbPanX;
            zoomTargetPanY = kbPanY;
            kenBurnsReturning = false;
        } else if (kenBurnsReturning) {
            // Smooth return to original view
            zoomTargetLevel = preKBZoom;
            zoomTargetPanX = preKBPanX;
            zoomTargetPanY = preKBPanY;
            if (!zoomSmooth) {
                // No lerp available — snap immediately
                vidZoom = preKBZoom; vidPanX = preKBPanX; vidPanY = preKBPanY;
                kenBurnsReturning = false;
            } else if (Math.abs(vidZoom - preKBZoom) < 0.01 &&
                Math.abs(vidPanX - preKBPanX) < 1 &&
                Math.abs(vidPanY - preKBPanY) < 1) {
                kenBurnsReturning = false;
            }
        }

        // ── Smooth zoom lerp
        if (zoomSmooth) {
            let lerpSpeed = 0.12;
            vidZoom += (zoomTargetLevel - vidZoom) * lerpSpeed;
            vidPanX += (zoomTargetPanX - vidPanX) * lerpSpeed;
            vidPanY += (zoomTargetPanY - vidPanY) * lerpSpeed;
            // Snap when close enough
            if (Math.abs(vidZoom - zoomTargetLevel) < 0.002) vidZoom = zoomTargetLevel;
            if (Math.abs(vidPanX - zoomTargetPanX) < 0.5) vidPanX = zoomTargetPanX;
            if (Math.abs(vidPanY - zoomTargetPanY) < 0.5) vidPanY = zoomTargetPanY;
        }

        // ── Clamp pan to keep video covering the viewport (no void space)
        if (vidZoom > 1) {
            let maxPanX = Math.max(0, (baseW * vidZoom - dispW) / 2);
            let maxPanY = Math.max(0, (baseH * vidZoom - dispH) / 2);
            vidPanX = constrain(vidPanX, -maxPanX, maxPanX);
            vidPanY = constrain(vidPanY, -maxPanY, maxPanY);
        }

        // Apply video zoom
        videoW = baseW * vidZoom;
        videoH = baseH * vidZoom;
        videoX = (dispW - videoW) / 2 + vidPanX;
        videoY = (dispH - videoH) / 2 + vidPanY;

        // Mirror only front-facing webcam (not external/rear cameras)
        if (usingWebcam && _currentFacingMode === 'user') {
            push();
            translate(videoX * 2 + videoW, 0);
            scale(-1, 1);
            image(videoEl, videoX, videoY, videoW, videoH);
            pop();
        } else {
            image(videoEl, videoX, videoY, videoW, videoH);
        }

        // MASK AI segmentation overlay — brief flash on selection
        if (currentMode === 14 && maskOverlay && maskOverlayVisible) {
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
        if (!fxLayerAll && fxMasterOpacity > 0) {
            // Snapshot pre-FX canvas for opacity blending
            if (fxMasterOpacity < 1.0) {
                if (!_fxOpacityBuf || _fxOpacityBuf.width !== drawingContext.canvas.width || _fxOpacityBuf.height !== drawingContext.canvas.height) {
                    _fxOpacityBuf = document.createElement('canvas');
                    _fxOpacityBuf.width = drawingContext.canvas.width;
                    _fxOpacityBuf.height = drawingContext.canvas.height;
                }
                _fxOpacityBuf.getContext('2d').drawImage(drawingContext.canvas, 0, 0);
            }
            _applySplitSideFx(() => {
                try { applyActiveEffects(); } catch(e) { console.warn('FX error:', e); }
                try { if (timelineSegments.length > 0) applyTimelineEffects(); } catch(e) { console.warn('Timeline FX error:', e); }
                if (typeof applyPerEffectAudioSync === 'function') applyPerEffectAudioSync();
            });
            // GPU shader pipeline — apply with its own split-side clipping
            _applySplitSideFx(() => { processShaderFX(); });
            if (fxMasterOpacity < 1.0) {
                drawingContext.save();
                drawingContext.globalAlpha = 1.0 - fxMasterOpacity;
                drawingContext.drawImage(_fxOpacityBuf, 0, 0);
                drawingContext.restore();
            }
        }

        // Video overlay (after effects, before blob tracking)
        if (typeof drawOverlay === 'function') drawOverlay();

        let timeInterval = map(paramValues[5], 0, 100, 0, 1000);
        if (millis() - lastTrackTime >= timeInterval) {
            trackPoints();
            lastTrackTime = millis();
        }

        // Update face tracking status display continuously (cached DOM refs)
        if (currentMode >= 15 && currentMode <= 17 && frameCount % 15 === 0) {
            if (!window._faceStatusEl) window._faceStatusEl = document.getElementById('face-status');
            if (!window._faceHintEl) window._faceHintEl = document.getElementById('face-hint');
            let fStatusEl = window._faceStatusEl;
            let fHintEl = window._faceHintEl;
            if (fStatusEl) {
                if (window.mpFaceInitError) {
                    fStatusEl.textContent = 'ERROR';
                    fStatusEl.style.color = '#E17055';
                    if (fHintEl) fHintEl.textContent = window.mpFaceInitError;
                } else if (!window.mpFaceLandmarkerReady) {
                    fStatusEl.textContent = 'LOADING';
                    fStatusEl.style.color = '#FDCB6E';
                } else if (faceLandmarkCache && faceLandmarkCache.length > 0) {
                    fStatusEl.textContent = faceLandmarkCache.length + ' FACE' + (faceLandmarkCache.length > 1 ? 'S' : '');
                    fStatusEl.style.color = '#00B894';
                    document.getElementById('face-loading').style.display = 'none';
                    if (fHintEl) fHintEl.textContent = currentMode === 15 ? 'Tracking eye landmarks' :
                        currentMode === 16 ? 'Tracking lip landmarks' : 'Tracking full face mesh';
                } else {
                    fStatusEl.textContent = 'NO FACE';
                    fStatusEl.style.color = '#E17055';
                    if (fHintEl) fHintEl.textContent = 'Point camera or video at a face';
                }
            }
        }

        // ── Auto-follow: pan toward centroid of tracked points
        if (autoFollow && trackedPoints.length > 0 && vidZoom > 1.05 && !kenBurnsEnabled) {
            let cx = 0, cy = 0;
            for (let p of trackedPoints) { cx += p.posicao.x; cy += p.posicao.y; }
            cx /= trackedPoints.length;
            cy /= trackedPoints.length;
            // Target pan: center the centroid on screen
            let targetPanX = (dispW / 2) - (cx - videoX + vidPanX);
            let targetPanY = (dispH / 2) - (cy - videoY + vidPanY);
            // Only adjust if centroid is off-center
            zoomTargetPanX += (targetPanX - zoomTargetPanX) * autoFollowSpeed;
            zoomTargetPanY += (targetPanY - zoomTargetPanY) * autoFollowSpeed;
        }

        // Clip all blob/line drawing to the video frame
        if (blobsVisible && blobsOpacity > 0) {
        if (blobsOpacity < 1.0) {
            if (!_blobOpacityBuf || _blobOpacityBuf.width !== drawingContext.canvas.width || _blobOpacityBuf.height !== drawingContext.canvas.height) {
                _blobOpacityBuf = document.createElement('canvas');
                _blobOpacityBuf.width = drawingContext.canvas.width;
                _blobOpacityBuf.height = drawingContext.canvas.height;
            }
            _blobOpacityBuf.getContext('2d').drawImage(drawingContext.canvas, 0, 0);
        }
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(videoX, videoY, videoW, videoH);
        drawingContext.clip();

        if (showLines && trackedPoints.length > 1) drawLines();
        if (_trailEnabled && _persistenceEnabled) drawTrails();
        drawHeatmap();

        // Draw ROI rectangle overlay
        if (_roiEnabled && _roiRect) {
            let sc1 = videoToScreenCoords(_roiRect.x1, _roiRect.y1);
            let sc2 = videoToScreenCoords(_roiRect.x2, _roiRect.y2);
            noFill(); stroke(0, 255, 200, 180); strokeWeight(1.5);
            drawingContext.setLineDash([6, 4]);
            rect(sc1.x, sc1.y, sc2.x - sc1.x, sc2.y - sc1.y);
            drawingContext.setLineDash([]);
            fill(0, 255, 200, 150); noStroke(); textSize(9);
            text('ROI', sc1.x + 4, sc1.y - 4);
        }
        if (_roiDrawing && _roiStart) {
            noFill(); stroke(0, 255, 200, 120); strokeWeight(1);
            drawingContext.setLineDash([4, 3]);
            rect(_roiStart.x, _roiStart.y, mouseX - _roiStart.x, mouseY - _roiStart.y);
            drawingContext.setLineDash([]);
        }

        let _tbc = color(trackBoxColor); // parse once, reuse per blob
        for (let p of trackedPoints) {
            // Pulse scaling: each blob swells based on pulseIntensity with random delay
            let pScale = 1.0;
            if (pulseIntensity > 0.01) {
                let delayed = constrain(pulseIntensity - p.pulseOffset, 0, 1);
                pScale = 1.0 + 0.2 * delayed;
            }
            let pw = p.width * pScale;
            let ph = p.height * pScale;

            if (activeVizModes.has(10) || activeVizModes.has(12)) {
                // ZOOM / ASCII — video crop inside blob
                push();
                let _vc = screenToVideoCoords(p.posicao.x, p.posicao.y);
                let srcX = _vc.x, srcY = _vc.y;
                let isFaceZoom = false;
                let absZoom = Math.abs(vizZoomLevel);
                let sampleR;
                if (vizZoomLevel >= 0) {
                    let zoomFactor = map(absZoom, 0, 8, 1, 8); // 1 = true 1:1 at slider 0
                    sampleR = max(pw, ph) / max(zoomFactor, 0.1);
                } else {
                    let wideFactor = map(absZoom, 0, 8, 1, 12);
                    sampleR = max(pw, ph) * wideFactor;
                }
                sampleR = max(sampleR, 4);
                let zW = max(pw, 20);
                let zH = max(ph, 20);
                let sx = constrain(srcX - sampleR, 0, max(0, videoEl.width - sampleR * 0.5));
                let sy = constrain(srcY - sampleR, 0, max(0, videoEl.height - sampleR * 0.5));
                let sw = min(sampleR * 2, videoEl.width - sx);
                let sh = min(sampleR * 2, videoEl.height - sy);
                sw = max(sw, 1); sh = max(sh, 1);
                let bx = p.posicao.x - zW/2, by = p.posicao.y - zH/2;
                image(videoEl, bx, by, zW, zH, sx, sy, sw, sh);

                // ASCII: green terminal-style ASCII art inside blob box
                if (activeVizModes.has(12)) {
                    let _chars = ASCII_CHARSETS[asciiCharSet] || ASCII_CHARSETS.classic;
                    let asciiScale = 2.8;
                    let aW = Math.max(zW * asciiScale, 140);
                    let aH = Math.max(zH * asciiScale, 100);
                    let ax = p.posicao.x - aW/2, ay = p.posicao.y - aH/2;
                    ax = constrain(ax, 0, width - aW);
                    ay = constrain(ay, 0, height - aH);
                    // Adaptive cell size: denser grid at higher viz zoom for sharper detail
                    let cellSz = Math.max(3.5, 7 / Math.max(1, 1 + Math.max(0, vizZoomLevel) * 0.15));
                    let cols = Math.min(Math.floor(aW / cellSz), 200);
                    let rows = Math.min(Math.floor(aH / (cellSz * 1.6)), 120);

                    // Sample from source video at >= grid resolution for quality
                    let sampleW = Math.min(Math.max(cols, Math.ceil(sw)), 400);
                    let sampleH = Math.min(Math.max(rows, Math.ceil(sh)), 300);
                    if (!_asciiSampler) _asciiSampler = document.createElement('canvas');
                    if (_asciiSampler.width !== sampleW || _asciiSampler.height !== sampleH) {
                        _asciiSampler.width = sampleW;
                        _asciiSampler.height = sampleH;
                    }
                    let actx = _asciiSampler.getContext('2d');
                    actx.drawImage(videoEl.elt || videoEl, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
                    // Downsample to grid resolution for character lookup
                    let gridCanvas = _asciiSampler._grid;
                    if (!gridCanvas) { gridCanvas = document.createElement('canvas'); _asciiSampler._grid = gridCanvas; }
                    if (gridCanvas.width !== cols || gridCanvas.height !== rows) {
                        gridCanvas.width = cols; gridCanvas.height = rows;
                    }
                    let gctx = gridCanvas.getContext('2d', { willReadFrequently: true });
                    gctx.imageSmoothingEnabled = true;
                    gctx.imageSmoothingQuality = 'high';
                    gctx.drawImage(_asciiSampler, 0, 0, sampleW, sampleH, 0, 0, cols, rows);
                    let sData = gctx.getImageData(0, 0, cols, rows).data;

                    push();
                    noStroke(); fill(0, 0, 0, 230);
                    rectMode(CORNER);
                    rect(ax, ay, aW, aH);

                    drawingContext.save();
                    drawingContext.beginPath();
                    drawingContext.rect(ax, ay, aW, aH);
                    drawingContext.clip();
                    let ctx = drawingContext;
                    ctx.font = Math.round(cellSz * 1.3) + 'px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let rowH = cellSz * 1.6;
                    let lastFill = '';
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            let si = (r * cols + c) * 4;
                            let lum = (0.299*sData[si] + 0.587*sData[si+1] + 0.114*sData[si+2]) / 255;
                            let ci = Math.floor(lum * (_chars.length - 1));
                            if (ci === 0) continue;
                            let g = Math.round(60 + lum * 195);
                            let f = 'rgb(0,' + g + ',' + Math.round(lum * 30) + ')';
                            if (f !== lastFill) { ctx.fillStyle = f; lastFill = f; }
                            ctx.fillText(_chars[ci], ax + c * cellSz + cellSz/2, ay + r * rowH + rowH/2);
                        }
                    }
                    drawingContext.restore();
                    pop();
                    // Queue for recording at native resolution
                    if (isRecording) _vizRecordQueue.push({
                        type: 'ascii', sx, sy, sw, sh, ax, ay, aW, aH,
                        cellSz, cols, rows, chars: _chars
                    });
                }

                // Border — blob style
                let _vizA = vizZoomBox ? 255 : 80;
                let _vizWt = vizZoomBox ? trackBoxWeight : trackBoxWeight * 0.67;
                drawBlobStyle(p, zW, zH, _tbc, _vizA, _vizWt);
                pop();
            } else {
                // Region FX: per-blob shader effects
                if (typeof applyRegionFX === 'function' && regionFXEnabled && regionFXMode !== 'none') {
                    applyRegionFX(p, document.getElementById('defaultCanvas0'));
                }
                drawBlobStyle(p, pw, ph, _tbc, 255, trackBoxWeight);
            }
            drawPointInfo(p);
        }
        if (blobStyle === 'particle') _updateBlobParticles();

        drawingContext.restore(); // end clip
        if (blobsOpacity < 1.0) {
            drawingContext.save();
            drawingContext.globalAlpha = 1.0 - blobsOpacity;
            drawingContext.drawImage(_blobOpacityBuf, 0, 0);
            drawingContext.restore();
        }
        } // end blobsVisible

        // ALL mode: apply effects to everything including blobs
        if (fxLayerAll && fxMasterOpacity > 0) {
            if (fxMasterOpacity < 1.0) {
                if (!_fxOpacityBuf || _fxOpacityBuf.width !== drawingContext.canvas.width || _fxOpacityBuf.height !== drawingContext.canvas.height) {
                    _fxOpacityBuf = document.createElement('canvas');
                    _fxOpacityBuf.width = drawingContext.canvas.width;
                    _fxOpacityBuf.height = drawingContext.canvas.height;
                }
                _fxOpacityBuf.getContext('2d').drawImage(drawingContext.canvas, 0, 0);
            }
            _applySplitSideFx(() => {
                try { applyActiveEffects(); } catch(e) { console.warn('FX error:', e); }
                try { if (timelineSegments.length > 0) applyTimelineEffects(); } catch(e) { console.warn('Timeline FX error:', e); }
                if (typeof applyPerEffectAudioSync === 'function') applyPerEffectAudioSync();
            });
            _applySplitSideFx(() => { processShaderFX(); });
            if (fxMasterOpacity < 1.0) {
                drawingContext.save();
                drawingContext.globalAlpha = 1.0 - fxMasterOpacity;
                drawingContext.drawImage(_fxOpacityBuf, 0, 0);
                drawingContext.restore();
            }
        }

        // Update timeline playhead
        if (getTimelineDuration() > 0) updateTimelinePlayhead();
    }
    // Flash overlay on beat (FLASH sync target only — too intense in MIX)
    if (audioSync && audioSyncTarget === 'flash' && beatIntensity > 0.02 && beatFlashVisible) {
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
    if (frameCount % 6 === 0) updateTopBar();

    // Copy to recording canvas — composite: native video crop + effects/blobs overlay
    if (isRecording && recordingCanvas && recordingCtx) {
        let pd = pixelDensity();
        let rw = recordingCanvas.width;
        let rh = recordingCanvas.height;
        let srcVidW = videoEl ? (videoEl.videoWidth || videoEl.width) : rw;
        let srcVidH = videoEl ? (videoEl.videoHeight || videoEl.height) : rh;

        // Calculate visible video region on the p5 canvas
        let visLeft = Math.max(0, videoX);
        let visTop = Math.max(0, videoY);
        let visRight = Math.min(width, videoX + videoW);
        let visBottom = Math.min(height, videoY + videoH);

        // Normalize to [0,1] within the full video extent
        let normLeft = (visLeft - videoX) / videoW;
        let normTop = (visTop - videoY) / videoH;
        let normRight = (visRight - videoX) / videoW;
        let normBottom = (visBottom - videoY) / videoH;

        // 1. Sharp base: crop source video at NATIVE resolution
        //    When zoomed, this crops to exactly what's visible — no blur from upscaling
        if (videoEl && videoEl.elt) {
            let cropSx = normLeft * srcVidW;
            let cropSy = normTop * srcVidH;
            let cropSw = (normRight - normLeft) * srcVidW;
            let cropSh = (normBottom - normTop) * srcVidH;
            recordingCtx.drawImage(videoEl.elt,
                cropSx, cropSy, cropSw, cropSh,
                0, 0, rw, rh);
        }

        // 2. Overlay p5 canvas (effects + blobs) — visible region only
        let p5Sx = Math.round(visLeft * pd);
        let p5Sy = Math.round(visTop * pd);
        let p5Sw = Math.round((visRight - visLeft) * pd);
        let p5Sh = Math.round((visBottom - visTop) * pd);
        recordingCtx.drawImage(p5Canvas,
            p5Sx, p5Sy, p5Sw, p5Sh,
            0, 0, rw, rh);

        // 3. Re-render THERMO/ASCII at recording resolution (p5 canvas is display-res)
        if (_vizRecordQueue.length > 0 && videoEl && videoEl.elt) {
            let xScale = rw / (visRight - visLeft);
            let yScale = rh / (visBottom - visTop);
            for (let vd of _vizRecordQueue) {
                if (vd.type === 'ascii') {
                    let rx = (vd.ax - visLeft) * xScale;
                    let ry = (vd.ay - visTop) * yScale;
                    let rdw = vd.aW * xScale;
                    let rdh = vd.aH * yScale;
                    let rCellW = rdw / vd.cols;
                    let rCellH = rdh / vd.rows;
                    // Black background at recording resolution
                    recordingCtx.fillStyle = 'rgba(0,0,0,0.9)';
                    recordingCtx.fillRect(rx, ry, rdw, rdh);
                    // Sample from source video at recording-scaled grid
                    let rCols = Math.min(Math.ceil(vd.cols * xScale), 400);
                    let rRows = Math.min(Math.ceil(vd.rows * yScale), 250);
                    if (!_asciiSampler) _asciiSampler = document.createElement('canvas');
                    _asciiSampler.width = rCols; _asciiSampler.height = rRows;
                    let actx = _asciiSampler.getContext('2d', { willReadFrequently: true });
                    actx.drawImage(videoEl.elt, vd.sx, vd.sy, vd.sw, vd.sh, 0, 0, rCols, rRows);
                    let sData = actx.getImageData(0, 0, rCols, rRows).data;
                    // Render ASCII at recording resolution
                    recordingCtx.save();
                    recordingCtx.beginPath();
                    recordingCtx.rect(rx, ry, rdw, rdh);
                    recordingCtx.clip();
                    let fontSize = Math.round(rCellW * 1.3);
                    recordingCtx.font = fontSize + 'px monospace';
                    recordingCtx.textAlign = 'center';
                    recordingCtx.textBaseline = 'middle';
                    let lastFill = '';
                    for (let r = 0; r < rRows; r++) {
                        for (let c = 0; c < rCols; c++) {
                            let si = (r * rCols + c) * 4;
                            let lum = (0.299*sData[si] + 0.587*sData[si+1] + 0.114*sData[si+2]) / 255;
                            let ci = Math.floor(lum * (vd.chars.length - 1));
                            if (ci === 0) continue;
                            let g = Math.round(60 + lum * 195);
                            let f = 'rgb(0,' + g + ',' + Math.round(lum * 30) + ')';
                            if (f !== lastFill) { recordingCtx.fillStyle = f; lastFill = f; }
                            recordingCtx.fillText(vd.chars[ci],
                                rx + (c + 0.5) * (rdw / rCols),
                                ry + (r + 0.5) * (rdh / rRows));
                        }
                    }
                    recordingCtx.restore();
                }
            }
            _vizRecordQueue = [];
        }

        // Signal captureStream(0) that a new frame is ready
        if (recordingVideoTrack && recordingVideoTrack.requestFrame) {
            recordingVideoTrack.requestFrame();
        }
    }

    // ── Depth blur: vignette blur at edges when zoomed
    if (depthBlurEnabled && videoLoaded && vidZoom > 1.05) {
        push();
        drawingContext.save();
        let ctx = drawingContext;
        let grad;
        let s = depthBlurStrength;
        // Top edge
        grad = ctx.createLinearGradient(videoX, videoY, videoX, videoY + s);
        grad.addColorStop(0, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(videoX, videoY, videoW, s);
        // Bottom edge
        grad = ctx.createLinearGradient(videoX, videoY + videoH - s, videoX, videoY + videoH);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(videoX, videoY + videoH - s, videoW, s);
        // Left edge
        grad = ctx.createLinearGradient(videoX, videoY, videoX + s, videoY);
        grad.addColorStop(0, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(videoX, videoY, s, videoH);
        // Right edge
        grad = ctx.createLinearGradient(videoX + videoW - s, videoY, videoX + videoW, videoY);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(videoX + videoW - s, videoY, s, videoH);
        drawingContext.restore();
        pop();
    }

    // ── Split side FX: clip effects to left/right side when split view is active
    function _applySplitSideFx(applyFn) {
        if (!splitZoomEnabled || splitFxSide === 'both') {
            applyFn();
            return;
        }
        // Save clean canvas before FX
        let cvs = drawingContext.canvas;
        if (!_splitBuf || _splitBuf.width !== cvs.width || _splitBuf.height !== cvs.height) {
            _splitBuf = document.createElement('canvas');
            _splitBuf.width = cvs.width;
            _splitBuf.height = cvs.height;
        }
        _splitBuf.getContext('2d').drawImage(cvs, 0, 0);

        // Apply effects to full canvas
        applyFn();

        // Restore the non-FX side from buffer using clipped drawImage (GPU-accelerated, no pixel readback)
        let pd = cvs.width / width;
        let splitX = Math.round(width * splitPosition / 100);
        let splitPx = Math.round(splitX * pd);
        let ctx = drawingContext;
        ctx.save();
        if (splitFxSide === 'right') {
            // FX on right only — restore left from clean buffer
            ctx.beginPath();
            ctx.rect(0, 0, splitPx, cvs.height);
            ctx.clip();
            ctx.drawImage(_splitBuf, 0, 0);
        } else {
            // FX on left only — restore right from clean buffer
            ctx.beginPath();
            ctx.rect(splitPx, 0, cvs.width - splitPx, cvs.height);
            ctx.clip();
            ctx.drawImage(_splitBuf, 0, 0);
        }
        ctx.restore();
    }

    // ── Split view: configurable position, mirror, dual FX
    function applySplitClipShape(ctx, x, y, w, h, shape) {
        ctx.beginPath();
        if (shape === 'circle') {
            let r = Math.min(w, h) / 2;
            ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
        } else if (shape === 'rounded') {
            ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.06);
        } else if (shape === 'pill') {
            ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.clip();
    }
    if (splitZoomEnabled && videoLoaded && videoEl) {
        push();
        let splitX = Math.round(width * splitPosition / 100);
        let rightW = width - splitX;

        // Calculate zoom crop centered on tracked centroid
        let zCx = width / 2, zCy = height / 2;
        if (trackedPoints.length > 0) {
            zCx = 0; zCy = 0;
            for (let p of trackedPoints) { zCx += p.posicao.x; zCy += p.posicao.y; }
            zCx /= trackedPoints.length;
            zCy /= trackedPoints.length;
        }
        let srcVW = videoEl.elt ? (videoEl.elt.videoWidth || videoEl.width) : videoEl.width;
        let srcVH = videoEl.elt ? (videoEl.elt.videoHeight || videoEl.height) : videoEl.height;
        let normCx = (zCx - videoX) / videoW;
        let normCy = (zCy - videoY) / videoH;
        let cropW = srcVW / splitZoomLevel;
        let cropH = srcVH / splitZoomLevel;
        let cropX = constrain(normCx * srcVW - cropW / 2, 0, srcVW - cropW);
        let cropY = constrain(normCy * srcVH - cropH / 2, 0, srcVH - cropH);

        // Determine sides: mirror flips which side is normal vs zoomed
        let zoomSideX = splitMirrorFlip ? 0 : splitX;
        let zoomSideW = splitMirrorFlip ? splitX : rightW;

        // ── Split view: draw zoomed side + optional per-side FX ──
        drawingContext.save();
        applySplitClipShape(drawingContext, zoomSideX, 0, zoomSideW, height, splitShape);
        image(videoEl, zoomSideX, 0, zoomSideW, height, cropX, cropY, cropW, cropH);

        // Apply effects to zoom side (respect fxLayerAll — false means VIDEO layer only)
        if (splitFxEnabled && masterFxEnabled && activeEffects.size > 0 && !fxLayerAll) {
            try { applyActiveEffects(); } catch(e) {}
        }

        // Zoom viz blobs on zoom side
        if (splitVizZoom && trackedPoints.length > 0) {
            let stbc = color(trackBoxColor);
            for (let p of trackedPoints) {
                let pNormX = (p.posicao.x - videoX) / videoW;
                let pNormY = (p.posicao.y - videoY) / videoH;
                let spx = zoomSideX + (pNormX - normCx + 0.5 / splitZoomLevel) * zoomSideW * splitZoomLevel;
                let spy = (pNormY - normCy + 0.5 / splitZoomLevel) * height * splitZoomLevel;
                if (spx < zoomSideX || spx > zoomSideX + zoomSideW || spy < 0 || spy > height) continue;
                let pw = p.width * splitZoomLevel * 0.5;
                let ph = p.height * splitZoomLevel * 0.5;
                let srcPx = constrain(pNormX * srcVW - pw / (splitZoomLevel * 2), 0, srcVW - 1);
                let srcPy = constrain(pNormY * srcVH - ph / (splitZoomLevel * 2), 0, srcVH - 1);
                let srcPw = Math.min(pw / splitZoomLevel, srcVW - srcPx);
                let srcPh = Math.min(ph / splitZoomLevel, srcVH - srcPy);
                image(videoEl, spx - pw/2, spy - ph/2, pw, ph, srcPx, srcPy, srcPw, srcPh);
                noFill(); stroke(red(stbc), green(stbc), blue(stbc), 80);
                strokeWeight(trackBoxWeight * 0.67); rectMode(CENTER);
                rect(spx, spy, pw, ph);
            }
        }
        drawingContext.restore();

        // Divider line (highlight on hover/drag)
        let divHover = _splitDrag || (Math.abs(mouseX - splitX) < 8);
        stroke(255, divHover ? 220 : 120);
        strokeWeight(divHover ? 3 : 1);
        line(splitX, 0, splitX, height);
        // Grab handle indicator + cursor
        if (divHover) {
            let hY = height / 2;
            fill(255, 180); noStroke();
            for (let dy = -12; dy <= 12; dy += 8) {
                ellipse(splitX, hY + dy, 4, 4);
            }
            if (!_splitDrag) cursor('col-resize');
        } else if (!_splitDrag) {
            cursor(ARROW);
        }

        // Labels
        noStroke(); fill(255, 150); textSize(10);
        textAlign(LEFT, TOP);
        let leftLabel = splitMirrorFlip ? splitZoomLevel.toFixed(1) + 'x' : 'Normal';
        let hasFx = masterFxEnabled && activeEffects.size > 0;
        if (hasFx && (splitFxSide === 'left' || splitFxSide === 'both')) leftLabel += ' + FX';
        text(leftLabel, 8, 8);
        textAlign(RIGHT, TOP);
        let rightLabel = splitMirrorFlip ? 'Normal' : splitZoomLevel.toFixed(1) + 'x';
        if (hasFx && (splitFxSide === 'right' || splitFxSide === 'both')) rightLabel += ' + FX';
        if (splitVizZoom) rightLabel += ' + ZOOM';
        text(rightLabel, width - 8, 8);
        pop();
    }

    // ── PiP overview map: shows full video with viewport rectangle
    if (pipEnabled && videoLoaded && videoEl && vidZoom > 1.05) {
        push();
        let pipW = 160, pipH = 160 / (videoEl.width / videoEl.height);
        let pipX = width - pipW - 12;
        let pipY = 12;
        // Background
        fill(0, 180); noStroke(); rectMode(CORNER);
        rect(pipX - 2, pipY - 2, pipW + 4, pipH + 4, 4);
        // Full video thumbnail
        image(videoEl, pipX, pipY, pipW, pipH);
        // Viewport rectangle
        let vpLeft = (Math.max(0, -videoX)) / videoW;
        let vpTop = (Math.max(0, -videoY)) / videoH;
        let vpRight = Math.min(1, (width - videoX) / videoW);
        let vpBottom = Math.min(1, (height - videoY) / videoH);
        noFill(); stroke(0, 255, 200); strokeWeight(1.5);
        rect(pipX + vpLeft * pipW, pipY + vpTop * pipH,
             (vpRight - vpLeft) * pipW, (vpBottom - vpTop) * pipH);
        // Label
        noStroke(); fill(255, 150); textSize(8); textAlign(RIGHT, TOP);
        text(vidZoom.toFixed(1) + 'x', pipX + pipW, pipY + pipH + 3);
        pop();
    }

    // ── Zoom level indicator overlay
    if (videoLoaded && Math.abs(vidZoom - 1) > 0.02) {
        push();
        noStroke(); fill(255, 100); textSize(12); textAlign(LEFT, TOP);
        text(vidZoom.toFixed(2) + 'x', 12, 12);
        pop();
    }

    // Update zoom UI each frame (for smooth transitions)
    if (zoomSmooth && (Math.abs(vidZoom - zoomTargetLevel) > 0.002)) updateZoomUI();

    paramOwnerPrev.set(paramOwner);
}

// ── CORE UI LISTENERS ─────────────────────

// switchToTab() removed — section nav is sole controller (use switchSection())

function setupCoreUIListeners() {

    // Collapsible section toggles
    document.querySelectorAll('.collapsible-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.closest('.collapsible').classList.toggle('collapsed');
        });
    });

    // Accordion section toggle
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.accordion-section');
            const isCollapsed = section.classList.toggle('collapsed');
            header.setAttribute('aria-expanded', !isCollapsed);
        });
    });

    // Tracking category tab switching — user click sets manual flag to prevent auto-override
    window._trackTabUserSelected = false;
    document.querySelectorAll('.tracking-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.trackTab;
            window._trackTabUserSelected = true;
            document.querySelectorAll('.tracking-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            document.querySelectorAll('.tracking-tab-content').forEach(panel => {
                panel.classList.toggle('active', panel.dataset.trackTab === tabId);
            });
        });
    });

    // Tracking ON/OFF toggle
    const trackingToggle = document.getElementById('tracking-toggle');
    const trackingBody = document.getElementById('tracking-body');
    const blobParamsSection = document.querySelector('section[aria-label="Blob parameters"]');
    let _trackingLastMode = 1; // remember last mode when toggling back on (default: BLUE)
    if (trackingToggle) {
        trackingToggle.addEventListener('change', () => {
            const isOn = trackingToggle.checked;
            if (isOn) {
                // Restore last mode
                currentMode = _trackingLastMode;
                _userMode = currentMode;
                if (trackingBody) trackingBody.classList.remove('tracking-off');
                if (blobParamsSection) blobParamsSection.style.display = '';
            } else {
                // Save current mode and turn off
                if (currentMode > 0) _trackingLastMode = currentMode;
                currentMode = 0;
                _userMode = 0;
                exitMaskMode();
                if (trackingBody) trackingBody.classList.add('tracking-off');
                if (blobParamsSection) blobParamsSection.style.display = 'none';
            }
            if (currentMode === 3) prevGridPixels = {};
            if (currentMode === 12) flickerScores = {};
            if (currentMode < 15 || currentMode > 17) { faceLandmarkCache = null; smoothedLandmarks = null; }
            if (currentMode === 14) { enterMaskSelecting(); if (window.initSegmenterLazy) window.initSegmenterLazy(); }
            if (currentMode >= 15 && currentMode <= 17 && window.initFaceLandmarkerLazy) window.initFaceLandmarkerLazy();
            ui.customColorGroup.style.display = (currentMode === 5 || currentMode === 13) ? '' : 'none';
            updateButtonStates();
        });
    }

    // Settings modal toggle (functions defined globally for keyPressed access)
    const settingsBtn = document.getElementById('settings-btn');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose = document.getElementById('settings-close');
    if (settingsBtn) settingsBtn.addEventListener('click', toggleSettings);
    if (settingsClose) settingsClose.addEventListener('click', toggleSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) toggleSettings();
    });

    // ── PERSISTENCE UI WIRING ─────────────
    const persistToggle = document.getElementById('persistence-toggle');
    const persistOpts = document.getElementById('persistence-options');
    if (persistToggle) {
        persistToggle.checked = _persistenceEnabled;
        persistToggle.addEventListener('change', () => {
            _persistenceEnabled = persistToggle.checked;
            if (persistOpts) persistOpts.style.display = _persistenceEnabled ? '' : 'none';
            if (!_persistenceEnabled) { _persistentBlobs = []; _nextBlobId = 1; }
        });
    }
    // Generic slider+input sync helper for persistence controls
    function wirePersistSlider(sliderId, inputId, setter) {
        let sl = document.getElementById(sliderId);
        let inp = document.getElementById(inputId);
        if (!sl || !inp) return;
        function sync(val) { let v = parseFloat(val); if (!isNaN(v)) { sl.value = v; inp.value = v; setter(v); } }
        sl.addEventListener('input', () => sync(sl.value));
        inp.addEventListener('change', () => sync(inp.value));
    }
    wirePersistSlider('slider-match-dist', 'val-match-dist', v => { _maxMoveDistance = v; });
    wirePersistSlider('slider-persist-dur', 'val-persist-dur', v => { _persistDuration = v; });
    wirePersistSlider('slider-min-age', 'val-min-age', v => { _minBlobAge = v; });
    wirePersistSlider('slider-smoothing', 'val-smoothing', v => { _blobSmoothing = v / 100; });
    wirePersistSlider('slider-dedup', 'val-dedup', v => { _dedupRadius = v; });
    const roiToggle = document.getElementById('roi-toggle');
    const roiHint = document.getElementById('roi-hint');
    const clearRoiBtn = document.getElementById('btn-clear-roi');
    if (roiToggle) {
        roiToggle.addEventListener('change', () => {
            _roiEnabled = roiToggle.checked;
            if (roiHint) roiHint.style.display = _roiEnabled ? '' : 'none';
            if (clearRoiBtn) clearRoiBtn.style.display = (_roiEnabled && _roiRect) ? '' : 'none';
            if (!_roiEnabled) { _roiRect = null; _roiDrawing = false; _roiStart = null; }
        });
    }
    if (clearRoiBtn) {
        clearRoiBtn.addEventListener('click', () => {
            _roiRect = null; _roiDrawing = false; _roiStart = null;
            clearRoiBtn.style.display = 'none';
        });
    }
    const clusterToggle = document.getElementById('cluster-toggle');
    const clusterOpts = document.getElementById('cluster-options');
    if (clusterToggle) {
        clusterToggle.checked = _clusterEnabled;
        clusterToggle.addEventListener('change', () => {
            _clusterEnabled = clusterToggle.checked;
            if (clusterOpts) clusterOpts.style.display = _clusterEnabled ? '' : 'none';
        });
    }
    wirePersistSlider('slider-cluster-eps', 'val-cluster-eps', v => { _clusterEps = v; });
    wirePersistSlider('slider-cluster-min', 'val-cluster-min', v => { _clusterMinPts = v; });
    const trailToggle = document.getElementById('trail-toggle');
    const trailOpts = document.getElementById('trail-options');
    if (trailToggle) {
        trailToggle.checked = _trailEnabled;
        trailToggle.addEventListener('change', () => {
            _trailEnabled = trailToggle.checked;
            if (trailOpts) trailOpts.style.display = _trailEnabled ? '' : 'none';
        });
    }
    wirePersistSlider('slider-trail-len', 'val-trail-len', v => { _trailLength = v; });
    wirePersistSlider('slider-trail-opacity', 'val-trail-opacity', v => { _trailOpacity = v / 100; });

    // Blob Revival toggle + sliders
    const reviveToggle = document.getElementById('revive-toggle');
    const reviveOpts = document.getElementById('revive-options');
    const reviveHint = document.getElementById('revive-hint');
    if (reviveToggle) {
        reviveToggle.checked = _reviveEnabled;
        reviveToggle.addEventListener('change', () => {
            _reviveEnabled = reviveToggle.checked;
            if (reviveOpts) reviveOpts.style.display = _reviveEnabled ? '' : 'none';
            if (reviveHint) reviveHint.style.display = _reviveEnabled ? '' : 'none';
        });
    }
    wirePersistSlider('slider-revive-time', 'val-revive-time', v => { _reviveTime = v; });
    wirePersistSlider('slider-revive-dist', 'val-revive-dist', v => { _reviveDistance = v; });
    wirePersistSlider('slider-revive-area', 'val-revive-area', v => { _reviveAreaDiff = v / 100; });

    // BG SUB capture button
    const captureBgBtn = document.getElementById('btn-capture-bg');
    if (captureBgBtn) {
        captureBgBtn.addEventListener('click', () => {
            if (!videoEl || !videoLoaded) return;
            videoEl.loadPixels();
            if (videoEl.pixels.length > 0) {
                _bgRefFrame = new Uint8Array(videoEl.pixels);
                let status = document.getElementById('bg-sub-status');
                if (status) status.textContent = 'Background captured (' + videoEl.width + 'x' + videoEl.height + ')';
            }
        });
    }

    // Off-canvas drawer toggle (responsive)
    const overlay = document.getElementById('panel-overlay');
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');

    function openDrawer(panel) {
        panel.classList.add('drawer-open');
        panel.setAttribute('aria-hidden', 'false');
        if (overlay) overlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
        // Focus trap: focus first focusable element
        const first = panel.querySelector('button, input, select, [tabindex]');
        if (first) first.focus();
    }
    function closeDrawer(panel) {
        panel.classList.remove('drawer-open');
        panel.setAttribute('aria-hidden', 'true');
        if (overlay) overlay.classList.remove('visible');
        document.body.style.overflow = '';
    }
    function closeAllDrawers() {
        if (leftPanel) closeDrawer(leftPanel);
        if (rightPanel) closeDrawer(rightPanel);
    }
    window._closeAllDrawers = closeAllDrawers;

    const toggleLeft = document.getElementById('drawer-toggle-left');
    const toggleRight = document.getElementById('drawer-toggle-right');
    const closeLeft = document.getElementById('close-left-panel');
    const closeRight = document.getElementById('close-right-panel');

    if (toggleLeft) toggleLeft.addEventListener('click', () => {
        closeAllDrawers();
        openDrawer(leftPanel);
    });
    if (toggleRight) toggleRight.addEventListener('click', () => {
        closeAllDrawers();
        openDrawer(rightPanel);
    });
    if (closeLeft) closeLeft.addEventListener('click', () => closeDrawer(leftPanel));
    if (closeRight) closeRight.addEventListener('click', () => closeDrawer(rightPanel));
    if (overlay) overlay.addEventListener('click', closeAllDrawers);

    // ── Bottom Sheet (≤600px) ──
    const sheetHandle = document.getElementById('sheet-handle');
    const sheetTabs = document.getElementById('sheet-section-tabs');
    let _sheetState = 'collapsed'; // collapsed | half | full | hidden
    let _sheetDragStart = null;
    let _sheetDragY = null;

    function isBottomSheetMode() {
        return window.innerWidth <= 600;
    }

    function setSheetState(state) {
        if (!leftPanel) return;
        _sheetState = state;
        leftPanel.classList.remove('sheet-collapsed', 'sheet-half', 'drawer-open');
        if (state === 'collapsed') leftPanel.classList.add('sheet-collapsed');
        else if (state === 'half') { leftPanel.classList.add('drawer-open', 'sheet-half'); }
        else if (state === 'full') { leftPanel.classList.add('drawer-open'); }
        // hidden = no class = fully off-screen
        if (overlay) overlay.classList.toggle('visible', state === 'full');
    }

    // Populate sheet section tabs (clone from top bar nav)
    function populateSheetTabs() {
        if (!sheetTabs) return;
        const topTabs = document.querySelectorAll('.tb-section-nav .section-tab');
        sheetTabs.innerHTML = '';
        topTabs.forEach(tab => {
            const clone = tab.cloneNode(true);
            clone.addEventListener('click', (e) => {
                e.stopPropagation();
                let section = clone.dataset.section;
                if (section) {
                    switchSection(section);
                    // Update active state in sheet tabs
                    sheetTabs.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
                    clone.classList.add('active');
                    // Also update top bar tabs
                    topTabs.forEach(t => t.classList.toggle('active', t.dataset.section === section));
                }
                if (_sheetState === 'collapsed') setSheetState('half');
            });
            sheetTabs.appendChild(clone);
        });
    }

    // Touch drag on handle for snap positions
    if (sheetHandle) {
        sheetHandle.addEventListener('touchstart', (e) => {
            _sheetDragStart = e.touches[0].clientY;
            _sheetDragY = _sheetDragStart;
        }, { passive: true });

        sheetHandle.addEventListener('touchmove', (e) => {
            _sheetDragY = e.touches[0].clientY;
        }, { passive: true });

        sheetHandle.addEventListener('touchend', () => {
            if (_sheetDragStart === null) return;
            let delta = _sheetDragY - _sheetDragStart;
            _sheetDragStart = null;
            // Swipe down: collapse one level
            if (delta > 40) {
                if (_sheetState === 'full') setSheetState('half');
                else if (_sheetState === 'half') setSheetState('collapsed');
            }
            // Swipe up: expand one level
            else if (delta < -40) {
                if (_sheetState === 'collapsed') setSheetState('half');
                else if (_sheetState === 'half') setSheetState('full');
            }
        });

        // Click handle to toggle half/collapsed
        sheetHandle.addEventListener('click', () => {
            if (_sheetState === 'collapsed') setSheetState('half');
            else if (_sheetState === 'half' || _sheetState === 'full') setSheetState('collapsed');
        });
    }

    // Initialize bottom sheet on resize
    function initBottomSheet() {
        if (isBottomSheetMode()) {
            if (sheetHandle) sheetHandle.style.display = '';
            populateSheetTabs();
            setSheetState('collapsed');
        } else {
            if (sheetHandle) sheetHandle.style.display = 'none';
            leftPanel.classList.remove('sheet-collapsed', 'sheet-half');
        }
    }
    initBottomSheet();
    window.addEventListener('resize', initBottomSheet);

    // Override drawer toggles to use bottom sheet on mobile
    const origOpenDrawer = openDrawer;
    openDrawer = function(panel) {
        if (isBottomSheetMode()) {
            setSheetState('half');
        } else {
            origOpenDrawer(panel);
        }
    };

    // ── Section nav ──
    let previousSection = 'create';
    function switchSection(section) {
        // Toggle: clicking Timeline again returns to previous section
        if (section === 'timeline' && currentSection === 'timeline') {
            section = previousSection;
        }
        const prev = currentSection;
        if (prev !== 'timeline') previousSection = prev;
        currentSection = section;
        document.body.dataset.section = section;

        document.querySelectorAll('.section-tab').forEach(t => {
            const isActive = t.dataset.section === section;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        document.querySelectorAll('.section-content').forEach(el => {
            const sections = (el.dataset.sectionContent || '').split(' ');
            el.classList.toggle('section-active', sections.includes(section));
        });

        // Timeline section: show/hide timeline container
        if (section === 'timeline' && prev !== 'timeline') {
            // Remember if timeline was already visible before we force-show it
            window._timelineWasVisible = ui.tlContainer && !ui.tlContainer.classList.contains('hidden');
            if (ui.tlContainer) ui.tlContainer.classList.remove('hidden');
            if (typeof renderTimelineSegments === 'function') renderTimelineSegments();
            if (typeof renderTimelineRuler === 'function') renderTimelineRuler();
            updateSlimEffectsList();
        } else if (prev === 'timeline' && section !== 'timeline') {
            // Leaving timeline section: restore to previous hidden state
            if (ui.tlContainer && !window._timelineWasVisible) ui.tlContainer.classList.add('hidden');
        }

        // Audio section: update sync summary
        if (section === 'audio' && typeof buildAudioSyncSummaryPanel === 'function') {
            buildAudioSyncSummaryPanel();
        }

        // Recalculate layout after CSS changes
        requestAnimationFrame(() => {
            if (typeof windowResized === 'function') windowResized();
        });
    }
    window.switchSection = switchSection;

    // Update slim effects list for Timeline section
    function updateSlimEffectsList() {
        const el = document.getElementById('tl-slim-effects-list');
        if (!el) return;
        if (!activeEffects || activeEffects.size === 0) {
            el.innerHTML = '<span class="hint-text">No effects active</span>';
            return;
        }
        let html = '';
        for (const name of activeEffects) {
            const cfg = FX_UI_CONFIG[name];
            if (!cfg) continue;
            const hidden = hiddenEffects && hiddenEffects.has(name);
            html += `<div class="slim-list-item"><span class="slim-dot"></span>${cfg.label}${hidden ? ' (off)' : ''}</div>`;
        }
        el.innerHTML = html;
    }
    window.updateSlimEffectsList = updateSlimEffectsList;

    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSection(tab.dataset.section));
    });

    // ── Export section button wiring ──
    const exportRecBtn = document.getElementById('export-record-btn');
    const exportScreenBtn = document.getElementById('export-screenshot-btn');
    const exportSaveBtn = document.getElementById('export-save-btn');
    if (exportRecBtn) exportRecBtn.addEventListener('click', () => {
        if (typeof toggleRecording === 'function') toggleRecording();
    });
    if (exportScreenBtn) exportScreenBtn.addEventListener('click', () => {
        if (typeof takeScreenshot === 'function') takeScreenshot();
    });
    if (exportSaveBtn) exportSaveBtn.addEventListener('click', () => {
        if (typeof saveRecording === 'function') saveRecording();
    });

    // Default section set via HTML (body data-section="create" + section-active classes)

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
                paramBaseline[idx] = val;
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
                    paramBaseline[idx] = val;
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
            e.stopPropagation();
            let newMode = parseInt(btn.dataset.value);
            if (isNaN(newMode)) return;
            currentMode = newMode;
            _userMode = currentMode;
            window._trackTabUserSelected = false; // allow auto-tab-switch to match new mode
            if (currentMode === 3) prevGridPixels = {};
            if (currentMode === 12) flickerScores = {};
            _persistentBlobs = []; _nextBlobId = 1; // reset persistence on mode change
            if (currentMode < 15 || currentMode > 17) { faceLandmarkCache = null; smoothedLandmarks = null; }
            ui.customColorGroup.style.display = (currentMode === 5 || currentMode === 13) ? '' : 'none';
            if (currentMode === 14) {
                enterMaskSelecting();
                if (window.initSegmenterLazy) window.initSegmenterLazy();
            } else {
                exitMaskMode();
            }
            if (currentMode >= 15 && currentMode <= 17) {
                if (window.initFaceLandmarkerLazy) window.initFaceLandmarkerLazy();
            }
            // BG SUB controls visibility
            let bgCtrl = document.getElementById('bg-sub-controls');
            if (bgCtrl) bgCtrl.style.display = (currentMode === 19) ? '' : 'none';
            // Ensure tracking stays on when selecting a mode
            let tt = document.getElementById('tracking-toggle');
            if (tt && !tt.checked) tt.checked = true;
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
            ui.dragGhost.style.background = '#A899C2';
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
                ui.tlGhost.style.background = '#A899C2';
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
        _userCustomHue = customHue;
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
            // Show Product Info fields when TAG viz is active (data feeds canvas overlay)
            let pig = document.getElementById('product-info-group');
            if (pig) pig.style.display = activeVizModes.has(8) ? '' : 'none';
            // Show/hide zoom viz options
            let vzp = document.getElementById('viz-zoom-options');
            if (vzp) vzp.style.display = (activeVizModes.has(10) || activeVizModes.has(12)) ? '' : 'none';
            updateButtonStates();
        });
    });

    // Zoom viz level slider
    const vizZoomSlider = document.getElementById('slider-viz-zoom');
    const vizZoomVal = document.getElementById('viz-zoom-val');
    if (vizZoomSlider) {
        vizZoomSlider.addEventListener('input', (e) => {
            vizZoomLevel = parseFloat(e.target.value);
            if (vizZoomVal) {
                let label = vizZoomLevel === 0 ? '1:1' : (vizZoomLevel > 0 ? vizZoomLevel.toFixed(1) + 'x' : vizZoomLevel.toFixed(1) + 'x wide');
                vizZoomVal.textContent = label;
            }
        });
    }
    // Zoom viz color box toggle
    document.querySelectorAll('#viz-zoom-box-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            vizZoomBox = (e.target.dataset.value === 'on');
            document.querySelectorAll('#viz-zoom-box-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    ui.lineButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            showLines = (e.target.dataset.value === 'on');
            document.getElementById('line-options-group').style.display = showLines ? '' : 'none';
            // Only update line button active states — don't call full updateButtonStates()
            // which auto-switches tracking tabs and causes unwanted mode tab changes
            ui.lineButtons.forEach(b => {
                const isOn = b.dataset.value === 'on';
                b.classList.toggle('active', showLines === isOn);
            });
        });
    });

    // Tracking box color picker
    const trackboxColorPicker = document.getElementById('trackbox-color-picker');
    const trackboxColorHex = document.getElementById('trackbox-color-hex');
    trackboxColorPicker.addEventListener('input', (e) => { trackBoxColor = e.target.value; trackboxColorHex.value = e.target.value; });
    trackboxColorHex.addEventListener('input', (e) => {
        let v = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { trackBoxColor = v; trackboxColorPicker.value = v; }
    });
    trackboxColorHex.addEventListener('keydown', (e) => e.stopPropagation());
    // Box stroke weight
    const boxWeightSlider = document.getElementById('slider-box-weight');
    const boxWeightInput = document.getElementById('val-box-weight');
    if (boxWeightSlider) {
        boxWeightSlider.addEventListener('input', (e) => { trackBoxWeight = parseFloat(e.target.value); boxWeightInput.value = e.target.value; });
        boxWeightInput.addEventListener('input', (e) => { let v = parseFloat(e.target.value); trackBoxWeight = isNaN(v) ? 1.2 : v; boxWeightSlider.value = trackBoxWeight; });
        boxWeightInput.addEventListener('keydown', (e) => e.stopPropagation());
    }

    // ── Zoom controls
    const vidZoomSlider = document.getElementById('slider-vid-zoom');
    if (vidZoomSlider) {
        vidZoomSlider.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            if (zoomSmooth) { zoomTargetLevel = v; } else { vidZoom = v; zoomTargetLevel = v; }
            if (v < 1) { zoomTargetPanX = 0; zoomTargetPanY = 0; if (!zoomSmooth) { vidPanX = 0; vidPanY = 0; } }
            updateZoomUI();
        });
    }
    // Zoom presets
    document.querySelectorAll('#zoom-preset-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            let v = parseFloat(e.target.dataset.value);
            zoomTargetLevel = v; zoomTargetPanX = 0; zoomTargetPanY = 0;
            if (!zoomSmooth) { vidZoom = v; vidPanX = 0; vidPanY = 0; }
            document.querySelectorAll('#zoom-preset-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            updateZoomUI();
        });
    });
    // Smooth zoom toggle
    document.querySelectorAll('#zoom-smooth-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            zoomSmooth = (e.target.dataset.value === 'on');
            if (!zoomSmooth) { zoomTargetLevel = vidZoom; zoomTargetPanX = vidPanX; zoomTargetPanY = vidPanY; }
            document.querySelectorAll('#zoom-smooth-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Auto-follow toggle
    document.querySelectorAll('#zoom-autofollow-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            autoFollow = (e.target.dataset.value === 'on');
            document.querySelectorAll('#zoom-autofollow-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Ken Burns toggle
    document.querySelectorAll('#zoom-kenburns-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            kenBurnsEnabled = (e.target.dataset.value === 'on');
            document.querySelectorAll('#zoom-kenburns-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('kenburns-speed-group').style.display = kenBurnsEnabled ? '' : 'none';
            if (kenBurnsEnabled) {
                // Save current view and start KB from matching zoom to avoid jump
                preKBZoom = vidZoom;
                preKBPanX = vidPanX;
                preKBPanY = vidPanY;
                let range = Math.max(kenBurnsMaxZoom - kenBurnsMinZoom, 0.01);
                let normZ = constrain((vidZoom - kenBurnsMinZoom) / range, 0, 1);
                kenBurnsTime = Math.asin(constrain(normZ * 2 - 1, -0.99, 0.99)) / 0.5;
                kenBurnsReturning = false;
            } else {
                // Smooth return to original view
                kenBurnsReturning = true;
            }
        });
    });
    // Ken Burns speed
    const kbSpeedSlider = document.getElementById('slider-kb-speed');
    const kbSpeedInput = document.getElementById('val-kb-speed');
    if (kbSpeedSlider) {
        kbSpeedSlider.addEventListener('input', (e) => { kenBurnsSpeed = parseFloat(e.target.value); kbSpeedInput.value = e.target.value; });
        kbSpeedInput.addEventListener('input', (e) => { kenBurnsSpeed = parseFloat(e.target.value) || 0.3; kbSpeedSlider.value = kenBurnsSpeed; });
        kbSpeedInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Ken Burns min zoom
    const kbMinSlider = document.getElementById('slider-kb-min');
    const kbMinInput = document.getElementById('val-kb-min');
    if (kbMinSlider) {
        kbMinSlider.addEventListener('input', (e) => {
            kenBurnsMinZoom = Math.min(parseFloat(e.target.value), kenBurnsMaxZoom - 0.1);
            kbMinInput.value = kenBurnsMinZoom.toFixed(1); kbMinSlider.value = kenBurnsMinZoom;
        });
        kbMinInput.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value) || 1.0;
            kenBurnsMinZoom = Math.min(v, kenBurnsMaxZoom - 0.1);
            kbMinSlider.value = kenBurnsMinZoom;
        });
        kbMinInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Ken Burns max zoom
    const kbMaxSlider = document.getElementById('slider-kb-max');
    const kbMaxInput = document.getElementById('val-kb-max');
    if (kbMaxSlider) {
        kbMaxSlider.addEventListener('input', (e) => {
            kenBurnsMaxZoom = Math.max(parseFloat(e.target.value), kenBurnsMinZoom + 0.1);
            kbMaxInput.value = kenBurnsMaxZoom.toFixed(1); kbMaxSlider.value = kenBurnsMaxZoom;
        });
        kbMaxInput.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value) || 2.5;
            kenBurnsMaxZoom = Math.max(v, kenBurnsMinZoom + 0.1);
            kbMaxSlider.value = kenBurnsMaxZoom;
        });
        kbMaxInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Ken Burns pan amount
    const kbPanSlider = document.getElementById('slider-kb-pan');
    const kbPanInput = document.getElementById('val-kb-pan');
    if (kbPanSlider) {
        kbPanSlider.addEventListener('input', (e) => { kenBurnsPanAmt = parseFloat(e.target.value); kbPanInput.value = e.target.value; });
        kbPanInput.addEventListener('input', (e) => { kenBurnsPanAmt = parseFloat(e.target.value) || 0.15; kbPanSlider.value = kenBurnsPanAmt; });
        kbPanInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Split zoom toggle
    document.querySelectorAll('#zoom-split-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            splitZoomEnabled = (e.target.dataset.value === 'on');
            document.querySelectorAll('#zoom-split-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('split-zoom-group').style.display = splitZoomEnabled ? '' : 'none';
            let sideRow = document.getElementById('fx-split-side-row');
            if (sideRow) sideRow.style.display = splitZoomEnabled ? '' : 'none';
        });
    });
    // Split zoom level
    const splitZoomSlider = document.getElementById('slider-split-zoom');
    const splitZoomInput = document.getElementById('val-split-zoom');
    if (splitZoomSlider) {
        splitZoomSlider.addEventListener('input', (e) => { splitZoomLevel = parseFloat(e.target.value); splitZoomInput.value = e.target.value; });
        splitZoomInput.addEventListener('input', (e) => { splitZoomLevel = parseFloat(e.target.value) || 3; splitZoomSlider.value = splitZoomLevel; });
        splitZoomInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Split FX toggle
    document.querySelectorAll('#split-fx-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            splitFxEnabled = (e.target.dataset.value === 'on');
            document.querySelectorAll('#split-fx-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Split position slider
    const splitPosSlider = document.getElementById('slider-split-pos');
    const splitPosInput = document.getElementById('val-split-pos');
    if (splitPosSlider) {
        splitPosSlider.addEventListener('input', (e) => { splitPosition = parseFloat(e.target.value); splitPosInput.value = e.target.value; });
        splitPosInput.addEventListener('input', (e) => { splitPosition = parseFloat(e.target.value) || 50; splitPosSlider.value = splitPosition; });
        splitPosInput.addEventListener('keydown', (e) => e.stopPropagation());
    }
    // Split mirror toggle
    document.querySelectorAll('#split-mirror-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            splitMirrorFlip = (e.target.dataset.value === 'on');
            document.querySelectorAll('#split-mirror-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Split Zoom Viz toggle
    document.querySelectorAll('#split-viz-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            splitVizZoom = (e.target.dataset.value === 'on');
            document.querySelectorAll('#split-viz-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Split shape selector
    document.querySelectorAll('#split-shape-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            splitShape = e.target.dataset.value;
            document.querySelectorAll('#split-shape-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // Depth blur toggle
    document.querySelectorAll('#zoom-depth-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            depthBlurEnabled = (e.target.dataset.value === 'on');
            document.querySelectorAll('#zoom-depth-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    // PiP map toggle
    document.querySelectorAll('#zoom-pip-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            pipEnabled = (e.target.dataset.value === 'on');
            document.querySelectorAll('#zoom-pip-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Line color picker
    const lineColorPicker = document.getElementById('line-color-picker');
    const lineColorHex = document.getElementById('line-color-hex');
    lineColorPicker.addEventListener('input', (e) => { lineColor = e.target.value; lineColorHex.value = e.target.value; });
    lineColorHex.addEventListener('input', (e) => {
        let v = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { lineColor = v; lineColorPicker.value = v; }
    });
    lineColorHex.addEventListener('keydown', (e) => e.stopPropagation());

    // Line weight
    const lineWeightSlider = document.getElementById('slider-line-weight');
    const lineWeightInput = document.getElementById('val-line-weight');
    lineWeightSlider.addEventListener('input', (e) => { lineWeight = parseFloat(e.target.value); lineWeightInput.value = e.target.value; });
    lineWeightInput.addEventListener('input', (e) => { lineWeight = parseFloat(e.target.value) || 1; lineWeightSlider.value = lineWeight; });
    lineWeightInput.addEventListener('keydown', (e) => e.stopPropagation());

    // Line style (curved/straight)
    document.querySelectorAll('#line-style-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            lineStraight = (e.target.dataset.value === 'straight');
            document.querySelectorAll('#line-style-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Line dashed toggle
    const lineDashedCb = document.getElementById('line-dashed');
    if (lineDashedCb) lineDashedCb.addEventListener('change', (e) => { lineDashed = e.target.checked; });

    // Connection mode (chain/hub/web)
    document.querySelectorAll('#connection-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            connectionMode = e.target.dataset.value;
            document.querySelectorAll('#connection-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Blob style selector (in Visualize tab of left panel)
    document.querySelectorAll('#blob-style-buttons-main .selector-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            blobStyle = e.target.dataset.value;
            if (blobStyle !== 'particle') _blobParticles.length = 0;
            document.querySelectorAll('#blob-style-buttons-main .selector-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
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

    // iOS Safari fix: file inputs inside CSS-transformed containers (bottom sheet)
    // don't open the file picker. Move input to <body> on mobile and proxy clicks.
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        const fileInput = ui.fileInput;
        const label = document.getElementById('file-input-container');
        // Move input to body (outside any transform)
        document.body.appendChild(fileInput);
        fileInput.style.cssText = 'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none;';
        // Tap on label → open file picker via the body-level input
        label.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
    }

    // Prevent panel scroll while dragging sliders (delegated for dynamic sliders too)
    const _clearSliderActive = () => {
        document.querySelectorAll('.panel.slider-active').forEach(p => p.classList.remove('slider-active'));
    };
    document.addEventListener('pointerdown', (e) => {
        if (e.target.matches('.panel input[type="range"], .panel input[type="range"] *')) {
            const panel = e.target.closest('.panel');
            if (panel) panel.classList.add('slider-active');
        }
    });
    document.addEventListener('pointerup', _clearSliderActive);
    document.addEventListener('pointercancel', _clearSliderActive);
    document.addEventListener('lostpointercapture', _clearSliderActive);
    window.addEventListener('blur', _clearSliderActive);

    // Live slider tooltip (shows value above thumb during drag)
    const sliderTooltip = document.getElementById('slider-tooltip');
    if (sliderTooltip) {
        document.addEventListener('input', (e) => {
            if (!e.target.matches('input[type="range"]')) return;
            let rect = e.target.getBoundingClientRect();
            let ratio = (e.target.value - e.target.min) / (e.target.max - e.target.min);
            let thumbX = rect.left + ratio * rect.width;
            let thumbY = rect.top;
            sliderTooltip.textContent = parseFloat(e.target.value).toFixed(e.target.step && e.target.step < 1 ? 1 : 0);
            sliderTooltip.style.left = thumbX + 'px';
            sliderTooltip.style.top = thumbY + 'px';
            sliderTooltip.style.display = 'block';
        });
        let hideTooltip = () => { if (sliderTooltip) sliderTooltip.style.display = 'none'; };
        document.addEventListener('pointerup', hideTooltip);
        document.addEventListener('pointercancel', hideTooltip);
    }

    // Audio source selector (FILE / MIC / VIDEO)
    document.querySelectorAll('#audio-source-buttons .selector-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.value;
            const fileUpload = document.getElementById('audio-file-upload');
            const hintEl = document.getElementById('audio-source-hint');

            // Deactivate all source buttons
            document.querySelectorAll('#audio-source-buttons .selector-btn').forEach(b => b.classList.remove('active'));

            if (val === 'file') {
                // Stop other sources
                if (typeof micActive !== 'undefined' && micActive && typeof stopMicrophone === 'function') stopMicrophone();
                if (typeof videoAudioActive !== 'undefined' && videoAudioActive && typeof stopVideoAudio === 'function') stopVideoAudio();
                // Show file upload area
                if (fileUpload) fileUpload.style.display = '';
                btn.classList.add('active');
                if (hintEl) hintEl.textContent = 'Upload an audio file (mp3, wav, ogg)';
            } else if (val === 'mic') {
                if (fileUpload) fileUpload.style.display = 'none';
                if (typeof toggleMicrophone === 'function') {
                    if (typeof micActive !== 'undefined' && micActive) {
                        stopMicrophone();
                    } else {
                        startMicrophone();
                        btn.classList.add('active');
                    }
                }
                if (hintEl) hintEl.textContent = 'Live microphone input for audio reactivity';
            } else if (val === 'video') {
                if (fileUpload) fileUpload.style.display = 'none';
                if (typeof toggleVideoAudio === 'function') {
                    if (typeof videoAudioActive !== 'undefined' && videoAudioActive) {
                        stopVideoAudio();
                    } else {
                        startVideoAudio();
                        btn.classList.add('active');
                    }
                }
                if (hintEl) hintEl.textContent = 'Use the loaded video\'s original audio track';
            }
        });
    });

    // Top bar transport buttons (sole transport controls)
    const tbPlay = document.getElementById('tb-play');
    const tbRestart = document.getElementById('tb-restart');
    const tbRecord = document.getElementById('tb-record');
    const tbSave = document.getElementById('tb-save');
    const tbPhoto = document.getElementById('tb-photo');
    if (tbPlay) tbPlay.addEventListener('click', togglePlay);
    if (tbRestart) tbRestart.addEventListener('click', restartVideo);
    if (tbRecord) tbRecord.addEventListener('click', toggleRecording);
    if (tbSave) tbSave.addEventListener('click', saveRecording);
    if (tbPhoto) tbPhoto.addEventListener('click', saveScreenshot);

    // Cross-link navigation between panels
    let linkToCamera = document.getElementById('link-to-camera');
    if (linkToCamera) linkToCamera.addEventListener('click', () => {
        // Switch to Create section where camera controls live
        switchSection('create');
    });
    let linkToZoom = document.getElementById('link-to-zoom');
    if (linkToZoom) linkToZoom.addEventListener('click', () => {
        let zp = document.getElementById('zoom-options-panel');
        if (zp) {
            zp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            zp.classList.add('highlight-pulse');
            setTimeout(() => zp.classList.remove('highlight-pulse'), 600);
        }
    });

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
            ui.tlContainer.style.left = ui.uiControls.classList.contains('collapsed') ? '24px' : '358px';
        }
    });

    ui.toggleBtnRight.addEventListener('click', () => {
        ui.uiControlsRight.classList.toggle('collapsed');
        ui.toggleBtnRight.classList.toggle('rotated');
        if (ui.tlContainer) {
            ui.tlContainer.style.right = ui.uiControlsRight.classList.contains('collapsed') ? '24px' : '358px';
        }
    });

    // Help + Settings buttons (panel + top bar)
    document.getElementById('help-btn').addEventListener('click', toggleHelp);
    let tbHelpBtn = document.getElementById('tb-help-btn');
    if (tbHelpBtn) tbHelpBtn.addEventListener('click', toggleHelp);
    let tbSettingsBtn = document.getElementById('tb-settings-btn');
    if (tbSettingsBtn) tbSettingsBtn.addEventListener('click', toggleSettings);
    document.getElementById('help-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'help-overlay') toggleHelp();
    });
    let helpCloseBtn = document.getElementById('help-close-btn');
    if (helpCloseBtn) helpCloseBtn.addEventListener('click', toggleHelp);

    // File inputs now cover their full containers (no programmatic .click() — works on iOS Safari)

    // Keyboard support for toggle button
    let toggleBtn = document.getElementById('toggle-btn');
    if (toggleBtn) toggleBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBtn.click(); }
    });

    // Hints toggle — hints hidden by default, toggle shows them
    const hintsBtn = document.getElementById('hints-btn');
    if (hintsBtn) {
        const hintsOn = localStorage.getItem('blobfx-hints') === 'on';
        if (hintsOn) {
            document.body.classList.add('hints-on');
            hintsBtn.classList.add('active');
        }
        hintsBtn.addEventListener('click', () => {
            const isOn = document.body.classList.toggle('hints-on');
            hintsBtn.classList.toggle('active', isOn);
            localStorage.setItem('blobfx-hints', isOn ? 'on' : 'off');
        });
    }

    // Accessibility: auto-label all range sliders from nearest label text
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        if (slider.getAttribute('aria-label')) return;
        // Check parent wrapper's previous sibling label
        let wrapper = slider.closest('.slider-wrapper, .tl-sync-row');
        let label = wrapper ? wrapper.previousElementSibling : null;
        if (!label || label.tagName !== 'LABEL') {
            // Try direct previous sibling
            label = slider.previousElementSibling;
        }
        if (!label || label.tagName !== 'LABEL') {
            // Try parent label
            label = slider.closest('label');
        }
        if (label) {
            let txt = label.textContent.replace(/[\d.]+$/, '').trim();
            if (txt) slider.setAttribute('aria-label', txt);
        }
    });
}

// ── STATE UPDATE ──────────────────────────

function updateButtonStates() {

    ui.modeButtons.forEach(btn => {
        if (parseInt(btn.dataset.value) === currentMode) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Sync tracking toggle with current mode
    const trackingToggle = document.getElementById('tracking-toggle');
    if (trackingToggle) trackingToggle.checked = currentMode > 0;
    // Sync tracking body visibility
    const trackingBody = document.getElementById('tracking-body');
    const blobParamsSection = document.querySelector('section[aria-label="Blob parameters"]');
    if (trackingBody) trackingBody.classList.toggle('tracking-off', currentMode === 0);
    if (blobParamsSection) blobParamsSection.style.display = currentMode === 0 ? 'none' : '';
    // Auto-switch tracking tab ONLY when mode changes (not on every call)
    // Respects user's manual tab selection — only overrides when they pick a new mode
    if (currentMode > 0 && !window._trackTabUserSelected) {
        if (window._trackTabLastMode !== currentMode) {
            window._trackTabLastMode = currentMode;
            const analysisModes = [3,6,7,8,9,12,4];
            const aiModes = [14,15,16,17];
            let targetTab = 'color';
            if (analysisModes.includes(currentMode)) targetTab = 'analysis';
            else if (aiModes.includes(currentMode)) targetTab = 'ai';
            document.querySelectorAll('.tracking-tab').forEach(t => {
                const isActive = t.dataset.trackTab === targetTab;
                t.classList.toggle('active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            document.querySelectorAll('.tracking-tab-content').forEach(p => {
                p.classList.toggle('active', p.dataset.trackTab === targetTab);
            });
        }
    }

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

    // Face tracking controls visibility
    const isFaceMode = currentMode >= 15 && currentMode <= 17;
    document.getElementById('face-controls-group').style.display = isFaceMode ? '' : 'none';
    if (isFaceMode) {
        let fStatusEl = document.getElementById('face-status');
        let fHintEl = document.getElementById('face-hint');
        if (window.mpFaceInitError) {
            fStatusEl.textContent = 'ERROR';
            fStatusEl.style.color = '#E17055';
            document.getElementById('face-loading').style.display = '';
            fHintEl.textContent = window.mpFaceInitError;
        } else if (!window.mpFaceLandmarkerReady) {
            fStatusEl.textContent = 'LOADING';
            fStatusEl.style.color = '#FDCB6E';
            document.getElementById('face-loading').style.display = '';
            fHintEl.textContent = 'Loading face detection model...';
        } else if (faceLandmarkCache && faceLandmarkCache.length > 0) {
            fStatusEl.textContent = faceLandmarkCache.length + ' FACE' + (faceLandmarkCache.length > 1 ? 'S' : '');
            fStatusEl.style.color = '#00B894';
            fHintEl.textContent = currentMode === 15 ? 'Tracking eye landmarks' :
                                  currentMode === 16 ? 'Tracking lip landmarks' : 'Tracking full face mesh';
        } else {
            fStatusEl.textContent = 'NO FACE';
            fStatusEl.style.color = '#E17055';
            fHintEl.textContent = 'Point camera or video at a face';
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

    // Disabled states
    if (ui.btnSave) ui.btnSave.disabled = !lastRecordedBlob;
    if (ui.btnPhoto) ui.btnPhoto.disabled = !videoLoaded && !usingWebcam;

    // Contextual param dimming
    const colorModes = new Set([1, 2, 5, 10, 11, 13]);
    let g1 = document.getElementById('group-1');
    if (g1) g1.classList.toggle('param-dimmed', !colorModes.has(currentMode));

    // Sync layer panel
    if (typeof updateLayerStates === 'function') updateLayerStates();
}

// ── LAYER PERSISTENCE ──────────────────────
function saveLayerState() {
    try {
        localStorage.setItem('blobfx-layers', JSON.stringify({
            blobsVisible, blobsOpacity, fxMasterOpacity,
            maskOverlayVisible, beatFlashVisible
        }));
    } catch(e) {}
}
function restoreLayerState() {
    try {
        const s = JSON.parse(localStorage.getItem('blobfx-layers'));
        if (s) {
            if (typeof s.blobsVisible === 'boolean') blobsVisible = s.blobsVisible;
            if (typeof s.blobsOpacity === 'number') blobsOpacity = s.blobsOpacity;
            if (typeof s.fxMasterOpacity === 'number') fxMasterOpacity = s.fxMasterOpacity;
            if (typeof s.maskOverlayVisible === 'boolean') maskOverlayVisible = s.maskOverlayVisible;
            if (typeof s.beatFlashVisible === 'boolean') beatFlashVisible = s.beatFlashVisible;
        }
    } catch(e) {}
}

// ── TOP BAR STATUS (throttled — only updates DOM on value change) ──────────────────────
let _tbPrev = { fps: -1, src: '', mode: -1, fxCount: -1, recSec: -1, hasSource: null };
let _tbEls = null;
function _getTbEls() {
    if (_tbEls) return _tbEls;
    _tbEls = {
        fps: document.getElementById('tb-fps'),
        src: document.getElementById('tb-source'),
        mode: document.getElementById('tb-mode'),
        fxBadge: document.getElementById('tb-fx-badge'),
        recIndicator: document.getElementById('tb-rec-indicator'),
        recTime: document.getElementById('tb-rec-time'),
        empty: document.getElementById('canvas-empty-state'),
    };
    return _tbEls;
}
function updateTopBar() {
    let el = _getTbEls();
    // FPS — update every 10 frames to reduce DOM writes
    if (el.fps) {
        let hasSource = usingWebcam || videoLoaded;
        if (!hasSource) {
            if (_tbPrev.fps !== -2) { el.fps.textContent = ''; _tbPrev.fps = -2; }
        } else {
            let fps = Math.round(frameRate());
            if (fps !== _tbPrev.fps) {
                _tbPrev.fps = fps;
                el.fps.textContent = fps + ' FPS' + (_adaptiveQuality > 0 ? ' ⚡' : '');
                el.fps.className = 'tb-status tb-fps ' + (fps >= 30 ? 'good' : fps >= 15 ? 'warn' : 'bad');
            }
            // Adaptive quality: auto-reduce when sustained low FPS on mobile
            if (_isMobileDevice && videoPlaying) {
                if (fps < _LOW_FPS_THRESHOLD) {
                    _lowFpsCount++;
                    if (_lowFpsCount >= _LOW_FPS_TRIGGER && _adaptiveQuality < 2) {
                        _adaptiveQuality++;
                        _lowFpsCount = 0;
                        if (_adaptiveQuality === 2 && _canvasBaseW > 0) {
                            // Level 2: reduce canvas resolution by 25%
                            let newW = Math.round(_canvasBaseW * 0.75);
                            let newH = Math.round(_canvasBaseH * 0.75);
                            resizeCanvas(newW, newH);
                            _canvasBaseW = newW; _canvasBaseH = newH;
                        }
                        console.log('[Adaptive] Quality reduced to level', _adaptiveQuality);
                    }
                } else {
                    _lowFpsCount = Math.max(0, _lowFpsCount - 2); // recover slowly
                }
            }
        }
    }
    // Source
    if (el.src) {
        let srcKey = usingWebcam ? 'WEBCAM' : videoLoaded ? 'VIDEO' : 'NO SOURCE';
        if (srcKey !== _tbPrev.src) {
            _tbPrev.src = srcKey;
            el.src.textContent = srcKey;
            el.src.classList.toggle('active', srcKey !== 'NO SOURCE');
            el.src.classList.toggle('no-source', srcKey === 'NO SOURCE');
        }
    }
    // Canvas empty state
    let hasSource = videoLoaded || usingWebcam;
    if (hasSource !== _tbPrev.hasSource) {
        _tbPrev.hasSource = hasSource;
        if (el.empty) el.empty.classList.toggle('hidden', hasSource);
    }
    // Mode
    if (el.mode && currentMode !== _tbPrev.mode) {
        _tbPrev.mode = currentMode;
        el.mode.textContent = MODE_NAMES[currentMode] || 'OFF';
        el.mode.classList.toggle('active', currentMode > 0);
    }
    // FX badge
    if (el.fxBadge) {
        let count = activeEffects ? activeEffects.size : 0;
        if (count !== _tbPrev.fxCount) {
            _tbPrev.fxCount = count;
            el.fxBadge.textContent = count > 0 ? count + ' FX' : '';
        }
    }
    // Recording indicator
    if (el.recIndicator && el.recTime) {
        if (isRecording) {
            let elapsed = Math.floor((millis() - recordingStartTime) / 1000);
            if (elapsed !== _tbPrev.recSec) {
                _tbPrev.recSec = elapsed;
                let m = Math.floor(elapsed / 60);
                let s = elapsed % 60;
                el.recTime.textContent = 'REC ' + m + ':' + String(s).padStart(2, '0');
            }
            if (_tbPrev.recSec === -1 || !el.recIndicator.classList.contains('active')) {
                el.recIndicator.classList.add('active');
            }
        } else if (_tbPrev.recSec !== -1) {
            _tbPrev.recSec = -1;
            el.recIndicator.classList.remove('active');
            el.recTime.textContent = '';
        }
    }
    // Save button disabled state in top bar
    let tbSave = document.getElementById('tb-save');
    if (tbSave) tbSave.disabled = !lastRecordedBlob;
}

function updateFxParamVisibility() {
    // In Effecto UI: show params for the currently viewed effect (one at a time)
    if (typeof showFxParams === 'function' && currentViewedEffect) {
        showFxParams(currentViewedEffect);
    }
}

function updateEffectCardStates() {
    // Update tab active indicators (dot + count)
    const catCounts = { color: 0, distortion: 0, pattern: 0, overlay: 0 };
    activeEffects.forEach(name => {
        let cat = FX_CATEGORIES[name];
        if (cat) catCounts[cat]++;
    });
    document.querySelectorAll('.fx-tab').forEach(tab => {
        let cat = tab.dataset.cat;
        tab.classList.toggle('has-active', catCounts[cat] > 0);
        let badge = tab.querySelector('.tab-count');
        if (badge) badge.textContent = catCounts[cat] > 0 ? catCounts[cat] : '';
    });
    // Update dropdown markers
    let sel = document.getElementById('fx-effect-select');
    if (sel) {
        Array.from(sel.options).forEach(opt => {
            let name = opt.value;
            let cfg = FX_UI_CONFIG[name];
            let prefix = activeEffects.has(name) ? '\u2022 ' : '  ';
            opt.textContent = prefix + (cfg ? cfg.label : name.toUpperCase());
        });
    }
    // Update ON/OFF button
    if (typeof updateFxOnButton === 'function') updateFxOnButton();
}

// ── HELP OVERLAY ─────────────────────────

let _helpVisible = false;
let _settingsVisible = false;

function toggleHelp() {
    _helpVisible = !_helpVisible;
    document.getElementById('help-overlay').classList.toggle('visible', _helpVisible);
}

function toggleSettings() {
    _settingsVisible = !_settingsVisible;
    let overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.toggle('visible', _settingsVisible);
}

function updateEmptyHint() {
    let hint = document.getElementById('tl-empty-hint');
    if (hint) hint.classList.toggle('hidden', timelineSegments.length > 0);
}

// ── PLAYBACK ──────────────────────────────

const _playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
const _pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
function syncPlayIcon(playing) {
    let icon = playing ? _pauseIcon : _playIcon;
    if (ui.btnPlay) ui.btnPlay.innerHTML = icon;
    let tbPlay = document.getElementById('tb-play');
    if (tbPlay) tbPlay.innerHTML = icon;
    if (ui.tlBtnPlay) ui.tlBtnPlay.innerHTML = icon;
}

function togglePlay() {
    if (videoEl && videoLoaded) {
        // Webcam mode: spacebar toggles audio only (webcam stream stays live)
        if (usingWebcam) {
            if (audioElement && audioLoaded) {
                if (audioPlaying) { audioElement.pause(); audioPlaying = false; }
                else { audioElement.play().catch(() => { audioPlaying = false; }); audioPlaying = true; }
            }
            return;
        }
        // Video mode: toggle video + audio
        videoPlaying = !videoPlaying;
        if (videoPlaying) {
             videoEl.elt.loop = (loopMode === 'loop' || loopMode === 'through');
             if (_isMobileDevice) frameRate(60); // restore full frame rate on play
             let playPromise = videoEl.elt.play();
             if (playPromise) {
                 playPromise.catch(() => {
                     videoPlaying = false;
                     syncPlayIcon(false);
                 });
             }
             syncPlayIcon(true);
             if (typeof syncOverlayPlayback === 'function') syncOverlayPlayback(true);
             if (audioElement && audioLoaded) {
                 let audioTime = getAudioTimeForVideo(videoEl.time());
                 if (audioTime >= 0) {
                     audioElement.currentTime = audioTime;
                     audioElement.play().then(() => { audioPlaying = true; }).catch(() => { audioPlaying = false; });
                 }
             }
        } else {
             videoEl.elt.pause();
             syncPlayIcon(false);
             if (typeof syncOverlayPlayback === 'function') syncOverlayPlayback(false);
             if (audioElement && audioLoaded) { audioElement.pause(); audioPlaying = false; }
             // Reduce frame rate when paused on mobile (battery savings)
             if (_isMobileDevice) frameRate(10);
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
    // Show baseline values (user's intended settings) in sliders, not audio/timeline-modulated values.
    // Modulated values only affect rendering — UI stays stable.
    let source = (audioSync || (typeof timelineSegments !== 'undefined' && timelineSegments.length > 0))
        ? paramBaseline : paramValues;
    [0, 1, 2, 3, 4, 5, 6, 7].forEach(idx => {
        if(ui.sliders[idx]) {
            let val = source[idx];
            // Only update DOM if value actually changed (avoid slider flicker)
            let curSlider = parseFloat(ui.sliders[idx].value);
            if (Math.abs(curSlider - val) > 0.01) {
                ui.sliders[idx].value = val;
            }
            if (document.activeElement !== ui.inputs[idx]) {
                let displayVal = Number.isInteger(val) ? String(val) : val.toFixed(1);
                if (ui.inputs[idx].value !== displayVal) {
                    ui.inputs[idx].value = displayVal;
                }
            }
        }
    });
    updateButtonStates();
}

let _windowResizeTimer = null;
let _isMobileDevice = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
let _adaptiveQuality = 0;       // 0=full, 1=reduced CPU effects, 2=reduced resolution
let _lowFpsCount = 0;           // consecutive low-FPS frames
const _LOW_FPS_THRESHOLD = 25;  // below this = "low"
const _LOW_FPS_TRIGGER = 90;    // frames of sustained low FPS before adapting
let _canvasBaseW = 0;  // fixed canvas resolution on mobile
let _canvasBaseH = 0;

function windowResized() {
    // iOS Safari reports pre-rotation dimensions for ~200ms after orientation change
    if (_windowResizeTimer) clearTimeout(_windowResizeTimer);
    _windowResizeTimer = setTimeout(() => {
        if (_isMobileDevice && _canvasBaseW > 0) {
            // Mobile: CSS scale the existing canvas instead of resizing (WebKit memory leak fix)
            let scaleX = windowWidth / _canvasBaseW;
            let scaleY = windowHeight / _canvasBaseH;
            let scale = Math.min(scaleX, scaleY);
            if (p5Canvas) {
                p5Canvas.style.transformOrigin = 'top left';
                p5Canvas.style.transform = `scale(${scale})`;
                p5Canvas.style.width = _canvasBaseW + 'px';
                p5Canvas.style.height = _canvasBaseH + 'px';
            }
        } else {
            // Desktop: resize normally
            pixelDensity(1); resizeCanvas(windowWidth, windowHeight);
        }
        // Update cached timeline height on resize
        let tlEl = document.getElementById('timeline-container');
        window._cachedTimelineHeight = (tlEl && !tlEl.classList.contains('hidden')) ? tlEl.offsetHeight : 0;
    }, _isMobileDevice ? 200 : 0);
}

// ── FILE / WEBCAM HANDLERS ────────────────

function toggleWebcam() {
    if (usingWebcam) {
        stopWebcam();
    } else {
        startWebcam();
    }
}

let _currentFacingMode = 'user'; // user (front) or environment (back)
let _webcamRetried = false;      // prevents infinite retry loop on camera error

function flipCamera() {
    if (!usingWebcam) return;
    _currentFacingMode = _currentFacingMode === 'user' ? 'environment' : 'user';
    startWebcam(null, _currentFacingMode);
}

function startWebcam(deviceId, facingMode) {
    // Stop video audio if active (switching away from file video)
    if (typeof videoAudioActive !== 'undefined' && videoAudioActive && typeof stopVideoAudio === 'function') stopVideoAudio();
    if (typeof _videoAudioSource !== 'undefined') _videoAudioSource = null;
    const vab = document.getElementById('audio-src-video');
    if (vab) { vab.disabled = true; vab.classList.remove('active'); }
    if (videoEl) {
        // Stop all tracks before switching (required for iOS)
        if (videoEl.elt && videoEl.elt.srcObject) {
            videoEl.elt.srcObject.getTracks().forEach(t => t.stop());
        }
        videoEl.remove(); videoEl = null;
    }
    usingWebcam = true;
    videoLoaded = false;
    videoDuration = 0;
    hideTimeline();
    ui.webcamBtn.classList.add('active');
    ui.fileName.innerText = 'webcam active';
    currentMode = 1; _userMode = 1;

    // Build constraints: deviceId > facingMode > default
    const savedDevice = deviceId || localStorage.getItem('hod-camera-device') || undefined;
    let constraints;
    if (savedDevice) {
        constraints = { video: { deviceId: { exact: savedDevice } } };
    } else if (facingMode) {
        constraints = { video: { facingMode: facingMode } }; // loose, not exact (iOS compat)
    } else {
        constraints = VIDEO;
    }

    videoEl = createCapture(constraints, () => {
        videoEl.hide();
        videoLoaded = true;
        videoPlaying = true;
        updateButtonStates();
        syncPlayIcon(true);
        // Update facing mode from actual stream track settings
        if (videoEl.elt && videoEl.elt.srcObject) {
            let track = videoEl.elt.srcObject.getVideoTracks()[0];
            if (track) {
                let facing = track.getSettings().facingMode;
                if (facing === 'user' || facing === 'environment') _currentFacingMode = facing;
                else if (!deviceId && !facingMode) _currentFacingMode = 'user'; // default built-in
            }
        }
        // Populate device selector after permission is granted
        populateCameraDevices();
        let flipBtn = document.getElementById('btn-flip-camera');
        if (flipBtn) flipBtn.style.display = '';
    });
    // Handle webcam permission denial / errors — fallback to default camera
    if (videoEl && videoEl.elt) {
        videoEl.elt.addEventListener('error', () => {
            // If using a saved deviceId that's stale, retry without it
            if (savedDevice && !_webcamRetried) {
                _webcamRetried = true;
                localStorage.removeItem('hod-camera-device');
                console.warn('[Camera] Saved device failed, retrying with default');
                startWebcam(null, null);
                return;
            }
            _webcamRetried = false;
            usingWebcam = false;
            videoLoaded = false;
            videoPlaying = false;
            ui.webcamBtn.classList.remove('active');
            ui.fileName.innerText = 'webcam failed — check permissions';
            syncPlayIcon(false);
        });
    }
}

function populateCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(devices => {
        const cams = devices.filter(d => d.kind === 'videoinput');
        const row = document.getElementById('camera-device-row');
        if (!row) return;
        if (cams.length < 1) { row.style.display = 'none'; return; }
        row.style.display = '';
        row.innerHTML = '';
        const saved = localStorage.getItem('hod-camera-device');
        // Get current stream's deviceId to mark active
        let activeId = saved;
        if (videoEl && videoEl.elt && videoEl.elt.srcObject) {
            const track = videoEl.elt.srcObject.getVideoTracks()[0];
            if (track) activeId = track.getSettings().deviceId || saved;
        }
        cams.forEach((cam, i) => {
            const btn = document.createElement('button');
            btn.className = 'camera-device-btn' + (cam.deviceId === activeId ? ' active' : '');
            btn.textContent = cam.label || ('Camera ' + (i + 1));
            btn.title = cam.label || ('Camera ' + (i + 1));
            btn.addEventListener('click', () => {
                localStorage.setItem('hod-camera-device', cam.deviceId);
                row.querySelectorAll('.camera-device-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Detect facing mode: front cameras contain 'front'/'facetime'/'user' in label,
                // external/back cameras don't — default to 'environment' (no mirror) for safety
                let label = (cam.label || '').toLowerCase();
                _currentFacingMode = (label.includes('front') || label.includes('facetime') || label.includes('user') || (i === 0 && cams.length <= 2))
                    ? 'user' : 'environment';
                if (usingWebcam) startWebcam(cam.deviceId);
            });
            row.appendChild(btn);
        });
    }).catch(() => {});
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
    let flipBtn = document.getElementById('btn-flip-camera');
    if (flipBtn) flipBtn.style.display = 'none';
    let devRow = document.getElementById('camera-device-row');
    if (devRow) devRow.style.display = 'none';
    ui.webcamBtn.classList.remove('active');
    ui.fileName.innerText = 'mp4 or mov';
    syncPlayIcon(false);
}

function handleFile(event) {
    const _dbg = (msg) => { console.log('[Upload] ' + msg); if (window._uploadDebug) window._uploadDebug(msg); };
    _dbg('handleFile fired');
    const file = event.target.files[0];
    if (!file) { _dbg('no file selected'); return; }
    _dbg('file: ' + file.name + ' type=' + (file.type || '(empty)') + ' size=' + file.size);
    // iOS Safari may report empty file.type — fall back to extension check
    const ext = file.name.split('.').pop().toLowerCase();
    const isVideo = file.type.startsWith('video/') || ['mp4','mov','webm','m4v','avi','mkv','qt'].includes(ext);
    _dbg('ext=' + ext + ' isVideo=' + isVideo);
    if (isVideo) {
        if (usingWebcam) stopWebcam();
        // Stop video audio if active (old video element being replaced)
        if (typeof videoAudioActive !== 'undefined' && videoAudioActive && typeof stopVideoAudio === 'function') {
            stopVideoAudio();
        }
        // Reset video audio source since element is being replaced
        if (typeof _videoAudioSource !== 'undefined') _videoAudioSource = null;
        if (videoEl) { videoEl.stop(); videoEl.remove(); }
        ui.fileName.innerText = file.name;
        ui.fileName.title = file.name;
        if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = URL.createObjectURL(file);
        _dbg('blobURL created: ' + currentVideoUrl.slice(0, 60));
        const url = currentVideoUrl;
        const gen = ++_videoLoadGen;
        const thisUrl = url;

        videoEl = createVideo(url, () => {
            if (gen !== _videoLoadGen) { _dbg('stale callback (gen ' + gen + '), ignoring'); return; }
            _dbg('createVideo callback fired — video ready');
            videoEl.volume(0); videoEl.loop(); videoEl.hide();
            videoLoaded = true; videoPlaying = true;
            // Show first-run overlay (once per user)
            if (!localStorage.getItem('hod-onboarded')) {
                const fro = document.getElementById('first-run-overlay');
                if (fro) fro.style.display = '';
            }
            // Enable video audio source button
            const vab = document.getElementById('audio-src-video');
            if (vab) vab.disabled = false;
            // Don't auto-enable tracking — user must turn it on explicitly
            if (currentMode === 0) { /* keep off */ }
            updateButtonStates();
            syncPlayIcon(true);
            // Remove previous timeupdate listener from ANY previous video element
            if (window._timeupdateHandler) {
                if (window._timeupdateVideoEl) {
                    window._timeupdateVideoEl.removeEventListener('timeupdate', window._timeupdateHandler);
                }
                if (videoEl.elt !== window._timeupdateVideoEl) {
                    videoEl.elt.removeEventListener('timeupdate', window._timeupdateHandler);
                }
            }
            // Keep audio in sync with video — handles offset and loop modes
            window._timeupdateHandler = () => {
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
                        syncPlayIcon(false);
                    }
                }
            };
            videoEl.elt.addEventListener('timeupdate', window._timeupdateHandler);
            window._timeupdateVideoEl = videoEl.elt;
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
        _dbg('createVideo called, waiting for callback...');
        // iOS Safari: set playsinline + muted, then force play().
        // iOS won't buffer to canplaythrough for large files — it suspends.
        // Calling .play() from a user gesture (file input change) forces iOS to load.
        // We also listen for loadeddata as a fallback trigger if canplaythrough never fires.
        if (videoEl && videoEl.elt) {
            videoEl.elt.setAttribute('playsinline', '');
            videoEl.elt.setAttribute('webkit-playsinline', '');
            videoEl.elt.muted = true;
            _dbg('set playsinline+muted');
            // iOS fallback: if canplaythrough never fires, use loadeddata
            let _iosFallbackDone = false;
            videoEl.elt.addEventListener('loadeddata', () => {
                _dbg('loadeddata fired');
                if (gen !== _videoLoadGen) return;
                if (_iosFallbackDone || videoLoaded) return;
                _iosFallbackDone = true;
                _dbg('iOS fallback: triggering play from loadeddata');
                videoEl.elt.play().then(() => {
                    _dbg('play() succeeded');
                }).catch(err => {
                    _dbg('play() failed: ' + err.message);
                });
            }, { once: true });
            // Force play from user gesture context — this is the key iOS fix
            videoEl.elt.play().then(() => {
                _dbg('initial play() succeeded');
            }).catch(err => {
                _dbg('initial play() rejected: ' + err.message + ' (expected, will retry on loadeddata)');
            });
        }
        // Handle video load errors (unsupported format, corrupt file)
        if (videoEl && videoEl.elt) {
            videoEl.elt.addEventListener('error', (e) => {
                if (gen !== _videoLoadGen) return;
                const err = videoEl.elt.error;
                _dbg('VIDEO ERROR: code=' + (err?.code || '?') + ' msg=' + (err?.message || 'none'));
                videoLoaded = false; videoPlaying = false;
                ui.fileName.innerText = 'video failed to load';
                syncPlayIcon(false);
                if (currentVideoUrl === thisUrl) { URL.revokeObjectURL(currentVideoUrl); currentVideoUrl = null; }
            }, { once: true });
            // iOS: track intermediate load events
            videoEl.elt.addEventListener('loadstart', () => _dbg('loadstart'), { once: true });
            videoEl.elt.addEventListener('loadeddata', () => _dbg('loadeddata'), { once: true });
            videoEl.elt.addEventListener('canplay', () => _dbg('canplay'), { once: true });
            videoEl.elt.addEventListener('canplaythrough', () => _dbg('canplaythrough'), { once: true });
            videoEl.elt.addEventListener('stalled', () => _dbg('stalled'), { once: true });
            videoEl.elt.addEventListener('suspend', () => _dbg('suspend'), { once: true });
        } else {
            _dbg('WARNING: createVideo returned null or no .elt');
        }
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
    paramBaseline[currentParam] = newVal;
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
    // Use original video resolution for recording (sharp output)
    let pd = pixelDensity();
    let srcW = videoEl ? (videoEl.videoWidth || videoEl.width) : 0;
    let srcH = videoEl ? (videoEl.videoHeight || videoEl.height) : 0;
    let dispW = Math.round(videoW * pd);
    let dispH = Math.round(videoH * pd);
    // Use original video res if available, otherwise display res
    let recW = srcW > 0 ? srcW : dispW;
    let recH = srcH > 0 ? srcH : dispH;
    // Codec requires even dimensions
    recW = Math.round(recW / 2) * 2;
    recH = Math.round(recH / 2) * 2;
    recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = recW;
    recordingCanvas.height = recH;
    recordingCtx = recordingCanvas.getContext('2d');
    recordingCtx.imageSmoothingEnabled = true;
    recordingCtx.imageSmoothingQuality = 'high';
    // captureStream(0) = manual frame mode: only captures when requestFrame() is called
    // This syncs perfectly with p5's draw loop — no duplicated or skipped frames
    const canvasStream = recordingCanvas.captureStream(0);
    recordingVideoTrack = canvasStream.getVideoTracks()[0];

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

    // Scale bitrate to resolution: ~30 Mbps for 1080p, ~50 Mbps for 4K
    // Higher multiplier reduces VP9/VP8 quality fluctuation between keyframes
    let pixels = recordingCanvas.width * recordingCanvas.height;
    let bitrate = Math.max(20000000, Math.round(pixels * 16));

    mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        lastRecordedBlob = new Blob(recordedChunks, { type: mimeType });
        lastRecordedExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        recordedChunks = [];
        if (ui.btnSave) ui.btnSave.style.borderColor = '#e5e5e5';
        let tbSaveEl = document.getElementById('tb-save');
        if (tbSaveEl) tbSaveEl.style.borderColor = '#e5e5e5';
    };

    // No timeslice — collect all data on stop to avoid chunk boundary quality drops
    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = millis();
    if (ui.btnRecord) { ui.btnRecord.classList.add('recording'); ui.btnRecord.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg> Stop`; }
    if (ui.tlBtnRecord) { ui.tlBtnRecord.classList.add('recording'); ui.tlBtnRecord.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>`; }
    let tbRec = document.getElementById('tb-record');
    if (tbRec) tbRec.classList.add('recording');
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
    recordingStartTime = 0;
    recordingCanvas = null;
    recordingCtx = null;
    recordingVideoTrack = null;
    if (ui.btnRecord) { ui.btnRecord.classList.remove('recording'); ui.btnRecord.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg> Record`; }
    if (ui.tlBtnRecord) { ui.tlBtnRecord.classList.remove('recording'); ui.tlBtnRecord.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>`; }
    let tbRec = document.getElementById('tb-record');
    if (tbRec) tbRec.classList.remove('recording');
}

function saveRecording() {
    if (!lastRecordedBlob) {
        let tbSave = document.getElementById('tb-save');
        if (tbSave) { tbSave.style.borderColor = '#ff4444'; setTimeout(() => { tbSave.style.borderColor = ''; }, 600); }
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

function keyPressed(event) {
    let e = event instanceof KeyboardEvent ? event : {};
    let tag = document.activeElement.tagName;

    // Spacebar always toggles play/pause regardless of focus — prevent checkboxes/buttons from hijacking it
    if (key === ' ') {
        if (e.preventDefault) e.preventDefault();
        togglePlay();
        return false;
    }

    // Block other keys when typing in inputs
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable) return;

    // Help overlay: ? to toggle, Escape to close
    if (key === '?') { toggleHelp(); return false; }
    if (keyCode === ESCAPE && _helpVisible) { toggleHelp(); return false; }
    if (keyCode === ESCAPE && _settingsVisible) { toggleSettings(); return false; }
    if (keyCode === ESCAPE && window._closeAllDrawers) { window._closeAllDrawers(); return false; }
    // Undo accidental click-to-track color pick
    if (keyCode === ESCAPE && currentMode === 5 && window._prevModeBeforeColorPick != null) {
        currentMode = window._prevModeBeforeColorPick;
        _userMode = window._prevUserModeBeforeColorPick;
        window._prevModeBeforeColorPick = null;
        window._prevUserModeBeforeColorPick = null;
        if (currentMode !== 5) document.getElementById('custom-color-group').style.display = 'none';
        updateButtonStates();
        return false;
    }

    // Block all other keys while help or settings is open
    if (_helpVisible || _settingsVisible) return false;

    let changed = false;

    // Video zoom: [ zoom out, ] zoom in, \ reset
    if (key === ']') {
        let nz = Math.min(8, (zoomSmooth ? zoomTargetLevel : vidZoom) * 1.3);
        if (zoomSmooth) { zoomTargetLevel = nz; } else { vidZoom = nz; zoomTargetLevel = nz; }
        updateZoomUI(); return false;
    }
    if (key === '[') {
        let nz = Math.max(0.25, (zoomSmooth ? zoomTargetLevel : vidZoom) / 1.3);
        if (zoomSmooth) { zoomTargetLevel = nz; } else { vidZoom = nz; zoomTargetLevel = nz; }
        if (nz < 1) { zoomTargetPanX = 0; zoomTargetPanY = 0; if (!zoomSmooth) { vidPanX = 0; vidPanY = 0; } }
        updateZoomUI(); return false;
    }
    if (key === '\\') {
        zoomTargetLevel = 1; zoomTargetPanX = 0; zoomTargetPanY = 0;
        if (!zoomSmooth) { vidZoom = 1; vidPanX = 0; vidPanY = 0; }
        updateZoomUI(); return false;
    }

    // Spacebar handled at top of keyPressed (before input guard)
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

    if ((key === 'z' || key === 'Z' || key === '1') && !e.metaKey && !e.ctrlKey) { exitMaskMode(); currentMode = 1; _userMode = 1; ui.customColorGroup.style.display = 'none'; changed = true; }
    if ((key === 'x' || key === 'X' || key === '2') && !e.metaKey && !e.ctrlKey) { exitMaskMode(); currentMode = 2; _userMode = 2; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '0') { exitMaskMode(); currentMode = 0; _userMode = 0; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '3') { exitMaskMode(); currentMode = 3; _userMode = 3; prevGridPixels = {}; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '4') { exitMaskMode(); currentMode = 4; _userMode = 4; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '5') { exitMaskMode(); currentMode = 5; _userMode = 5; ui.customColorGroup.style.display = ''; changed = true; }
    if (key === '6') { exitMaskMode(); currentMode = 6; _userMode = 6; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '7') { exitMaskMode(); currentMode = 7; _userMode = 7; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '8') { exitMaskMode(); currentMode = 8; _userMode = 8; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === '9') { exitMaskMode(); currentMode = 9; _userMode = 9; ui.customColorGroup.style.display = 'none'; changed = true; }
    if (key === 'm' || key === 'M') { currentMode = 14; _userMode = 14; enterMaskSelecting(); changed = true; }
    // Auto-switch to TRACK tab when mode keys pressed
    if (/^[0-9zxm]$/i.test(key) && !e.metaKey && !e.ctrlKey && changed) switchSection('track');
    if (key === 'l' || key === 'L') { showLines = !showLines; changed = true; }

    if (keyCode === ESCAPE && currentMode === 14) {
        exitMaskMode();
        currentMode = 1; _userMode = 1;
        ui.customColorGroup.style.display = 'none';
        changed = true;
    }

    if (key === 't' || key === 'T') {
        audioSync = !audioSync;
        if (audioSync) {
            audioBaseValues = { 0: paramValues[0], 1: paramValues[1], 5: paramValues[5], 6: paramValues[6] };
        }
        switchSection('audio');
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
        switchSection('audio');
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
            tlSaveState();
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
            tlSaveState();
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
                        ...seg,
                        id: nextSegId++,
                        startTime: seg.endTime,
                        endTime: Math.min(seg.endTime + dur, tlDur),
                        params: JSON.parse(JSON.stringify(seg.params)),
                        lane: 0,
                        synced: undefined
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
                    ...clip,
                    id: nextSegId++,
                    startTime: currentTime + offset,
                    endTime: Math.min(currentTime + offset + dur, tlDur),
                    params: JSON.parse(JSON.stringify(clip.params)),
                    lane: 0,
                    synced: undefined
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

    // Timeline zoom: +/- keys, Home = reset
    if (key === '=' || key === '+') {
        tlZoom = Math.min(50, tlZoom * 1.3);
        clampScroll();
        if (ui.tlZoomSlider) ui.tlZoomSlider.value = tlZoom;
        refreshTimeline();
        return false;
    }
    if (key === '-' || key === '_') {
        tlZoom = Math.max(1, tlZoom / 1.3);
        clampScroll();
        if (ui.tlZoomSlider) ui.tlZoomSlider.value = tlZoom;
        refreshTimeline();
        return false;
    }
    if (keyCode === 36) { // Home key
        tlZoom = 1; tlScrollOffset = 0;
        if (ui.tlZoomSlider) ui.tlZoomSlider.value = 1;
        refreshTimeline();
        return false;
    }

    if (key === 'q' || key === 'Q') {
        const targets = ['all', 'qty', 'size', 'color', 'flash', 'pulse', 'rate'];
        let curIdx = targets.indexOf(audioSyncTarget);
        audioSyncTarget = targets[(curIdx + 1) % targets.length];
        switchSection('audio');
        changed = true;
    }

    if (key === 'b' || key === 'B') {
        bpmLocked = !bpmLocked;
        switchSection('audio');
        changed = true;
    }

    if(changed) syncUI();
}

function mouseDragged(evt) {
    let el = evt ? evt.target : document.elementFromPoint(winMouseX, winMouseY);
    if (el && el.closest('.panel, #timeline-container, .modal-overlay, #settings-overlay, #top-bar')) return;
    if (mouseButton === RIGHT && mouseX > 0) {
        let delta = (mouseX - lastX) * 0.2;
        if (currentParam !== 4) {
            paramValues[currentParam] = constrain(paramValues[currentParam] + delta, 0, 100);
            paramBaseline[currentParam] = paramValues[currentParam];
            syncUI();
        }
        lastX = mouseX;
        return false;
    }
    return true;
}

function mouseReleased(evt) {
    if (_roiDrawing && _roiStart) {
        _roiDrawing = false;
        let vc1 = screenToVideoCoords(_roiStart.x, _roiStart.y);
        let vc2 = screenToVideoCoords(mouseX, mouseY);
        if (vc1 && vc2) {
            _roiRect = {
                x1: Math.min(vc1.x, vc2.x), y1: Math.min(vc1.y, vc2.y),
                x2: Math.max(vc1.x, vc2.x), y2: Math.max(vc1.y, vc2.y)
            };
            // Min size guard — too small = accidental click
            if ((_roiRect.x2 - _roiRect.x1) < 10 || (_roiRect.y2 - _roiRect.y1) < 10) _roiRect = null;
            let crb = document.getElementById('btn-clear-roi');
            if (crb) crb.style.display = _roiRect ? '' : 'none';
        }
        _roiStart = null;
    }
}

function mousePressed(evt) {
    // Don't handle clicks that landed on UI elements (buttons, inputs, panels)
    // Use the actual event target or clientX/Y for viewport-correct element detection
    let el = evt ? evt.target : document.elementFromPoint(winMouseX, winMouseY);
    if (el && el.closest('.panel, #timeline-container, .modal-overlay, #settings-overlay, #top-bar, .drawer-toggle, .panel-overlay')) return;
    // Only handle canvas clicks — bail if click wasn't on our canvas
    if (el && el.tagName !== 'CANVAS') return;
    if (mouseButton === RIGHT) { lastX = mouseX; return false; }
    // ROI drawing — intercept left-click when ROI mode is active
    if (_roiEnabled && mouseButton === LEFT && mouseX >= videoX && mouseX <= videoX + videoW && mouseY >= videoY && mouseY <= videoY + videoH) {
        _roiDrawing = true;
        _roiStart = { x: mouseX, y: mouseY };
        _roiRect = null;
        return false;
    }
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
    // Click-to-track: sample color from canvas and switch to CUSTOM mode
    if (mouseButton === LEFT && currentMode !== 14 && currentMode > 0 && videoLoaded) {
        if (mouseX >= videoX && mouseX <= videoX + videoW && mouseY >= videoY && mouseY <= videoY + videoH) {
            // Don't pick color when clicking the split divider
            if (splitZoomEnabled) {
                let splitX = Math.round(width * splitPosition / 100);
                if (Math.abs(mouseX - splitX) < 10) return false;
            }
            // Store previous mode so user can undo with Escape
            window._prevModeBeforeColorPick = currentMode;
            window._prevUserModeBeforeColorPick = _userMode;
            let c = get(Math.round(mouseX), Math.round(mouseY));
            let h = hue(c);
            customHue = h;
            _userCustomHue = h;
            // Update the color picker UI
            let r = red(c), g = green(c), b = blue(c);
            let hex = '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
            let picker = document.getElementById('custom-color-picker');
            if (picker) picker.value = hex;
            // Switch to CUSTOM mode
            currentMode = 5;
            _userMode = 5;
            document.getElementById('custom-color-group').style.display = '';
            updateButtonStates();
        }
    }
    return false;
}

// ── TOUCH GESTURE HANDLERS ───────────────
// p5.js touch events — declared globally to intercept touch on canvas
// These replace mouse events on touch devices for proper gesture routing

let _touchPinchDist = 0;       // distance between two fingers at start
let _touchPinchZoom = 1;       // zoom level at pinch start
let _touchTwoFingerY = 0;      // two-finger vertical drag start Y
let _touchTwoFingerParam = 0;  // param value at drag start
let _touchLongPressTimer = null;
let _touchStartPos = null;     // {x, y} for single tap detection
let _touchMoved = false;

function touchStarted(event) {
    // Only handle touches on the canvas
    if (!event || !event.target || event.target.tagName !== 'CANVAS') return;

    let t = event.touches || touches;
    _touchMoved = false;

    if (t.length === 2) {
        // Two-finger: start pinch zoom + vertical param drag
        let dx = t[1].clientX - t[0].clientX;
        let dy = t[1].clientY - t[0].clientY;
        _touchPinchDist = Math.sqrt(dx * dx + dy * dy);
        _touchPinchZoom = zoomTargetLevel;
        _touchTwoFingerY = (t[0].clientY + t[1].clientY) / 2;
        _touchTwoFingerParam = paramValues[currentParam];
        if (_touchLongPressTimer) { clearTimeout(_touchLongPressTimer); _touchLongPressTimer = null; }
        return false;
    }

    if (t.length === 1) {
        _touchStartPos = { x: t[0].clientX, y: t[0].clientY };
        // Long-press detection (500ms)
        if (_touchLongPressTimer) clearTimeout(_touchLongPressTimer);
        _touchLongPressTimer = setTimeout(() => {
            if (!_touchMoved && _touchStartPos) {
                _showTouchContextMenu(_touchStartPos.x, _touchStartPos.y);
            }
            _touchLongPressTimer = null;
        }, 500);
    }
    return false;
}

function touchMoved(event) {
    if (!event || !event.target || event.target.tagName !== 'CANVAS') return;

    let t = event.touches || touches;
    _touchMoved = true;
    if (_touchLongPressTimer) { clearTimeout(_touchLongPressTimer); _touchLongPressTimer = null; }

    if (t.length === 2) {
        // Pinch zoom
        let dx = t[1].clientX - t[0].clientX;
        let dy = t[1].clientY - t[0].clientY;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (_touchPinchDist > 0) {
            let scale = dist / _touchPinchDist;
            let newZoom = Math.max(0.25, Math.min(8, _touchPinchZoom * scale));
            let cx = (t[0].clientX + t[1].clientX) / 2;
            let cy = (t[0].clientY + t[1].clientY) / 2;
            let curZoom = zoomTargetLevel;
            zoomTargetPanX = cx - (cx - zoomTargetPanX) * (newZoom / curZoom);
            zoomTargetPanY = cy - (cy - zoomTargetPanY) * (newZoom / curZoom);
            zoomTargetLevel = newZoom;
            if (zoomTargetLevel >= 0.99 && zoomTargetLevel <= 1.01) { zoomTargetLevel = 1; zoomTargetPanX = 0; zoomTargetPanY = 0; }
            updateZoomUI();
        }

        // Two-finger vertical drag → adjust current parameter (Snapseed pattern)
        let midY = (t[0].clientY + t[1].clientY) / 2;
        let deltaY = _touchTwoFingerY - midY; // up = positive
        let sensitivity = 0.5; // 0.5 units per pixel dragged
        let newVal = constrain(_touchTwoFingerParam + deltaY * sensitivity, 0, 100);
        paramValues[currentParam] = newVal;
        paramBaseline[currentParam] = newVal;
        syncUI();

        return false;
    }

    // Single finger: handled by p5 mousePressed/mouseDragged via fallback
    return false;
}

function touchEnded(event) {
    if (_touchLongPressTimer) { clearTimeout(_touchLongPressTimer); _touchLongPressTimer = null; }
    _touchPinchDist = 0;

    // Only suppress default for canvas touches — UI buttons need click synthesis
    if (!event || !event.target || event.target.tagName !== 'CANVAS') {
        _touchStartPos = null;
        _touchMoved = false;
        return; // let browser synthesize click for UI elements
    }

    // Single tap (no drag) → forward to click-to-track logic
    if (!_touchMoved && _touchStartPos) {
        // Let mousePressed handle it via p5 fallback — just clean up
    }
    _touchStartPos = null;
    _touchMoved = false;
    return false;
}

// Simple context menu for long-press on canvas
function _showTouchContextMenu(cx, cy) {
    // Remove any existing menu
    let existing = document.getElementById('touch-context-menu');
    if (existing) existing.remove();

    let menu = document.createElement('div');
    menu.id = 'touch-context-menu';
    menu.style.cssText = `
        position:fixed; left:${cx}px; top:${cy - 10}px; transform:translateX(-50%) translateY(-100%);
        background:rgba(17,14,22,0.95); border:1px solid rgba(139,69,232,0.3); border-radius:10px;
        padding:6px 0; z-index:2000; min-width:160px; box-shadow:0 8px 24px rgba(0,0,0,0.6);
        font-family:inherit; font-size:13px; color:#ddd;
    `;

    let items = [
        { label: 'Track This Color', action: () => {
            let c = get(Math.round(mouseX), Math.round(mouseY));
            customHue = hue(c); _userCustomHue = customHue;
            currentMode = 5; _userMode = 5;
            updateButtonStates();
        }},
        { label: 'Reset Tracking', action: () => {
            currentMode = 0; _userMode = 0;
            _persistentBlobs = []; _nextBlobId = 1;
            updateButtonStates();
        }},
        { label: 'Reset Zoom', action: () => {
            zoomTargetLevel = 1; zoomTargetPanX = 0; zoomTargetPanY = 0;
            updateZoomUI();
        }},
    ];

    items.forEach(item => {
        let btn = document.createElement('div');
        btn.textContent = item.label;
        btn.style.cssText = 'padding:10px 16px; cursor:pointer;';
        btn.addEventListener('touchend', (e) => { e.stopPropagation(); item.action(); menu.remove(); });
        btn.addEventListener('click', (e) => { e.stopPropagation(); item.action(); menu.remove(); });
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    // Auto-dismiss on any tap outside
    setTimeout(() => {
        document.addEventListener('touchstart', function dismiss() {
            menu.remove();
            document.removeEventListener('touchstart', dismiss);
        }, { once: true });
    }, 100);
}
