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
let currentMode = 1;
let _userMode = 1;        // user's UI-selected mode (survives timeline overrides)
let _userCustomHue = 195; // user's UI-selected custom hue
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

let videoX, videoY, videoW, videoH;
let currentVideoUrl = null;

// Video zoom/pan state
let vidZoom = 1;
let vidPanX = 0;
let vidPanY = 0;

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
    12:'Flicker', 13:'Invert', 14:'Mask', 15:'Eyes', 16:'Lips', 17:'Face'
};

// Face landmark tracking state (MediaPipe Face Landmarker)
let faceLandmarkCache = null;   // cached landmark results
let faceDetectFrame = 0;        // frame counter for throttled detection
const FACE_DETECT_INTERVAL = 2; // re-detect every N frames

// Landmark index groups for face feature modes
const FACE_EYES_INDICES = [
    // Left eye contour
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
    // Right eye contour
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
    // Left iris
    468, 469, 470, 471, 472,
    // Right iris
    473, 474, 475, 476, 477
];

const FACE_LIPS_INDICES = [
    // Outer lip
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
    // Inner lip
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324
];
let modeDragState = null;
const BLOB_SEG_COLOR = '#00CEC9';
let editingBlobSeg = null; // when a blob segment is selected, sliders edit its params

const FX_CATEGORIES = {
    sepia:'color', tint:'color', palette:'color', bricon:'color', thermal:'color', gradmap:'color', duotone:'color',
    chroma:'distortion', rgbshift:'distortion', curve:'distortion', wave:'distortion', jitter:'distortion', mblur:'distortion', emboss:'distortion',
    bloom:'pattern', dither:'pattern', atkinson:'pattern', halftone:'pattern', pxsort:'pattern', pixel:'pattern', led:'pattern',
    ascii:'overlay', glitch:'overlay', noise:'overlay', grain:'overlay', dots:'overlay', grid:'overlay', scanlines:'overlay', vignette:'overlay', crt:'overlay'
};
const FX_CAT_COLORS = { color:'#6C5CE7', distortion:'#00B894', pattern:'#FDCB6E', overlay:'#E17055' };
const FX_PARAM_MAP = {
    sepia: [{v:'sepiaIntensity',g:()=>sepiaIntensity,s:v=>sepiaIntensity=v}],
    tint: [{v:'tintPreset',g:()=>tintPreset,s:v=>tintPreset=v},{v:'tintIntensity',g:()=>tintIntensity,s:v=>tintIntensity=v},{v:'tintCustomColor',g:()=>tintCustomColor,s:v=>tintCustomColor=v}],
    palette: [{v:'palettePreset',g:()=>palettePreset,s:v=>palettePreset=v},{v:'paletteIntensity',g:()=>paletteIntensity,s:v=>paletteIntensity=v}],
    bricon: [{v:'briValue',g:()=>briValue,s:v=>briValue=v},{v:'conValue',g:()=>conValue,s:v=>conValue=v},{v:'satValue',g:()=>satValue,s:v=>satValue=v}],
    chroma: [{v:'chromaOffset',g:()=>chromaOffset,s:v=>chromaOffset=v}],
    curve: [{v:'curveIntensity',g:()=>curveIntensity,s:v=>curveIntensity=v},{v:'curveDirection',g:()=>curveDirection,s:v=>curveDirection=v}],
    wave: [{v:'waveAmp',g:()=>waveAmp,s:v=>waveAmp=v},{v:'waveFreq',g:()=>waveFreq,s:v=>waveFreq=v},{v:'waveSpeed',g:()=>waveSpeed,s:v=>waveSpeed=v}],
    jitter: [{v:'jitterIntensity',g:()=>jitterIntensity,s:v=>jitterIntensity=v},{v:'jitterBlockSize',g:()=>jitterBlockSize,s:v=>jitterBlockSize=v},{v:'jitterMode',g:()=>jitterMode,s:v=>jitterMode=v}],
    mblur: [{v:'mblurIntensity',g:()=>mblurIntensity,s:v=>mblurIntensity=v},{v:'mblurAngle',g:()=>mblurAngle,s:v=>mblurAngle=v}],
    bloom: [{v:'bloomIntensity',g:()=>bloomIntensity,s:v=>bloomIntensity=v},{v:'bloomRadius',g:()=>bloomRadius,s:v=>bloomRadius=v},{v:'bloomThreshold',g:()=>bloomThreshold,s:v=>bloomThreshold=v},{v:'bloomSpread',g:()=>bloomSpread,s:v=>bloomSpread=v},{v:'bloomBlendMode',g:()=>bloomBlendMode,s:v=>bloomBlendMode=v},{v:'bloomExposure',g:()=>bloomExposure,s:v=>bloomExposure=v}],
    dither: [{v:'ditherColorMode',g:()=>ditherColorMode,s:v=>ditherColorMode=v},{v:'ditherAlgorithm',g:()=>ditherAlgorithm,s:v=>ditherAlgorithm=v},{v:'ditherPalette',g:()=>ditherPalette,s:v=>ditherPalette=v},{v:'ditherColorCount',g:()=>ditherColorCount,s:v=>ditherColorCount=v},{v:'ditherPixelation',g:()=>ditherPixelation,s:v=>ditherPixelation=v},{v:'ditherStrength',g:()=>ditherStrength,s:v=>ditherStrength=v}],
    atkinson: [{v:'atkinsonColorMode',g:()=>atkinsonColorMode,s:v=>atkinsonColorMode=v},{v:'atkinsonThreshold',g:()=>atkinsonThreshold,s:v=>atkinsonThreshold=v},{v:'atkinsonSpread',g:()=>atkinsonSpread,s:v=>atkinsonSpread=v},{v:'atkinsonStrength',g:()=>atkinsonStrength,s:v=>atkinsonStrength=v}],
    halftone: [{v:'halfSpacing',g:()=>halfSpacing,s:v=>halfSpacing=v},{v:'halfColorMode',g:()=>halfColorMode,s:v=>halfColorMode=v},{v:'halfAngle',g:()=>halfAngle,s:v=>halfAngle=v},{v:'halfContrast',g:()=>halfContrast,s:v=>halfContrast=v},{v:'halfSpread',g:()=>halfSpread,s:v=>halfSpread=v},{v:'halfShape',g:()=>halfShape,s:v=>halfShape=v},{v:'halfInkColor',g:()=>halfInkColor,s:v=>halfInkColor=v},{v:'halfPaperColor',g:()=>halfPaperColor,s:v=>halfPaperColor=v},{v:'halfInverted',g:()=>halfInverted,s:v=>halfInverted=v}],
    pxsort: [{v:'pxsortLo',g:()=>pxsortLo,s:v=>pxsortLo=v},{v:'pxsortHi',g:()=>pxsortHi,s:v=>pxsortHi=v},{v:'pxsortDir',g:()=>pxsortDir,s:v=>pxsortDir=v}],
    pixel: [{v:'pixelSize',g:()=>pixelSize,s:v=>pixelSize=v}],
    ascii: [{v:'asciiCellSize',g:()=>asciiCellSize,s:v=>asciiCellSize=v},{v:'asciiColorMode',g:()=>asciiColorMode,s:v=>asciiColorMode=v},{v:'asciiCharSet',g:()=>asciiCharSet,s:v=>asciiCharSet=v},{v:'asciiInvert',g:()=>asciiInvert,s:v=>asciiInvert=v}],
    glitch: [{v:'glitchIntensity',g:()=>glitchIntensity,s:v=>glitchIntensity=v},{v:'glitchFreq',g:()=>glitchFreq,s:v=>glitchFreq=v},{v:'glitchMode',g:()=>glitchMode,s:v=>glitchMode=v},{v:'glitchChannelShift',g:()=>glitchChannelShift,s:v=>glitchChannelShift=v},{v:'glitchBlockSize',g:()=>glitchBlockSize,s:v=>glitchBlockSize=v},{v:'glitchSeed',g:()=>glitchSeed,s:v=>glitchSeed=v},{v:'glitchSpeed',g:()=>glitchSpeed,s:v=>glitchSpeed=v}],
    noise: [{v:'noiseIntensity',g:()=>noiseIntensity,s:v=>noiseIntensity=v},{v:'noiseScale',g:()=>noiseScale,s:v=>noiseScale=v},{v:'noiseColorMode',g:()=>noiseColorMode,s:v=>noiseColorMode=v}],
    grain: [{v:'grainIntensity',g:()=>grainIntensity,s:v=>grainIntensity=v},{v:'grainSize',g:()=>grainSize,s:v=>grainSize=v},{v:'grainColorMode',g:()=>grainColorMode,s:v=>grainColorMode=v}],
    dots: [{v:'dotsAngle',g:()=>dotsAngle,s:v=>dotsAngle=v},{v:'dotsScale',g:()=>dotsScale,s:v=>dotsScale=v}],
    grid: [{v:'gridScale',g:()=>gridScale,s:v=>gridScale=v},{v:'gridWidth',g:()=>gridWidth,s:v=>gridWidth=v},{v:'gridOpacity',g:()=>gridOpacity,s:v=>gridOpacity=v}],
    scanlines: [{v:'scanIntensity',g:()=>scanIntensity,s:v=>scanIntensity=v},{v:'scanCount',g:()=>scanCount,s:v=>scanCount=v}],
    vignette: [{v:'vigIntensity',g:()=>vigIntensity,s:v=>vigIntensity=v},{v:'vigRadius',g:()=>vigRadius,s:v=>vigRadius=v}],
    // New effects
    thermal: [{v:'thermalIntensity',g:()=>thermalIntensity,s:v=>thermalIntensity=v}],
    gradmap: [{v:'gradColor1',g:()=>gradColor1,s:v=>gradColor1=v},{v:'gradColor2',g:()=>gradColor2,s:v=>gradColor2=v},{v:'gradIntensity',g:()=>gradIntensity,s:v=>gradIntensity=v}],
    duotone: [{v:'duoShadow',g:()=>duoShadow,s:v=>duoShadow=v},{v:'duoHighlight',g:()=>duoHighlight,s:v=>duoHighlight=v},{v:'duoIntensity',g:()=>duoIntensity,s:v=>duoIntensity=v}],
    rgbshift: [{v:'rgbShiftRX',g:()=>rgbShiftRX,s:v=>rgbShiftRX=v},{v:'rgbShiftRY',g:()=>rgbShiftRY,s:v=>rgbShiftRY=v},{v:'rgbShiftBX',g:()=>rgbShiftBX,s:v=>rgbShiftBX=v},{v:'rgbShiftBY',g:()=>rgbShiftBY,s:v=>rgbShiftBY=v},{v:'rgbShiftIntensity',g:()=>rgbShiftIntensity,s:v=>rgbShiftIntensity=v}],
    emboss: [{v:'embossAngle',g:()=>embossAngle,s:v=>embossAngle=v},{v:'embossStrength',g:()=>embossStrength,s:v=>embossStrength=v}],
    led: [{v:'ledCellSize',g:()=>ledCellSize,s:v=>ledCellSize=v},{v:'ledGap',g:()=>ledGap,s:v=>ledGap=v},{v:'ledGlow',g:()=>ledGlow,s:v=>ledGlow=v},{v:'ledBrightness',g:()=>ledBrightness,s:v=>ledBrightness=v}],
    crt: [{v:'crtScanWeight',g:()=>crtScanWeight,s:v=>crtScanWeight=v},{v:'crtCurvature',g:()=>crtCurvature,s:v=>crtCurvature=v},{v:'crtGlow',g:()=>crtGlow,s:v=>crtGlow=v},{v:'crtChroma',g:()=>crtChroma,s:v=>crtChroma=v},{v:'crtStatic',g:()=>crtStatic,s:v=>crtStatic=v}]
};
const EFFECT_FN_MAP = {
    sepia:()=>applySepia(), tint:()=>applyTint(), palette:()=>applyPalette(), bricon:()=>applyBriCon(),
    thermal:()=>applyThermal(), gradmap:()=>applyGradientMap(), duotone:()=>applyDuotone(),
    chroma:()=>applyChromatic(), rgbshift:()=>applyRGBShift(), curve:()=>applyCurve(), wave:()=>applyWave(), jitter:()=>applyJitter(), mblur:()=>applyMblur(), emboss:()=>applyEmboss(),
    bloom:()=>applyBloom(), dither:()=>applyDithering(), atkinson:()=>applyAtkinson(), halftone:()=>applyHalftone(), pxsort:()=>applyPixelSort(), pixel:()=>applyPixelate(), led:()=>applyLED(),
    ascii:()=>applyASCII(), glitch:()=>applyGlitch(), noise:()=>applyNoise(), grain:()=>applyGrain(), dots:()=>applyDots(), grid:()=>applyGrid(), scanlines:()=>applyScanlines(), vignette:()=>applyVignette(), crt:()=>applyCRT()
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

// ── FX DEFAULTS (for reset functionality) ──
const FX_DEFAULTS = {
    sepia: {sepiaIntensity:70},
    tint: {tintPreset:'green',tintIntensity:70,tintCustomColor:'#00ff00'},
    palette: {palettePreset:'noir',paletteIntensity:80},
    bricon: {briValue:0,conValue:100,satValue:100},
    chroma: {chromaOffset:5},
    curve: {curveIntensity:30,curveDirection:'barrel'},
    wave: {waveAmp:20,waveFreq:5,waveSpeed:2},
    jitter: {jitterIntensity:20,jitterBlockSize:2,jitterMode:'random'},
    mblur: {mblurIntensity:30,mblurAngle:0},
    bloom: {bloomIntensity:40,bloomRadius:50,bloomThreshold:50,bloomSpread:50,bloomBlendMode:'additive',bloomExposure:100},
    dither: {ditherColorMode:'bw',ditherAlgorithm:'bayer4',ditherPalette:'bw',ditherColorCount:2,ditherPixelation:1,ditherStrength:100},
    atkinson: {atkinsonColorMode:'bw',atkinsonThreshold:128,atkinsonSpread:100,atkinsonStrength:100},
    halftone: {halfSpacing:6,halfColorMode:'bw',halfAngle:0,halfContrast:50,halfSpread:0,halfShape:'circle',halfInkColor:'#000000',halfPaperColor:'#ffffff',halfInverted:false},
    pxsort: {pxsortLo:30,pxsortHi:220,pxsortDir:'horizontal'},
    pixel: {pixelSize:8},
    ascii: {asciiCellSize:10,asciiColorMode:'mono',asciiCharSet:'classic',asciiInvert:false},
    glitch: {glitchIntensity:30,glitchFreq:20,glitchMode:'shift',glitchChannelShift:50,glitchBlockSize:50,glitchSeed:0,glitchSpeed:50},
    noise: {noiseIntensity:25,noiseScale:1,noiseColorMode:'mono'},
    grain: {grainIntensity:35,grainSize:15,grainColorMode:'mono'},
    dots: {dotsAngle:45,dotsScale:6},
    grid: {gridScale:20,gridWidth:1,gridOpacity:30},
    scanlines: {scanIntensity:50,scanCount:300},
    vignette: {vigIntensity:50,vigRadius:70},
    thermal: {thermalIntensity:80},
    gradmap: {gradColor1:'#000033',gradColor2:'#ff6600',gradIntensity:80},
    duotone: {duoShadow:'#1a1a2e',duoHighlight:'#e94560',duoIntensity:80},
    rgbshift: {rgbShiftRX:5,rgbShiftRY:0,rgbShiftBX:-5,rgbShiftBY:0,rgbShiftIntensity:70},
    emboss: {embossAngle:135,embossStrength:50},
    led: {ledCellSize:8,ledGap:2,ledGlow:30,ledBrightness:100},
    crt: {crtScanWeight:2,crtCurvature:30,crtGlow:50,crtChroma:3,crtStatic:20}
};

// ── FX_UI_CONFIG — UI control definitions for JS-generated FX panel ──
// Single source of truth for effect labels, controls, and DOM IDs.
// Control types: slider, selector, color, shape, swatch, toggle
const FX_UI_CONFIG = {
    sepia: { label:'Sepia', controls:[
        {type:'slider',sid:'slider-sepia-intensity',vid:'val-sepia-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>sepiaIntensity=v}
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
        {type:'slider',sid:'slider-thermal-intensity',vid:'val-thermal-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>thermalIntensity=v}
    ]},
    gradmap: { label:'Grad Map', hasRandomize:true, controls:[
        {type:'color',cid:'grad-color1',hid:'grad-color1-hex',label:'Shadow',setter:v=>gradColor1=v},
        {type:'color',cid:'grad-color2',hid:'grad-color2-hex',label:'Highlight',setter:v=>gradColor2=v},
        {type:'slider',sid:'slider-grad-intensity',vid:'val-grad-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>gradIntensity=v}
    ]},
    duotone: { label:'Duotone', hasRandomize:true, controls:[
        {type:'color',cid:'duo-shadow',hid:'duo-shadow-hex',label:'Shadow',setter:v=>duoShadow=v},
        {type:'color',cid:'duo-highlight',hid:'duo-highlight-hex',label:'Highlight',setter:v=>duoHighlight=v},
        {type:'slider',sid:'slider-duo-intensity',vid:'val-duo-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>duoIntensity=v}
    ]},
    chroma: { label:'Chromatic', controls:[
        {type:'slider',sid:'slider-chroma-offset',vid:'val-chroma-offset',label:'Offset',min:1,max:25,step:1,setter:v=>chromaOffset=v}
    ]},
    rgbshift: { label:'RGB Shift', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-rgbshift-rx',vid:'val-rgbshift-rx',label:'Red X',min:-25,max:25,step:1,setter:v=>rgbShiftRX=v},
        {type:'slider',sid:'slider-rgbshift-ry',vid:'val-rgbshift-ry',label:'Red Y',min:-25,max:25,step:1,setter:v=>rgbShiftRY=v},
        {type:'slider',sid:'slider-rgbshift-bx',vid:'val-rgbshift-bx',label:'Blue X',min:-25,max:25,step:1,setter:v=>rgbShiftBX=v},
        {type:'slider',sid:'slider-rgbshift-by',vid:'val-rgbshift-by',label:'Blue Y',min:-25,max:25,step:1,setter:v=>rgbShiftBY=v},
        {type:'slider',sid:'slider-rgbshift-intensity',vid:'val-rgbshift-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>rgbShiftIntensity=v}
    ]},
    curve: { label:'Curve', controls:[
        {type:'slider',sid:'slider-curve-intensity',vid:'val-curve-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>curveIntensity=v},
        {type:'selector',cid:'curve-dir-buttons',label:'Direction',setter:v=>curveDirection=v,
         opts:[{v:'barrel',l:'BARREL'},{v:'pinch',l:'PINCH'}]}
    ]},
    wave: { label:'Wave', controls:[
        {type:'slider',sid:'slider-wave-amp',vid:'val-wave-amp',label:'Amplitude',min:1,max:100,step:1,setter:v=>waveAmp=v},
        {type:'slider',sid:'slider-wave-freq',vid:'val-wave-freq',label:'Frequency',min:1,max:20,step:1,setter:v=>waveFreq=v},
        {type:'slider',sid:'slider-wave-speed',vid:'val-wave-speed',label:'Speed',min:0,max:5,step:0.1,setter:v=>waveSpeed=v}
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
        {type:'slider',sid:'slider-emboss-strength',vid:'val-emboss-strength',label:'Strength',min:5,max:100,step:1,setter:v=>embossStrength=v}
    ]},
    bloom: { label:'Bloom', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-bloom-intensity',vid:'val-bloom-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>bloomIntensity=v},
        {type:'slider',sid:'slider-bloom-radius',vid:'val-bloom-radius',label:'Radius',min:10,max:100,step:1,setter:v=>bloomRadius=v},
        {type:'slider',sid:'slider-bloom-thresh',vid:'val-bloom-thresh',label:'Threshold',min:0,max:100,step:1,setter:v=>bloomThreshold=v},
        {type:'slider',sid:'slider-bloom-spread',vid:'val-bloom-spread',label:'Spread',min:10,max:100,step:1,setter:v=>bloomSpread=v},
        {type:'slider',sid:'slider-bloom-exposure',vid:'val-bloom-exposure',label:'Exposure',min:50,max:200,step:1,setter:v=>bloomExposure=v},
        {type:'selector',cid:'bloom-blend-buttons',label:'Blend',setter:v=>bloomBlendMode=v,
         opts:[{v:'additive',l:'ADD'},{v:'screen',l:'SCREEN'},{v:'soft',l:'SOFT'}]}
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
        {type:'slider',sid:'slider-pixel-size',vid:'val-pixel-size',label:'Size',min:2,max:50,step:1,setter:v=>pixelSize=v}
    ]},
    led: { label:'LED Screen', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-led-cellsize',vid:'val-led-cellsize',label:'Cell Size',min:4,max:20,step:1,setter:v=>ledCellSize=v},
        {type:'slider',sid:'slider-led-gap',vid:'val-led-gap',label:'Gap',min:1,max:5,step:1,setter:v=>ledGap=v},
        {type:'slider',sid:'slider-led-glow',vid:'val-led-glow',label:'Glow',min:0,max:100,step:1,setter:v=>ledGlow=v},
        {type:'slider',sid:'slider-led-brightness',vid:'val-led-brightness',label:'Brightness',min:50,max:150,step:1,setter:v=>ledBrightness=v}
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
         opts:[{v:'shift',l:'SHIFT'},{v:'tear',l:'TEAR'},{v:'corrupt',l:'CORRUPT'}]}
    ]},
    noise: { label:'Noise', controls:[
        {type:'slider',sid:'slider-noise-intensity',vid:'val-noise-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>noiseIntensity=v},
        {type:'slider',sid:'slider-noise-scale',vid:'val-noise-scale',label:'Scale',min:1,max:10,step:1,setter:v=>noiseScale=v},
        {type:'selector',cid:'noise-color-buttons',label:'Color',setter:v=>noiseColorMode=v,
         opts:[{v:'mono',l:'MONO'},{v:'color',l:'COLOR'}]}
    ]},
    grain: { label:'Grain', controls:[
        {type:'slider',sid:'slider-grain-intensity',vid:'val-grain-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>grainIntensity=v},
        {type:'slider',sid:'slider-grain-size',vid:'val-grain-size',label:'Size',min:5,max:40,step:1,setter:v=>grainSize=v},
        {type:'selector',cid:'grain-color-buttons',label:'Color',setter:v=>grainColorMode=v,
         opts:[{v:'mono',l:'MONO'},{v:'color',l:'COLOR'}]}
    ]},
    dots: { label:'Dots', controls:[
        {type:'slider',sid:'slider-dots-angle',vid:'val-dots-angle',label:'Angle',min:0,max:360,step:1,setter:v=>dotsAngle=v},
        {type:'slider',sid:'slider-dots-scale',vid:'val-dots-scale',label:'Scale',min:2,max:20,step:1,setter:v=>dotsScale=v}
    ]},
    grid: { label:'Grid', controls:[
        {type:'slider',sid:'slider-grid-scale',vid:'val-grid-scale',label:'Scale',min:5,max:50,step:1,setter:v=>gridScale=v},
        {type:'slider',sid:'slider-grid-width',vid:'val-grid-width',label:'Width',min:1,max:5,step:0.5,setter:v=>gridWidth=v},
        {type:'slider',sid:'slider-grid-opacity',vid:'val-grid-opacity',label:'Opacity',min:5,max:100,step:1,setter:v=>gridOpacity=v}
    ]},
    scanlines: { label:'Scanlines', controls:[
        {type:'slider',sid:'slider-scan-intensity',vid:'val-scan-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>scanIntensity=v},
        {type:'slider',sid:'slider-scan-count',vid:'val-scan-count',label:'Count',min:50,max:800,step:10,setter:v=>scanCount=v}
    ]},
    vignette: { label:'Vignette', controls:[
        {type:'slider',sid:'slider-vig-intensity',vid:'val-vig-intensity',label:'Intensity',min:5,max:100,step:1,setter:v=>vigIntensity=v},
        {type:'slider',sid:'slider-vig-radius',vid:'val-vig-radius',label:'Radius',min:20,max:100,step:1,setter:v=>vigRadius=v}
    ]},
    crt: { label:'CRT Screen', hasRandomize:true, controls:[
        {type:'slider',sid:'slider-crt-scanweight',vid:'val-crt-scanweight',label:'Scan Weight',min:1,max:5,step:1,setter:v=>crtScanWeight=v},
        {type:'slider',sid:'slider-crt-curvature',vid:'val-crt-curvature',label:'Curvature',min:0,max:100,step:1,setter:v=>crtCurvature=v},
        {type:'slider',sid:'slider-crt-glow',vid:'val-crt-glow',label:'Phosphor Glow',min:0,max:100,step:1,setter:v=>crtGlow=v},
        {type:'slider',sid:'slider-crt-chroma',vid:'val-crt-chroma',label:'Chroma Fringe',min:0,max:10,step:1,setter:v=>crtChroma=v},
        {type:'slider',sid:'slider-crt-static',vid:'val-crt-static',label:'Static Noise',min:0,max:100,step:1,setter:v=>crtStatic=v}
    ]}
};

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
    btnPlay: document.getElementById('btn-play'),
    btnRestart: document.getElementById('btn-restart'),
    btnRecord: document.getElementById('btn-record'),
    btnSave: document.getElementById('btn-save'),
    audioUpload: document.getElementById('audioUpload'),
    audioName: document.getElementById('audio-name'),
    audioMeterFill: document.getElementById('audio-meter-fill'),
    modeButtons: document.querySelectorAll('#group-modes .selector-btn'),
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
    p5Canvas.setAttribute('tabindex', '0');
    canvas.elt.addEventListener('contextmenu', (e) => e.preventDefault());
    background(0);
    textFont('Helvetica Neue');
    textSize(11);

    // Video zoom: scroll on canvas (no modifier = video zoom, Ctrl = timeline zoom)
    canvas.elt.addEventListener('wheel', (e) => {
        // Skip if cursor is over panels or timeline
        let over = document.elementFromPoint(e.clientX, e.clientY);
        if (over && (over.closest('.panel') || over.closest('#timeline-container'))) return;
        e.preventDefault();
        let zoomFactor = 1 - e.deltaY * 0.002;
        let newZoom = Math.max(1, Math.min(8, vidZoom * zoomFactor));
        // Zoom toward cursor
        let cx = e.clientX, cy = e.clientY;
        vidPanX = cx - (cx - vidPanX) * (newZoom / vidZoom);
        vidPanY = cy - (cy - vidPanY) * (newZoom / vidZoom);
        vidZoom = newZoom;
        // Reset pan when zoomed out to 1x
        if (vidZoom <= 1.01) { vidZoom = 1; vidPanX = 0; vidPanY = 0; }
    }, { passive: false });

    // Video pan: middle-click drag or left-drag when zoomed (on canvas only)
    let _vidDrag = null;
    canvas.elt.addEventListener('mousedown', (e) => {
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

        // Reserve space for timeline if visible
        let tlEl = document.getElementById('timeline-container');
        if (tlEl && !tlEl.classList.contains('hidden')) {
            dispH -= tlEl.offsetHeight + 20; // +20 for bottom gap
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

        // Apply video zoom
        videoW = baseW * vidZoom;
        videoH = baseH * vidZoom;
        videoX = (dispW - videoW) / 2 + vidPanX;
        videoY = (dispH - videoH) / 2 + vidPanY;

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

            if (activeVizModes.has(10) || (currentMode >= 15 && currentMode <= 17)) {
                // ZOOM — magnified video crop inside blob
                // Crop radius scales with blob size for natural zoom feel
                push();
                let srcX = map(p.posicao.x, videoX, videoX + videoW, 0, videoEl.width);
                let srcY = map(p.posicao.y, videoY, videoY + videoH, 0, videoEl.height);
                let isFaceZoom = currentMode >= 15 && currentMode <= 17;
                // Zoom factor: larger blob size → larger source crop → more magnification
                // Blob Size (param4) controls how zoomed-in each crop is
                let zoomFactor = map(paramValues[4], 0, 100, 1.5, 6);
                let sampleR = max(pw, ph) / zoomFactor;
                // Minimum source crop so tiny blobs still show detail
                sampleR = max(sampleR, 8);
                let zW = max(pw, 20);
                let zH = max(ph, 20);
                // Clamp source region to video bounds
                let sx = constrain(srcX - sampleR, 0, videoEl.width - sampleR * 0.5);
                let sy = constrain(srcY - sampleR, 0, videoEl.height - sampleR * 0.5);
                let sw = min(sampleR * 2, videoEl.width - sx);
                let sh = min(sampleR * 2, videoEl.height - sy);
                image(videoEl, p.posicao.x - zW/2, p.posicao.y - zH/2, zW, zH,
                      sx, sy, sw, sh);
                // Subtle border — thin for face, light for general zoom
                noFill(); strokeWeight(0.8); rectMode(CENTER);
                if (isFaceZoom) {
                    stroke(255, 40);
                } else {
                    stroke(255, 80);
                }
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

    // Copy cropped video region to recording canvas (no black bars)
    if (isRecording && recordingCanvas && recordingCtx) {
        let pd = pixelDensity();
        recordingCtx.drawImage(p5Canvas,
            videoX * pd, videoY * pd, videoW * pd, videoH * pd,
            0, 0, recordingCanvas.width, recordingCanvas.height);
        // Signal captureStream(0) that a new frame is ready
        if (recordingVideoTrack && recordingVideoTrack.requestFrame) {
            recordingVideoTrack.requestFrame();
        }
    }
}

// ── CORE UI LISTENERS ─────────────────────

function switchToTab(tabName) {
    document.querySelectorAll('.panel-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.dataset.tab === tabName);
    });
}

function setupCoreUIListeners() {

    // Panel tab switching
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => switchToTab(tab.dataset.tab));
    });

    // Collapsible section toggles
    document.querySelectorAll('.collapsible-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.closest('.collapsible').classList.toggle('collapsed');
        });
    });

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
            _userMode = currentMode;
            if (currentMode === 3) prevGridPixels = {};
            if (currentMode === 12) flickerScores = {};
            if (currentMode < 15 || currentMode > 17) faceLandmarkCache = null;
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
            // Auto-expand Product Info when TAG viz is active
            let pig = document.getElementById('product-info-group');
            if (activeVizModes.has(8)) {
                pig.classList.remove('collapsed');
            }
            updateButtonStates();
        });
    });

    ui.lineButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            showLines = (e.target.dataset.value === 'on');
            document.getElementById('line-options-group').style.display = showLines ? '' : 'none';
            updateButtonStates();
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

    // Help button + overlay close
    document.getElementById('help-btn').addEventListener('click', toggleHelp);
    document.getElementById('help-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'help-overlay') toggleHelp();
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

    // Face tracking controls visibility
    const isFaceMode = currentMode >= 15 && currentMode <= 17;
    document.getElementById('face-controls-group').style.display = isFaceMode ? '' : 'none';
    if (isFaceMode) {
        let fStatusEl = document.getElementById('face-status');
        let fHintEl = document.getElementById('face-hint');
        if (!window.mpFaceLandmarkerReady) {
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

    // Contextual param dimming
    const colorModes = new Set([1, 2, 5, 10, 11, 13]);
    let g1 = document.getElementById('group-1');
    if (g1) g1.classList.toggle('param-dimmed', !colorModes.has(currentMode));
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

function toggleHelp() {
    _helpVisible = !_helpVisible;
    document.getElementById('help-overlay').classList.toggle('visible', _helpVisible);
}

function updateEmptyHint() {
    let hint = document.getElementById('tl-empty-hint');
    if (hint) hint.classList.toggle('hidden', timelineSegments.length > 0);
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
    currentMode = 1; _userMode = 1;

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
            currentMode = 1; _userMode = 1;
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
    // Create cropped canvas (video area only, no black bars)
    let pd = pixelDensity();
    recordingCanvas = document.createElement('canvas');
    recordingCanvas.width = Math.round(videoW * pd);
    recordingCanvas.height = Math.round(videoH * pd);
    recordingCtx = recordingCanvas.getContext('2d');
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

    // Scale bitrate to resolution: ~20 Mbps for 1080p, ~35 Mbps for 4K
    // Higher multiplier reduces VP9/VP8 quality fluctuation between keyframes
    let pixels = recordingCanvas.width * recordingCanvas.height;
    let bitrate = Math.max(12000000, Math.round(pixels * 10));

    mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        lastRecordedBlob = new Blob(recordedChunks, { type: mimeType });
        lastRecordedExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
        recordedChunks = [];
        ui.btnSave.style.borderColor = '#e5e5e5';
    };

    // No timeslice — collect all data on stop to avoid chunk boundary quality drops
    mediaRecorder.start();
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
    recordingCanvas = null;
    recordingCtx = null;
    recordingVideoTrack = null;
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

function keyPressed(event) {
    let tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.isContentEditable) return;
    let e = event instanceof KeyboardEvent ? event : {};

    // Help overlay: ? to toggle, Escape to close
    if (key === '?') { toggleHelp(); return false; }
    if (keyCode === ESCAPE && _helpVisible) { toggleHelp(); return false; }

    // Block all other keys while help is open
    if (_helpVisible) return false;

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
    if (/^[0-9zxm]$/i.test(key) && !e.metaKey && !e.ctrlKey && changed) switchToTab('track');
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
        switchToTab('audio');
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
        switchToTab('audio');
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
        switchToTab('audio');
        changed = true;
    }

    if (key === 'b' || key === 'B') {
        bpmLocked = !bpmLocked;
        switchToTab('audio');
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
