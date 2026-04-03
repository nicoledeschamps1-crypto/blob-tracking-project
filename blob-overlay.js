// ═══════════════════════════════════════════════════════════════════
// blob-overlay.js — Video Overlay System for Hues of Dispositions
// Loads after blob-shader-fx.js, before blob-audio.js
// ═══════════════════════════════════════════════════════════════════

// ── Overlay State ──
let overlayEnabled = false;
let overlayOpacity = 0.5;
let overlayBlendMode = 'normal'; // Canvas composite operation name
let overlayVideo = null;     // HTMLVideoElement
let overlayImage = null;     // For static image overlays
let overlayType = 'none';    // 'none' | 'video' | 'image'
let overlayLoop = true;
let overlayMuted = true;
let overlayFit = 'cover';    // 'cover' | 'contain' | 'stretch'
let _overlayFileURL = null;  // Object URL for cleanup
let _overlayLoadGen = 0;

// Blend mode map: display name → globalCompositeOperation value
const OVERLAY_BLEND_MODES = [
    { name: 'Normal',     value: 'source-over' },
    { name: 'Multiply',   value: 'multiply' },
    { name: 'Screen',     value: 'screen' },
    { name: 'Overlay',    value: 'overlay' },
    { name: 'Soft Light', value: 'soft-light' },
    { name: 'Hard Light', value: 'hard-light' },
    { name: 'Difference', value: 'difference' },
    { name: 'Exclusion',  value: 'exclusion' },
    { name: 'Darken',     value: 'darken' },
    { name: 'Lighten',    value: 'lighten' },
    { name: 'Color Dodge',value: 'color-dodge' },
    { name: 'Color Burn', value: 'color-burn' },
];

// ── File Loading ──

function loadOverlayFile(file) {
    if (!file) return;

    // Clean up previous
    disposeOverlay();

    const ext = file.name ? file.name.split('.').pop().toLowerCase() : '';
    const isVideo = file.type.startsWith('video/') || ['mp4','mov','webm','m4v','avi','mkv','qt'].includes(ext);
    const isImage = file.type.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext);

    if (!isVideo && !isImage) {
        console.warn('[Overlay] Unsupported file type:', file.type, ext);
        _showOverlayError('Unsupported file type: ' + (ext || file.type || 'unknown'));
        return;
    }

    _overlayFileURL = URL.createObjectURL(file);
    const gen = ++_overlayLoadGen;
    const thisUrl = _overlayFileURL;

    if (isVideo) {
        overlayType = 'video';
        const thisVideo = document.createElement('video');
        overlayVideo = thisVideo;
        thisVideo.src = thisUrl;
        thisVideo.loop = overlayLoop;
        thisVideo.muted = overlayMuted;
        thisVideo.playsInline = true;
        thisVideo.crossOrigin = 'anonymous';
        thisVideo.addEventListener('loadeddata', () => {
            if (gen !== _overlayLoadGen) return;
            overlayEnabled = true;
            thisVideo.play().catch(() => {});
            _updateOverlayUI();
            console.log('[Overlay] Video loaded:', thisVideo.videoWidth + 'x' + thisVideo.videoHeight);
        });
        thisVideo.addEventListener('error', (e) => {
            if (gen !== _overlayLoadGen) { thisVideo.pause(); thisVideo.removeAttribute('src'); URL.revokeObjectURL(thisUrl); return; }
            console.error('[Overlay] Video load error:', e);
            _showOverlayError('Failed to load video overlay');
            disposeOverlay();
        });
        thisVideo.load();
    } else {
        overlayType = 'image';
        const thisImg = new Image();
        overlayImage = thisImg;
        thisImg.crossOrigin = 'anonymous';
        thisImg.onload = () => {
            if (gen !== _overlayLoadGen) return;
            overlayEnabled = true;
            _updateOverlayUI();
            console.log('[Overlay] Image loaded:', thisImg.width + 'x' + thisImg.height);
        };
        thisImg.onerror = () => {
            if (gen !== _overlayLoadGen) { URL.revokeObjectURL(thisUrl); return; }
            console.error('[Overlay] Image load error');
            _showOverlayError('Failed to load image overlay');
            disposeOverlay();
        };
        thisImg.src = thisUrl;
    }
}

function disposeOverlay() {
    if (overlayVideo) {
        overlayVideo.pause();
        overlayVideo.removeAttribute('src');
        overlayVideo.load();
        overlayVideo = null;
    }
    overlayImage = null;
    overlayType = 'none';
    overlayEnabled = false;
    if (_overlayFileURL) {
        URL.revokeObjectURL(_overlayFileURL);
        _overlayFileURL = null;
    }
    _updateOverlayUI();
}

// ── Drawing ──

function drawOverlay() {
    if (!overlayEnabled || overlayOpacity <= 0) return;

    const src = overlayType === 'video' ? overlayVideo :
                overlayType === 'image' ? overlayImage : null;
    if (!src) return;

    // For video, check it has data
    if (overlayType === 'video' && (overlayVideo.readyState < 2 || overlayVideo.videoWidth === 0)) return;

    const srcW = overlayType === 'video' ? src.videoWidth : src.width;
    const srcH = overlayType === 'video' ? src.videoHeight : src.height;
    if (srcW === 0 || srcH === 0) return;

    // Calculate draw region to match base video bounds
    let dx, dy, dw, dh;
    const srcRatio = srcW / srcH;
    const dstRatio = videoW / videoH;

    if (overlayFit === 'stretch') {
        dx = videoX; dy = videoY; dw = videoW; dh = videoH;
    } else if (overlayFit === 'cover') {
        if (srcRatio > dstRatio) {
            dh = videoH; dw = dh * srcRatio;
        } else {
            dw = videoW; dh = dw / srcRatio;
        }
        dx = videoX + (videoW - dw) / 2;
        dy = videoY + (videoH - dh) / 2;
    } else { // contain
        if (srcRatio > dstRatio) {
            dw = videoW; dh = dw / srcRatio;
        } else {
            dh = videoH; dw = dh * srcRatio;
        }
        dx = videoX + (videoW - dw) / 2;
        dy = videoY + (videoH - dh) / 2;
    }

    // Draw with blend mode and opacity via Canvas 2D
    const ctx = drawingContext;
    ctx.save();

    // Clip to video bounds
    ctx.beginPath();
    ctx.rect(videoX, videoY, videoW, videoH);
    ctx.clip();

    ctx.globalAlpha = overlayOpacity;
    const blendEntry = OVERLAY_BLEND_MODES.find(b => b.name.toLowerCase().replace(/\s/g, '-') === overlayBlendMode);
    ctx.globalCompositeOperation = blendEntry ? blendEntry.value : 'source-over';

    ctx.drawImage(src, dx, dy, dw, dh);

    ctx.restore();
}

// ── Playback Sync ──

function syncOverlayPlayback(playing) {
    if (!overlayVideo || overlayType !== 'video') return;
    if (playing) {
        overlayVideo.play().catch(() => {});
    } else {
        overlayVideo.pause();
    }
}

function seekOverlay(time) {
    if (!overlayVideo || overlayType !== 'video') return;
    overlayVideo.currentTime = time;
}

// ── UI Builder ──

function buildOverlayPanel() {
    const container = document.getElementById('fx-overlay-panel');
    if (!container) return;

    container.innerHTML = `
        <span class="tab-desc">Overlay a video or image on top of your tracked scene</span>

        <label class="overlay-upload-zone" id="overlay-upload-zone" for="overlay-file-input">
            <input type="file" id="overlay-file-input" accept="video/*,image/*" style="position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none">
            <div class="overlay-upload-content" id="overlay-upload-content">
                <span class="overlay-upload-icon">&#x1F4F9;</span>
                <span class="overlay-upload-text">Drop video/image or click to upload</span>
            </div>
            <div class="overlay-loaded-content" id="overlay-loaded-content" style="display:none">
                <span class="overlay-filename" id="overlay-filename"></span>
                <button class="overlay-remove-btn" id="overlay-remove-btn" title="Remove overlay">&times;</button>
            </div>
        </label>

        <div class="overlay-controls" id="overlay-controls" style="display:none">
            <div class="overlay-toggle-row">
                <span>Overlay</span>
                <label class="fx-toggle-switch">
                    <input type="checkbox" id="overlay-enable-toggle" checked>
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <label>Opacity</label>
            <div class="slider-row">
                <input type="range" id="overlay-opacity-slider" min="0" max="100" value="50" class="styled-slider">
                <span class="slider-value" id="overlay-opacity-val">50%</span>
            </div>

            <label>Blend Mode</label>
            <select id="overlay-blend-select" class="overlay-select"></select>

            <label>Fit</label>
            <div class="selector-row" id="overlay-fit-buttons">
                <button class="selector-btn" data-value="cover">Cover</button>
                <button class="selector-btn" data-value="contain">Contain</button>
                <button class="selector-btn" data-value="stretch">Stretch</button>
            </div>

            <div class="overlay-video-controls" id="overlay-video-controls" style="display:none">
                <div class="overlay-toggle-row">
                    <span>Loop</span>
                    <label class="fx-toggle-switch">
                        <input type="checkbox" id="overlay-loop-toggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="overlay-toggle-row">
                    <span>Mute</span>
                    <label class="fx-toggle-switch">
                        <input type="checkbox" id="overlay-mute-toggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>
    `;

    // Populate blend mode dropdown
    const blendSelect = document.getElementById('overlay-blend-select');
    OVERLAY_BLEND_MODES.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name.toLowerCase().replace(/\s/g, '-');
        opt.textContent = b.name;
        blendSelect.appendChild(opt);
    });

    // ── Wire up events ──
    const fileInput = document.getElementById('overlay-file-input');
    const uploadZone = document.getElementById('overlay-upload-zone');

    // File input now covers the full zone (no programmatic .click() needed — works on iOS)

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) loadOverlayFile(fileInput.files[0]);
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) loadOverlayFile(file);
    });

    // Remove button
    document.getElementById('overlay-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        disposeOverlay();
        fileInput.value = '';
    });

    // Enable toggle
    document.getElementById('overlay-enable-toggle').addEventListener('change', (e) => {
        overlayEnabled = e.target.checked;
    });

    // Opacity slider
    const opSlider = document.getElementById('overlay-opacity-slider');
    const opVal = document.getElementById('overlay-opacity-val');
    opSlider.addEventListener('input', () => {
        overlayOpacity = parseInt(opSlider.value) / 100;
        opVal.textContent = opSlider.value + '%';
    });

    // Blend mode
    blendSelect.addEventListener('change', () => {
        overlayBlendMode = blendSelect.value;
    });

    // Fit buttons
    document.querySelectorAll('#overlay-fit-buttons .selector-btn').forEach(btn => {
        if (btn.dataset.value === overlayFit) btn.classList.add('active');
        btn.addEventListener('click', () => {
            document.querySelectorAll('#overlay-fit-buttons .selector-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            overlayFit = btn.dataset.value;
        });
    });

    // Loop toggle
    document.getElementById('overlay-loop-toggle').addEventListener('change', (e) => {
        overlayLoop = e.target.checked;
        if (overlayVideo) overlayVideo.loop = overlayLoop;
    });

    // Mute toggle
    document.getElementById('overlay-mute-toggle').addEventListener('change', (e) => {
        overlayMuted = e.target.checked;
        if (overlayVideo) overlayVideo.muted = overlayMuted;
    });
}

function _showOverlayError(msg) {
    const el = document.getElementById('overlay-upload-content');
    if (!el) return;
    const err = document.createElement('div');
    err.textContent = msg;
    err.style.cssText = 'color:#f87171;font-size:10px;padding:4px 0;text-align:center';
    el.appendChild(err);
    setTimeout(() => err.remove(), 4000);
}

function _updateOverlayUI() {
    const uploadContent = document.getElementById('overlay-upload-content');
    const loadedContent = document.getElementById('overlay-loaded-content');
    const controls = document.getElementById('overlay-controls');
    const videoControls = document.getElementById('overlay-video-controls');
    const filenameEl = document.getElementById('overlay-filename');
    const enableToggle = document.getElementById('overlay-enable-toggle');

    if (!uploadContent) return; // Panel not built yet

    if (overlayType === 'none') {
        uploadContent.style.display = '';
        loadedContent.style.display = 'none';
        controls.style.display = 'none';
    } else {
        uploadContent.style.display = 'none';
        loadedContent.style.display = '';
        controls.style.display = '';
        videoControls.style.display = overlayType === 'video' ? '' : 'none';
        if (filenameEl) {
            const fileInput = document.getElementById('overlay-file-input');
            filenameEl.textContent = fileInput && fileInput.files[0]
                ? fileInput.files[0].name
                : overlayType === 'video' ? 'Video overlay' : 'Image overlay';
        }
        if (enableToggle) enableToggle.checked = overlayEnabled;
    }
}
