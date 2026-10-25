// <starry-sky>: the living sky, a WebGL2 shader.
//
// Brush strokes come from line-integral convolution of stipple noise along
// the model's wind field, so every streak follows the same swirls the
// particles in <starry-swirl> ride. Bands of colour spiral around each
// vortex, stars breathe in ringed halos, the crescent moon glows, and it
// is all quantised to the 8-tone ramp with ordered dither on a coarse
// pixel grid: pixel art by construction.
//
// Pointer: a new vortex follows the cursor (press to make it stronger).
// Click: a ripple of light. Keys: arrows pan the view, Space sends a ripple.
//
// Attributes: pixel (3), focus (0..1, which slice on narrow boxes), speed (1),
// stroke (1, brush length), dither (0.9), still, paused, no-tour, transparent.

import { StarryElement, define, RAMP_RGB, settle, burst, clamp, lerp, rampIndex, hash2 } from "./core.mjs";
import { GLSL_FIELD, viewOf, packVortices, packStars, MOON, STARS, VORTICES, fieldAt, riverY, PAINT_W } from "./model.mjs";
import { createGL, GLSL_COMMON, rampUniform } from "./gl.mjs";

const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec4 uView;
uniform vec4 uS[12];
uniform int uSN;
uniform vec4 uMoon;
uniform vec3 uCut;
uniform vec4 uRip;
uniform float uStroke;
uniform float uDither;
uniform float uAlpha;
${GLSL_FIELD}
${GLSL_COMMON}

// Painted bands: long waves in open sky, spirals around each vortex.
float bands(vec2 p, out float glow) {
  float psi = p.y + 0.035 * sin(p.x * 3.1 - uT * 0.27) + 0.02 * sin(p.x * 9.0 + uT * 0.1);
  float b = sin(psi * 64.0 - uT * 0.45);
  glow = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uN) break;
    vec2 d = p - uV[i].xy;
    float r = length(d);
    float reach = uW[i].x;
    float w = exp(-r * r / (reach * reach * 0.55));
    float a = atan(d.y, d.x) * uW[i].z;
    // Arms widen outward (r^0.8) and wobble, like a loaded brush.
    float s = sin(uW[i].y * a - pow(r, 0.8) * 70.0 + 0.6 * sin(a * 3.0 + r * 40.0) + uT * 0.9);
    b = mix(b, s, w * min(1.0, uW[i].w * 4.0));
    glow += w * uW[i].w * (0.55 + 0.45 * s);
  }
  return b;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
  vec2 p = uView.xy + uv * uView.zw;
  float px = uView.w / uRes.y;

  // Line-integral convolution of pixel-grid noise along the wind.
  float step = px * 1.35 * uStroke;
  float acc = 0.0, ws = 0.0;
  vec2 q = p;
  for (int i = 0; i < 11; i++) {
    float w = 0.55 + 0.45 * sin(float(i) * 0.62 - uT * 2.4);
    acc += hash12(floor(q / px)) * w; ws += w;
    vec2 v = field(q);
    q += v / (length(v) + 1e-4) * step;
  }
  q = p;
  for (int i = 1; i < 11; i++) {
    vec2 v = field(q);
    q -= v / (length(v) + 1e-4) * step;
    float w = 0.55 + 0.45 * sin(-float(i) * 0.62 - uT * 2.4);
    acc += hash12(floor(q / px)) * w; ws += w;
  }
  float lic = clamp((acc / ws - 0.5) * 3.6, -1.0, 1.0);

  float glow;
  float b = bands(p, glow);
  float rv = exp(-pow(p.y - riverY(p.x), 2.0) / 0.0045);

  float lum = 0.33 + 0.1 * b + 0.17 * lic + glow * (0.75 + 0.5 * lic);
  lum += rv * (0.22 + 0.16 * b + 0.12 * lic);
  lum -= 0.08 * smoothstep(0.35, 0.0, p.y) * (1.0 - glow);

  // Ripple of light from a click.
  if (uRip.w > 0.0) {
    float rr = length(p - uRip.xy);
    float front = uRip.z * 0.42;
    float ring = exp(-pow((rr - front) / 0.03, 2.0));
    lum += ring * uRip.w * (0.3 + 0.2 * lic);
  }

  // Stars: gold core, straw halo, rings that breathe outward.
  for (int i = 0; i < 12; i++) {
    if (i >= uSN) break;
    vec4 s = uS[i];
    float R = s.z * (1.0 + 0.06 * sin(uT * 1.7 + s.w));
    float k = length(p - s.xy) / R;
    float rings = 0.5 + 0.5 * sin(k * 15.0 - uT * 1.6 + s.w);
    float halo = smoothstep(1.35, 0.45, k);
    float star = 0.62 + 0.18 * rings + 0.3 * smoothstep(0.62, 0.12, k) + 0.1 * lic;
    lum = mix(lum, max(lum, star), halo);
  }

  // The moon: a straw disc, an ochre crescent, a wide ringed halo.
  vec3 cres = vec3(0.0);
  float crescent = 0.0;
  if (uMoon.w > 0.0) {
    float d = length(p - uMoon.xy);
    float k = d / uMoon.z;
    float rings = 0.5 + 0.5 * sin(k * 11.0 - uT * 0.9);
    float halo = smoothstep(2.3, 0.9, k);
    lum = mix(lum, max(lum, 0.55 + 0.22 * rings + 0.08 * lic), halo * 0.9);
    float disc = smoothstep(0.85 + px / uMoon.z, 0.85, k);
    lum = mix(lum, 0.86 + 0.05 * lic, disc);
    float inner = smoothstep(uMoon.z * 0.66 + px, uMoon.z * 0.66, d);
    float cut = smoothstep(uCut.z - px, uCut.z, length(p - uMoon.xy - uCut.xy));
    crescent = inner * cut;
  }

  vec3 col = rampOf(lum, frag, uDither);
  if (crescent > 0.0 && crescent + (bayer4(frag) - 0.5) * 0.6 > 0.5) col = vec3(0.784, 0.569, 0.165);
  outColor = vec4(col * uAlpha, uAlpha);
}
`;

const RAMP_U = rampUniform(RAMP_RGB);

class StarrySky extends StarryElement {
  static label = "A living Starry Night sky: brush strokes flow around swirling vortices, stars pulse in ringed halos beside a crescent moon. Move the pointer to stir the wind, click to send a ripple of light.";
  static role = "img";
  static css = `:host { --starry-aspect: 2.5; }`;
  static get observedAttributes() {
    return [...super.observedAttributes, "focus", "speed", "stroke", "dither"];
  }

  setup() {
    this.spin = { x: 0, v: 0 }; // pointer vortex strength
    this.focus = { x: this.num("focus", 0.5), v: 0 };
    this.ripple = { x: 0, y: 0, at: -99, amp: 0 };
    this.ctx = createGL(this.canvas, FRAG, { alpha: this.hasAttribute("transparent") });
    if (this.ctx) {
      const { a, b, n } = packVortices();
      const s = packStars();
      this.ctx.v4("uV", a);
      this.ctx.v4("uW", b);
      this.ctx.i1("uN", n);
      this.ctx.v4("uS", s.a);
      this.ctx.i1("uSN", s.n);
      this.ctx.f4("uMoon", MOON.x, MOON.y, MOON.r, 1);
      this.ctx.f3("uCut", MOON.cut[0], MOON.cut[1], MOON.cut[2]);
      this.ctx.v3("uRamp", RAMP_U);
      this.ctx.f1("uPtrReach", 0.22);
      this.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
      this.canvas.addEventListener("webglcontextrestored", () => {
        this._ready = false;
        this.setup();
        this.kick(true);
      });
    } else {
      this.setAttribute("data-fallback", "2d");
    }
    this.v = [0, 0];
  }

  onAttribute(name) {
    if (name === "focus") this.focusTarget = this.num("focus", 0.5);
  }

  view() {
    return viewOf(this.w / this.h, this.focus.x);
  }

  toPaint(x, y) {
    const v = this.view();
    return [v.x0 + x * v.w, v.y0 + y * v.h];
  }

  onPress(x, y) {
    const [px, py] = this.toPaint(x, y);
    this.ripple = { x: px, y: py, at: this.clock, amp: 1 };
  }

  onKey(key, shift) {
    const step = shift ? 0.15 : 0.05;
    if (key === "ArrowLeft") this.focusTarget = clamp((this.focusTarget ?? this.focus.x) - step, 0, 1);
    else if (key === "ArrowRight") this.focusTarget = clamp((this.focusTarget ?? this.focus.x) + step, 0, 1);
    else if (key === "Home") this.focusTarget = 0;
    else if (key === "End") this.focusTarget = 1;
    else if (key === " " || key === "Enter") {
      const c = this.toPaint(0.5, 0.45);
      this.ripple = { x: c[0], y: c[1], at: this.clock, amp: 1 };
    } else return false;
    return true;
  }

  update(dt, calm, touring) {
    const speed = this.num("speed", 1);
    const t = this.clock * speed;
    const p = this.pointer;

    // The tour: a soft wind wanders the sky and drops a ripple now and then.
    let px = p.x,
      py = p.y,
      want = p.insideT * (p.down ? 0.05 : 0.026);
    if (touring) {
      px = 0.5 + 0.32 * Math.sin(t * 0.23);
      py = 0.42 + 0.18 * Math.sin(t * 0.37 + 1.1);
      want = 0.02;
      const beat = Math.floor(t / 7);
      if (beat !== this._beat) {
        this._beat = beat;
        if (beat > 0) {
          const st = STARS[beat % STARS.length];
          this.ripple = { x: st.x, y: st.y, at: this.clock, amp: 0.8 };
        }
      }
    }
    const moving = settle(this.spin, want, dt, 0.45, calm);
    if (this.focusTarget !== undefined) settle(this.focus, this.focusTarget, dt, 0.35, calm);
    const [wx, wy] = this.toPaint(px, py);
    const view = this.view();
    const ripAge = (this.clock - this.ripple.at) * speed;
    const rip = calm ? 0 : burst(ripAge, 0.06, 1.1) * this.ripple.amp;

    if (this.ctx) {
      const c = this.ctx;
      c.f2("uRes", this.bw, this.bh);
      c.f4("uView", view.x0, view.y0, view.w, view.h);
      c.f1("uT", t);
      c.f4("uPtr", wx, wy, this.spin.x, 0.05);
      c.f4("uRip", this.ripple.x, this.ripple.y, ripAge, rip);
      c.f1("uStroke", this.num("stroke", 1));
      c.f1("uDither", this.num("dither", 0.9));
      c.f1("uAlpha", 1);
      c.draw(this.bw, this.bh);
    } else {
      this.drawFallback(view, t);
    }

    // Readout: the wind under the pointer (or the tour), in painting units.
    fieldAt(wx, wy, t, this.v, [{ x: wx, y: wy, spin: this.spin.x, core: 0.05, reach: 0.22 }]);
    const sp = Math.hypot(this.v[0], this.v[1]);
    const deg = Math.round((Math.atan2(-this.v[1], this.v[0]) * 180) / Math.PI);
    this.say(`wind ${sp.toFixed(2)} at ${deg}° · ${VORTICES.length} swirls · ${STARS.length} stars`);

    return !calm && !this.hasAttribute("paused") ? true : moving;
  }

  // No WebGL2: paint one still frame of bands, stars and moon on a 2D canvas.
  drawFallback(view, t) {
    const g = (this._g ||= this.canvas.getContext("2d"));
    if (this._fallbackDrawn === `${this.bw}x${this.bh}`) return;
    this._fallbackDrawn = `${this.bw}x${this.bh}`;
    const img = g.createImageData(this.bw, this.bh);
    const d = img.data;
    for (let y = 0; y < this.bh; y++) {
      for (let x = 0; x < this.bw; x++) {
        const P = [view.x0 + ((x + 0.5) / this.bw) * view.w, view.y0 + ((y + 0.5) / this.bh) * view.h];
        let lum = 0.33 + 0.1 * Math.sin(P[1] * 64 + 0.6 * Math.sin(P[0] * 9)) + 0.14 * (hash2(x, y) - 0.5);
        for (const v of VORTICES) {
          const r = Math.hypot(P[0] - v.x, P[1] - v.y);
          const w = Math.exp((-r * r) / (v.reach * v.reach * 0.55));
          const a = Math.atan2(P[1] - v.y, P[0] - v.x) * Math.sign(v.spin);
          lum += w * v.lum * (0.55 + 0.45 * Math.sin(v.arms * a - r * 150));
        }
        lum += 0.25 * Math.exp(-((P[1] - riverY(P[0])) ** 2) / 0.0045);
        for (const s of STARS) {
          const k = Math.hypot(P[0] - s.x, P[1] - s.y) / s.size;
          if (k < 1.35) lum = lerp(lum, Math.max(lum, 0.7 + 0.3 * (k < 0.5)), Math.min(1, (1.35 - k) / 0.9));
        }
        const mk = Math.hypot(P[0] - MOON.x, P[1] - MOON.y) / MOON.r;
        if (mk < 0.85) lum = 0.88;
        else if (mk < 2.3) lum = Math.max(lum, 0.55 * Math.min(1, (2.3 - mk) / 1.4) + lum * 0.4);
        let c = RAMP_RGB[rampIndex(clamp(lum, 0, 1), x, y, 0.9)];
        const crescent = Math.hypot(P[0] - MOON.x, P[1] - MOON.y) < MOON.r * 0.66 && Math.hypot(P[0] - MOON.x - MOON.cut[0], P[1] - MOON.y - MOON.cut[1]) > MOON.cut[2];
        if (crescent) c = [200, 145, 42];
        const i = (y * this.bw + x) * 4;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
}

export { StarrySky, PAINT_W };
define("starry-sky", StarrySky);
