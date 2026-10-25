// Starry Night kit: core.
// Palette, motion math (follow, settle, spring, envelopes), seeded noise,
// and StarryElement, the base class every component extends.
// Zero dependencies. Works in any browser that has custom elements.

/* ------------------------------------------------------------------ */
/* Palette: sampled from the pixel-art panorama, darkest to brightest. */
/* ------------------------------------------------------------------ */

export const PALETTE = {
  ink: "#050a1f", // cypress, deepest night
  night: "#0b1b52", // shadowed sky
  ultramarine: "#153a9c", // body of the sky
  cobalt: "#2763cf", // lit strokes
  azure: "#4d93e6", // bright strokes
  frost: "#a8d0ee", // pale ribbons
  straw: "#eedc7f", // star halos
  gold: "#f7c844", // star and moon cores
  ochre: "#c8912a", // the moon's shadowed crescent
  window: "#ffd45a", // lit village windows
};

// The ramp every component quantises to. Index 0 is darkest.
export const RAMP = [
  PALETTE.ink,
  PALETTE.night,
  PALETTE.ultramarine,
  PALETTE.cobalt,
  PALETTE.azure,
  PALETTE.frost,
  PALETTE.straw,
  PALETTE.gold,
];

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const RAMP_RGB = RAMP.map(hexToRgb);

// 4x4 ordered-dither matrix, values in (0, 1).
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

// Quantise a 0..1 brightness to a ramp index with ordered dither.
export function rampIndex(lum, x, y, dither = 0.9) {
  const n = RAMP.length - 1;
  const v = lum * n + (bayer(x, y) - 0.5) * dither;
  return v <= 0 ? 0 : v >= n ? n : Math.round(v);
}

/* ------------------------------------------------------------------ */
/* Motion math. Everything is time-based: pass dt in seconds.          */
/* `calm` is true under prefers-reduced-motion: values jump to target. */
/* ------------------------------------------------------------------ */

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// One-shot event envelope: smooth attack over `rise`, exponential decay `fall`.
export function burst(age, rise = 0.08, fall = 0.4) {
  if (age < 0) return 0;
  if (age < rise) return smooth(0, rise, age);
  return Math.exp(-(age - rise) / fall);
}

// Exponential follow toward a target with time constant tau (s).
export function follow(x, target, dt, tau = 0.25, calm = false) {
  if (calm) return target;
  return x + (target - x) * (1 - Math.exp(-dt / tau));
}

// Critically damped settle on s = { x, v }. Returns true while moving.
export function settle(s, target, dt, seconds = 0.4, calm = false) {
  if (calm) {
    s.x = target;
    s.v = 0;
    return false;
  }
  const w = 1 / seconds;
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (w * w * (target - s.x) - 2 * w * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(target - s.x) < 5e-4 && Math.abs(s.v) < 5e-4) {
    s.x = target;
    s.v = 0;
    return false;
  }
  return true;
}

// Damped spring on s = { x, v } with stiffness k and damping c, sub-stepped.
export function spring(s, target, dt, k = 120, c = 14, calm = false) {
  if (calm) {
    s.x = target;
    s.v = 0;
    return false;
  }
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(target - s.x) < 5e-4 && Math.abs(s.v) < 5e-4) {
    s.x = target;
    s.v = 0;
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Seeded randomness so every render of a component is reproducible.   */
/* ------------------------------------------------------------------ */

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ */
/* StarryElement: the shared lifecycle.                                */
/*                                                                     */
/*  - one requestAnimationFrame loop, dt clamped to 1/30 s             */
/*  - stops when offscreen (IntersectionObserver) or settled           */
/*  - reduced motion: one still frame, still responds to input         */
/*  - pointer mapped to 0..1, eased with exponential follow            */
/*  - idle tour after 1.4 s, paused on interaction, resumes after 3.6 s */
/*  - a live readout: `readout` event + aria-valuetext                 */
/*  - low-res backing canvas, scaled up with crisp pixels              */
/* ------------------------------------------------------------------ */

const BASE_CSS = `
:host { display: block; position: relative; overflow: hidden; contain: content;
  aspect-ratio: var(--starry-aspect, auto); background: var(--starry-bg, ${PALETTE.ink});
  touch-action: pan-y; -webkit-tap-highlight-color: transparent; outline: none; }
:host([transparent]) { background: transparent; }
:host(:focus-visible) { outline: 1px solid var(--starry-focus, ${PALETTE.frost}); outline-offset: 6px; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block;
  image-rendering: pixelated; image-rendering: crisp-edges; }
`;

const TOUR_START = 1.4;
const TOUR_RESUME = 3.6;

export class StarryElement extends HTMLElement {
  static get observedAttributes() {
    return ["pixel", "paused", "seed", "still"];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BASE_CSS + (this.constructor.css || "");
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("part", "canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    this.root.append(style, this.canvas);

    this.w = 0; // css px
    this.h = 0;
    this.bw = 0; // backing px
    this.bh = 0;
    this.clock = 0; // seconds of animated time
    this.visible = false;
    this.frame = 0;
    this.last = 0;
    this.idle = 0; // seconds since the last interaction
    this.interacted = false;
    this.pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, inside: 0, insideT: 0, down: false };
    this._tick = this._tick.bind(this);
  }

  /* ---- attributes ---- */
  num(name, fallback) {
    const v = parseFloat(this.getAttribute(name));
    return Number.isFinite(v) ? v : fallback;
  }
  get pixel() {
    return clamp(this.num("pixel", this.constructor.defaultPixel ?? 3), 1, 16);
  }
  get seed() {
    return this.num("seed", 7) | 0;
  }
  get calm() {
    return this.hasAttribute("still") || (this._motion ? this._motion.matches : false);
  }

  attributeChangedCallback(name) {
    // Parser-created elements report their attributes before connectedCallback.
    if (!this.isConnected || !this._ready) return;
    if (name === "pixel") this._resize();
    if (name === "seed") this.reseed?.();
    this.onAttribute?.(name);
    this.kick();
  }

  /* ---- lifecycle ---- */
  connectedCallback() {
    if (!this.hasAttribute("tabindex") && this.constructor.focusable !== false) this.tabIndex = 0;
    if (!this.hasAttribute("role")) this.setAttribute("role", this.constructor.role || "img");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", this.constructor.label || "Animated Starry Night illustration");

    this._motion = matchMedia("(prefers-reduced-motion: reduce)");
    this._onMotion = () => this.kick();
    this._motion.addEventListener?.("change", this._onMotion);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._io = new IntersectionObserver(
      (entries) => {
        // Read the newest entry: one callback can carry a leave and a return.
        this.visible = entries[entries.length - 1].isIntersecting;
        if (this.visible) this.kick();
      },
      { rootMargin: "120px 0px" },
    );
    this._io.observe(this);

    this._bindInput();
    if (!this._ready) {
      this._ready = true;
      this.setup?.();
    }
    this._resize();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this._ro?.disconnect();
    this._io?.disconnect();
    this._motion?.removeEventListener?.("change", this._onMotion);
    this._unbindInput?.();
  }

  _resize() {
    const r = this.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    const px = this.pixel;
    const bw = Math.max(1, Math.round(w / px));
    const bh = Math.max(1, Math.round(h / px));
    if (bw === this.bw && bh === this.bh && w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.bw = bw;
    this.bh = bh;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.resize?.(bw, bh);
    this.kick(true);
  }

  /* ---- input ---- */
  _bindInput() {
    const toLocal = (e) => {
      const r = this.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
    };
    const touch = () => {
      this.idle = 0;
      this.interacted = true;
    };
    const move = (e) => {
      const [x, y] = toLocal(e);
      this.pointer.tx = x;
      this.pointer.ty = y;
      this.pointer.inside = 1;
      touch();
      this.onPointerMove?.(x, y, e);
      this.kick();
    };
    const down = (e) => {
      const [x, y] = toLocal(e);
      this.pointer.tx = x;
      this.pointer.ty = y;
      this.pointer.inside = 1;
      this.pointer.down = true;
      touch();
      this.onPress?.(x, y, e);
      this.kick();
    };
    const up = () => {
      this.pointer.down = false;
      this.onRelease?.();
      this.kick();
    };
    const leave = () => {
      this.pointer.inside = 0;
      this.pointer.down = false;
      this.onLeave?.();
      this.kick();
    };
    const key = (e) => {
      if (this.onKey?.(e.key, e.shiftKey)) {
        e.preventDefault();
        touch();
        this.kick();
      }
    };
    const focus = () => {
      touch();
      this.kick();
    };
    this.addEventListener("pointermove", move);
    this.addEventListener("pointerdown", down);
    this.addEventListener("pointerup", up);
    this.addEventListener("pointercancel", leave);
    this.addEventListener("pointerleave", leave);
    this.addEventListener("keydown", key);
    this.addEventListener("focus", focus);
    this._unbindInput = () => {
      this.removeEventListener("pointermove", move);
      this.removeEventListener("pointerdown", down);
      this.removeEventListener("pointerup", up);
      this.removeEventListener("pointercancel", leave);
      this.removeEventListener("pointerleave", leave);
      this.removeEventListener("keydown", key);
      this.removeEventListener("focus", focus);
    };
  }

  // True while nobody has touched the element for a while: the tour drives targets.
  get touring() {
    if (this.calm || this.hasAttribute("no-tour")) return false;
    const wait = this.interacted ? TOUR_RESUME : TOUR_START;
    return this.idle > wait && !this.matches(":hover") && document.activeElement !== this;
  }

  /* ---- loop ---- */
  kick(force = false) {
    if (force) this._dirty = true;
    if (this.frame || !this.visible || !this.bw) return;
    if (this.hasAttribute("paused") && !this._dirty) return;
    this.last = 0;
    this.frame = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    this.frame = 0;
    const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 30) : 1 / 60;
    this.last = now;
    const calm = this.calm;
    const paused = this.hasAttribute("paused");
    if (!paused && !calm) this.clock += dt;
    this.idle += dt;

    const p = this.pointer;
    p.x = follow(p.x, p.tx, dt, 0.18, calm);
    p.y = follow(p.y, p.ty, dt, 0.18, calm);
    p.insideT = follow(p.insideT, p.inside, dt, 0.35, calm);

    // update() returns true while it needs more frames.
    const busy = this.update(paused ? 0 : dt, calm, this.touring) !== false;
    this._dirty = false;
    const keep = this.visible && !paused && (busy || this.touring) && !(calm && !busy);
    if (keep) this.frame = requestAnimationFrame(this._tick);
    else this.last = 0;
  }

  /* ---- readout ---- */
  say(text) {
    if (text === this._said) return;
    this._said = text;
    this.setAttribute("aria-valuetext", text);
    this.dispatchEvent(new CustomEvent("readout", { detail: text, bubbles: true }));
  }

  /* ---- public API ---- */
  play() {
    this.removeAttribute("paused");
  }
  pause() {
    this.setAttribute("paused", "");
  }
  // Capture the current frame as a PNG data URL (scaled to CSS size, crisp).
  snapshot(scale = 1) {
    const out = document.createElement("canvas");
    out.width = Math.round(this.w * scale);
    out.height = Math.round(this.h * scale);
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }
}

export function define(name, cls) {
  if (typeof customElements !== "undefined" && !customElements.get(name)) customElements.define(name, cls);
  return cls;
}
