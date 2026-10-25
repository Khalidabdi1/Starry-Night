// <starry-swirl>: brush strokes riding the wind.
//
// A few thousand particles advected through the model's field (the same
// field the <starry-sky> shader convolves), each leaving a short fading
// stroke on the pixel grid. Particles born in bright regions (a swirl's
// glow, the river of cloud) paint straw and gold; the rest paint blues.
//
// Pointer: a vortex follows the cursor and the brush sheds light where it
// passes. Press for a stronger swirl. Keys: Space scatters a burst of light.
//
// Attributes: count (1800), pixel (2), trail (0.9 s), speed (1), focus (0.5),
// still, paused, no-tour, transparent.

import { StarryElement, define, rng, settle, clamp } from "./core.mjs";
import { fieldAt, viewOf, VORTICES, riverY, STARS, MOON } from "./model.mjs";
import { Raster } from "./raster.mjs";

class StarrySwirl extends StarryElement {
  static label = "Thousands of brush strokes flowing through the swirling wind of The Starry Night. Move the pointer to stir a new swirl.";
  static defaultPixel = 2;
  static css = `:host { --starry-aspect: 2.5; }`;
  static get observedAttributes() {
    return [...super.observedAttributes, "count", "focus"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.spin = { x: 0, v: 0 };
    this.v = [0, 0];
    this.reseed();
  }

  reseed() {
    this.rand = rng(this.seed);
    this.parts = [];
    this.raster && this.raster.fill(0.2, this.hasAttribute("transparent") ? 0 : 1);
  }

  onAttribute(name) {
    if (name === "count") this.parts.length = Math.min(this.parts.length, this.count);
  }

  get count() {
    return clamp(this.num("count", 1800) | 0, 50, 20000);
  }

  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
    this.raster.fill(0.2, this.hasAttribute("transparent") ? 0 : 1);
    this.parts.length = 0;
  }

  view() {
    return viewOf(this.w / this.h, this.num("focus", 0.5));
  }

  // Brightness a stroke paints with, from where it is born.
  toneAt(x, y) {
    let glow = 0;
    for (const v of VORTICES) {
      const r2 = (x - v.x) ** 2 + (y - v.y) ** 2;
      glow += v.lum * Math.exp(-r2 / (v.reach * v.reach * 0.35));
    }
    glow += 0.5 * Math.exp(-((y - riverY(x)) ** 2) / 0.004);
    for (const s of STARS) glow += 0.6 * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (s.size * s.size));
    glow += 0.7 * Math.exp(-((x - MOON.x) ** 2 + (y - MOON.y) ** 2) / (MOON.r * MOON.r * 2.5));
    const r = this.rand();
    return clamp(0.36 + 0.22 * r + glow * (0.5 + 0.6 * r), 0, 1);
  }

  spawn(p, view, near) {
    const R = this.rand;
    if (near) {
      p.x = near[0] + (R() - 0.5) * 0.06;
      p.y = near[1] + (R() - 0.5) * 0.06;
      p.tone = 0.8 + 0.2 * R();
    } else {
      p.x = view.x0 + R() * view.w;
      p.y = view.y0 + R() * view.h;
      p.tone = this.toneAt(p.x, p.y);
    }
    p.life = 1.5 + R() * 3.5;
    p.age = 0;
    p.width = R() < 0.18 ? 2 : 1;
    return p;
  }

  onKey(key) {
    if (key === " " || key === "Enter") {
      const view = this.view();
      for (let i = 0; i < 160 && i < this.parts.length; i++) {
        const p = this.parts[(this.rand() * this.parts.length) | 0];
        this.spawn(p, view, [view.x0 + view.w * 0.5, view.y0 + view.h * 0.45]);
      }
      return true;
    }
    return false;
  }

  update(dt, calm, touring) {
    const view = this.view();
    const R = this.raster;
    if (!R) return false;
    const speed = this.num("speed", 1);
    const t = this.clock * speed;
    const transparent = this.hasAttribute("transparent");
    const ptr = this.pointer;

    let px = ptr.x,
      py = ptr.y,
      want = ptr.insideT * (ptr.down ? 0.05 : 0.028);
    if (touring) {
      px = 0.5 + 0.34 * Math.sin(t * 0.19);
      py = 0.45 + 0.2 * Math.sin(t * 0.31 + 0.7);
      want = 0.024;
    }
    settle(this.spin, want, dt, 0.4, calm);
    const wx = view.x0 + px * view.w,
      wy = view.y0 + py * view.h;
    const extra = [{ x: wx, y: wy, spin: this.spin.x, core: 0.05, reach: 0.2 }];

    while (this.parts.length < this.count) this.parts.push(this.spawn({}, view));

    // Reduced motion: lay down one still frame of long strokes and stop.
    const steps = calm ? 24 : 1;
    const h = calm ? 0.06 : dt * speed;
    if (calm) R.fill(0.2, transparent ? 0 : 1);
    else {
      const trail = this.num("trail", 0.9);
      R.decay(0.2, dt, trail);
      if (transparent) R.decayAlpha(0, dt, trail * 0.8);
    }

    const sx = this.bw / view.w,
      sy = this.bh / view.h;
    const f = this.v;
    let sum = 0;
    const shed = !calm && (ptr.insideT > 0.5 || touring) ? 4 : 0;
    for (let k = 0; k < this.parts.length; k++) {
      const p = this.parts[k];
      for (let s = 0; s < steps; s++) {
        fieldAt(p.x, p.y, t, f, extra);
        const ox = (p.x - view.x0) * sx,
          oy = (p.y - view.y0) * sy;
        p.x += f[0] * h * 0.9;
        p.y += f[1] * h * 0.9;
        p.age += h;
        // Fade in and out over a stroke's life so nothing pops.
        const life = Math.min(1, p.age / 0.4, (p.life - p.age) / 0.6);
        const v = 0.2 + (p.tone - 0.2) * Math.max(0, life);
        R.line(ox, oy, (p.x - view.x0) * sx, (p.y - view.y0) * sy, v, p.width, Math.max(0, life));
      }
      if (k < 64) sum += Math.hypot(f[0], f[1]);
      const out = p.x < view.x0 - 0.02 || p.x > view.x0 + view.w + 0.02 || p.y < view.y0 - 0.02 || p.y > view.y0 + view.h + 0.02;
      if (out || p.age > p.life) this.spawn(p, view, k < shed ? [wx, wy] : null);
    }

    R.present({ transparent, dither: 0.7 });
    this.say(`${this.parts.length} strokes · wind ${(sum / Math.min(64, this.parts.length)).toFixed(2)}`);
    return !calm;
  }
}

export { StarrySwirl };
define("starry-swirl", StarrySwirl);
