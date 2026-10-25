// Starry Night kit: the model.
//
// One small, pure description of the painting's sky, shared by every
// component and by both the JS and GLSL code paths, so a swirl drawn by a
// shader and a brush stroke pushed by a particle agree on where the wind goes.
//
// Painting space: the panorama is PAINT_W wide and 1 tall, x to the right,
// y DOWN (like the screen). Every position below is measured off the
// pixel-art panorama in assets/starry-night.webp (1983 x 793).

export const PAINT_W = 2.5;

// Vortices: Lamb-Oseen cores (a solid-body centre that blends into a
// 1/r swirl) with a Gaussian reach so each one stays local.
//   spin  > 0 turns clockwise on screen (y is down)
//   core  radius of the solid centre
//   reach radius past which the swirl fades out
//   arms  spiral arms in the painted band pattern
//   lum   how much the swirl brightens the sky (its yellow streaks)
const V = (fx, fy, spin, core, reach, arms, lum) => ({
  x: fx * PAINT_W,
  y: fy,
  spin: spin * 1.5,
  core,
  reach,
  arms,
  lum,
});

export const VORTICES = [
  V(0.47, 0.33, 0.034, 0.085, 0.3, 2, 0.32), // the great swirl, upper lobe
  V(0.385, 0.43, -0.026, 0.07, 0.24, 2, 0.22), // the great swirl, lower lobe
  V(0.655, 0.42, 0.028, 0.06, 0.22, 3, 0.28), // the right swirl
  V(0.575, 0.535, 0.016, 0.03, 0.1, 3, 0.3), // the small tight curl
  V(0.89, 0.2, -0.03, 0.09, 0.28, 1, 0.12), // the moon's halo
  V(0.1, 0.22, 0.02, 0.07, 0.22, 1, 0.12), // the wind at the left edge
];

// Stars: x, y in painting space, size = halo radius, phase = twinkle offset.
const S = (fx, fy, size, phase) => ({ x: fx * PAINT_W, y: fy, size, phase });
export const STARS = [
  S(0.05, 0.07, 0.07, 0.1),
  S(0.175, 0.015, 0.055, 1.7),
  S(0.265, 0.07, 0.075, 2.9),
  S(0.175, 0.2, 0.075, 4.1),
  S(0.27, 0.37, 0.06, 0.8),
  S(0.045, 0.48, 0.07, 3.3),
  S(0.29, 0.555, 0.095, 5.2),
  S(0.575, 0.08, 0.07, 2.2),
  S(0.71, 0.1, 0.065, 4.6),
  S(0.77, 0.38, 0.07, 1.2),
];

export const MOON = { x: 0.89 * PAINT_W, y: 0.2, r: 0.12, cut: [0.035, -0.03, 0.105] };

// The bright river of cloud that runs low across the sky, rising to the right.
export function riverY(x) {
  const f = x / PAINT_W;
  return 0.64 - 0.24 * smoothstep(0.38, 1.0, f) + 0.025 * Math.sin(f * 17.0);
}
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// The wind: a slow drift to the right with long waves, plus every vortex.
// Writes into out[0], out[1]. `extra` is an optional array of more vortices
// (a pointer, a click) in the same shape.
export function fieldAt(x, y, t, out, extra) {
  let vx = 0.16 + 0.05 * Math.sin(y * 6.3 + t * 0.21);
  let vy = 0.045 * Math.sin(x * 3.1 - t * 0.27) + 0.03 * Math.cos(x * 7.7 + y * 3.0 + t * 0.13);
  // The river leans with its own slope.
  const f = x / PAINT_W;
  vy += -0.09 * smoothstep(0.38, 1.0, f) * Math.exp(-((y - riverY(x)) ** 2) / 0.02);
  for (let i = 0; i < VORTICES.length; i++) {
    const v = VORTICES[i];
    [vx, vy] = addVortex(vx, vy, x - v.x, y - v.y, v.spin, v.core, v.reach);
  }
  if (extra) {
    for (let i = 0; i < extra.length; i++) {
      const v = extra[i];
      if (!v.spin) continue;
      [vx, vy] = addVortex(vx, vy, x - v.x, y - v.y, v.spin, v.core, v.reach);
    }
  }
  out[0] = vx;
  out[1] = vy;
  return out;
}

function addVortex(vx, vy, dx, dy, spin, core, reach) {
  const r2 = dx * dx + dy * dy + 1e-6;
  const s = (spin * (1 - Math.exp(-r2 / (core * core)))) / r2 * Math.exp(-r2 / (reach * reach));
  return [vx - dy * s, vy + dx * s];
}

// How a component's box maps into painting space ("cover" fit).
// `focus` 0..1 picks the horizontal slice on narrow boxes (0.47 = the great swirl).
export function viewOf(aspect, focus = 0.5) {
  const h = Math.min(1, PAINT_W / aspect);
  const w = aspect * h;
  const cx = Math.min(PAINT_W - w / 2, Math.max(w / 2, focus * PAINT_W));
  return { x0: cx - w / 2, y0: 0.5 - h / 2, w, h };
}

// Pack the model for a shader: vec4 arrays.
export function packVortices() {
  const a = new Float32Array(8 * 4);
  const b = new Float32Array(8 * 4);
  VORTICES.forEach((v, i) => {
    a.set([v.x, v.y, v.spin, v.core], i * 4);
    b.set([v.reach, v.arms, Math.sign(v.spin), v.lum], i * 4);
  });
  return { a, b, n: VORTICES.length };
}
export function packStars() {
  const a = new Float32Array(12 * 4);
  STARS.forEach((s, i) => a.set([s.x, s.y, s.size, s.phase], i * 4));
  return { a, n: STARS.length };
}

// The same field in GLSL ES 3.00. Needs: uniform vec4 uV[8], uW[8]; uniform int uN;
// uniform vec4 uPtr (x, y, spin, core); uniform vec4 uPtr2 (reach, 0, 0, 0).
export const GLSL_FIELD = /* glsl */ `
const float PAINT_W = ${PAINT_W.toFixed(4)};
uniform vec4 uV[8];
uniform vec4 uW[8];
uniform int uN;
uniform vec4 uPtr;
uniform float uPtrReach;
uniform float uT;

float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

float riverY(float x) {
  float f = x / PAINT_W;
  return 0.64 - 0.24 * sstep(0.38, 1.0, f) + 0.025 * sin(f * 17.0);
}

vec2 addVortex(vec2 d, float spin, float core, float reach) {
  float r2 = dot(d, d) + 1e-6;
  float s = spin * (1.0 - exp(-r2 / (core * core))) / r2 * exp(-r2 / (reach * reach));
  return vec2(-d.y, d.x) * s;
}

vec2 field(vec2 p) {
  vec2 v = vec2(0.16 + 0.05 * sin(p.y * 6.3 + uT * 0.21),
                0.045 * sin(p.x * 3.1 - uT * 0.27) + 0.03 * cos(p.x * 7.7 + p.y * 3.0 + uT * 0.13));
  float f = p.x / PAINT_W;
  float dy = p.y - riverY(p.x);
  v.y += -0.09 * sstep(0.38, 1.0, f) * exp(-dy * dy / 0.02);
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    v += addVortex(p - uV[i].xy, uV[i].z, uV[i].w, uW[i].x);
  }
  if (uPtr.z != 0.0) v += addVortex(p - uPtr.xy, uPtr.z, uPtr.w, uPtrReach);
  return v;
}
`;
