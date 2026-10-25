// <starry-text>: words written in wind.
//
// The text is rasterised once into a mask at the pixel grid; one particle
// is given each sampled glyph pixel as its home. A single value, `scatter`
// (0 = assembled, 1 = blown apart), settles critically damped toward its
// target. Each particle is pulled home by a spring scaled by (1 - scatter)
// and carried by the model's wind scaled by scatter, so the word dissolves
// into Starry Night swirls and pours back into its letters.
//
// Hover (or focus) to scatter, leave to reassemble; Space toggles; the tour
// breathes it apart and back now and then.
//
// Attributes: text (or the element's text content), font ("700 1em serif"
// style, sized to fit), pixel (2), density (1), speed (1), still, paused,
// transparent.

import { StarryElement, define, rng, settle, clamp } from "./core.mjs";
import { fieldAt, viewOf } from "./model.mjs";
import { Raster } from "./raster.mjs";

class StarryText extends StarryElement {
  static defaultPixel = 2;
  static css = `:host { --starry-aspect: 4; } ::slotted(*) { display: none; }`;
  static get observedAttributes() {
    return [...super.observedAttributes, "text", "font", "density"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.scatter = { x: 0, v: 0 };
    this.forced = null;
    this.f = [0, 0];
    this.root.append(document.createElement("slot"));
  }

  get text() {
    return (this.getAttribute("text") ?? this.textContent ?? "").trim() || "Starry Night";
  }

  onAttribute(name) {
    if (name === "text" || name === "font" || name === "density") this.layout();
  }

  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
    this.layout();
  }

  layout() {
    if (!this.raster) return;
    const { w, h } = this.raster;
    const text = this.text;
    this.setAttribute("aria-label", text);
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const g = off.getContext("2d", { willReadFrequently: true });
    const spec = this.getAttribute("font") || `700 1em "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;
    // Fit the text: try a size, measure, scale to 86% of the width and 70% of the height.
    const fontAt = (px) => spec.replace(/(\d*\.?\d+)(em|px|rem)/, `${px}px`);
    g.font = fontAt(100);
    const m = g.measureText(text);
    const size = Math.max(4, Math.min((100 * w * 0.86) / Math.max(1, m.width), h * 0.7));
    g.font = fontAt(size);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    g.fillText(text, w / 2, h / 2 + size * 0.04);
    const data = g.getImageData(0, 0, w, h).data;

    const R = rng(this.seed);
    const density = clamp(this.num("density", 1), 0.1, 4);
    const homes = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128 && R() < 0.55 * density) homes.push([x + 0.5, y + 0.5]);
    // Keep any old particles' positions so a re-layout flows rather than jumps.
    const old = this.parts || [];
    this.parts = homes.map(([hx, hy], i) => {
      const o = old[i % Math.max(1, old.length)];
      const r = R();
      return {
        hx,
        hy,
        x: o ? o.x : R() * w,
        y: o ? o.y : R() * h,
        vx: 0,
        vy: 0,
        // Letters glow gold at the top, straw and frost lower down, like starlight.
        tone: clamp(0.62 + 0.38 * (1 - hy / h) * r + 0.12 * r, 0.55, 1),
        wind: 0.6 + 0.8 * R(),
      };
    });
    if (!old.length) this.scatter.x = this.calm ? 0 : 1; // arrive from the wind
    this.kick();
  }

  onKey(key) {
    if (key === " " || key === "Enter") {
      this.forced = this.forced === null ? (this.scatter.x < 0.5 ? 1 : 0) : this.forced ? 0 : 1;
      return true;
    }
    if (key === "Escape") {
      this.forced = null;
      return true;
    }
    return false;
  }
  onLeave() {
    this.forced = null;
  }

  update(dt, calm, touring) {
    const R = this.raster;
    if (!R || !this.parts) return false;
    const { w, h } = R;
    const t = this.clock * this.num("speed", 1);
    const transparent = this.hasAttribute("transparent");

    let target = this.pointer.insideT > 0.5 ? 1 : 0;
    // The tour breathes the word apart for ~2.5 s in every 12.6 s, first at about 8 s.
    if (touring) target = Math.sin(t * 0.5 - 2.5) > 0.82 ? 1 : 0;
    if (this.forced !== null) target = this.forced;
    const moving = settle(this.scatter, target, dt, target ? 0.35 : 0.7, calm);
    const sc = clamp(this.scatter.x, 0, 1);

    const view = viewOf(w / h, 0.47);
    const sx = view.w / w,
      sy = view.h / h;
    R.decay(0.16, dt, calm ? 1e-3 : 0.22);
    if (transparent) R.decayAlpha(0, dt, calm ? 1e-3 : 0.2);

    const f = this.f;
    let home = 0;
    const k = 60 * (1 - sc) + 0.5;
    const c = 2 * Math.sqrt(k) * 0.9;
    for (const p of this.parts) {
      if (calm) {
        p.x = sc > 0.5 ? p.x : p.hx;
        p.y = sc > 0.5 ? p.y : p.hy;
      } else {
        fieldAt(view.x0 + p.x * sx, view.y0 + p.y * sy, t, f);
        const gx = (f[0] / sx) * sc * p.wind * 0.9,
          gy = (f[1] / sy) * sc * p.wind * 0.9;
        const ox = p.x,
          oy = p.y;
        p.vx += (k * (p.hx - p.x) - c * p.vx) * dt;
        p.vy += (k * (p.hy - p.y) - c * p.vy) * dt;
        p.x += (p.vx + gx) * dt;
        p.y += (p.vy + gy) * dt;
        // Wrap blown strokes around the edges so the swirl stays full.
        if (p.x < -4) p.x += w + 8;
        else if (p.x > w + 4) p.x -= w + 8;
        if (p.y < -4) p.y += h + 8;
        else if (p.y > h + 4) p.y -= h + 8;
        if (Math.abs(p.x - ox) < w / 2 && Math.abs(p.y - oy) < h / 2) R.line(ox, oy, p.x, p.y, p.tone * (0.75 + 0.25 * (1 - sc)), 1, 1);
      }
      R.plot(p.x, p.y, p.tone, 1);
      if (Math.abs(p.x - p.hx) < 1 && Math.abs(p.y - p.hy) < 1) home++;
    }
    R.present({ transparent, dither: 0.6 });
    const pct = Math.round((100 * home) / Math.max(1, this.parts.length));
    this.say(`${this.text} · ${pct}% assembled`);
    return !calm || moving;
  }
}

export { StarryText };
define("starry-text", StarryText);
