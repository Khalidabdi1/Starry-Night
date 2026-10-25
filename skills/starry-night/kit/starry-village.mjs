// <starry-village>: the village under the sky.
//
// Three ranges of hills, two rows of houses and the church with its
// spire, rasterised once per size (back to front, so nearer roofs cover
// farther ones). Each window is its own light: when night falls they
// come on one after another, rippling out from where you clicked, then
// flicker like lamps. Smoke rises from the chimneys and leans with the wind.
//
// Click or Space: toggle the lights (a staggered cascade, 45 ms apart).
// The idle tour lets a few windows come and go on their own.
//
// Attributes: houses (18), pixel (3), speed (1), seed, still, paused,
// transparent (sky left clear, to layer over <starry-sky>), lights="off".

import { StarryElement, define, rng, settle, clamp, hash2, smooth } from "./core.mjs";
import { Raster } from "./raster.mjs";

const STAGGER = 0.045; // seconds between windows in a cascade

class StarryVillage extends StarryElement {
  static label = "The village from The Starry Night: hills, houses and a church spire. Click to switch the window lights on or off; they come on one after another.";
  static css = `:host { --starry-aspect: 3; }`;
  static role = "button";
  static get observedAttributes() {
    return [...super.observedAttributes, "houses", "lights"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.on = this.getAttribute("lights") !== "off";
    this.windows = [];
    this.smoke = [];
  }

  onAttribute(name) {
    if (name === "houses") this.resize(this.bw, this.bh);
    if (name === "lights") this.toggle(this.getAttribute("lights") !== "off", 0.5, 0.7);
  }

  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
    this.build(bw, bh);
    // Start dark, then let night fall: the first cascade runs from the church.
    for (const w of this.windows) w.lit.x = 0;
    this.toggle(this.on, this.church ? this.church.u : 0.5, 0.75, 0.6);
  }

  build(bw, bh) {
    const R = rng(this.seed);
    const base = new Float32Array(bw * bh).fill(-1); // -1 = sky
    const put = (x, y, v) => {
      if (x >= 0 && y >= 0 && x < bw && y < bh) base[y * bw + x] = v;
    };

    // Hills, far to near. Ridges in "height from the bottom" (0..1).
    const ridges = [
      { at: (u) => 0.7 + 0.07 * Math.sin(u * 5.1 + 1) + 0.03 * Math.sin(u * 13.7), lum: 0.34 },
      { at: (u) => 0.5 + 0.08 * Math.sin(u * 3.3 + 2) + 0.03 * Math.sin(u * 11 + 0.5), lum: 0.25 },
      { at: (u) => 0.24 + 0.04 * Math.sin(u * 4 + 0.3), lum: 0.14 },
    ];
    for (const r of ridges) {
      for (let x = 0; x < bw; x++) {
        const u = (x + 0.5) / bw;
        const top = Math.round(bh * (1 - r.at(u)));
        for (let y = Math.max(0, top); y < bh; y++) {
          const hatch = 0.5 + 0.5 * Math.sin(x * 0.9 - y * 1.7 + Math.sin(x * 0.05) * 4);
          put(x, y, r.lum + 0.07 * hatch + 0.04 * (hash2(x, y) - 0.5) - (y === top ? 0.06 : 0));
        }
      }
    }

    // Houses: a back row and a front row, with the church in the back row.
    const n = clamp(this.num("houses", 18) | 0, 4, 60);
    const houses = [];
    const backN = Math.ceil(n * 0.55);
    for (let i = 0; i < n; i++) {
      const back = i < backN;
      const k = back ? i / backN : (i - backN) / (n - backN);
      houses.push({
        u: 0.2 + k * 0.5 + (R() - 0.5) * 0.025,
        base: back ? 0.3 + (R() - 0.5) * 0.04 : 0.16 + (R() - 0.5) * 0.04,
        w: 0.02 + R() * 0.02,
        h: 0.08 + R() * 0.06,
        roof: 0.045 + R() * 0.035,
        chimney: R() < 0.4,
        church: false,
      });
    }
    const church = { u: 0.41, base: 0.3, w: 0.03, h: 0.17, roof: 0.06, chimney: false, church: true };
    houses.push(church);
    this.church = church;
    // Painter's order: farther (higher base) first, then left to right.
    houses.sort((a, b) => b.base - a.base || a.u - b.u);

    this.windows = [];
    this.chimneys = [];
    const sx = (u) => Math.round(u * bw);
    const sy = (v) => Math.round(bh * (1 - v));
    for (const hs of houses) {
      const x0 = sx(hs.u - hs.w / 2),
        x1 = sx(hs.u + hs.w / 2);
      const yb = sy(hs.base),
        yt = sy(hs.base + hs.h);
      // Walls, with an ink edge.
      for (let y = yt; y <= yb; y++)
        for (let x = x0; x <= x1; x++) put(x, y, x === x0 || x === x1 || y === yb ? 0.04 : 0.29 + 0.05 * (hash2(x, y) - 0.5));
      // Gable roof: the right slope catches the moon.
      const rh = Math.max(2, Math.round(bh * hs.roof));
      const mid = (x0 + x1) / 2;
      for (let r = 0; r <= rh; r++) {
        const half = ((x1 - x0) / 2 + 1) * (1 - r / rh);
        const y = yt - r;
        for (let x = Math.floor(mid - half); x <= Math.ceil(mid + half); x++) {
          const edge = Math.abs(x - mid) > half - 1;
          put(x, y, edge ? 0.05 : x > mid ? 0.46 + 0.05 * hash2(x, y) : 0.24);
        }
      }
      if (hs.church) {
        // Tower and spire.
        const tx0 = sx(hs.u - 0.006),
          tx1 = sx(hs.u + 0.006);
        const tt = sy(hs.base + hs.h + 0.12);
        for (let y = tt; y < yt - rh / 2; y++) for (let x = tx0; x <= tx1; x++) put(x, y, x === tx0 || x === tx1 ? 0.05 : 0.33);
        const sh = Math.round(bh * 0.24);
        const smid = (tx0 + tx1) / 2;
        for (let r = 0; r <= sh; r++) {
          const half = ((tx1 - tx0) / 2 + 1) * (1 - r / sh);
          for (let x = Math.floor(smid - half); x <= Math.ceil(smid + half); x++) put(x, tt - r, x >= smid ? 0.5 : 0.27);
        }
      }
      if (hs.chimney) {
        const cx = sx(hs.u + hs.w * 0.25);
        const ct = yt - Math.round(rh * 0.7);
        for (let y = ct - 2; y < yt; y++) put(cx, y, 0.06), put(cx + 1, y, 0.1);
        this.chimneys.push({ x: cx + 0.5, y: ct - 2 });
      }
      // Windows: 1–3 lamps on the wall.
      const count = hs.church ? 2 : 1 + ((R() * 3) | 0);
      const ww = Math.max(1, Math.round(bw * 0.004));
      const wh = Math.max(1, Math.round(bh * 0.025));
      const wy = Math.round((yt + yb) / 2 - wh / 2);
      for (let c = 0; c < count; c++) {
        const wx = Math.round(x0 + ((c + 1) * (x1 - x0)) / (count + 1) - ww / 2);
        const px = [];
        for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) if (x > x0 && x < x1 && y > yt && y < yb) px.push(y * bw + x);
        if (!px.length) continue;
        this.windows.push({
          px,
          u: (wx + ww / 2) / bw,
          v: 1 - wy / bh,
          lit: { x: 0, v: 0 },
          target: 0,
          at: 0,
          phase: R() * 6.283,
          mood: 0.7 + 0.3 * R(),
        });
      }
    }
    this.base = base;
  }

  // Switch all lights, rippling out from (u, v) in element fractions.
  toggle(on, u = 0.5, v = 0.5, delay = 0) {
    this.on = on;
    const order = this.windows
      .map((w, i) => ({ i, d: Math.hypot((w.u - u) * 3, w.v - (1 - v)) }))
      .sort((a, b) => a.d - b.d);
    order.forEach(({ i }, rank) => {
      const w = this.windows[i];
      w.target = on ? 1 : 0;
      w.at = this.clock + delay + rank * STAGGER;
    });
    this.kick();
  }

  onPress(x, y) {
    this.toggle(!this.on, x, y);
  }
  onKey(key) {
    if (key === " " || key === "Enter") {
      this.toggle(!this.on, 0.5, 0.7);
      return true;
    }
    return false;
  }

  update(dt, calm, touring) {
    const R = this.raster;
    if (!R || !this.base) return false;
    const t = this.clock * this.num("speed", 1);
    const { w, h, L, A } = R;
    const transparent = this.hasAttribute("transparent");
    const base = this.base;

    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      if (b < 0) {
        const x = i % w,
          y = (i / w) | 0;
        L[i] = 0.32 + 0.04 * Math.sin(x * 0.12 + Math.sin(y * 0.2 + t * 0.3) * 2 + y * 0.35) + 0.06 * (hash2(x, y) - 0.5);
        A[i] = transparent ? 0 : 1;
      } else {
        L[i] = b;
        A[i] = 1;
      }
    }

    // The tour: now and then one window changes its mind.
    if (touring && this.on && this.windows.length) {
      const beat = Math.floor(t / 1.6);
      if (beat !== this._beat) {
        this._beat = beat;
        const win = this.windows[(hash2(beat, 3) * this.windows.length) | 0];
        win.target = win.target ? 0 : 1;
        win.at = this.clock;
      }
    }

    let busy = false,
      lit = 0;
    for (const win of this.windows) {
      const want = this.clock >= win.at ? win.target : win.lit.x > 0.5 ? 1 : 0;
      if (this.clock < win.at) busy = true;
      if (settle(win.lit, want, dt, 0.09, calm)) busy = true;
      const flicker = calm ? 1 : 0.9 + 0.1 * Math.sin(t * 7 * win.mood + win.phase) * Math.sin(t * 2.3 + win.phase);
      const v = win.lit.x * flicker;
      if (win.lit.x > 0.5) lit++;
      for (const i of win.px) L[i] = Math.max(L[i], 0.08 + 0.92 * v);
      // A soft spill of light on the wall around the window.
      if (v > 0.05) {
        const i0 = win.px[0];
        for (const d of [-1, 1, -w, w, -w - 1, -w + 1, w - 1, w + 1, -2, 2])
          if (base[i0 + d] >= 0 && L[i0 + d] < 0.6) L[i0 + d] = Math.max(L[i0 + d], base[i0 + d] + 0.22 * v);
      }
    }

    // Chimney smoke, leaning right with the wind.
    if (!calm) {
      for (const c of this.chimneys) if (Math.random() < dt * 5) this.smoke.push({ x: c.x, y: c.y, age: 0, life: 2 + Math.random() * 2 });
      for (let k = this.smoke.length - 1; k >= 0; k--) {
        const s = this.smoke[k];
        s.age += dt;
        s.y -= dt * 3.2;
        s.x += dt * (1.5 + 2.5 * smooth(0, 1.5, s.age)) + Math.sin(s.age * 3 + k) * dt * 0.8;
        if (s.age > s.life) {
          this.smoke.splice(k, 1);
          continue;
        }
        const fade = Math.min(1, s.age / 0.3, (s.life - s.age) / 0.8);
        const i = Math.round(s.y) * w + Math.round(s.x);
        if (i >= 0 && i < L.length && s.x < w && base[i] < 0) {
          L[i] = Math.max(L[i], 0.3 + 0.22 * fade);
          A[i] = Math.max(A[i], 0.9 * fade);
        }
      }
    }

    R.present({ transparent, dither: 0.75 });
    this.setAttribute("aria-pressed", String(this.on));
    this.say(`${lit} of ${this.windows.length} windows lit`);
    return !calm || busy;
  }
}

export { StarryVillage };
define("starry-village", StarryVillage);
