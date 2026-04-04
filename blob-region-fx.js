// ═══════════════════════════════════════════════════════════════
// blob-region-fx.js — Per-Blob Region Effects (WebGL2)
// Separate pipeline from ShaderFXPipeline. Processes blob regions
// on a small offscreen WebGL2 canvas and composites back onto p5.
// ═══════════════════════════════════════════════════════════════

// ── Globals ──────────────────────────────────────────────────
let regionFXEnabled = false;
let regionFXMode = 'none';    // none, inv, pixel, thermal, blur, glitch, tone, dither, crt, edge, zoom, water, fill
let regionFXInvert = false;   // apply OUTSIDE blob
let regionFXFusion = false;   // 50/50 blend
let regionFXRandom = false;   // random per blob
let regionFXIntensity = 100;  // 0–100

// ── Internal state ───────────────────────────────────────────
let _regionGL = null;            // WebGL2 context
let _regionGLCanvas = null;      // offscreen <canvas>
let _regionPrograms = {};        // compiled programs by name
let _regionVAO = null;           // fullscreen quad VAO
let _regionSrcTex = null;        // source texture (p5 canvas upload)
let _regionFrameUploaded = -1;   // frameCount of last texture upload
const _REGION_SIZE = 256;        // offscreen canvas size
const _REGION_MODES = ['inv', 'pixel', 'thermal', 'blur', 'glitch', 'tone', 'dither', 'crt', 'edge', 'zoom', 'water', 'fill'];

// ── GLSL Shaders ─────────────────────────────────────────────

const _VERT_REGION = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_texCoord;
uniform vec4 u_blobRect; // x, y, w, h in 0–1 UV space
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = u_blobRect.xy + (a_position * 0.5 + 0.5) * u_blobRect.zw;
}`;

const FRAG_REGION_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
    fragColor = texture(u_texture, v_texCoord);
}`;

const FRAG_REGION_INVERT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_texture, v_texCoord);
    vec3 inv = vec3(1.0) - c.rgb;
    fragColor = vec4(mix(c.rgb, inv, u_intensity), c.a);
}`;

const FRAG_REGION_PIXELATE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float blockSz = mix(4.0, 48.0, u_intensity);
    vec2 cellSize = vec2(blockSz) / u_resolution;
    vec2 cellPos = floor(v_texCoord / cellSize + 0.5) * cellSize;
    vec2 hc = cellSize * 0.25;
    vec3 result = (
        texture(u_texture, clamp(cellPos + vec2(-hc.x, -hc.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2( hc.x, -hc.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2(-hc.x,  hc.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2( hc.x,  hc.y), 0.0, 1.0)).rgb
    ) * 0.25;
    // Subtle grid line at block edges
    vec2 edge = abs(fract(v_texCoord / cellSize) - 0.5) * 2.0;
    float grid = smoothstep(0.88, 1.0, max(edge.x, edge.y));
    result = mix(result, result * 0.65, grid * 0.35);
    fragColor = vec4(result, 1.0);
}`;

const FRAG_REGION_THERMAL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
out vec4 fragColor;
vec3 thermalMap(float t) {
    // 11-stop thermal palette: deep blue → cyan → green → yellow → red → white
    const vec3 c[11] = vec3[11](
        vec3(0.0, 0.0, 0.5), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.5, 1.0),
        vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.5), vec3(0.0, 1.0, 0.0),
        vec3(0.5, 1.0, 0.0), vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0),
        vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0)
    );
    float p = t * 10.0;
    int lo = int(floor(p));
    return mix(c[min(lo, 10)], c[min(lo + 1, 10)], fract(p));
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 thermal = thermalMap(clamp(lum, 0.0, 1.0));
    fragColor = vec4(mix(orig.rgb, thermal, u_intensity), orig.a);
}`;

const FRAG_REGION_BLUR = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    // 9-tap gaussian (sigma ≈ 1.5, scaled by intensity)
    float spread = mix(0.5, 4.0, u_intensity);
    vec2 off = u_texelSize * spread;
    vec3 sum = texture(u_texture, v_texCoord).rgb * 4.0;
    sum += texture(u_texture, v_texCoord + vec2( off.x, 0.0)).rgb * 2.0;
    sum += texture(u_texture, v_texCoord + vec2(-off.x, 0.0)).rgb * 2.0;
    sum += texture(u_texture, v_texCoord + vec2(0.0,  off.y)).rgb * 2.0;
    sum += texture(u_texture, v_texCoord + vec2(0.0, -off.y)).rgb * 2.0;
    sum += texture(u_texture, v_texCoord + vec2( off.x,  off.y)).rgb;
    sum += texture(u_texture, v_texCoord + vec2(-off.x,  off.y)).rgb;
    sum += texture(u_texture, v_texCoord + vec2( off.x, -off.y)).rgb;
    sum += texture(u_texture, v_texCoord + vec2(-off.x, -off.y)).rgb;
    sum /= 16.0;
    fragColor = vec4(sum, 1.0);
}`;

const FRAG_REGION_GLITCH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float t = u_time * 3.0;
    // Per-channel horizontal offset — use 0-1 UV space directly, not pixel coords
    float spread = u_intensity * 0.08;
    float offR = sin(t * 1.7 + v_texCoord.y * 12.0) * spread;
    float offB = sin(t * 2.3 + v_texCoord.y * 8.0) * spread;
    float r = texture(u_texture, v_texCoord + vec2(offR, 0.0)).r;
    float g = orig.g;
    float b = texture(u_texture, v_texCoord + vec2(offB, 0.0)).b;
    // Strong scan line artifacts
    float scanline = mix(1.0, 0.5 + 0.5 * sin(v_texCoord.y * 30.0 * 3.14159), u_intensity * 0.6);
    fragColor = vec4(vec3(r, g, b) * scanline, orig.a);
}`;

const FRAG_REGION_TONE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_texture, v_texCoord);
    float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Halftone grid size scales with intensity
    float gridSz = mix(3.0, 12.0, u_intensity);
    vec2 px = v_texCoord * u_resolution;
    vec2 cell = floor(px / gridSz) * gridSz + gridSz * 0.5;
    float dist = length(px - cell) / (gridSz * 0.5);
    // Dot radius proportional to luminance
    float halftone = step(dist, lum);
    fragColor = vec4(vec3(halftone), c.a);
}`;

const FRAG_REGION_DITHER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 c = texture(u_texture, v_texCoord);
    // Bayer 4x4 threshold matrix
    int bayer[16] = int[16](
         0,  8,  2, 10,
        12,  4, 14,  6,
         3, 11,  1,  9,
        15,  7, 13,  5
    );
    ivec2 px = ivec2(int(mod(v_texCoord.x * u_resolution.x, 4.0)), int(mod(v_texCoord.y * u_resolution.y, 4.0)));
    int idx = clamp(px.y * 4 + px.x, 0, 15);
    float threshold = float(bayer[idx]) / 16.0 - 0.5;
    // Number of quantization levels based on intensity
    float levels = mix(2.0, 8.0, 1.0 - u_intensity);
    vec3 dithered = floor(c.rgb * levels + threshold + 0.5) / levels;
    fragColor = vec4(clamp(dithered, 0.0, 1.0), c.a);
}`;

const FRAG_REGION_CRT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    // Barrel distortion
    vec2 uv = v_texCoord - 0.5;
    float dist = dot(uv, uv);
    float barrel = 1.0 + dist * 0.3 * u_intensity;
    uv = uv * barrel + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    // RGB sub-pixel offset — use UV space, not pixel coords
    float sep = u_intensity * 0.02;
    float r = texture(u_texture, uv + vec2(sep, 0.0)).r;
    float g = texture(u_texture, uv).g;
    float b = texture(u_texture, uv - vec2(sep, 0.0)).b;
    vec3 col = vec3(r, g, b);
    // Scanlines — fewer, thicker lines visible at any size
    float scanline = mix(1.0, 0.4 + 0.6 * sin(uv.y * 20.0 * 3.14159), u_intensity * 0.7);
    // Flicker
    float flicker = 0.95 + 0.05 * sin(u_time * 8.0);
    fragColor = vec4(col * scanline * flicker, 1.0);
}`;

const FRAG_REGION_EDGE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    // Sobel operator
    float tl = dot(texture(u_texture, v_texCoord + vec2(-u_texelSize.x, -u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float t  = dot(texture(u_texture, v_texCoord + vec2(0.0, -u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(u_texture, v_texCoord + vec2( u_texelSize.x, -u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float l  = dot(texture(u_texture, v_texCoord + vec2(-u_texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float r  = dot(texture(u_texture, v_texCoord + vec2( u_texelSize.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(u_texture, v_texCoord + vec2(-u_texelSize.x,  u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float b  = dot(texture(u_texture, v_texCoord + vec2(0.0,  u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(u_texture, v_texCoord + vec2( u_texelSize.x,  u_texelSize.y)).rgb, vec3(0.299, 0.587, 0.114));
    float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
    float edge = sqrt(gx*gx + gy*gy);
    edge = smoothstep(0.05, mix(0.3, 0.08, u_intensity), edge);
    fragColor = vec4(vec3(edge), 1.0);
}`;

const FRAG_REGION_ZOOM = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    // Zoom toward center of region
    vec2 center = vec2(0.5);
    float zoomFactor = mix(1.0, 3.0, u_intensity);
    vec2 uv = center + (v_texCoord - center) / zoomFactor;
    uv = clamp(uv, 0.0, 1.0);
    fragColor = texture(u_texture, uv);
}`;

const FRAG_REGION_WATER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    float amp = u_intensity * 0.07;
    float freq = 6.0;
    float t = u_time * 2.0;
    vec2 uv = v_texCoord;
    uv.x += sin(uv.y * freq + t) * amp;
    uv.y += cos(uv.x * freq + t * 1.3) * amp;
    uv = clamp(uv, 0.0, 1.0);
    fragColor = texture(u_texture, uv);
}`;

const FRAG_REGION_FILL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    // Solid color cutout — intensity controls color:
    // 0.0 = black, 0.5 = midgray, 1.0 = white
    vec3 solid = vec3(u_intensity);
    fragColor = vec4(solid, orig.a);
}`;

// ── Shader compilation helpers ───────────────────────────────

function _regionCompileShader(gl, type, src) {
    let s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[RegionFX] Shader compile error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

function _regionLinkProgram(gl, vsrc, fsrc) {
    let vs = _regionCompileShader(gl, gl.VERTEX_SHADER, vsrc);
    let fs = _regionCompileShader(gl, gl.FRAGMENT_SHADER, fsrc);
    if (!vs || !fs) return null;
    let prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('[RegionFX] Program link error:', gl.getProgramInfoLog(prog));
        gl.deleteProgram(prog);
        return null;
    }
    // Clean up shader objects (they stay attached)
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
}

// ── Initialization ───────────────────────────────────────────

function initRegionFX() {
    _regionGLCanvas = document.createElement('canvas');
    _regionGLCanvas.width = _REGION_SIZE;
    _regionGLCanvas.height = _REGION_SIZE;
    _regionGL = _regionGLCanvas.getContext('webgl2', {
        alpha: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false
    });
    if (!_regionGL) {
        console.warn('[RegionFX] WebGL2 not available — region effects disabled');
        return;
    }
    let gl = _regionGL;

    // Compile all programs
    const shaders = {
        passthrough: FRAG_REGION_PASSTHROUGH,
        inv:         FRAG_REGION_INVERT,
        pixel:       FRAG_REGION_PIXELATE,
        thermal:     FRAG_REGION_THERMAL,
        blur:        FRAG_REGION_BLUR,
        glitch:      FRAG_REGION_GLITCH,
        tone:        FRAG_REGION_TONE,
        dither:      FRAG_REGION_DITHER,
        crt:         FRAG_REGION_CRT,
        edge:        FRAG_REGION_EDGE,
        zoom:        FRAG_REGION_ZOOM,
        water:       FRAG_REGION_WATER,
        fill:        FRAG_REGION_FILL
    };
    for (let [name, frag] of Object.entries(shaders)) {
        let prog = _regionLinkProgram(gl, _VERT_REGION, frag);
        if (prog) {
            // Cache uniform locations (avoids 3600+ getUniformLocation calls/sec)
            _regionPrograms[name] = {
                prog,
                locs: {
                    u_texture:   gl.getUniformLocation(prog, 'u_texture'),
                    u_blobRect:  gl.getUniformLocation(prog, 'u_blobRect'),
                    u_intensity: gl.getUniformLocation(prog, 'u_intensity'),
                    u_resolution:gl.getUniformLocation(prog, 'u_resolution'),
                    u_texelSize: gl.getUniformLocation(prog, 'u_texelSize'),
                    u_time:      gl.getUniformLocation(prog, 'u_time'),
                }
            };
        }
    }

    // Fullscreen quad VAO (clip-space triangle strip: −1..+1)
    _regionVAO = gl.createVertexArray();
    gl.bindVertexArray(_regionVAO);
    let buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,   -1,  1,   1,  1
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Source texture (will be uploaded from p5 canvas each frame)
    _regionSrcTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _regionSrcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Context loss handling
    _regionGLCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('[RegionFX] WebGL context lost');
    });
    _regionGLCanvas.addEventListener('webglcontextrestored', () => {
        console.log('[RegionFX] WebGL context restored — reinitialising');
        _regionPrograms = {};
        _regionFrameUploaded = -1;
        initRegionFX();
    });

    console.log('[RegionFX] Initialised —', Object.keys(_regionPrograms).length, 'programs compiled');
}

// ── Per-blob render ──────────────────────────────────────────

function applyRegionFX(blob, canvasEl) {
    if (!_regionGL || !canvasEl) return;
    let gl = _regionGL;

    // Determine which mode to apply for this blob
    let mode = regionFXMode;
    if (regionFXRandom) {
        // Deterministic per blob using blob position hash
        let hash = Math.abs(Math.round(blob.posicao.x * 7 + blob.posicao.y * 13)) % _REGION_MODES.length;
        mode = _REGION_MODES[hash];
    }
    let entry = _regionPrograms[mode];
    if (!entry) return;

    // Upload p5 canvas as texture once per frame
    if (_regionFrameUploaded !== frameCount) {
        gl.bindTexture(gl.TEXTURE_2D, _regionSrcTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // canvas top = V=1 (matches UV calc)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasEl);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // restore default
        gl.bindTexture(gl.TEXTURE_2D, null);
        _regionFrameUploaded = frameCount;
    }

    // Calculate blob rect in screen pixels
    let px = blob.posicao.x;
    let py = blob.posicao.y;
    let bw = blob.width || 80;
    let bh = blob.height || 80;
    let x1 = px - bw / 2;
    let y1 = py - bh / 2;

    // Clamp to canvas bounds
    let cw = canvasEl.width;
    let ch = canvasEl.height;
    x1 = Math.max(0, Math.min(x1, cw - 1));
    y1 = Math.max(0, Math.min(y1, ch - 1));
    let x2 = Math.min(px + bw / 2, cw);
    let y2 = Math.min(py + bh / 2, ch);
    let rw = x2 - x1;
    let rh = y2 - y1;
    if (rw < 2 || rh < 2) return;

    // Normalized UV rect for the vertex shader
    let uvX = x1 / cw;
    let uvY = 1.0 - (y1 + rh) / ch;  // WebGL Y is flipped
    let uvW = rw / cw;
    let uvH = rh / ch;

    // Intensity normalised 0–1
    let intensity = regionFXIntensity / 100;

    // Render to screen buffer
    _regionRenderPass(gl, entry, uvX, uvY, uvW, uvH, cw, ch, intensity);

    // Composite result back onto p5 canvas
    _compositeRegion(
        drawingContext, _regionGLCanvas,
        x1, y1, rw, rh,
        regionFXInvert, regionFXFusion, intensity
    );
}

function _regionRenderPass(gl, entry, uvX, uvY, uvW, uvH, canvasW, canvasH, intensity) {
    let { prog, locs } = entry;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // render to screen (preserveDrawingBuffer)
    gl.viewport(0, 0, _REGION_SIZE, _REGION_SIZE);
    gl.useProgram(prog);

    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _regionSrcTex);
    if (locs.u_texture !== null) gl.uniform1i(locs.u_texture, 0);

    // Uniforms (using cached locations)
    if (locs.u_blobRect !== null) gl.uniform4f(locs.u_blobRect, uvX, uvY, uvW, uvH);
    if (locs.u_intensity !== null) gl.uniform1f(locs.u_intensity, intensity);
    if (locs.u_resolution !== null) gl.uniform2f(locs.u_resolution, _REGION_SIZE, _REGION_SIZE);
    if (locs.u_texelSize !== null) gl.uniform2f(locs.u_texelSize, 1.0 / _REGION_SIZE, 1.0 / _REGION_SIZE);
    if (locs.u_time !== null) gl.uniform1f(locs.u_time, (typeof millis === 'function' ? millis() : performance.now()) / 1000.0);

    // Draw + flush (flush required before 2D canvas reads WebGL pixels via drawImage)
    gl.bindVertexArray(_regionVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.flush();
    gl.bindVertexArray(null);
}

function _compositeRegion(ctx, glCanvas, px, py, pw, ph, inverted, fusion, intensity) {
    ctx.save();

    if (inverted) {
        // Invert mode: apply effect OUTSIDE blob rect, leaving blob area untouched
        // Save the blob region first
        ctx.beginPath();
        ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // Cut out the blob rect (even-odd rule)
        ctx.rect(px, py, pw, ph);
        ctx.clip('evenodd');
    } else {
        // Normal mode: clip to blob rect
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();
    }

    if (fusion) {
        ctx.globalAlpha = 0.5;
    } else {
        ctx.globalAlpha = intensity;
    }

    // Draw the GL canvas region onto the p5 canvas
    // Source: full GL canvas (0,0,SIZE,SIZE) → dest: blob rect
    ctx.drawImage(glCanvas, 0, 0, _REGION_SIZE, _REGION_SIZE, px, py, pw, ph);
    ctx.restore();
}

// ── UI Wiring ────────────────────────────────────────────────

function wireRegionFXUI() {
    // Effect buttons — click to activate, click again to deactivate (like blob style)
    let btnContainer = document.getElementById('region-fx-buttons');
    if (btnContainer) {
        btnContainer.querySelectorAll('.selector-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                let mode = btn.dataset.rfx || 'none';
                if (regionFXMode === mode) {
                    // Click active effect again → deactivate
                    regionFXMode = 'none';
                    regionFXEnabled = false;
                    btn.classList.remove('active');
                } else {
                    // Activate this effect
                    regionFXMode = mode;
                    regionFXEnabled = true;
                    btnContainer.querySelectorAll('.selector-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        });
    }

    // Intensity slider
    let slider = document.getElementById('slider-rfx-intensity');
    let valDisplay = document.getElementById('val-rfx-intensity');
    if (slider) {
        slider.addEventListener('input', () => {
            regionFXIntensity = parseInt(slider.value);
            if (valDisplay) valDisplay.textContent = slider.value;
        });
    }

    // Checkboxes
    let chkInvert = document.getElementById('rfx-invert');
    if (chkInvert) chkInvert.addEventListener('change', () => { regionFXInvert = chkInvert.checked; });

    let chkFusion = document.getElementById('rfx-fusion');
    if (chkFusion) chkFusion.addEventListener('change', () => { regionFXFusion = chkFusion.checked; });

    let chkRandom = document.getElementById('rfx-random');
    if (chkRandom) chkRandom.addEventListener('change', () => { regionFXRandom = chkRandom.checked; });
}

// Wire UI after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireRegionFXUI);
} else {
    wireRegionFXUI();
}
