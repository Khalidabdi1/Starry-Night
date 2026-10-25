// Starry Night kit: a minimal WebGL2 layer.
// One full-screen triangle, one program, typed uniform setters.
// Returns null when WebGL2 is unavailable so components can fall back.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const GLSL_COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bayer4(vec2 f) {
  ivec2 q = ivec2(mod(f, 4.0));
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[q.y * 4 + q.x] + 0.5) / 16.0;
}
uniform vec3 uRamp[8];
// Quantise brightness to the 8-tone ramp with ordered dither.
vec3 rampOf(float lum, vec2 frag, float dither) {
  float v = clamp(lum, 0.0, 1.0) * 7.0 + (bayer4(frag) - 0.5) * dither;
  int i = int(clamp(floor(v + 0.5), 0.0, 7.0));
  return uRamp[i];
}
`;

export function createGL(canvas, fragSource, { alpha = false, premultipliedAlpha = true } = {}) {
  let gl;
  try {
    gl = canvas.getContext("webgl2", { alpha, premultipliedAlpha, antialias: false, depth: false, preserveDrawingBuffer: true });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("starry-night shader: " + log);
    }
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSource));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("starry-night link: " + gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn(err);
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const cache = new Map();
  const where = (name) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
    return cache.get(name);
  };

  return {
    gl,
    lost: () => gl.isContextLost(),
    f1: (n, a) => gl.uniform1f(where(n), a),
    f2: (n, a, b) => gl.uniform2f(where(n), a, b),
    f3: (n, a, b, c) => gl.uniform3f(where(n), a, b, c),
    f4: (n, a, b, c, d) => gl.uniform4f(where(n), a, b, c, d),
    i1: (n, a) => gl.uniform1i(where(n), a),
    v3: (n, arr) => gl.uniform3fv(where(n), arr),
    v4: (n, arr) => gl.uniform4fv(where(n), arr),
    texture(unit, source, { nearest = true } = {}) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const f = nearest ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    },
    draw(w, h) {
      gl.viewport(0, 0, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// The ramp as a flat vec3 array (0..1) for uRamp.
export function rampUniform(rampRgb) {
  const a = new Float32Array(8 * 3);
  rampRgb.slice(0, 8).forEach((c, i) => a.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3));
  return a;
}
