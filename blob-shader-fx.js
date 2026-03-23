// ═══════════════════════════════════════════════════════════════
// blob-shader-fx.js — WebGL2 GPU Shader Effects Pipeline
// Phase 2.5: 31 effects, per-effect opacity, blend modes
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

// ── 1. Bloom (Cross-pattern Gaussian + Reinhard tone mapping) ─
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
float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 texel = 1.0 / u_resolution;
    float sigma = u_radius * 8.0;
    const int samples = 16;
    vec3 bloom = vec3(0.0);
    float totalW = 0.0;
    // Horizontal pass samples
    for (int i = -samples; i <= samples; i++) {
        float offset = float(i) * sigma / float(samples);
        vec2 uv = v_texCoord + vec2(offset * texel.x, 0.0);
        vec3 s = texture(u_texture, uv).rgb;
        float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
        if (lum > u_threshold) {
            float w = gaussian(float(i), float(samples) * 0.4);
            bloom += s * w; totalW += w;
        }
    }
    // Vertical pass samples
    for (int i = -samples; i <= samples; i++) {
        float offset = float(i) * sigma / float(samples);
        vec2 uv = v_texCoord + vec2(0.0, offset * texel.y);
        vec3 s = texture(u_texture, uv).rgb;
        float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
        if (lum > u_threshold) {
            float w = gaussian(float(i), float(samples) * 0.4);
            bloom += s * w; totalW += w;
        }
    }
    if (totalW > 0.0) bloom /= totalW;
    vec3 result = orig.rgb + bloom * u_intensity * 1.5;
    // Reinhard tone mapping to prevent harsh clipping
    result = result / (result + vec3(1.0));
    result *= 1.8;
    fragColor = vec4(mix(orig.rgb, clamp(result, 0.0, 1.0), u_opacity), 1.0);
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
    float radius = abs(u_amount) / 100.0 * 12.0;
    vec2 texel = 1.0 / u_resolution;
    // 13-tap separable Gaussian approximation (H+V in single pass)
    float weights[7];
    float sigma = max(radius, 0.5);
    float total = 0.0;
    for (int i = 0; i < 7; i++) {
        float x = float(i);
        weights[i] = exp(-0.5 * x * x / (sigma * sigma));
        total += (i == 0) ? weights[i] : weights[i] * 2.0;
    }
    for (int i = 0; i < 7; i++) weights[i] /= total;
    vec3 blur = orig * weights[0];
    for (int i = 1; i < 7; i++) {
        float off = float(i) * max(1.0, radius / 6.0);
        vec2 dH = vec2(texel.x * off, 0.0);
        vec2 dV = vec2(0.0, texel.y * off);
        blur += (texture(u_texture, v_texCoord + dH).rgb +
                 texture(u_texture, v_texCoord - dH).rgb +
                 texture(u_texture, v_texCoord + dV).rgb +
                 texture(u_texture, v_texCoord - dV).rgb) * weights[i] * 0.5;
    }
    float t = abs(u_amount) / 100.0;
    vec3 result;
    if (u_amount < 0.0) {
        result = mix(orig, blur, t);
    } else {
        vec3 sharp = orig + (orig - blur) * t * 4.0;
        result = sharp;
    }
    fragColor = vec4(mix(orig, clamp(result, 0.0, 1.0), u_opacity), 1.0);
}`;

// ── 3. CRT (phosphor dots, edge darkening, warm temp) ───────
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
    // Phosphor dot pattern (RGB triads)
    if (u_glow > 0.1) {
        vec2 dotPos = uv * u_resolution;
        float subpixel = mod(floor(dotPos.x), 3.0);
        vec3 phosphorMask = vec3(0.0);
        if (subpixel < 0.5) phosphorMask = vec3(1.0, 0.2, 0.2);
        else if (subpixel < 1.5) phosphorMask = vec3(0.2, 1.0, 0.2);
        else phosphorMask = vec3(0.2, 0.2, 1.0);
        col = col * mix(vec3(1.0), phosphorMask, u_glow * 0.5);
        // Phosphor glow bleed between dots
        vec3 glow = vec3(0.0);
        for (int i = -1; i <= 1; i++) {
            vec2 neighborUV = uv + vec2(float(i) * texel.x * 1.5, 0.0);
            glow += texture(u_texture, neighborUV).rgb;
        }
        glow /= 3.0;
        col += glow * 0.08 * u_glow;
    }
    // Warm CRT color temperature
    col *= vec3(1.02, 1.0, 0.96);
    // Edge darkening from curvature
    if (u_curvature > 0.05) {
        vec2 edge = smoothstep(vec2(0.0), vec2(0.05), uv) * smoothstep(vec2(0.0), vec2(0.05), 1.0 - uv);
        float edgeDark = edge.x * edge.y;
        float dist = length(uv - 0.5) * 2.0;
        edgeDark *= 1.0 - dist * dist * u_curvature * 0.3;
        col *= clamp(edgeDark, 0.0, 1.0);
    }
    fragColor = vec4(mix(orig.rgb, clamp(col,0.0,1.0), u_opacity), 1.0);
}`;

// ── 4. Vignette (asymmetric + smoother falloff) ─────────────
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
    // Asymmetric: slightly stronger at bottom (like real lens)
    vec2 center = vec2(0.5, 0.52);
    vec2 d = v_texCoord - center;
    d.y *= 0.9;
    float dist = length(d) * 2.0;
    // Smoother power curve falloff
    float vig = 1.0 - pow(dist * u_intensity, 2.5);
    vig = smoothstep(0.0, 1.0, vig);
    vec3 result = mix(u_color, orig.rgb, clamp(vig, 0.0, 1.0));
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 5. Duotone (smoothstep + BT.709) ────────────────────────
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
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    float t = smoothstep(0.0, 1.0, lum);
    vec3 duo = mix(u_shadow, u_highlight, t);
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
        float dist = length(cc);
        vec2 dir = normalize(cc + 0.0001);
        // Quadratic radial falloff — stronger at edges (mimics real lens)
        float falloff = dist * dist * 4.0;
        float radOff = falloff * u_offset * texel.x * 2.0;
        // 3-channel dispersion with green slightly offset too
        result = vec3(
            texture(u_texture, v_texCoord + dir * radOff * 1.0).r,
            texture(u_texture, v_texCoord + dir * radOff * 0.1).g,
            texture(u_texture, v_texCoord - dir * radOff * 1.0).b);
    } else {
        float off = u_offset * texel.x;
        // Wavelength-proportional offsets (R=1.0, G=0.1, B=-1.0)
        result = vec3(
            texture(u_texture, vec2(v_texCoord.x + off, v_texCoord.y)).r,
            texture(u_texture, vec2(v_texCoord.x + off * 0.1, v_texCoord.y)).g,
            texture(u_texture, vec2(v_texCoord.x - off, v_texCoord.y)).b);
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
// Value noise with smooth interpolation
float vnoise(vec2 p, float seed) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    float a = hash(i + seed);
    float b = hash(i + vec2(1.0, 0.0) + seed);
    float c = hash(i + vec2(0.0, 1.0) + seed);
    float d = hash(i + vec2(1.0, 1.0) + seed);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float seed = floor(u_time * 30.0);
    vec2 p = v_texCoord * u_resolution / u_scale;
    // Luminance-aware masking (stronger in midtones like film grain)
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    float mask = mix(0.3, 1.0, 1.0 - abs(lum - 0.5) * 2.0);
    vec3 n;
    if (u_mono > 0.5) {
        float v = vnoise(p, seed) * 2.0 - 1.0;
        n = vec3(v);
    } else {
        n = vec3(vnoise(p, seed)*2.0-1.0, vnoise(p, seed+100.0)*2.0-1.0, vnoise(p, seed+200.0)*2.0-1.0);
    }
    vec3 result = clamp(orig.rgb + n * u_intensity * 0.5 * mask, 0.0, 1.0);
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
    float px = u_vertical > 0.5 ? v_texCoord.x * u_resolution.x : v_texCoord.y * u_resolution.y;
    // Sharp scanline with phosphor-like bright/dark pattern
    float phase = coord * u_count * 3.14159;
    float line = sin(phase);
    // Sharpen the sine into a more CRT-like pattern
    line = sign(line) * pow(abs(line), 0.6);
    line = line * 0.5 + 0.5;
    // Luminance-dependent: darks get stronger scanlines
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    float lumWeight = mix(1.0, 0.5, lum);
    // Phosphor glow on bright lines
    float glow = smoothstep(0.6, 1.0, line) * lum * 0.15;
    vec3 result = orig.rgb * (1.0 - (1.0 - line) * u_intensity * lumWeight) + glow;
    fragColor = vec4(mix(orig.rgb, clamp(result, 0.0, 1.0), u_opacity), 1.0);
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

// ── 10. Halftone (anti-aliased smoothstep dots) ─────────────
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
    float lum = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
    lum = clamp(0.5 + (lum-0.5)*u_contrast, 0.0, 1.0);
    float dotR = (1.0-lum) * u_spacing * 0.48;
    // Anti-aliased dot edge using smoothstep
    float dotMask = 1.0 - smoothstep(dotR - 1.0, dotR + 1.0, dist);
    vec3 inkColor = u_colorMode > 0.5 ? sampled.rgb * 0.8 : u_ink;
    vec3 result = mix(u_paper, inkColor, dotMask);
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
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Soft light blend preserves saturation better than multiply
    vec3 tinted = mix(u_tintColor * lum, orig.rgb * u_tintColor, 0.5);
    // Preserve original luminance
    float tintLum = dot(tinted, vec3(0.2126, 0.7152, 0.0722));
    tinted *= lum / max(tintLum, 0.001);
    vec3 result = mix(orig.rgb, clamp(tinted, 0.0, 1.0), u_intensity);
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
        float gray = dot(c, vec3(0.2126, 0.7152, 0.0722));
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
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Smooth threshold with anti-aliased edge (softness ~2% of range)
    float soft = 0.02;
    float val = smoothstep(u_level - soft, u_level + soft, lum);
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
    vec3 c = orig.rgb;
    float t = u_temp;
    // Perceptual warm/cool using luminance-preserving curves
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Warm: boost R in highlights, orange in mids, reduce B
    // Cool: boost B in shadows, teal in mids, reduce R
    vec3 warm = vec3(
        c.r + t * 0.12 * (0.5 + lum * 0.5),
        c.g + t * 0.03 * (1.0 - abs(lum - 0.5) * 1.5),
        c.b - t * 0.10 * (0.3 + (1.0 - lum) * 0.7)
    );
    // Preserve overall luminance
    float newLum = dot(warm, vec3(0.2126, 0.7152, 0.0722));
    float lumAdj = lum / max(newLum, 0.001);
    vec3 result = clamp(warm * mix(1.0, lumAdj, 0.6), 0.0, 1.0);
    fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
}`;

// ── 17. Grain (luminance-dependent intensity) ────────────────
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
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Grain strongest in midtones, weaker in shadows/highlights
    float grainMask = 1.0 - abs(lum - 0.5) * 2.0;
    grainMask = mix(0.3, 1.0, grainMask);
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
    vec3 result = clamp(orig.rgb + n * grainMask, 0.0, 1.0);
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
uniform float u_mode;      // 0=shift,1=tear,2=corrupt,3=vhs,4=slice,5=drift,6=static
uniform float u_opacity;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    vec2 uv = v_texCoord;
    float seed = floor(u_time * u_speed);
    float bsz = max(4.0, u_blockSize);
    float blockY = floor(uv.y * u_resolution.y / bsz);
    float h = hash(vec2(blockY, seed));
    float chrOff = u_channelShift / u_resolution.x;
    vec3 result;

    if (u_mode < 0.5) {
        // SHIFT: block row shift + RGB separation
        if (h > 1.0 - u_freq) {
            float offset = (hash(vec2(blockY+1.0, seed)) - 0.5) * u_intensity * 0.2;
            uv.x = fract(uv.x + offset);
        }
        result = vec3(
            texture(u_texture, vec2(uv.x + chrOff, uv.y)).r,
            texture(u_texture, uv).g,
            texture(u_texture, vec2(uv.x - chrOff, uv.y)).b);
        float h2 = hash(vec2(blockY + 50.0, seed));
        if (h2 > 1.0 - u_freq * 0.3) result = vec3(result.r, result.b, result.g);

    } else if (u_mode < 1.5) {
        // TEAR: horizontal tear bands
        float tearH = bsz * 1.5 / u_resolution.y;
        float tearSeed = hash(vec2(blockY * 0.7, seed));
        if (tearSeed > 1.0 - u_freq) {
            float shift = (hash(vec2(blockY + 3.0, seed)) - 0.5) * u_intensity * 0.3;
            uv.x = clamp(uv.x + shift, 0.0, 1.0);
        }
        result = texture(u_texture, uv).rgb;

    } else if (u_mode < 2.5) {
        // CORRUPT: block displacement + channel swap
        float blockX = floor(uv.x * u_resolution.x / bsz);
        float hb = hash(vec2(blockX + blockY * 100.0, seed));
        if (hb > 1.0 - u_freq * 0.5) {
            float ox = (hash(vec2(blockX + 10.0, seed + blockY)) - 0.5) * u_intensity * 0.15;
            float oy = (hash(vec2(blockY + 20.0, seed + blockX)) - 0.5) * u_intensity * 0.08;
            uv = clamp(uv + vec2(ox, oy), 0.0, 1.0);
            float sw = hash(vec2(blockX + blockY, seed + 77.0));
            vec4 s = texture(u_texture, uv);
            result = sw > 0.66 ? vec3(s.b, s.g, s.r) : (sw > 0.33 ? vec3(s.g, s.r, s.b) : s.rgb);
        } else {
            result = orig.rgb;
        }

    } else if (u_mode < 3.5) {
        // VHS: tracking lines + color bleed + noise band
        if (h > 1.0 - u_freq * 0.5) {
            float shift = (hash(vec2(blockY + 1.0, seed)) - 0.5) * u_intensity * 0.12;
            uv.x = clamp(uv.x + shift, 0.0, 1.0);
        }
        float bleed = chrOff * 1.5;
        result = vec3(
            texture(u_texture, vec2(clamp(uv.x + bleed, 0.0, 1.0), uv.y)).r,
            texture(u_texture, uv).g,
            texture(u_texture, vec2(clamp(uv.x - bleed, 0.0, 1.0), uv.y)).b);
        // Noise band
        float bandCenter = fract(seed * 0.1) ;
        float bandDist = abs(uv.y - bandCenter);
        if (bandDist < 0.015) {
            result += vec3(0.2);
        }

    } else if (u_mode < 4.5) {
        // SLICE: image cut into slices that shift independently
        float numSlices = floor(u_freq * 25.0) + 3.0;
        float sliceIdx = floor(uv.y * numSlices);
        float sliceH = hash(vec2(sliceIdx, seed));
        float shift = (sliceH - 0.5) * u_intensity * 0.25;
        // Some slices shift more
        if (hash(vec2(sliceIdx + 99.0, seed)) > 0.7) shift *= 2.5;
        uv.x = clamp(uv.x + shift, 0.0, 1.0);
        // Occasional black gap
        float gapChance = hash(vec2(sliceIdx + 200.0, seed));
        if (gapChance > 0.92 && u_intensity > 0.3) {
            result = vec3(0.0);
        } else {
            result = vec3(
                texture(u_texture, vec2(uv.x + chrOff * 0.5, uv.y)).r,
                texture(u_texture, uv).g,
                texture(u_texture, vec2(uv.x - chrOff * 0.5, uv.y)).b);
        }

    } else if (u_mode < 5.5) {
        // DRIFT: pixels melt downward with column-based displacement
        float colIdx = floor(uv.x * u_resolution.x / max(2.0, bsz * 0.5));
        float driftH = hash(vec2(colIdx, seed));
        float driftAmt = 0.0;
        if (driftH < u_freq) {
            driftAmt = hash(vec2(colIdx + 5.0, seed)) * u_intensity * 0.3;
            // Smoothed by neighboring columns
            float dL = hash(vec2(colIdx - 1.0, seed)) < u_freq ? hash(vec2(colIdx + 4.0, seed)) * u_intensity * 0.3 : 0.0;
            float dR = hash(vec2(colIdx + 1.0, seed)) < u_freq ? hash(vec2(colIdx + 6.0, seed)) * u_intensity * 0.3 : 0.0;
            driftAmt = driftAmt * 0.5 + (dL + dR) * 0.25;
        }
        vec2 dUv = vec2(uv.x, clamp(uv.y - driftAmt, 0.0, 1.0));
        result = texture(u_texture, dUv).rgb;
        // Channel split on drifted areas
        if (driftAmt > 0.01) {
            float rX = clamp(dUv.x + chrOff, 0.0, 1.0);
            result.r = texture(u_texture, vec2(rX, dUv.y)).r;
        }

    } else {
        // STATIC: TV static + scanline interference + rolling bar
        float inBand = 0.0;
        float bandCenter = fract(seed * 0.07);
        float bandSize = 0.1 + u_intensity * 0.15;
        if (abs(uv.y - bandCenter) < bandSize) inBand = 1.0;
        float rowNoise = inBand > 0.5 ? u_intensity * 0.8 : u_intensity * 0.12;
        float scanShift = inBand > 0.5 ? (hash(vec2(blockY + 7.0, seed)) - 0.5) * u_intensity * 0.15 : 0.0;
        vec2 sUv = vec2(clamp(uv.x + scanShift, 0.0, 1.0), uv.y);
        // Per-pixel snow
        float snowH = hash3(vec3(gl_FragCoord.xy, seed));
        if (snowH < rowNoise * u_freq) {
            float v = hash(gl_FragCoord.xy + seed);
            result = vec3(v);
        } else {
            result = texture(u_texture, sUv).rgb;
        }
        // Rolling bar
        float barPos = fract(u_time * 0.5);
        float barDist = abs(uv.y - barPos);
        if (barDist < 0.012 && u_intensity > 0.3) {
            result += vec3(0.15);
        }
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
    vec2 cellPos = floor(v_texCoord / cellSize + 0.5) * cellSize;
    // 4-sample average for smoother color representation
    vec2 halfCell = cellSize * 0.25;
    vec3 result = (
        texture(u_texture, clamp(cellPos + vec2(-halfCell.x, -halfCell.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2( halfCell.x, -halfCell.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2(-halfCell.x,  halfCell.y), 0.0, 1.0)).rgb +
        texture(u_texture, clamp(cellPos + vec2( halfCell.x,  halfCell.y), 0.0, 1.0)).rgb
    ) * 0.25;
    // Subtle grid line at block edges
    vec2 edge = abs(fract(v_texCoord / cellSize) - 0.5) * 2.0;
    float grid = smoothstep(0.9, 1.0, max(edge.x, edge.y));
    result = mix(result, result * 0.7, grid * 0.3);
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

// ── 22. Thermal (HD palettes with more color stops) ─────────
const FRAG_THERMAL = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_palette;
uniform float u_opacity;
out vec4 fragColor;
vec3 thermalLookup(float lum, float pal) {
    const vec3 d[14] = vec3[14](
        vec3(0,0,.125),vec3(0,0,.314),vec3(.063,0,.502),vec3(.188,0,.627),
        vec3(.314,0,.706),vec3(.502,0,.627),vec3(.627,0,.392),vec3(.753,.125,0),
        vec3(.863,.314,0),vec3(.941,.549,0),vec3(1,.784,0),vec3(1,.941,.235),
        vec3(1,1,.627),vec3(1,1,1));
    const vec3 ir[12] = vec3[12](
        vec3(0,0,0),vec3(.039,0,.118),vec3(.157,0,.314),vec3(.314,0,.471),
        vec3(.471,0,.549),vec3(.627,.078,.314),vec3(.784,.235,.078),
        vec3(.902,.471,0),vec3(.98,.706,.078),vec3(1,.902,.314),
        vec3(1,1,.706),vec3(1,1,1));
    const vec3 rb[10] = vec3[10](
        vec3(0,0,.502),vec3(0,0,.784),vec3(0,.314,1),vec3(0,.706,.863),
        vec3(0,.863,.471),vec3(.314,1,0),vec3(.784,1,0),
        vec3(1,.706,0),vec3(1,.314,0),vec3(1,0,.502));
    const vec3 ar[9] = vec3[9](
        vec3(0,.078,.235),vec3(0,.157,.392),vec3(0,.314,.588),
        vec3(.118,.471,.706),vec3(.314,.627,.824),vec3(.502,.784,.902),
        vec3(.706,.863,.941),vec3(.863,.941,1),vec3(1,1,1));
    const vec3 ni[9] = vec3[9](
        vec3(0,0,0),vec3(0,.039,0),vec3(0,.118,.024),
        vec3(0,.235,.059),vec3(0,.392,.098),vec3(.024,.549,.137),
        vec3(.059,.706,.235),vec3(.314,.863,.471),vec3(.706,1,.706));
    if (pal < 0.5) {
        float p = lum * 13.0; int lo = int(floor(p));
        return mix(d[min(lo,13)], d[min(lo+1,13)], fract(p));
    } else if (pal < 1.5) {
        float p = lum * 11.0; int lo = int(floor(p));
        return mix(ir[min(lo,11)], ir[min(lo+1,11)], fract(p));
    } else if (pal < 2.5) {
        float p = lum * 9.0; int lo = int(floor(p));
        return mix(rb[min(lo,9)], rb[min(lo+1,9)], fract(p));
    } else if (pal < 3.5) {
        float p = lum * 8.0; int lo = int(floor(p));
        return mix(ar[min(lo,8)], ar[min(lo+1,8)], fract(p));
    } else {
        float p = lum * 8.0; int lo = int(floor(p));
        return mix(ni[min(lo,8)], ni[min(lo+1,8)], fract(p));
    }
}
void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float lum = dot(orig.rgb, vec3(0.2126, 0.7152, 0.0722));
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

// ── 25. Dither (Bayer + gamma correction) ────────────────────
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
    // Gamma correction before dithering
    float gamma = 1.6;
    vec3 col = pow(sampled.rgb, vec3(gamma));
    float bayerVal = bayer8(px) - 0.5;
    float levels = max(1.0, u_colorCount - 1.0);
    vec3 dithered = floor(col * levels + bayerVal * u_strength * 0.6 + 0.5) / levels;
    // Reverse gamma
    dithered = pow(dithered, vec3(1.0 / gamma));
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

// ── Lens Curve (barrel/pincushion/fisheye/squeeze + chromatic fringe) ──
const FRAG_CURVE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_intensity;   // 0-1
uniform float u_mode;        // 0=barrel,1=pincushion,2=fisheye,3=squeeze,4=mustache
uniform float u_fringe;      // chromatic fringe amount 0-1
uniform float u_opacity;
out vec4 fragColor;

vec2 distort(vec2 uv, float k) {
    vec2 centered = uv - 0.5;
    float r2 = dot(centered, centered);
    float mode = u_mode;
    float factor;
    if (mode < 0.5) {
        // Barrel: edges push outward
        factor = 1.0 + k * r2;
    } else if (mode < 1.5) {
        // Pincushion: edges pull inward
        factor = 1.0 - k * r2;
    } else if (mode < 2.5) {
        // Fisheye: stronger radial with r^4 term
        factor = 1.0 + k * r2 + k * 0.5 * r2 * r2;
    } else if (mode < 3.5) {
        // Squeeze: horizontal barrel + vertical pincushion
        float kx = 1.0 + k * centered.x * centered.x;
        float ky = 1.0 - k * 0.5 * centered.y * centered.y;
        return vec2(centered.x * kx, centered.y * ky) + 0.5;
    } else {
        // Mustache: barrel center + pincushion edges (r^2 - r^4)
        factor = 1.0 + k * (r2 - 2.5 * r2 * r2);
    }
    return centered * factor + 0.5;
}

void main() {
    vec4 orig = texture(u_texture, v_texCoord);
    float k = u_intensity * 2.0;

    if (u_fringe > 0.01) {
        // Chromatic fringe: offset R and B channels slightly
        float fk = u_fringe * 0.15;
        vec2 uvR = distort(v_texCoord, k * (1.0 + fk));
        vec2 uvG = distort(v_texCoord, k);
        vec2 uvB = distort(v_texCoord, k * (1.0 - fk));
        float r = texture(u_texture, clamp(uvR, 0.0, 1.0)).r;
        float g = texture(u_texture, clamp(uvG, 0.0, 1.0)).g;
        float b = texture(u_texture, clamp(uvB, 0.0, 1.0)).b;
        vec3 result = vec3(r, g, b);
        fragColor = vec4(mix(orig.rgb, result, u_opacity), 1.0);
    } else {
        vec2 uv = distort(v_texCoord, k);
        vec4 result = texture(u_texture, clamp(uv, 0.0, 1.0));
        fragColor = vec4(mix(orig.rgb, result.rgb, u_opacity), 1.0);
    }
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

        // Handle WebGL context loss/restore
        this.glCanvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.ready = false;
            console.warn('[ShaderFX] Context lost');
        });
        this.glCanvas.addEventListener('webglcontextrestored', () => {
            console.log('[ShaderFX] Context restored — reinitializing');
            this.ready = false;
            this._initQuad();
            this.sourceTexture = this._createTexture();
            this._initFramebuffers();
            this.registerEffect('passthrough', VERT_PASSTHROUGH, FRAG_PASSTHROUGH);
            this.ready = true;
            // Re-register effects on restore
            try { registerCoreShaderEffects(); shaderFX.setEffectChain(SHADER_CHAIN_ORDER); } catch(e) {}
        });

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
                if (!blendEntry) {
                    // Blend shader failed to compile — fall back to normal blend path
                    if (!isLast) {
                        inputTexture = this.fbTextures[this._pingPongIdx];
                        this._pingPongIdx = 1 - this._pingPongIdx;
                    }
                    continue;
                }
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
            // Re-attach textures to framebuffers after reallocation
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTextures[i], 0);
            let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.warn('[ShaderFX] Framebuffer ' + i + ' incomplete after resize:', status);
            }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    'wave', 'swirl', 'ripple', 'curve',
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
            let modeIdx = {shift:0,tear:1,corrupt:2,vhs:3,slice:4,drift:5,static:6}[glitchMode]||0;
            shaderFX.setUniform('glitch','u_mode',modeIdx);
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
        { name:'curve', frag:FRAG_CURVE, sync:()=>{
            let sign = (curveDirection === 'barrel' || curveDirection === 'fisheye' || curveDirection === 'mustache') ? 1 : -1;
            let modeIdx = {barrel:0,pinch:1,fisheye:2,squeeze:3,mustache:4}[curveDirection]||0;
            shaderFX.setUniform('curve','u_intensity',sign * curveIntensity/100);
            shaderFX.setUniform('curve','u_mode',modeIdx);
            shaderFX.setUniform('curve','u_fringe',curveFringe/100);
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

    console.log('[ShaderFX] Registered ' + count + '/31 core effects + blend pass');
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
        console.log('[ShaderFX] Phase 2.5 ready — 31 GPU effects + blend modes');
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
