// ═══════════════════════════════════════════════════════════════
// blob-shader-fx.js — WebGL2 GPU Shader Effects Pipeline
// Phase 2.5: 30 effects, per-effect opacity, blend modes
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Fullscreen quad vertex shader (shared by all effects) ──
const VERT_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
}`;

const FRAG_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
    fragColor = texture(u_texture, v_texCoord);
}`;


// ═══════════════════════════════════════════════════════════════
// GLSL Fragment Shaders — 20 GPU Effects
// All support u_opacity (0–1) for per-effect opacity blending.
// ═══════════════════════════════════════════════════════════════

// ── 1. Bloom ─────────────────────────────────────────────────
const FRAG_BLOOM = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_threshold;
uniform float u_radius;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    float maxRad = u_radius * 20.0;
    vec3 bloom = vec3(0.0);
    float totalW = 0.0;
    const float GA = 2.39996323;
    for (int i = 0; i < 32; i++) {
        float r = sqrt(float(i) + 0.5) / sqrt(32.0) * maxRad;
        float th = float(i) * GA;
        vec2 off = vec2(cos(th), sin(th)) * r * texel;
        vec3 s = texture(u_texture, v_texCoord + off).rgb;
        float lum = dot(s, vec3(0.299, 0.587, 0.114));
        if (lum > u_threshold) {
            float w = 1.0 - r / (maxRad + 0.001);
            bloom += s * w; totalW += w;
        }
    }
    if (totalW > 0.0) bloom /= totalW;
    vec3 result = clamp(orig.rgb + bloom * u_intensity, 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 2. Blur / Sharpen ────────────────────────────────────────
const FRAG_BLUR_SHARP = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_amount;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec3 orig = texture(u_texture, v_texCoord).rgb;
    vec2 off = (1.0 / u_resolution) * max(1.0, abs(u_amount) / 20.0);
    vec3 blur =
        texture(u_texture, v_texCoord + vec2(-off.x,-off.y)).rgb * 0.0625 +
        texture(u_texture, v_texCoord + vec2(0,-off.y)).rgb * 0.125 +
        texture(u_texture, v_texCoord + vec2(off.x,-off.y)).rgb * 0.0625 +
        texture(u_texture, v_texCoord + vec2(-off.x,0)).rgb * 0.125 +
        orig * 0.25 +
        texture(u_texture, v_texCoord + vec2(off.x,0)).rgb * 0.125 +
        texture(u_texture, v_texCoord + vec2(-off.x,off.y)).rgb * 0.0625 +
        texture(u_texture, v_texCoord + vec2(0,off.y)).rgb * 0.125 +
        texture(u_texture, v_texCoord + vec2(off.x,off.y)).rgb * 0.0625;
    float t = abs(u_amount) / 100.0;
    vec3 result = u_amount > 0.0 ? mix(orig, blur, t) : orig + (orig - blur) * t * 3.0;
    fragColor = vec4(mix(orig, clamp(result, 0.0, 1.0), u_opacity), 1.0);
}`;

// ── 3. CRT ───────────────────────────────────────────────────
const FRAG_CRT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_chroma;
uniform float u_static;
uniform float u_scanWeight;
uniform float u_glow;
uniform float u_curvature;
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 uv = v_texCoord;
    if (u_curvature > 0.05) {
        vec2 cc = uv - 0.5;
        uv = 0.5 + cc * (1.0 + dot(cc,cc) * u_curvature * 0.8);
        if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) { fragColor = vec4(0,0,0,1); return; }
    }
    vec2 texel = 1.0 / u_resolution;
    float chrOff = u_chroma * texel.x;
    vec3 col = vec3(
        texture(u_texture, vec2(uv.x+chrOff, uv.y)).r,
        texture(u_texture, uv).g,
        texture(u_texture, vec2(uv.x-chrOff, uv.y)).b);
    if (u_scanWeight > 0.0) {
        float sl = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
        col *= 1.0 - (1.0-sl) * u_scanWeight * 0.3;
    }
    if (u_static > 0.0) {
        float n = hash(uv*u_resolution + u_time*1000.0);
        if (n > 1.0-u_static*0.3) col += vec3(n*0.25*u_static);
    }
    if (u_glow > 0.2) {
        vec3 g = vec3(0.0);
        for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) { if(i==0&&j==0) continue;
            g += texture(u_texture, uv+vec2(float(i),float(j))*texel*2.0).rgb; }
        col += g/24.0 * u_glow*0.15;
    }
    if (u_curvature > 0.05) {
        vec2 cc = uv-0.5; col *= clamp(1.0-dot(cc,cc)*u_curvature*3.0, 0.0, 1.0);
    }
    fragColor = vec4(mix(orig.rgb, clamp(col,0.0,1.0), u_opacity), 1.0);
}`;

// ── 4. Vignette ──────────────────────────────────────────────
const FRAG_VIGNETTE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_radius;
uniform vec3 u_color;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 cc = v_texCoord - 0.5;
    float dist = length(cc) * 2.0;
    float vig = smoothstep(u_radius*0.8, 0.9+(1.0-u_radius)*0.5, dist);
    vec3 result = mix(orig.rgb, u_color, vig * u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 5. Duotone ───────────────────────────────────────────────
const FRAG_DUOTONE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_shadow;
uniform vec3 u_highlight;
uniform float u_intensity;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    vec3 duo = mix(u_shadow, u_highlight, lum);
    vec3 result = mix(orig.rgb, duo, u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 6. Chromatic Aberration ──────────────────────────────────
const FRAG_CHROMATIC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_offset;
uniform float u_radial;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    vec3 result;
    if (u_radial > 0.5) {
        vec2 cc = v_texCoord - 0.5;
        vec2 dir = normalize(cc + 0.0001);
        float radOff = length(cc) * u_offset * texel.x * 2.0;
        result = vec3(
            texture(u_texture, v_texCoord + dir*radOff).r,
            orig.g,
            texture(u_texture, v_texCoord - dir*radOff).b);
    } else {
        float off = u_offset * texel.x;
        result = vec3(
            texture(u_texture, vec2(v_texCoord.x+off, v_texCoord.y)).r,
            orig.g,
            texture(u_texture, vec2(v_texCoord.x-off, v_texCoord.y)).b);
    }
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 7. Noise ─────────────────────────────────────────────────
const FRAG_NOISE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_scale;
uniform float u_mono;
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 cell = floor(v_texCoord * u_resolution / u_scale);
    float seed = floor(u_time * 30.0);
    vec3 n;
    if (u_mono > 0.5) {
        float v = hash(cell+seed)*2.0-1.0;
        n = vec3(v);
    } else {
        n = vec3(hash(cell+seed)*2.0-1.0, hash(cell+seed+100.0)*2.0-1.0, hash(cell+seed+200.0)*2.0-1.0);
    }
    vec3 result = clamp(orig.rgb + n * u_intensity * 0.5, 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 8. Scanlines ─────────────────────────────────────────────
const FRAG_SCANLINES = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_count;
uniform float u_vertical;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float coord = u_vertical > 0.5 ? v_texCoord.x : v_texCoord.y;
    float line = sin(coord * u_count * 3.14159) * 0.5 + 0.5;
    vec3 result = orig.rgb * (1.0 - (1.0-line) * u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 9. Levels ────────────────────────────────────────────────
const FRAG_LEVELS = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_inBlack;
uniform float u_inWhite;
uniform float u_gamma;
uniform float u_outBlack;
uniform float u_outWhite;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float inRange = max(0.001, u_inWhite - u_inBlack);
    float invG = u_gamma > 0.0 ? 1.0/u_gamma : 1.0;
    vec3 v = clamp((orig.rgb - u_inBlack) / inRange, 0.0, 1.0);
    v = pow(v, vec3(invG));
    vec3 result = u_outBlack + v * (u_outWhite - u_outBlack);
    fragColor = vec4(mix(orig.rgb, clamp(result,0.0,1.0), u_opacity), 1.0);
}`;

// ── 10. Halftone ─────────────────────────────────────────────
const FRAG_HALFTONE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_spacing;
uniform float u_angle;
uniform float u_contrast;
uniform vec3 u_ink;
uniform vec3 u_paper;
uniform float u_colorMode;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 px = v_texCoord * u_resolution;
    float cs = cos(u_angle), sn = sin(u_angle);
    vec2 rotPx = vec2(px.x*cs - px.y*sn, px.x*sn + px.y*cs);
    vec2 cell = floor(rotPx / u_spacing + 0.5) * u_spacing;
    vec2 samplePx = vec2(cell.x*cs + cell.y*sn, -cell.x*sn + cell.y*cs);
    vec2 sampleUV = clamp(samplePx / u_resolution, 0.0, 1.0);
    vec4 sampled = texture(u_texture, sampleUV);
    float dist = length(rotPx - cell);
    float lum = dot(sampled.rgb, vec3(0.299, 0.587, 0.114));
    lum = clamp(0.5 + (lum-0.5)*u_contrast, 0.0, 1.0);
    float dotR = (1.0-lum) * u_spacing * 0.48;
    vec3 result = dist < dotR ?
        (u_colorMode > 0.5 ? sampled.rgb * 0.8 : u_ink) : u_paper;
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;


// ═══════════════════════════════════════════════════════════════
// Phase 2 — 10 Additional Effects
// ═══════════════════════════════════════════════════════════════

// ── 11. Sepia ────────────────────────────────────────────────
const FRAG_SEPIA = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_warmth;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec3 s = vec3(
        min(1.0, orig.r*0.393 + orig.g*0.769 + orig.b*0.189),
        min(1.0, orig.r*0.349 + orig.g*0.686 + orig.b*0.168),
        min(1.0, orig.r*0.272 + orig.g*0.534 + orig.b*0.131));
    float w = u_warmth / 255.0;
    s.r = min(1.0, s.r + w*0.5);
    s.g = min(1.0, s.g + w*0.2);
    s.b = max(0.0, s.b - w*0.3);
    vec3 result = mix(orig.rgb, s, u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 12. Tint ─────────────────────────────────────────────────
const FRAG_TINT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform vec3 u_tintColor;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = u_tintColor * lum;
    vec3 result = mix(orig.rgb, tinted, u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 13. Brightness / Contrast / Saturation ───────────────────
const FRAG_BRICON = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_brightness;  // -1..+1 (from briValue/100)
uniform float u_contrast;    // 0..2 (from conValue/100)
uniform float u_saturation;  // 0..2 (from satValue/100)
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec3 c = orig.rgb + u_brightness;
    c = (c - 0.5) * u_contrast + 0.5;
    if (abs(u_saturation - 1.0) > 0.01) {
        float gray = dot(c, vec3(0.299, 0.587, 0.114));
        c = gray + (c - gray) * u_saturation;
    }
    fragColor = vec4(mix(orig.rgb, clamp(c, 0.0, 1.0), u_opacity), 1.0);
}`;

// ── 14. Threshold ────────────────────────────────────────────
const FRAG_THRESHOLD = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_level;   // 0–1
uniform float u_invert;  // 0 or 1
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    float val = lum > u_level ? 1.0 : 0.0;
    if (u_invert > 0.5) val = 1.0 - val;
    fragColor = vec4(mix(orig.rgb, vec3(val), u_opacity), 1.0);
}`;

// ── 15. Exposure ─────────────────────────────────────────────
const FRAG_EXPOSURE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_ev;  // exposure value in EV stops
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec3 result = clamp(orig.rgb * pow(2.0, u_ev), 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 16. Color Temperature ────────────────────────────────────
const FRAG_COLORTEMP = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_temp;  // -1..+1 (warm to cool)
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float rShift = u_temp > 0.0 ? u_temp * 0.157 : 0.0;
    float bShift = u_temp < 0.0 ? -u_temp * 0.157 : 0.0;
    float gShift = -abs(u_temp) * 0.039;
    vec3 result = clamp(orig.rgb + vec3(rShift, gShift, bShift), 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 17. Grain ────────────────────────────────────────────────
const FRAG_GRAIN = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_size;
uniform float u_mono;
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 cell = floor(v_texCoord * u_resolution / u_size);
    float seed = floor(u_time * 24.0);
    vec3 n;
    if (u_mono > 0.5) {
        float v = (hash(cell+seed) - 0.5) * u_intensity * 0.314;
        n = vec3(v);
    } else {
        n = vec3(
            (hash(cell+seed) - 0.5),
            (hash(cell+seed+100.0) - 0.5),
            (hash(cell+seed+200.0) - 0.5)) * u_intensity * 0.314;
    }
    vec3 result = clamp(orig.rgb + n, 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 18. Glitch ───────────────────────────────────────────────
const FRAG_GLITCH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_freq;
uniform float u_speed;
uniform float u_channelShift;
uniform float u_blockSize;
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 uv = v_texCoord;
    float seed = floor(u_time * u_speed);
    float bsz = max(4.0, u_blockSize);
    float blockY = floor(uv.y * u_resolution.y / bsz);
    float h = hash(vec2(blockY, seed));
    // Block row shift
    if (h > 1.0 - u_freq) {
        float offset = (hash(vec2(blockY+1.0, seed)) - 0.5) * u_intensity * 0.2;
        uv.x = fract(uv.x + offset);
    }
    // RGB channel separation
    float chrOff = u_channelShift / u_resolution.x;
    vec3 result = vec3(
        texture(u_texture, vec2(uv.x + chrOff, uv.y)).r,
        texture(u_texture, uv).g,
        texture(u_texture, vec2(uv.x - chrOff, uv.y)).b);
    // Random color corruption on some blocks
    float h2 = hash(vec2(blockY + 50.0, seed));
    if (h2 > 1.0 - u_freq * 0.3) {
        result.rgb = vec3(result.r, result.b, result.g); // channel swap
    }
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 19. Emboss ───────────────────────────────────────────────
const FRAG_EMBOSS = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;     // radians
uniform float u_strength;  // 0–1
uniform float u_colorMode; // 0 = gray, 1 = color-preserve
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    float dx = cos(u_angle), dy = sin(u_angle);
    vec2 d = vec2(dx, dy) * texel;
    vec3 s1 = texture(u_texture, v_texCoord + d).rgb;
    vec3 s2 = texture(u_texture, v_texCoord - d).rgb;
    vec3 result;
    if (u_colorMode > 0.5) {
        float eGray = dot(s1 - s2, vec3(1.0/3.0));
        float factor = (eGray + 0.5) / 0.5;
        result = mix(orig.rgb, clamp(orig.rgb * factor, 0.0, 1.0), u_strength);
    } else {
        vec3 embossed = s1 - s2 + 0.5;
        result = mix(orig.rgb, clamp(embossed, 0.0, 1.0), u_strength);
    }
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 20. Pixelate ─────────────────────────────────────────────
const FRAG_PIXELATE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_size;  // block size in pixels
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 cellSize = vec2(u_size) / u_resolution;
    vec2 cell = floor(v_texCoord / cellSize + 0.5) * cellSize;
    vec3 result = texture(u_texture, clamp(cell, 0.0, 1.0)).rgb;
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;


// ═══════════════════════════════════════════════════════════════
// Phase 2.5 — 10 Additional Effects + Blend Modes
// ═══════════════════════════════════════════════════════════════

// ── 21. Gradient Map ─────────────────────────────────────────
const FRAG_GRADMAP = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec3 u_color3;
uniform float u_midpoint;
uniform float u_intensity;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    vec3 mapped;
    if (lum <= u_midpoint) {
        float t = u_midpoint > 0.0 ? lum / u_midpoint : 0.0;
        mapped = mix(u_color1, u_color3, t);
    } else {
        float t = u_midpoint < 1.0 ? (lum - u_midpoint) / (1.0 - u_midpoint) : 1.0;
        mapped = mix(u_color3, u_color2, t);
    }
    vec3 result = mix(orig.rgb, mapped, u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 22. Thermal ──────────────────────────────────────────────
const FRAG_THERMAL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_palette;
uniform float u_opacity;
out vec4 fragColor;
vec3 thermalLookup(float lum, float pal) {
    const vec3 d[11] = vec3[11](
        vec3(0,0,.502),vec3(0,0,1),vec3(0,.502,1),vec3(0,1,1),vec3(0,1,.502),
        vec3(0,1,0),vec3(.502,1,0),vec3(1,1,0),vec3(1,.502,0),vec3(1,0,0),vec3(1,1,1));
    const vec3 ir[9] = vec3[9](
        vec3(0,0,0),vec3(0,0,.392),vec3(.314,0,.471),vec3(.627,0,.314),
        vec3(.784,.196,0),vec3(1,.392,0),vec3(1,.784,.196),vec3(1,1,.588),vec3(1,1,1));
    const vec3 rb[8] = vec3[8](
        vec3(0,0,.502),vec3(0,0,1),vec3(0,1,1),vec3(0,1,0),
        vec3(1,1,0),vec3(1,.502,0),vec3(1,0,0),vec3(1,0,.502));
    const vec3 ar[7] = vec3[7](
        vec3(0,.078,.235),vec3(0,.235,.471),vec3(.157,.471,.706),
        vec3(.392,.706,.863),vec3(.706,.863,.941),vec3(.863,.941,1),vec3(1,1,1));
    const vec3 ni[7] = vec3[7](
        vec3(0,0,0),vec3(0,.078,0),vec3(0,.196,.039),
        vec3(0,.353,.078),vec3(.039,.549,.118),vec3(.118,.784,.196),vec3(.706,1,.706));
    if (pal < 0.5) {
        float p = lum * 10.0; int lo = int(floor(p));
        return mix(d[min(lo,10)], d[min(lo+1,10)], fract(p));
    } else if (pal < 1.5) {
        float p = lum * 8.0; int lo = int(floor(p));
        return mix(ir[min(lo,8)], ir[min(lo+1,8)], fract(p));
    } else if (pal < 2.5) {
        float p = lum * 7.0; int lo = int(floor(p));
        return mix(rb[min(lo,7)], rb[min(lo+1,7)], fract(p));
    } else if (pal < 3.5) {
        float p = lum * 6.0; int lo = int(floor(p));
        return mix(ar[min(lo,6)], ar[min(lo+1,6)], fract(p));
    } else {
        float p = lum * 6.0; int lo = int(floor(p));
        return mix(ni[min(lo,6)], ni[min(lo+1,6)], fract(p));
    }
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    vec3 thermal = thermalLookup(lum, u_palette);
    vec3 result = mix(orig.rgb, thermal, u_intensity);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 23. RGB Shift ────────────────────────────────────────────
const FRAG_RGBSHIFT = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_rOffset;
uniform vec2 u_bOffset;
uniform float u_intensity;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    vec2 rOff = u_rOffset * texel * u_intensity;
    vec2 bOff = u_bOffset * texel * u_intensity;
    float r = texture(u_texture, v_texCoord + rOff).r;
    float b = texture(u_texture, v_texCoord + bOff).b;
    vec3 result = vec3(r, orig.g, b);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 24. Wave ─────────────────────────────────────────────────
const FRAG_WAVE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_speed;
uniform float u_mode;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 uv = v_texCoord;
    float t = u_time * u_speed * 0.05;
    float amp = u_amplitude * 0.5 / u_resolution.x;
    if (u_mode < 0.5) {
        float off = sin(uv.y * u_frequency * 0.05 * u_resolution.y + t) * amp;
        uv.x = clamp(uv.x + off, 0.0, 1.0);
    } else if (u_mode < 1.5) {
        float off = sin(uv.x * u_frequency * 0.05 * u_resolution.x + t) * amp;
        uv.y = clamp(uv.y + off, 0.0, 1.0);
    } else {
        vec2 delta = uv - 0.5;
        float dist = length(delta * u_resolution);
        float wave = sin(dist * u_frequency * 0.05 + t) * amp;
        vec2 dir = normalize(delta + 0.0001);
        uv = clamp(uv + dir * wave, 0.0, 1.0);
    }
    vec3 result = texture(u_texture, uv).rgb;
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 25. Dither (Bayer) ───────────────────────────────────────
const FRAG_DITHER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_strength;
uniform float u_pixelation;
uniform float u_colorCount;
uniform float u_opacity;
out vec4 fragColor;
float bayer8(vec2 pos) {
    const float m[64] = float[64](
        0.0,32.0,8.0,40.0,2.0,34.0,10.0,42.0,
        48.0,16.0,56.0,24.0,50.0,18.0,58.0,26.0,
        12.0,44.0,4.0,36.0,14.0,46.0,6.0,38.0,
        60.0,28.0,52.0,20.0,62.0,30.0,54.0,22.0,
        3.0,35.0,11.0,43.0,1.0,33.0,9.0,41.0,
        51.0,19.0,59.0,27.0,49.0,17.0,57.0,25.0,
        15.0,47.0,7.0,39.0,13.0,45.0,5.0,37.0,
        63.0,31.0,55.0,23.0,61.0,29.0,53.0,21.0);
    int x = int(mod(pos.x, 8.0));
    int y = int(mod(pos.y, 8.0));
    return m[y * 8 + x] / 64.0;
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 px = floor(v_texCoord * u_resolution / u_pixelation) * u_pixelation;
    vec4 sampled = texture(u_texture, (px + 0.5) / u_resolution);
    float bayerVal = bayer8(px) - 0.5;
    float levels = max(1.0, u_colorCount - 1.0);
    vec3 dithered = floor(sampled.rgb * levels + bayerVal * u_strength + 0.5) / levels;
    fragColor = vec4(mix(orig.rgb, clamp(dithered, 0.0, 1.0), u_opacity), 1.0);
}`;

// ── 26. Swirl ────────────────────────────────────────────────
const FRAG_SWIRL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_angle;
uniform float u_radius;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 center = vec2(0.5);
    vec2 delta = v_texCoord - center;
    vec2 aspect = vec2(1.0, u_resolution.y / u_resolution.x);
    float dist = length(delta * aspect) * 2.0;
    float radius = u_radius;
    vec2 uv = v_texCoord;
    if (dist < radius) {
        float pct = (radius - dist) / radius;
        float theta = pct * pct * u_angle;
        float s = sin(theta), c = cos(theta);
        delta = vec2(delta.x * c - delta.y * s, delta.x * s + delta.y * c);
        uv = clamp(center + delta, 0.0, 1.0);
    }
    vec3 result = texture(u_texture, uv).rgb;
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 27. Ripple ───────────────────────────────────────────────
const FRAG_RIPPLE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_speed;
uniform float u_damping;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 center = vec2(0.5);
    vec2 delta = v_texCoord - center;
    float dist = length(delta * u_resolution);
    float maxR = length(u_resolution) * 0.5;
    float dampFactor = u_damping > 0.0 ? exp(-dist / maxR * u_damping * 3.0) : 1.0;
    float wave = sin(dist * u_frequency * 0.05 - u_time * u_speed * 0.1) * u_amplitude * 0.3 / u_resolution.x * dampFactor;
    vec2 dir = normalize(delta + 0.0001);
    vec2 uv = clamp(v_texCoord + dir * wave, 0.0, 1.0);
    vec3 result = texture(u_texture, uv).rgb;
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 28. NTSC ─────────────────────────────────────────────────
const FRAG_NTSC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_chromaBleed;
uniform float u_instability;
uniform float u_noise;
uniform float u_rolling;
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    vec3 result = orig.rgb;
    if (u_chromaBleed > 0.0) {
        float bleed = u_chromaBleed * 8.0 * texel.x;
        result.r = result.r * 0.5 + texture(u_texture, vec2(v_texCoord.x + bleed, v_texCoord.y)).r * 0.5;
        result.b = result.b * 0.5 + texture(u_texture, vec2(v_texCoord.x - bleed, v_texCoord.y)).b * 0.5;
    }
    if (u_instability > 0.0) {
        float jitter = (hash(vec2(floor(v_texCoord.y * u_resolution.y * 0.5), floor(u_time * 30.0))) - 0.5) * u_instability * 0.118;
        result.r += jitter;
        result.g -= jitter * 0.5;
    }
    if (u_noise > 0.0) {
        float n = hash(v_texCoord * u_resolution + u_time * 1000.0);
        if (n > 1.0 - u_noise * 0.4) {
            float noiseVal = (hash(v_texCoord * u_resolution + u_time * 999.0) - 0.5) * u_noise * 0.314;
            result += vec3(noiseVal);
        }
    }
    if (u_rolling > 0.5) {
        float barPos = fract(u_time * 0.5);
        float barWidth = 0.08;
        float dist = abs(v_texCoord.y - barPos);
        if (dist < barWidth) result += vec3(0.118 * (1.0 - dist / barWidth));
    }
    fragColor = vec4(mix(orig.rgb, clamp(result, 0.0, 1.0), u_opacity), 1.0);
}`;

// ── 29. Color Balance ────────────────────────────────────────
const FRAG_COLORBAL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec3 u_shadow;
uniform vec3 u_mid;
uniform vec3 u_hi;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.299, 0.587, 0.114));
    float sw = max(0.0, 1.0 - lum * 3.0);
    float mw = max(0.0, 1.0 - abs(lum - 0.5) * 4.0);
    float hw = max(0.0, lum * 3.0 - 2.0);
    vec3 shift = u_shadow * sw + u_mid * mw + u_hi * hw;
    vec3 result = clamp(orig.rgb + shift, 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 30. RGB Gain ─────────────────────────────────────────────
const FRAG_RGBGAIN = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_rGain;
uniform float u_gGain;
uniform float u_bGain;
uniform float u_gamma;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float invG = u_gamma > 0.0 ? 1.0 / u_gamma : 1.0;
    vec3 result = pow(clamp(orig.rgb * vec3(u_rGain, u_gGain, u_bGain), 0.0, 1.0), vec3(invG));
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── Blend Pass Shader ────────────────────────────────────────
const FRAG_BLEND = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform sampler2D u_original;
uniform float u_blendMode;
uniform float u_opacity;
out vec4 fragColor;
void main() {
    vec3 base = texture(u_original, v_texCoord).rgb;
    vec3 blend = texture(u_texture, v_texCoord).rgb;
    vec3 result;
    if (u_blendMode < 0.5) {
        result = blend;
    } else if (u_blendMode < 1.5) {
        result = base * blend;
    } else if (u_blendMode < 2.5) {
        result = 1.0 - (1.0 - base) * (1.0 - blend);
    } else if (u_blendMode < 3.5) {
        result = vec3(
            base.r < 0.5 ? 2.0*base.r*blend.r : 1.0-2.0*(1.0-base.r)*(1.0-blend.r),
            base.g < 0.5 ? 2.0*base.g*blend.g : 1.0-2.0*(1.0-base.g)*(1.0-blend.g),
            base.b < 0.5 ? 2.0*base.b*blend.b : 1.0-2.0*(1.0-base.b)*(1.0-blend.b));
    } else if (u_blendMode < 4.5) {
        result = vec3(
            blend.r < 0.5 ? base.r-(1.0-2.0*blend.r)*base.r*(1.0-base.r) : base.r+(2.0*blend.r-1.0)*(sqrt(base.r)-base.r),
            blend.g < 0.5 ? base.g-(1.0-2.0*blend.g)*base.g*(1.0-base.g) : base.g+(2.0*blend.g-1.0)*(sqrt(base.g)-base.g),
            blend.b < 0.5 ? base.b-(1.0-2.0*blend.b)*base.b*(1.0-base.b) : base.b+(2.0*blend.b-1.0)*(sqrt(base.b)-base.b));
    } else if (u_blendMode < 5.5) {
        result = vec3(
            blend.r < 0.5 ? 2.0*base.r*blend.r : 1.0-2.0*(1.0-base.r)*(1.0-blend.r),
            blend.g < 0.5 ? 2.0*base.g*blend.g : 1.0-2.0*(1.0-base.g)*(1.0-blend.g),
            blend.b < 0.5 ? 2.0*base.b*blend.b : 1.0-2.0*(1.0-base.b)*(1.0-blend.b));
    } else if (u_blendMode < 6.5) {
        result = abs(base - blend);
    } else {
        result = base + blend - 2.0 * base * blend;
    }
    fragColor = vec4(mix(base, result, u_opacity), 1.0);
}`;

// Blend mode constants
const BLEND_NORMAL = 0;
const BLEND_MULTIPLY = 1;
const BLEND_SCREEN = 2;
const BLEND_OVERLAY = 3;
const BLEND_SOFT_LIGHT = 4;
const BLEND_HARD_LIGHT = 5;
const BLEND_DIFFERENCE = 6;
const BLEND_EXCLUSION = 7;


// ═══════════════════════════════════════════════════════════════
// ShaderFX Pipeline Class
// ═══════════════════════════════════════════════════════════════

class ShaderFXPipeline {
    constructor() {
        this.gl = null;
        this.glCanvas = null;
        this.quadVAO = null;
        this.quadVBO = null;
        this.sourceTexture = null;
        this.framebuffers = [null, null];
        this.fbTextures = [null, null];
        this.programs = new Map();
        this.effectChain = [];
        this.activeEffects = new Set();
        this.effectOpacity = new Map();   // per-effect opacity (0–1)
        this.effectBlendMode = new Map(); // per-effect blend mode (0=normal)
        this.width = 0;
        this.height = 0;
        this.enabled = false;
        this.ready = false;
        this._pingPongIdx = 0;
        this._blendProgram = null;       // blend pass program entry
    }

    init(width, height) {
        this.width = width;
        this.height = height;
        this.glCanvas = document.createElement('canvas');
        this.glCanvas.width = width;
        this.glCanvas.height = height;
        this.glCanvas.style.display = 'none';

        const gl = this.glCanvas.getContext('webgl2', {
            alpha: false, depth: false, stencil: false,
            antialias: false, premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });
        if (!gl) {
            console.warn('[ShaderFX] WebGL2 not available');
            return false;
        }
        this.gl = gl;
        console.log('[ShaderFX] WebGL2 context created:', gl.getParameter(gl.VERSION));
        this._initQuad();
        this.sourceTexture = this._createTexture();
        this._initFramebuffers();
        this.registerEffect('passthrough', VERT_PASSTHROUGH, FRAG_PASSTHROUGH);
        this.ready = true;
        this.enabled = true;
        console.log('[ShaderFX] Pipeline ready (' + width + 'x' + height + ')');
        return true;
    }

    _initQuad() {
        const gl = this.gl;
        const vertices = new Float32Array([
            -1,-1, 0,0,  1,-1, 1,0,  -1,1, 0,1,  1,1, 1,1,
        ]);
        this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(this.quadVAO);
        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
        gl.bindVertexArray(null);
    }

    _createTexture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
    }

    _initFramebuffers() {
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            const tex = this._createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height,
                          0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                                    gl.TEXTURE_2D, tex, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                console.error('[ShaderFX] FBO ' + i + ' incomplete');
            this.framebuffers[i] = fbo;
            this.fbTextures[i] = tex;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[ShaderFX] Compile error:\n' + gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _linkProgram(vertSrc, fragSrc) {
        const gl = this.gl;
        const vert = this._compileShader(gl.VERTEX_SHADER, vertSrc);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
        if (!vert || !frag) return null;
        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.bindAttribLocation(program, 0, 'a_position');
        gl.bindAttribLocation(program, 1, 'a_texCoord');
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('[ShaderFX] Link error:\n' + gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        gl.detachShader(program, vert); gl.detachShader(program, frag);
        gl.deleteShader(vert); gl.deleteShader(frag);
        return program;
    }

    registerEffect(name, vertSrc, fragSrc) {
        const program = this._linkProgram(vertSrc, fragSrc);
        if (!program) { console.error('[ShaderFX] Failed:', name); return false; }
        const gl = this.gl;
        const uniforms = {};
        const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = {
                location: gl.getUniformLocation(program, info.name),
                type: info.type, size: info.size
            };
        }
        this.programs.set(name, { program, uniforms });
        this.effectOpacity.set(name, 1.0);
        console.log('[ShaderFX] Registered:', name, '(' + n + ' uniforms)');
        return true;
    }

    setUniform(effectName, uniformName, value) {
        const entry = this.programs.get(effectName);
        if (!entry) return;
        const u = entry.uniforms[uniformName];
        if (!u) return;
        const gl = this.gl;
        gl.useProgram(entry.program);
        switch (u.type) {
            case gl.FLOAT:      gl.uniform1f(u.location, value); break;
            case gl.FLOAT_VEC2: gl.uniform2fv(u.location, value); break;
            case gl.FLOAT_VEC3: gl.uniform3fv(u.location, value); break;
            case gl.FLOAT_VEC4: gl.uniform4fv(u.location, value); break;
            case gl.INT: case gl.SAMPLER_2D: gl.uniform1i(u.location, value); break;
            case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.location, false, value); break;
            case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.location, false, value); break;
            default: gl.uniform1f(u.location, value);
        }
    }

    setEffectChain(effectNames) {
        this.effectChain = effectNames.filter(n => this.programs.has(n));
    }

    setEffectOpacity(name, opacity) {
        this.effectOpacity.set(name, Math.max(0, Math.min(1, opacity)));
    }

    setEffectBlendMode(name, mode) {
        this.effectBlendMode.set(name, mode);
    }

    _renderPass(entry, inputTexture, targetFBO, opacity) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(entry.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        if (entry.uniforms['u_texture'])
            gl.uniform1i(entry.uniforms['u_texture'].location, 0);
        if (entry.uniforms['u_resolution'])
            gl.uniform2f(entry.uniforms['u_resolution'].location, this.width, this.height);
        if (entry.uniforms['u_time'])
            gl.uniform1f(entry.uniforms['u_time'].location, performance.now() / 1000.0);
        if (entry.uniforms['u_opacity'])
            gl.uniform1f(entry.uniforms['u_opacity'].location, opacity);
        gl.bindVertexArray(this.quadVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    process(sourceCanvas) {
        if (!this.ready || !this.enabled) return;
        const gl = this.gl;
        const chain = this.effectChain.filter(n => this.activeEffects.has(n));
        if (chain.length === 0) return;

        if (sourceCanvas.width !== this.width || sourceCanvas.height !== this.height)
            this.resize(sourceCanvas.width, sourceCanvas.height);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

        this._pingPongIdx = 0;
        let inputTexture = this.sourceTexture;

        for (let i = 0; i < chain.length; i++) {
            const effectName = chain[i];
            const entry = this.programs.get(effectName);
            const isLast = (i === chain.length - 1);
            const blendMode = this.effectBlendMode.get(effectName) || 0;
            const opacity = this.effectOpacity.get(effectName) ?? 1.0;

            if (blendMode === 0) {
                // Normal blend: effect handles opacity internally
                const targetFBO = isLast ? null : this.framebuffers[this._pingPongIdx];
                this._renderPass(entry, inputTexture, targetFBO, opacity);
                if (!isLast) {
                    inputTexture = this.fbTextures[this._pingPongIdx];
                    this._pingPongIdx = 1 - this._pingPongIdx;
                }
            } else {
                // Non-normal blend: render effect at full strength, then blend pass
                const preEffectTexture = inputTexture;

                // Render effect to pingpong buffer (full opacity)
                this._renderPass(entry, inputTexture, this.framebuffers[this._pingPongIdx], 1.0);
                const effectTexture = this.fbTextures[this._pingPongIdx];
                const blendIdx = 1 - this._pingPongIdx;

                // Blend pass: combine pre-effect + effect output
                const blendEntry = this._blendProgram;
                const blendTarget = isLast ? null : this.framebuffers[blendIdx];
                gl.bindFramebuffer(gl.FRAMEBUFFER, blendTarget);
                gl.viewport(0, 0, this.width, this.height);
                gl.useProgram(blendEntry.program);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, effectTexture);
                gl.uniform1i(blendEntry.uniforms['u_texture'].location, 0);

                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, preEffectTexture);
                gl.uniform1i(blendEntry.uniforms['u_original'].location, 1);

                gl.uniform1f(blendEntry.uniforms['u_blendMode'].location, blendMode);
                gl.uniform1f(blendEntry.uniforms['u_opacity'].location, opacity);

                gl.bindVertexArray(this.quadVAO);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                gl.bindVertexArray(null);

                if (!isLast) {
                    inputTexture = this.fbTextures[blendIdx];
                    // pingPongIdx stays same (we used both buffers, result in blendIdx)
                    this._pingPongIdx = 1 - blendIdx;
                }
            }
        }

        if (typeof drawingContext !== 'undefined' && drawingContext)
            drawingContext.drawImage(this.glCanvas, 0, 0);
    }

    resize(w, h) {
        if (w === this.width && h === this.height) return;
        this.width = w; this.height = h;
        this.glCanvas.width = w; this.glCanvas.height = h;
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this.fbTextures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        console.log('[ShaderFX] Resized to', w, 'x', h);
    }

    enableEffect(name) { this.activeEffects.add(name); }
    disableEffect(name) { this.activeEffects.delete(name); }
    toggleEffect(name) {
        if (this.activeEffects.has(name)) this.activeEffects.delete(name);
        else this.activeEffects.add(name);
    }
    isEffectActive(name) { return this.activeEffects.has(name); }

    destroy() {
        if (!this.gl) return;
        const gl = this.gl;
        this.programs.forEach(({ program }) => gl.deleteProgram(program));
        this.programs.clear();
        gl.deleteTexture(this.sourceTexture);
        for (let i = 0; i < 2; i++) {
            gl.deleteTexture(this.fbTextures[i]);
            gl.deleteFramebuffer(this.framebuffers[i]);
        }
        gl.deleteBuffer(this.quadVBO);
        gl.deleteVertexArray(this.quadVAO);
        this.glCanvas.remove();
        this.gl = null; this.ready = false; this.enabled = false;
        console.log('[ShaderFX] Pipeline destroyed');
    }
}


// ═══════════════════════════════════════════════════════════════
// Shader Effect Registry
// ═══════════════════════════════════════════════════════════════

const SHADER_CHAIN_ORDER = [
    // Color tier
    'sepia', 'tint', 'bricon', 'exposure', 'colortemp', 'levels', 'duotone', 'threshold',
    'gradmap', 'thermal', 'rgbgain', 'colorbal',
    // Distortion tier
    'chroma', 'rgbshift', 'blursharp', 'emboss',
    'wave', 'swirl', 'ripple',
    // Pattern tier
    'bloom', 'pixel', 'dither',
    // Overlay tier
    'glitch', 'noise', 'grain', 'crt', 'ntsc',
    // Hybrid → shader
    'halftone',
    // Draw → shader
    'scanlines', 'vignette',
];

const SHADER_EFFECT_REGISTRY = {};

function _hexToGL(hex) {
    hex = hex || '#000000';
    return [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255];
}

function registerCoreShaderEffects() {
    const tints = { green:[0,1,0], amber:[1,0.749,0], cyan:[0,1,1], blue:[0,0.392,1] };
    const effects = [
        // Phase 1 — original 10
        { name:'bloom', frag:FRAG_BLOOM, sync:()=>{
            shaderFX.setUniform('bloom','u_intensity',bloomIntensity/100);
            shaderFX.setUniform('bloom','u_threshold',bloomThreshold/100);
            shaderFX.setUniform('bloom','u_radius',bloomRadius/100);
        }},
        { name:'blursharp', frag:FRAG_BLUR_SHARP, sync:()=>{
            shaderFX.setUniform('blursharp','u_amount',blursharpAmount);
        }},
        { name:'crt', frag:FRAG_CRT, sync:()=>{
            shaderFX.setUniform('crt','u_chroma',crtChroma);
            shaderFX.setUniform('crt','u_static',crtStatic/100);
            shaderFX.setUniform('crt','u_scanWeight',crtScanWeight);
            shaderFX.setUniform('crt','u_glow',crtGlow/100);
            shaderFX.setUniform('crt','u_curvature',crtCurvature/100);
        }},
        { name:'vignette', frag:FRAG_VIGNETTE, sync:()=>{
            shaderFX.setUniform('vignette','u_intensity',vigIntensity/100);
            shaderFX.setUniform('vignette','u_radius',vigRadius/100);
            shaderFX.setUniform('vignette','u_color',_hexToGL(vigColor));
        }},
        { name:'duotone', frag:FRAG_DUOTONE, sync:()=>{
            shaderFX.setUniform('duotone','u_shadow',_hexToGL(duoShadow));
            shaderFX.setUniform('duotone','u_highlight',_hexToGL(duoHighlight));
            shaderFX.setUniform('duotone','u_intensity',duoIntensity/100);
        }},
        { name:'chroma', frag:FRAG_CHROMATIC, sync:()=>{
            shaderFX.setUniform('chroma','u_offset',chromaOffset);
            shaderFX.setUniform('chroma','u_radial',chromaMode==='radial'?1:0);
        }},
        { name:'noise', frag:FRAG_NOISE, sync:()=>{
            shaderFX.setUniform('noise','u_intensity',noiseIntensity/100);
            shaderFX.setUniform('noise','u_scale',noiseScale);
            shaderFX.setUniform('noise','u_mono',noiseColorMode==='mono'?1:0);
        }},
        { name:'scanlines', frag:FRAG_SCANLINES, sync:()=>{
            shaderFX.setUniform('scanlines','u_intensity',scanIntensity/100);
            shaderFX.setUniform('scanlines','u_count',scanCount);
            shaderFX.setUniform('scanlines','u_vertical',scanVertical?1:0);
        }},
        { name:'levels', frag:FRAG_LEVELS, sync:()=>{
            shaderFX.setUniform('levels','u_inBlack',levelsInBlack/255);
            shaderFX.setUniform('levels','u_inWhite',levelsInWhite/255);
            shaderFX.setUniform('levels','u_gamma',levelsGamma);
            shaderFX.setUniform('levels','u_outBlack',levelsOutBlack/255);
            shaderFX.setUniform('levels','u_outWhite',levelsOutWhite/255);
        }},
        { name:'halftone', frag:FRAG_HALFTONE, sync:()=>{
            shaderFX.setUniform('halftone','u_spacing',halfSpacing);
            shaderFX.setUniform('halftone','u_angle',halfAngle*Math.PI/180);
            shaderFX.setUniform('halftone','u_contrast',halfContrast/50);
            let ink=_hexToGL(halfInverted?halfPaperColor:halfInkColor);
            let paper=_hexToGL(halfInverted?halfInkColor:halfPaperColor);
            shaderFX.setUniform('halftone','u_ink',ink);
            shaderFX.setUniform('halftone','u_paper',paper);
            shaderFX.setUniform('halftone','u_colorMode',halfColorMode==='color'?1:0);
        }},
        // Phase 2 — 10 new effects
        { name:'sepia', frag:FRAG_SEPIA, sync:()=>{
            shaderFX.setUniform('sepia','u_intensity',sepiaIntensity/100);
            shaderFX.setUniform('sepia','u_warmth',sepiaWarmth);
        }},
        { name:'tint', frag:FRAG_TINT, sync:()=>{
            shaderFX.setUniform('tint','u_intensity',tintIntensity/100);
            let tc = tintPreset==='custom' ? _hexToGL(tintCustomColor) : (tints[tintPreset]||tints.green);
            shaderFX.setUniform('tint','u_tintColor',tc);
        }},
        { name:'bricon', frag:FRAG_BRICON, sync:()=>{
            shaderFX.setUniform('bricon','u_brightness',briValue/100);
            shaderFX.setUniform('bricon','u_contrast',conValue/100);
            shaderFX.setUniform('bricon','u_saturation',satValue/100);
        }},
        { name:'threshold', frag:FRAG_THRESHOLD, sync:()=>{
            shaderFX.setUniform('threshold','u_level',thresholdLevel/255);
            shaderFX.setUniform('threshold','u_invert',thresholdInvert?1:0);
        }},
        { name:'exposure', frag:FRAG_EXPOSURE, sync:()=>{
            shaderFX.setUniform('exposure','u_ev',exposureEV/10);
        }},
        { name:'colortemp', frag:FRAG_COLORTEMP, sync:()=>{
            shaderFX.setUniform('colortemp','u_temp',colortempValue/100);
        }},
        { name:'grain', frag:FRAG_GRAIN, sync:()=>{
            shaderFX.setUniform('grain','u_intensity',grainIntensity/100);
            let sz = Math.max(1, Math.round((grainSize-5)/(40-5)*7+1));
            shaderFX.setUniform('grain','u_size',sz);
            shaderFX.setUniform('grain','u_mono',grainColorMode==='mono'?1:0);
        }},
        { name:'glitch', frag:FRAG_GLITCH, sync:()=>{
            shaderFX.setUniform('glitch','u_intensity',glitchIntensity/100);
            shaderFX.setUniform('glitch','u_freq',glitchFreq/100);
            shaderFX.setUniform('glitch','u_speed',Math.max(1,glitchSpeed/10));
            shaderFX.setUniform('glitch','u_channelShift',glitchChannelShift*0.3);
            shaderFX.setUniform('glitch','u_blockSize',Math.max(4,glitchBlockSize*0.5));
        }},
        { name:'emboss', frag:FRAG_EMBOSS, sync:()=>{
            shaderFX.setUniform('emboss','u_angle',embossAngle*Math.PI/180);
            shaderFX.setUniform('emboss','u_strength',embossStrength/100);
            shaderFX.setUniform('emboss','u_colorMode',embossColor?1:0);
        }},
        { name:'pixel', frag:FRAG_PIXELATE, sync:()=>{
            shaderFX.setUniform('pixel','u_size',Math.max(2,pixelSize));
        }},
        // Phase 2.5 — 10 new effects
        { name:'gradmap', frag:FRAG_GRADMAP, sync:()=>{
            shaderFX.setUniform('gradmap','u_color1',_hexToGL(gradColor1));
            shaderFX.setUniform('gradmap','u_color2',_hexToGL(gradColor2));
            shaderFX.setUniform('gradmap','u_color3',_hexToGL(gradColor3));
            shaderFX.setUniform('gradmap','u_midpoint',gradMidpoint/100);
            shaderFX.setUniform('gradmap','u_intensity',gradIntensity/100);
        }},
        { name:'thermal', frag:FRAG_THERMAL, sync:()=>{
            shaderFX.setUniform('thermal','u_intensity',thermalIntensity/100);
            let palIdx = {default:0,iron:1,rainbow:2,arctic:3,night:4}[thermalPalette]||0;
            shaderFX.setUniform('thermal','u_palette',palIdx);
        }},
        { name:'rgbshift', frag:FRAG_RGBSHIFT, sync:()=>{
            shaderFX.setUniform('rgbshift','u_rOffset',[rgbShiftRX,rgbShiftRY]);
            shaderFX.setUniform('rgbshift','u_bOffset',[rgbShiftBX,rgbShiftBY]);
            shaderFX.setUniform('rgbshift','u_intensity',rgbShiftIntensity/100);
        }},
        { name:'wave', frag:FRAG_WAVE, sync:()=>{
            shaderFX.setUniform('wave','u_amplitude',waveAmp);
            shaderFX.setUniform('wave','u_frequency',waveFreq);
            shaderFX.setUniform('wave','u_speed',waveSpeed);
            let modeIdx = {horizontal:0,vertical:1,circular:2}[waveMode]||0;
            shaderFX.setUniform('wave','u_mode',modeIdx);
        }},
        { name:'dither', frag:FRAG_DITHER, sync:()=>{
            shaderFX.setUniform('dither','u_strength',ditherStrength/100);
            shaderFX.setUniform('dither','u_pixelation',Math.max(1,ditherPixelation));
            shaderFX.setUniform('dither','u_colorCount',Math.max(2,ditherColorCount));
        }},
        { name:'swirl', frag:FRAG_SWIRL, sync:()=>{
            shaderFX.setUniform('swirl','u_angle',swirlAngle*Math.PI/180);
            shaderFX.setUniform('swirl','u_radius',swirlRadius/100);
        }},
        { name:'ripple', frag:FRAG_RIPPLE, sync:()=>{
            shaderFX.setUniform('ripple','u_amplitude',rippleAmp);
            shaderFX.setUniform('ripple','u_frequency',rippleFreq);
            shaderFX.setUniform('ripple','u_speed',rippleSpeed);
            shaderFX.setUniform('ripple','u_damping',rippleDamping/100);
        }},
        { name:'ntsc', frag:FRAG_NTSC, sync:()=>{
            shaderFX.setUniform('ntsc','u_chromaBleed',ntscChromaBleed/100);
            shaderFX.setUniform('ntsc','u_instability',ntscInstability/100);
            shaderFX.setUniform('ntsc','u_noise',ntscNoise/100);
            shaderFX.setUniform('ntsc','u_rolling',ntscRolling?1:0);
        }},
        { name:'colorbal', frag:FRAG_COLORBAL, sync:()=>{
            shaderFX.setUniform('colorbal','u_shadow',[colorbalShadowR*0.5/255,colorbalShadowG*0.5/255,colorbalShadowB*0.5/255]);
            shaderFX.setUniform('colorbal','u_mid',[colorbalMidR*0.5/255,colorbalMidG*0.5/255,colorbalMidB*0.5/255]);
            shaderFX.setUniform('colorbal','u_hi',[colorbalHiR*0.5/255,colorbalHiG*0.5/255,colorbalHiB*0.5/255]);
        }},
        { name:'rgbgain', frag:FRAG_RGBGAIN, sync:()=>{
            shaderFX.setUniform('rgbgain','u_rGain',rgbGainR/100);
            shaderFX.setUniform('rgbgain','u_gGain',rgbGainG/100);
            shaderFX.setUniform('rgbgain','u_bGain',rgbGainB/100);
            shaderFX.setUniform('rgbgain','u_gamma',rgbGainGamma);
        }},
    ];

    let count = 0;
    for (const fx of effects) {
        if (shaderFX.registerEffect(fx.name, VERT_PASSTHROUGH, fx.frag)) {
            SHADER_EFFECT_REGISTRY[fx.name] = { sync: fx.sync };
            count++;
        }
    }

    // Register blend pass shader
    if (shaderFX.registerEffect('_blend', VERT_PASSTHROUGH, FRAG_BLEND)) {
        shaderFX._blendProgram = shaderFX.programs.get('_blend');
    }

    console.log('[ShaderFX] Registered ' + count + '/30 core effects + blend pass');
    return count;
}

function syncShaderFromCPU() {
    shaderFX.activeEffects.clear();
    if (typeof activeEffects === 'undefined' || !masterFxEnabled) return;
    for (const name of activeEffects) {
        if (SHADER_EFFECT_REGISTRY[name]) {
            shaderFX.enableEffect(name);
            SHADER_EFFECT_REGISTRY[name].sync();
        }
    }
}

function hasShaderVersion(name) {
    return shaderFX.ready && shaderFX.enabled && !!SHADER_EFFECT_REGISTRY[name];
}


// ═══════════════════════════════════════════════════════════════
// Global instance & integration hooks
// ═══════════════════════════════════════════════════════════════

const shaderFX = new ShaderFXPipeline();

function initShaderFX() {
    if (typeof p5Canvas === 'undefined' || !p5Canvas) {
        console.warn('[ShaderFX] p5Canvas not available — deferring init');
        return false;
    }
    const ok = shaderFX.init(p5Canvas.width, p5Canvas.height);
    if (ok) {
        registerCoreShaderEffects();
        shaderFX.setEffectChain(SHADER_CHAIN_ORDER);
        console.log('[ShaderFX] Phase 2.5 ready — 30 GPU effects + blend modes');
    }
    return ok;
}

function processShaderFX() {
    if (!shaderFX.ready || !shaderFX.enabled) return;
    syncShaderFromCPU();
    if (shaderFX.activeEffects.size === 0) return;
    // Clip GPU shader output to video bounds
    if (typeof drawingContext !== 'undefined' && typeof videoX !== 'undefined' && videoW > 0) {
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(videoX, videoY, videoW, videoH);
        drawingContext.clip();
        shaderFX.process(p5Canvas);
        drawingContext.restore();
    } else {
        shaderFX.process(p5Canvas);
    }
}
