# Building a new component

Extend `StarryElement`. The base class gives you the loop, resizing, the pixel grid, pointer and keyboard handling, the tour, reduced motion, offscreen pause and the readout. You write `setup`, `resize`, `update` and the optional input hooks.

## 2D raster skeleton

A field of fireflies drifting on the wind, as an example:

```js
// kit/starry-fireflies.mjs
import { StarryElement, define, rng, settle, burst, clamp } from "./core.mjs";
import { fieldAt, viewOf } from "./model.mjs";
import { Raster } from "./raster.mjs";

class StarryFireflies extends StarryElement {
  static label = "Fireflies drifting on the Starry Night wind.";
  static css = `:host { --starry-aspect: 2; }`;
  static defaultPixel = 3;
  static get observedAttributes() {
    return [...super.observedAttributes, "count"];
  }

  setup() {
    this.g = this.canvas.getContext("2d");
    this.glow = { x: 0, v: 0 };
    this.f = [0, 0]; // reused every frame: no allocation in update()
    this.reseed();
  }
  reseed() {
    const R = rng(this.seed);
    this.flies = Array.from({ length: clamp(this.num("count", 60) | 0, 1, 2000) }, () => ({
      x: R(), y: R(), phase: R() * 6.283,
    }));
  }
  onAttribute(name) {
    if (name === "count") this.reseed();
  }
  resize(bw, bh) {
    this.raster = new Raster(this.g, bw, bh);
  }
  onPress() {
    this.flashAt = this.clock;
  }

  update(dt, calm, touring) {
    const R = this.raster;
    if (!R) return false;
    const t = this.clock * this.num("speed", 1);
    const view = viewOf(this.w / this.h, 0.5);
    const moving = settle(this.glow, this.pointer.insideT > 0.5 ? 1 : 0, dt, 0.4, calm);
    const flash = calm ? 0 : burst(this.clock - (this.flashAt ?? -99), 0.06, 0.5);

    R.decay(0.22, dt, calm ? 1e-3 : 0.35);          // trails fade toward the night
    for (const p of this.flies) {
      if (!calm) {
        fieldAt(view.x0 + p.x * view.w, view.y0 + p.y * view.h, t, this.f);
        p.x = (p.x + (this.f[0] / view.w) * dt + 1) % 1;   // ride the model's wind
        p.y = (p.y + (this.f[1] / view.h) * dt + 1) % 1;
      }
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + p.phase);
      R.plot(p.x * R.w, p.y * R.h, clamp(0.6 + 0.3 * tw + 0.2 * this.glow.x + flash, 0, 1));
    }
    R.present({ transparent: this.hasAttribute("transparent") });
    this.say(`${this.flies.length} fireflies`);
    return !calm || moving;
  }
}

export { StarryFireflies };
define("starry-fireflies", StarryFireflies);
```

Then export it from `kit/index.mjs` and add a wrapper in `kit/react/starry-night.tsx`:

```ts
export const StarryFireflies = make<Common & { count?: number }>("starry-fireflies", () => import("../starry-fireflies.mjs"));
```

## WebGL2 skeleton

```js
import { StarryElement, define, RAMP_RGB } from "./core.mjs";
import { GLSL_FIELD, viewOf, packVortices } from "./model.mjs";
import { createGL, GLSL_COMMON, rampUniform } from "./gl.mjs";

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec4 uView;
${GLSL_FIELD}
${GLSL_COMMON}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  vec2 p = uView.xy + uv * uView.zw;                 // painting space
  vec2 v = field(p);
  float lum = 0.3 + 0.3 * length(v);
  outColor = vec4(rampOf(lum, gl_FragCoord.xy, 0.9), 1.0);
}`;

class StarryWindmap extends StarryElement {
  setup() {
    this.ctx = createGL(this.canvas, FRAG);
    if (!this.ctx) return this.setAttribute("data-fallback", "none");
    const { a, b, n } = packVortices();
    this.ctx.v4("uV", a); this.ctx.v4("uW", b); this.ctx.i1("uN", n);
    this.ctx.v3("uRamp", rampUniform(RAMP_RGB));
    this.ctx.f1("uPtrReach", 0.2);
  }
  update(dt, calm) {
    if (!this.ctx) return false;
    const v = viewOf(this.w / this.h, 0.5);
    this.ctx.f2("uRes", this.bw, this.bh);
    this.ctx.f4("uView", v.x0, v.y0, v.w, v.h);
    this.ctx.f1("uT", this.clock);
    this.ctx.f4("uPtr", 0, 0, 0, 0.05);                // no pointer vortex
    this.ctx.draw(this.bw, this.bh);
    return !calm;
  }
}
define("starry-windmap", StarryWindmap);
```

`GLSL_FIELD` declares `uT`, `uV`, `uW`, `uN`, `uPtr` and `uPtrReach`. Set every one of them, or the field reads zeros.

## Checklist for a new component

- [ ] Motion comes from `fieldAt` / `field()` and nowhere else.
- [ ] Every colour goes through the ramp.
- [ ] Every random choice is seeded.
- [ ] No allocation in `update`. Static layers are rasterised once in `resize`.
- [ ] `update` returns false once settled under `calm`, and the calm frame is a good still.
- [ ] Events use `burst`, states use `settle` or `spring`, and nothing pops.
- [ ] It works with `transparent` (coverage in `Raster.A`, or premultiplied alpha in the shader).
- [ ] The label describes the object. The readout is short and true, keys are handled, and the role is right.
- [ ] It is exported from `index.mjs` and wrapped in `react/starry-night.tsx`.
- [ ] It is captured at desktop and 390 wide, with `--reduced-motion` and `--no-webgl`, and you read every PNG.
