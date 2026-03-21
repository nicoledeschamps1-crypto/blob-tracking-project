// ═══════════════════════════════════════════════════════════════
// blob-shader-fx.js — WebGL2 GPU Shader Effects Pipeline
// Phase 0: Framework + Passthrough Proof of Concept
// ═══════════════════════════════════════════════════════════════
// Architecture: Separate WebGL2 context (not p5's Canvas2D).
// Takes p5 canvas as input texture, runs shader chain via
// ping-pong framebuffers, writes result back to p5 canvas.
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

// ── Passthrough fragment shader (proof of concept) ──
const FRAG_PASSTHROUGH = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
    fragColor = texture(u_texture, v_texCoord);
}`;


class ShaderFXPipeline {
    constructor() {
        this.gl = null;
        this.glCanvas = null;
        this.quadVAO = null;
        this.quadVBO = null;
        this.sourceTexture = null;
        this.framebuffers = [null, null]; // ping-pong pair
        this.fbTextures = [null, null];
        this.programs = new Map();       // name → { program, uniforms }
        this.effectChain = [];           // ordered list of effect names to run
        this.activeEffects = new Set();  // which shader effects are enabled
        this.width = 0;
        this.height = 0;
        this.enabled = false;
        this.ready = false;
        this._pingPongIdx = 0;
    }

    // ── Initialize WebGL2 context and core resources ──
    init(width, height) {
        this.width = width;
        this.height = height;

        // Create offscreen canvas for WebGL2
        this.glCanvas = document.createElement('canvas');
        this.glCanvas.width = width;
        this.glCanvas.height = height;
        this.glCanvas.style.display = 'none';

        const gl = this.glCanvas.getContext('webgl2', {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });

        if (!gl) {
            console.warn('[ShaderFX] WebGL2 not available — GPU effects disabled');
            return false;
        }

        this.gl = gl;
        console.log('[ShaderFX] WebGL2 context created:', gl.getParameter(gl.VERSION));

        // Create fullscreen quad geometry
        this._initQuad();

        // Create source texture (for uploading p5 canvas)
        this.sourceTexture = this._createTexture();

        // Create ping-pong framebuffers
        this._initFramebuffers();

        // Compile passthrough shader
        this.registerEffect('passthrough', VERT_PASSTHROUGH, FRAG_PASSTHROUGH);

        this.ready = true;
        this.enabled = true;
        console.log('[ShaderFX] Pipeline ready (' + width + 'x' + height + ')');
        return true;
    }

    // ── Create fullscreen quad VAO ──
    _initQuad() {
        const gl = this.gl;

        // Two triangles covering clip space, with flipped Y texcoords
        // (canvas pixels are top-down, GL textures are bottom-up)
        const vertices = new Float32Array([
            // pos (x,y)    texcoord (u,v)
            -1, -1,         0, 0,
             1, -1,         1, 0,
            -1,  1,         0, 1,
             1,  1,         1, 1,
        ]);

        this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(this.quadVAO);

        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // a_position = location 0
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        // a_texCoord = location 1
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.bindVertexArray(null);
    }

    // ── Create a GL texture with standard settings ──
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

    // ── Create ping-pong framebuffer pair ──
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

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('[ShaderFX] Framebuffer ' + i + ' incomplete:', status);
            }

            this.framebuffers[i] = fbo;
            this.fbTextures[i] = tex;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // ── Compile a single shader ──
    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            console.error('[ShaderFX] Shader compile error:\n' + log);
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    // ── Link a shader program ──
    _linkProgram(vertSrc, fragSrc) {
        const gl = this.gl;
        const vert = this._compileShader(gl.VERTEX_SHADER, vertSrc);
        const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
        if (!vert || !frag) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);

        // Bind attribute locations before linking
        gl.bindAttribLocation(program, 0, 'a_position');
        gl.bindAttribLocation(program, 1, 'a_texCoord');

        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            console.error('[ShaderFX] Program link error:\n' + log);
            gl.deleteProgram(program);
            return null;
        }

        // Detach and delete individual shaders (program keeps compiled code)
        gl.detachShader(program, vert);
        gl.detachShader(program, frag);
        gl.deleteShader(vert);
        gl.deleteShader(frag);

        return program;
    }

    // ── Register a named effect with its shaders ──
    registerEffect(name, vertSrc, fragSrc) {
        const program = this._linkProgram(vertSrc, fragSrc);
        if (!program) {
            console.error('[ShaderFX] Failed to register effect:', name);
            return false;
        }

        // Cache all active uniform locations
        const gl = this.gl;
        const uniforms = {};
        const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = {
                location: gl.getUniformLocation(program, info.name),
                type: info.type,
                size: info.size
            };
        }

        this.programs.set(name, { program, uniforms });
        console.log('[ShaderFX] Registered effect:', name,
                    '(' + numUniforms + ' uniforms)');
        return true;
    }

    // ── Set a uniform value on a named effect ──
    setUniform(effectName, uniformName, value) {
        const entry = this.programs.get(effectName);
        if (!entry) return;
        const u = entry.uniforms[uniformName];
        if (!u) return;

        const gl = this.gl;
        gl.useProgram(entry.program);

        switch (u.type) {
            case gl.FLOAT:
                gl.uniform1f(u.location, value);
                break;
            case gl.FLOAT_VEC2:
                gl.uniform2fv(u.location, value);
                break;
            case gl.FLOAT_VEC3:
                gl.uniform3fv(u.location, value);
                break;
            case gl.FLOAT_VEC4:
                gl.uniform4fv(u.location, value);
                break;
            case gl.INT:
            case gl.SAMPLER_2D:
                gl.uniform1i(u.location, value);
                break;
            case gl.FLOAT_MAT3:
                gl.uniformMatrix3fv(u.location, false, value);
                break;
            case gl.FLOAT_MAT4:
                gl.uniformMatrix4fv(u.location, false, value);
                break;
            default:
                gl.uniform1f(u.location, value);
        }
    }

    // ── Set which effects are active and in what order ──
    setEffectChain(effectNames) {
        this.effectChain = effectNames.filter(n => this.programs.has(n));
    }

    // ── Main processing: source canvas → shader chain → output ──
    process(sourceCanvas) {
        if (!this.ready || !this.enabled) return;

        const gl = this.gl;
        const chain = this.effectChain.filter(n => this.activeEffects.has(n));

        // Nothing to do — skip entirely
        if (chain.length === 0) return;

        // Handle resize if needed
        if (sourceCanvas.width !== this.width || sourceCanvas.height !== this.height) {
            this.resize(sourceCanvas.width, sourceCanvas.height);
        }

        // Upload source canvas as texture
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

        // Run shader chain with ping-pong
        this._pingPongIdx = 0;
        let inputTexture = this.sourceTexture;

        for (let i = 0; i < chain.length; i++) {
            const effectName = chain[i];
            const entry = this.programs.get(effectName);
            const isLast = (i === chain.length - 1);

            // Bind output: framebuffer (or screen for last pass)
            if (isLast) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, this.width, this.height);
            } else {
                const outIdx = this._pingPongIdx;
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[outIdx]);
                gl.viewport(0, 0, this.width, this.height);
            }

            // Use this effect's program
            gl.useProgram(entry.program);

            // Bind input texture to unit 0
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, inputTexture);
            if (entry.uniforms['u_texture']) {
                gl.uniform1i(entry.uniforms['u_texture'].location, 0);
            }

            // Set common uniforms if the shader declares them
            if (entry.uniforms['u_resolution']) {
                gl.uniform2f(entry.uniforms['u_resolution'].location,
                             this.width, this.height);
            }
            if (entry.uniforms['u_time']) {
                gl.uniform1f(entry.uniforms['u_time'].location,
                             performance.now() / 1000.0);
            }

            // Draw fullscreen quad
            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);

            // Next pass reads from this pass's output
            if (!isLast) {
                inputTexture = this.fbTextures[this._pingPongIdx];
                this._pingPongIdx = 1 - this._pingPongIdx;
            }
        }

        // Copy WebGL result back to p5's canvas
        // drawImage(glCanvas) is GPU-accelerated in modern browsers
        if (typeof drawingContext !== 'undefined' && drawingContext) {
            drawingContext.drawImage(this.glCanvas, 0, 0);
        }
    }

    // ── Handle canvas resize ──
    resize(w, h) {
        if (w === this.width && h === this.height) return;
        this.width = w;
        this.height = h;
        this.glCanvas.width = w;
        this.glCanvas.height = h;

        // Reallocate framebuffer textures
        const gl = this.gl;
        for (let i = 0; i < 2; i++) {
            gl.bindTexture(gl.TEXTURE_2D, this.fbTextures[i]);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h,
                          0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        console.log('[ShaderFX] Resized to', w, 'x', h);
    }

    // ── Enable/disable a specific shader effect ──
    enableEffect(name) { this.activeEffects.add(name); }
    disableEffect(name) { this.activeEffects.delete(name); }
    toggleEffect(name) {
        if (this.activeEffects.has(name)) this.activeEffects.delete(name);
        else this.activeEffects.add(name);
    }
    isEffectActive(name) { return this.activeEffects.has(name); }

    // ── Cleanup ──
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
        this.gl = null;
        this.ready = false;
        this.enabled = false;
        console.log('[ShaderFX] Pipeline destroyed');
    }
}


// ═══════════════════════════════════════════════════════════════
// Global instance & integration hooks
// ═══════════════════════════════════════════════════════════════

const shaderFX = new ShaderFXPipeline();

// Call once after p5 setup()
function initShaderFX() {
    if (typeof p5Canvas === 'undefined' || !p5Canvas) {
        console.warn('[ShaderFX] p5Canvas not available — deferring init');
        return false;
    }
    const ok = shaderFX.init(p5Canvas.width, p5Canvas.height);
    if (ok) {
        // Enable passthrough as proof of concept
        shaderFX.setEffectChain(['passthrough']);
        shaderFX.enableEffect('passthrough');
        console.log('[ShaderFX] Passthrough shader active — canvas should look identical');
    }
    return ok;
}

// Call at end of draw() — processes canvas through shader chain
function processShaderFX() {
    if (!shaderFX.ready || !shaderFX.enabled) return;
    if (shaderFX.activeEffects.size === 0) return;
    shaderFX.process(p5Canvas);
}
