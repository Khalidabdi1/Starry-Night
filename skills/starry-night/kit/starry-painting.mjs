// <starry-painting src="...">: bring a still image to life.
//
// The image's sky is advected along the model's wind with a two-phase
// flow map (two samples half a cycle apart, crossfaded with a triangle
// weight, so the motion loops forever with no reset pop). Stars shimmer
// in rings, dark shapes (the cypress, the hills) are held still by a
// brightness mask and the horizon line. Sampling is nearest-texel on the
// image's own pixel grid, so pixel art stays pixel art.
//
// Made for the pixel-art panorama in this repo (2.5 : 1), whose swirls sit
// exactly on the model's vortices, but any image works: it is mapped
// "cover" into painting space and every swirl still turns.
//
// Pointer: a vortex follows the cursor. Click: a ripple. Space: a ripple.
// Attributes: src, alt, flow (1), horizon (0.64), hold (0.16, darkness kept
// still), pixel (1), speed (1), still, paused.

import { StarryElement, define, settle, burst, clamp } from "./core.mjs";
import { GLSL_FIELD, viewOf, packVortices, packStars, PAINT_W, VORTICES } from "./model.mjs";
import { createGL } from "./gl.mjs";

const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uImg;
uniform vec2 uImgSize;
uniform vec2 uRes;
uniform vec4 uView;   // painting-space window the element shows
uniform vec4 uCrop;   // image uv window (x0, y0, w, h), y down
uniform float uFlow;
uniform float uHorizon;
uniform float uHold;
uniform vec4 uS[12];
uniform int uSN;
uniform vec4 uRip;
${GLSL_FIELD}

vec3 tex(vec2 uv) {
  uv = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 texel = (floor(uv * uImgSize) + 0.5) / uImgSize;
  return texture(uImg, vec2(texel.x, 1.0 - texel.y)).rgb;
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
  vec2 p = uView.xy + uv * uView.zw;               // painting space
  vec2 iuv = uCrop.xy + uv * uCrop.zw;             // image uv
  vec2 toUv = uCrop.zw / uView.zw;                 // painting units -> image uv

  vec3 still = tex(iuv);
  vec2 v = field(p);
  float cyc = uT * 0.22;
  float ph0 = fract(cyc), ph1 = fract(cyc + 0.5);
  vec2 off = v * 0.32 * uFlow * toUv;
  // Ripple: a ring that pushes the paint outward as it passes.
  if (uRip.w > 0.0) {
    vec2 d = p - uRip.xy;
    float r = length(d) + 1e-4;
    float ring = exp(-pow((r - uRip.z * 0.4) / 0.04, 2.0)) * uRip.w;
    iuv += d / r * ring * 0.012 * toUv;
  }
  vec3 a = tex(iuv - off * (ph0 - 0.5));
  vec3 b = tex(iuv - off * (ph1 - 0.5));
  vec3 flowed = mix(a, b, abs(ph0 - 0.5) * 2.0);

  // Hold the land and the cypress still.
  float sky = smoothstep(uHorizon + 0.04, uHorizon - 0.04, p.y);
  float dark = smoothstep(uHold, uHold * 0.55, luma(still));
  float darkFlow = smoothstep(uHold, uHold * 0.55, luma(flowed));
  float m = sky * (1.0 - dark) * (1.0 - darkFlow);
  vec3 col = mix(still, flowed, m);

  // Stars shimmer: rings of brightness breathing outward over bright paint.
  float shimmer = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uSN) break;
    float k = length(p - uS[i].xy) / (uS[i].z * 1.3);
    shimmer += (0.5 + 0.5 * sin(k * 14.0 - uT * 1.8 + uS[i].w)) * smoothstep(1.2, 0.2, k);
  }
  float bright = smoothstep(0.45, 0.8, luma(col));
  col *= 1.0 + 0.22 * shimmer * bright * uFlow;
  outColor = vec4(col, 1.0);
}
`;

class StarryPainting extends StarryElement {
  static label = "A painting brought to life: its sky flows along the swirling wind and its stars shimmer.";
  static defaultPixel = 1;
  static css = `:host { --starry-aspect: 2.5; } img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; image-rendering:pixelated; }`;
  static get observedAttributes() {
    return [...super.observedAttributes, "src", "alt", "flow", "horizon", "hold"];
  }

  setup() {
    this.spin = { x: 0, v: 0 };
    this.ripple = { x: 0, y: 0, at: -99, amp: 0 };
    this.ctx = createGL(this.canvas, FRAG);
    if (this.ctx) {
      const { a, b, n } = packVortices();
      const s = packStars();
      this.ctx.v4("uV", a);
      this.ctx.v4("uW", b);
      this.ctx.i1("uN", n);
      this.ctx.v4("uS", s.a);
      this.ctx.i1("uSN", s.n);
      this.ctx.f1("uPtrReach", 0.2);
      this.ctx.i1("uImg", 0);
    } else {
      this.setAttribute("data-fallback", "img");
    }
    this.load();
  }

  onAttribute(name) {
    if (name === "src") this.load();
    if (name === "alt") this.setAttribute("aria-label", this.getAttribute("alt"));
  }

  load() {
    const src = this.getAttribute("src");
    if (!src || src === this._src) return;
    this._src = src;
    this.img = null;
    this.say("loading image");
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.img = img;
      if (this.ctx) this.ctx.texture(0, img, { nearest: true });
      else this.showFallback(img);
      this.dispatchEvent(new Event("load"));
      this.kick(true);
    };
    img.onerror = () => {
      this.say("image failed to load");
      this.dispatchEvent(new Event("error"));
    };
    img.src = src;
    if (this.getAttribute("alt")) this.setAttribute("aria-label", this.getAttribute("alt"));
  }

  showFallback(img) {
    const el = img.cloneNode();
    el.alt = "";
    this.root.append(el);
    this.canvas.style.display = "none";
  }

  // Which part of the image is visible ("cover"), and the painting space it maps to.
  geometry() {
    const ea = this.w / this.h;
    const ia = this.img ? this.img.naturalWidth / this.img.naturalHeight : PAINT_W;
    // Crop the image to the element's aspect, centred.
    let cw = 1,
      ch = 1;
    if (ea > ia) ch = ia / ea;
    else cw = ea / ia;
    const crop = { x0: (1 - cw) / 2, y0: (1 - ch) / 2, w: cw, h: ch };
    // The full image maps onto the full painting (cover), then cropped alike.
    const full = viewOf(ia, 0.5);
    const view = { x0: full.x0 + crop.x0 * full.w, y0: full.y0 + crop.y0 * full.h, w: cw * full.w, h: ch * full.h };
    return { crop, view };
  }

  onPress(x, y) {
    const { view } = this.geometry();
    this.ripple = { x: view.x0 + x * view.w, y: view.y0 + y * view.h, at: this.clock, amp: 1 };
  }
  onKey(key) {
    if (key === " " || key === "Enter") {
      this.onPress(0.5, 0.4);
      return true;
    }
    return false;
  }

  update(dt, calm, touring) {
    if (!this.img || !this.ctx) return false;
    const t = this.clock * this.num("speed", 1);
    const p = this.pointer;
    let px = p.x,
      py = p.y,
      want = p.insideT * (p.down ? 0.045 : 0.024);
    if (touring) {
      px = 0.5 + 0.3 * Math.sin(t * 0.21);
      py = 0.35 + 0.15 * Math.sin(t * 0.33);
      want = 0.012;
    }
    const moving = settle(this.spin, want, dt, 0.45, calm);
    const { crop, view } = this.geometry();
    const c = this.ctx;
    const ripAge = this.clock - this.ripple.at;
    c.f2("uRes", this.bw, this.bh);
    c.f2("uImgSize", this.img.naturalWidth, this.img.naturalHeight);
    c.f4("uView", view.x0, view.y0, view.w, view.h);
    c.f4("uCrop", crop.x0, crop.y0, crop.w, crop.h);
    c.f1("uT", t);
    c.f1("uFlow", calm ? 0 : clamp(this.num("flow", 1), 0, 4));
    c.f1("uHorizon", this.num("horizon", 0.64));
    c.f1("uHold", this.num("hold", 0.16));
    c.f4("uPtr", view.x0 + px * view.w, view.y0 + py * view.h, calm ? 0 : this.spin.x, 0.05);
    c.f4("uRip", this.ripple.x, this.ripple.y, ripAge, calm ? 0 : burst(ripAge, 0.06, 0.9));
    c.draw(this.bw, this.bh);
    this.say(calm ? "still" : `flowing · ${VORTICES.length} swirls${this.spin.x > 0.004 ? " · stirred" : ""}`);
    return !calm || moving;
  }
}

export { StarryPainting };
define("starry-painting", StarryPainting);
