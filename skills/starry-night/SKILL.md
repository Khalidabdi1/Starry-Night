---
name: starry-night
description: Build pixel-art animations, animated backgrounds, hero sections, loaders and interactive effects in the style of Van Gogh's The Starry Night, using a zero-dependency kit of seven web components (living sky shader, brush strokes in the wind, breathing stars and moon, a swaying cypress, a village whose windows light up, words written in wind, and a component that makes any still image flow) driven by one shared model of the painting's swirling wind. Use this whenever someone wants a Starry Night, Van Gogh, swirling-sky, impressionist, painterly or night-sky animation, a dithered or pixel-art animated background, a flow-field or swirl effect, an animated hero for a landing page, a themed loading spinner, or wants to bring a painting or illustration to life, even if they never say "Starry Night". Works in plain HTML, any framework that renders custom elements, and React/Next.js through typed wrappers.
license: MIT
compatibility: Runs in any modern browser (custom elements; WebGL2 for the two shader components, with 2D fallbacks). The verification script needs Node.js 22+ and Chrome or Chromium.
metadata:
  author: Khalidabdi1
  version: "1.0.0"
---

# Starry Night

This skill makes animations that feel like the painting is still moving: brush strokes that follow the wind, stars that breathe in ringed halos, a cypress that bends like a real trunk, a village whose lamps come on one by one. Everything is pixel art by construction, drawn on a coarse grid and snapped to one 8-tone palette sampled from the painting.

The kit ships in `kit/`. Open `kit/index.mjs` to see every export, and the demo page at the repository root (`index.html`) to see every component live.

## The one idea that matters

**The painting is the model.** `kit/model.mjs` is a small, pure description of the sky measured off the panorama in `assets/starry-night.webp`. It holds six vortices placed on the great swirl, its lower lobe, the right swirl, the tight curl, the moon's halo and the left edge, plus ten stars, the moon, and the river of cloud. Every component reads it. The shader smears noise along `field()`, particles ride `fieldAt()`, and text scatters into the same wind. That is why the pieces compose: layer a sky, a village and a cypress and they agree on where the wind goes.

So when you build something new, **ride the model; don't invent a second wind.** If a new effect needs motion, take it from `fieldAt(x, y, t)`. If it needs a new swirl, add a vortex to the model (or pass it as `extra`) so the shader and the particles both feel it. `references/model.md` has the maths.

## Workflow

1. **Pick the job.** Decide whether the request is (a) using a component as-is, (b) composing several into a scene, or (c) a new component. Most requests are (a) or (b). Say which, then build.
2. **Choose components** from the table below. Prefer the smallest one that does the job: a loader is `<starry-star variant="spinner">`, not a sky.
3. **Compose in layers, back to front.** A scene is `starry-sky` at the back, then `transparent` layers on top (`starry-village`, `starry-cypress`, `starry-swirl`, `starry-text`). Give the top layers `pointer-events: none` and forward pointer events from the container (see `references/components.md`, "Composing a scene"). Keep the same `pixel` value on every layer so the pixel grids match.
4. **Fit the frame.** Every component maps its box into painting space with a "cover" fit. On narrow boxes, use `focus` (0..1) to choose the slice: 0.47 is the great swirl, 0.89 the moon. Check at 390 px wide.
5. **Make it live, politely.** The base class already handles the loop, the idle tour, offscreen pause, reduced motion, focus and the readout. Don't bypass it. When wiring a page, show the live readout (`readout` event or `aria-valuetext`) somewhere near the figure.
6. **New component?** Extend `StarryElement` and follow `references/new-component.md`. Draw into a `Raster` (or a `createGL` shader), take motion from the model, and use `follow`, `settle`, `spring` and `burst` from `core.mjs` instead of hand-rolled easing.
7. **Verify like a critic.** Run `node scripts/capture.mjs <url>` at desktop and at 390 wide, with `--reduced-motion` and with `--no-webgl`. Use `--scroll "#id"` for anything below the fold, because components only render while onscreen. Read every PNG, and check the console output: the script exits 1 on any page error. The checklist is in `references/verify.md`.

## Components

| Tag | What it is | Draws with | Key attributes |
|---|---|---|---|
| `<starry-sky>` | The living sky: brush strokes along the wind, spiral bands, ringed stars, crescent moon. Pointer stirs a vortex, click ripples light. | WebGL2 (2D still fallback) | `pixel` 3, `focus`, `speed`, `stroke`, `dither` |
| `<starry-painting src>` | Makes a still image flow: two-phase flow map along the wind, stars shimmer, dark land held still. | WebGL2 (`<img>` fallback) | `src`, `alt`, `flow`, `horizon`, `hold`, `pixel` 1 |
| `<starry-swirl>` | Thousands of brush-stroke particles riding the wind, with fading trails. | 2D raster | `count` 1800, `trail`, `focus`, `pixel` 2 |
| `<starry-text text>` | A word built from particles that scatter into the wind on hover and pour back. | 2D raster | `text`, `font`, `density`, `pixel` 2 |
| `<starry-star>` | A star, the moon, or a spinner (the painting's tight curl). Swells on hover, flares on click. | 2D raster | `variant` star / moon / spinner |
| `<starry-cypress>` | A flame-shaped cypress on an underdamped spring; pushed by gusts and the pointer. | 2D raster | `tongues`, `transparent` |
| `<starry-village>` | Hills, houses and a spire; windows light in a staggered cascade from the click. | 2D raster | `houses`, `lights`, `transparent` |

Shared attributes on every tag: `pixel`, `speed`, `seed`, `still` (forces the reduced-motion still frame), `paused`, `no-tour`, `transparent`. Shared API: `play()`, `pause()`, `snapshot()`, and the `readout` event. Full reference: `references/components.md`.

```html
<script type="module" src="kit/index.mjs"></script>
<starry-sky style="height: 70vh"></starry-sky>
```

React/Next.js: copy `kit/` into the project and import from `kit/react/starry-night.tsx`. The wrappers render the bare tag on the server and load the element on the client.

## Craft rules (short form)

`references/craft.md` gives the reasoning.

- **One palette.** Every pixel is one of the 8 ramp tones in `core.mjs` (`ink`, `night`, `ultramarine`, `cobalt`, `azure`, `frost`, `straw`, `gold`). The only extras are the moon's ochre and the window lamps. Never add a gradient or a colour outside the ramp; express light as brightness and let the ramp quantise it.
- **Pixel art by construction.** Draw at `box / pixel` resolution and let CSS scale it up with `image-rendering: pixelated`. Use ordered (Bayer 4×4) dither, never random noise that flickers frame to frame. Seed every random choice (`rng(seed)`, `hash2`).
- **Brightness hierarchy.** Sky body around 0.3. Strokes and bands rise to 0.5–0.6, halos to 0.6–0.8, and cores to gold. The cypress and the village outlines stay in the bottom two tones. Exactly one thing is the brightest gold in any small region: a star's core, the moon, a lamp.
- **Motion follows the wind.** Anything that drifts drifts along `fieldAt`. Nothing moves in straight lines across the sky. Smoke leans right because the wind blows right.
- **Nothing pops.** Particles fade in and out over their life. Events (flares, ripples, gusts) ride `burst()` envelopes with an attack, and states (scatter, swell, lights) settle critically damped. A flow map crossfades two phases instead of resetting.
- **Painter's order.** Rasterise back to front, far to near: farther hills first, back-row houses before the front row, short cypress tongues in front of tall ones.
- **Restraint.** One shader per screen region, the backing canvas a few times smaller than the box, stop when offscreen. Reduced motion gets one still frame that still answers input.

## Motion rules (short form)

From `references/motion.md`:

- **Time-based.** dt comes from rAF timestamps, clamped to 1/30 s.
- **Ease toward targets.** Pointers set targets, and values follow with exponential easing (τ about 0.18 s for the pointer).
- **Choose the right mover.** `spring` for springy things (the cypress: k 16, c 2.6, so it overshoots once). `settle` where a value must arrive cleanly (0.3–0.7 s). `burst(age, rise, fall)` for one-off events.
- **Idle tour.** It starts after 1.4 s, pauses on hover or focus, resumes 3.6 s after the last interaction, and drives the same targets a user would.
- **Readout.** Make it true and short, read from the model: `wind 0.21 at 12° · 6 swirls · 10 stars`, `17 of 24 windows lit`, `lean +4.2°`.
- **Keyboard.** Arrows step, Shift steps further, Space or Enter triggers the event, Home and Escape reset. The element is focusable and shows a focus ring.

## Scripts

| Script | Use |
|---|---|
| `scripts/capture.mjs` | Headless Chrome screenshots with console and page-error capture (exits 1 on errors). Options: `--size`, `--wait`, `--scroll`, `--move x,y`, `--press`, `--key`, `--focus`, `--frames N --gap ms` for motion strips, `--reduced-motion`, `--no-webgl`, `--full`, `--eval`. Zero dependencies (Node 22+). |

## References

- `references/components.md`: every component's attributes, keys, events and readout, plus composing a scene.
- `references/model.md`: painting space, the vortex field (JS and GLSL), `viewOf`, adding vortices and stars.
- `references/craft.md`: the pixel-art look in depth: palette, dither, brightness hierarchy, the anti-patterns.
- `references/motion.md`: loop, follow, settle, spring, envelopes, tours, accessibility.
- `references/new-component.md`: a complete skeleton for a new component (2D raster and WebGL2).
- `references/verify.md`: capture commands and the review checklist.

## Credits

The motion and verification discipline (one pure model driving every number, framed cards with a live readout, envelopes that never pop, idle tours, checking every PNG) is adapted from [Anatomy](https://github.com/wheresryan22/anatomy) by wheresryan22. The painting is Vincent van Gogh's *The Starry Night* (1889, Museum of Modern Art, New York).
