// <starry-cypress>: the cypress, a dark flame that sways in the wind.
//
// The tree is a bundle of flame tongues, each with its own height, lean
// and width, rasterised per pixel with hatching that runs along the
// tongue. The whole tree bends on an underdamped spring (it overshoots
// once, like a real trunk); the tongues flutter on top of that.
//
// Wind: slow gusts from the model, a push away from the pointer, and a
// drag that pulls the crown toward the pointer while pressed.
// Keys: arrows push the crown, Space sends a gust.
//
// Attributes: tongues (9), pixel (3), speed (1), seed, still, paused,
// transparent (draw only the tree, to layer it over <starry-sky>).

import { StarryElement, define, rng, spring, burst, smooth, clamp, hash2 } from "./core.mjs";
import { Raster } from "./raster.mjs";

class StarryCypress extends StarryElement {
  static label = "The cypress from The Starry Night, a dark flame of a tree swaying in the wind. Hover to push it, press and drag to bend it.";
  static css = `:host { --starry-aspect: 0.5; }`;
  static role = "slider";
  static get observedAttributes() {
    return [...super.observedAttributes, "tongues"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.sway = { x: 0, v: 0 };
    this.nudge = 0;
    this.gustAt = -99;
    this.setAttribute("aria-valuemin", "-30");
    this.setAttribute("aria-valuemax", "30");
    this.reseed();
  }

  reseed() {
    const R = rng(this.seed);
    const n = clamp(this.num("tongues", 11) | 0, 3, 24);
    this.tongues = [];
    for (let i = 0; i < n; i++) {
      const c = i / (n - 1) - 0.5; // -0.5..0.5 across the trunk
      const tall = 1 - Math.abs(c) * 1.1;
      this.tongues.push({
        bx: 0.5 + c * 0.42 + (R() - 0.5) * 0.06,
        H: clamp(0.4 + 0.55 * tall + (R() - 0.5) * 0.12, 0.3, 0.97),
        lean: c * 0.22 + (R() - 0.5) * 0.1,
        W: 0.07 + 0.07 * R() + 0.06 * tall,
        phase: R() * 6.283,
        flick: 0.6 + 0.8 * R(),
      });
    }
    // The body: one broad, tall flame that every tongue grows out of, so the
    // tree reads as a solid mass with tongues licking off it.
    this.tongues.push({ bx: 0.5, H: 0.97, lean: 0.03, W: 0.2, phase: R() * 6.283, flick: 0.5, body: true });
    // Paint short tongues first: the first hit wins, so they sit in front.
    this.tongues.sort((a, b) => a.H - b.H);
  }

  onAttribute(name) {
    if (name === "tongues") this.reseed();
  }

  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
  }

  onKey(key, shift) {
    const s = shift ? 0.12 : 0.05;
    if (key === "ArrowLeft") this.nudge = clamp(this.nudge - s, -0.3, 0.3);
    else if (key === "ArrowRight") this.nudge = clamp(this.nudge + s, -0.3, 0.3);
    else if (key === "Home" || key === "Escape") this.nudge = 0;
    else if (key === " " || key === "Enter") this.gustAt = this.clock;
    else return false;
    return true;
  }
  onPress() {
    this.nudge = 0;
  }

  update(dt, calm, touring) {
    const R = this.raster;
    if (!R) return false;
    const t = this.clock * this.num("speed", 1);
    const p = this.pointer;

    // Wind on the crown, in tree widths.
    let target = 0.035 * Math.sin(t * 0.7) + 0.018 * Math.sin(t * 1.9 + 1.3) + this.nudge;
    if (p.down) target = (p.x - 0.5) * 0.7;
    else if (p.insideT > 0.01) {
      const side = p.x < 0.5 ? 1 : -1;
      target += side * 0.12 * p.insideT * smooth(0.5, 0.05, Math.abs(p.x - 0.5));
    }
    if (touring) target += 0.06 * Math.sin(t * 0.45);
    const gust = calm ? 0 : burst(this.clock - this.gustAt, 0.15, 0.6);
    target += gust * 0.16;
    const moving = spring(this.sway, target, dt, 16, 2.6, calm);
    const sway = this.sway.x;

    const { w, h, L, A } = R;
    const transparent = this.hasAttribute("transparent");
    const aspect = w / h;
    const flutterAmp = calm ? 0 : 0.012;

    for (let y = 0; y < h; y++) {
      const vb = 1 - (y + 0.5) / h; // 0 at the ground, 1 at the top
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w;
        let lum = -1,
          cover = 0;
        for (let k = 0; k < this.tongues.length; k++) {
          const T = this.tongues[k];
          const hn = vb / T.H;
          if (hn > 1) continue;
          const bend = sway * hn * hn * T.H * 1.4;
          const flutter = flutterAmp * T.flick * Math.sin(t * 2.3 * T.flick + T.phase + hn * 5) * hn;
          const spine = T.bx + T.lean * Math.pow(hn, 1.6) + bend + flutter;
          // A flame: swells over the first third, then tapers to a point.
          const swell = 0.55 + 0.45 * smooth(0, 0.3, hn);
          const half = T.W * swell * Math.pow(1 - hn, T.body ? 0.55 : 0.75) * (0.8 + 0.2 * Math.sin(hn * 9 + T.phase));
          const across = (u - spine) / half;
          if (across < -1 || across > 1) continue;
          // Hatching runs up the tongue and leans with it.
          const hatch = 0.5 + 0.5 * Math.sin(across * 3.2 + hn * 34 * T.H + T.phase);
          const lit = smooth(0.1, 1, -across); // moonlight catches the left edges
          let v = 0.02 + 0.09 * hatch + 0.1 * lit * hatch;
          if (hash2(x * 7 + k, y * 3) > 0.985) v = 0.42; // cobalt flecks
          // The front tongue sets the tone; coverage is the most any tongue gives,
          // so a soft edge in front never lets the sky through a tongue behind.
          if (lum < 0) lum = v;
          cover = Math.max(cover, smooth(1, 0.85, Math.abs(across)));
          if (cover >= 1) break;
        }
        const i = y * w + x;
        if (lum < 0) {
          // Open sky behind (or clear when layered).
          L[i] = 0.32 + 0.045 * Math.sin(u * aspect * 22 + Math.sin(vb * 6 + t * 0.4) * 2 + vb * 9) + 0.06 * (hash2(x, y) - 0.5);
          A[i] = transparent ? 0 : 1;
        } else {
          L[i] = lum;
          A[i] = transparent ? cover : 1;
        }
      }
    }
    R.present({ transparent, dither: 0.8 });

    const deg = (Math.atan(sway * 1.4) * 180) / Math.PI;
    this.setAttribute("aria-valuenow", deg.toFixed(1));
    this.say(`lean ${deg >= 0 ? "+" : ""}${deg.toFixed(1)}° · gust ${Math.abs(target).toFixed(2)}`);
    return !calm || moving;
  }
}

export { StarryCypress };
define("starry-cypress", StarryCypress);
