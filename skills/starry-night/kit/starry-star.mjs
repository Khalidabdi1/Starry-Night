// <starry-star>: one of the painting's stars, its moon, or a curl as a spinner.
//
//   variant="star"     gold core, straw halo, stippled rings breathing outward
//   variant="moon"     straw disc with an ochre crescent and a wide ringed halo
//   variant="spinner"  the small tight curl from the painting, as a loading spinner
//
// Hover swells it (critically damped), click sends a flare ring out
// (attack/decay envelope), Space or Enter does the same from the keyboard.
//
// Attributes: variant, pixel (3), speed (1), still, paused, transparent.

import { StarryElement, define, settle, burst, smooth, clamp, hash2 } from "./core.mjs";
import { Raster } from "./raster.mjs";

class StarryStar extends StarryElement {
  static label = "A Starry Night star with a breathing, ringed halo.";
  static css = `:host { --starry-aspect: 1; }`;
  static get observedAttributes() {
    return [...super.observedAttributes, "variant"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.swell = { x: 0, v: 0 };
    this.flareAt = -99;
    this.onAttribute("variant");
  }

  onAttribute(name) {
    if (name !== "variant") return;
    const v = this.variant;
    if (!this.hasAttribute("aria-label") || this._autoLabel) {
      this._autoLabel = true;
      this.setAttribute(
        "aria-label",
        v === "moon" ? "A crescent moon in a ringed halo, from The Starry Night." : v === "spinner" ? "Loading" : StarryStar.label,
      );
    }
    if (v === "spinner") this.setAttribute("role", "status");
  }

  get variant() {
    const v = this.getAttribute("variant");
    return v === "moon" || v === "spinner" ? v : "star";
  }

  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
  }

  onPress() {
    this.flareAt = this.clock;
  }
  onKey(key) {
    if (key === " " || key === "Enter") {
      this.flareAt = this.clock;
      return true;
    }
    return false;
  }

  update(dt, calm) {
    const R = this.raster;
    if (!R) return false;
    const t = this.clock * this.num("speed", 1);
    const moving = settle(this.swell, this.pointer.insideT > 0.5 || this.matches(":focus-visible") ? 1 : 0, dt, 0.3, calm);
    const sw = this.swell.x;
    const flareAge = this.clock - this.flareAt;
    const flare = calm ? 0 : burst(flareAge, 0.06, 0.7);
    const transparent = this.hasAttribute("transparent");
    const variant = this.variant;

    const { w, h, L, A } = R;
    const cx = w / 2,
      cy = h / 2;
    const unit = Math.min(w, h) / 2; // px per half-size
    const size = variant === "moon" ? 0.3 : variant === "spinner" ? 0.9 : 0.3;
    const rad = unit * size * (1 + 0.12 * sw + 0.04 * Math.sin(t * 1.7));
    const front = flareAge * 1.6; // flare ring radius, in halo radii

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy;
        const r = Math.hypot(dx, dy);
        const k = r / rad;
        const a = Math.atan2(dy, dx);
        const grain = hash2(x, y) - 0.5;
        // Background: short diagonal strokes drifting in the night blue.
        // Background: soft curved strokes drifting in the night blue.
        const bx = x / w - 0.5,
          by = y / h - 0.5;
        let lum = 0.2 + 0.035 * Math.sin((bx * 9 + Math.sin(by * 5 + t * 0.3) * 1.4) * 4 + by * 10) + 0.06 * grain;
        let cover = 0;

        if (variant === "spinner") {
          // Two arms winding into a bright centre, turning steadily.
          const arm = 0.5 + 0.5 * Math.sin(2 * a + k * 13 - t * 5.5);
          const body = smooth(1.0, 0.25, k);
          lum = lum * (1 - body) + body * (0.3 + 0.55 * arm * (1.15 - k) + 0.25 * smooth(0.25, 0, k));
          cover = smooth(1.05, 0.7, k);
        } else {
          const rings = 0.5 + 0.5 * Math.sin(k * (variant === "moon" ? 10 : 14) - t * (1.6 + sw) + grain * 0.6);
          const reach = variant === "moon" ? 2.4 : 2.1;
          const halo = smooth(reach, 0.5, k);
          lum = lum * (1 - halo) + halo * Math.max(lum, 0.5 + 0.26 * rings * (1.3 - k / reach) + 0.12 * sw);
          cover = smooth(reach, reach * 0.7, k);
          if (variant === "moon") {
            const disc = smooth(1.0, 0.94, k);
            lum = lum * (1 - disc) + disc * (0.86 + 0.06 * grain);
          } else {
            // Straw inner halo, then the gold core.
            const inner = smooth(1.0, 0.6, k);
            lum = lum * (1 - inner) + inner * Math.max(lum, 0.8);
            const core = smooth(0.62, 0.42, k);
            lum = lum * (1 - core) + core * 1.0;
          }
        }

        // Flare: a bright ring travelling out from the centre.
        if (flare > 0) {
          const ring = Math.exp(-(((k - front) / 0.18) ** 2));
          lum += ring * flare * 0.45;
          cover = Math.max(cover, ring * flare);
        }
        const i = y * w + x;
        L[i] = clamp(lum, 0, 1);
        A[i] = transparent ? cover : 1;
      }
    }
    R.present({ transparent, dither: 0.85 });

    // The moon's crescent is drawn over the quantised disc, in ochre.
    if (variant === "moon") {
      const g = this.g;
      const img = R.img;
      const cr = rad * 0.66,
        ox = rad * 0.3,
        oy = -rad * 0.24,
        cut = rad * 0.6;
      for (let y = Math.floor(cy - cr); y <= cy + cr; y++) {
        for (let x = Math.floor(cx - cr); x <= cx + cr; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const inner = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < cr;
          const out = Math.hypot(x + 0.5 - cx - ox, y + 0.5 - cy - oy) > cut;
          if (inner && out) {
            const j = (y * w + x) * 4;
            img.data[j] = 200;
            img.data[j + 1] = 145;
            img.data[j + 2] = 42;
            img.data[j + 3] = 255;
          }
        }
      }
      g.putImageData(img, 0, 0);
    }

    this.say(variant === "spinner" ? "loading" : `halo ${(1 + 0.12 * sw).toFixed(2)}×${flare > 0.05 ? " · flare" : ""}`);
    return !calm || moving || flare > 0.001;
  }
}

export { StarryStar };
define("starry-star", StarryStar);
