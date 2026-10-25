// Starry Night kit: the raster.
// A brightness buffer at the component's pixel grid. Components deposit
// light, the buffer fades it, and present() quantises every pixel to the
// 8-tone ramp with ordered dither, so 2D components look exactly like the
// shader ones.

import { RAMP_RGB, BAYER4 } from "./core.mjs";

export class Raster {
  constructor(ctx, w, h) {
    this.ctx = ctx;
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.L = new Float32Array(w * h); // brightness 0..1
    this.A = new Float32Array(w * h).fill(1); // coverage 0..1 (for transparent hosts)
    this.img = this.ctx.createImageData(w, h);
  }

  fill(v, a = 1) {
    this.L.fill(v);
    this.A.fill(a);
  }

  // Ease every pixel toward `base` with time constant tau (s): trails.
  decay(base, dt, tau) {
    const k = 1 - Math.exp(-dt / tau);
    const L = this.L;
    for (let i = 0; i < L.length; i++) L[i] += (base - L[i]) * k;
  }
  decayAlpha(base, dt, tau) {
    const k = 1 - Math.exp(-dt / tau);
    const A = this.A;
    for (let i = 0; i < A.length; i++) A[i] += (base - A[i]) * k;
  }

  // Deposit light: keeps the brighter value (paint, don't add).
  plot(x, y, v, a = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (v > this.L[i]) this.L[i] = v;
    if (a > this.A[i]) this.A[i] = a;
  }

  // A stroke from (x0,y0) to (x1,y1), one pixel wide (or `width`).
  line(x0, y0, x1, y1, v, width = 1, a = 1) {
    const dx = x1 - x0,
      dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let s = 0; s <= n; s++) {
      const x = x0 + (dx * s) / n,
        y = y0 + (dy * s) / n;
      this.plot(x, y, v, a);
      if (width > 1) {
        this.plot(x + 1, y, v, a);
        this.plot(x, y + 1, v, a);
        if (width > 2) {
          this.plot(x - 1, y, v, a);
          this.plot(x, y - 1, v, a);
        }
      }
    }
  }

  // Quantise to the ramp and draw. `transparent`: coverage below 0.5 (dithered) is clear.
  present({ transparent = false, dither = 0.9, ramp = RAMP_RGB } = {}) {
    const { L, A, w, h } = this;
    const d = this.img.data;
    const n = ramp.length - 1;
    for (let y = 0; y < h; y++) {
      const row = (y & 3) * 4;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const b = BAYER4[row + (x & 3)];
        const j = i * 4;
        if (transparent && A[i] + (b - 0.5) * 0.8 < 0.5) {
          d[j + 3] = 0;
          continue;
        }
        let v = L[i] * n + (b - 0.5) * dither;
        v = v <= 0 ? 0 : v >= n ? n : Math.round(v);
        const c = ramp[v];
        d[j] = c[0];
        d[j + 1] = c[1];
        d[j + 2] = c[2];
        d[j + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
