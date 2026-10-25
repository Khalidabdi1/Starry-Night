# Components

Every component is a custom element registered by importing its module (or `kit/index.mjs` for all of them). Each one extends `StarryElement` (`kit/core.mjs`), so they share a lifecycle, attributes and API.

## Shared behaviour

| Attribute | Default | Effect |
|---|---|---|
| `pixel` | 3 (`swirl`, `text`: 2, `painting`: 1) | CSS pixels per art pixel. The backing canvas is `box / pixel`. |
| `speed` | 1 | Multiplies animated time. |
| `seed` | 7 | Seeds every random choice, so a render is reproducible. |
| `still` | — | Forces the reduced-motion path: one still frame that still answers input. |
| `paused` | — | Freezes time. Resizes still redraw. |
| `no-tour` | — | Turns off the idle tour. |
| `transparent` | — | Clear background, so the component can sit on a layer above another one. |

- **Size.** The host is `display: block` with `aspect-ratio: var(--starry-aspect)`. Each component sets its own (sky 2.5, swirl 2.5, painting 2.5, text 4, star 1, cypress 0.5, village 3). Override the ratio with `--starry-aspect`, or set an explicit `height`.
- **Background.** `--starry-bg` (default the palette's ink) sets it. `--starry-focus` sets the focus-ring colour.
- **Events.** `readout` (`event.detail` is the text) fires when the live readout changes, and `aria-valuetext` mirrors it. `starry-painting` also fires `load` and `error`.
- **Methods.** `play()` and `pause()`. `snapshot(scale = 1)` returns a PNG data URL of the current frame at CSS size, with crisp pixels.
- **Loop.** One rAF loop per element, with dt clamped to 1/30 s. It stops when the element is offscreen (IntersectionObserver, 120 px margin), when paused, or when settled under reduced motion.
- **Tour.** It starts after 1.4 s idle, and after 3.6 s once someone has interacted. It never runs while the element is hovered or focused.
- **Accessibility.** The element is focusable (`tabindex="0"` unless you set one) and has a role and an `aria-label` describing it. Pass your own `aria-label` to override. Use `tabindex="-1"` and `aria-hidden="true"` for decorative layers.

## `<starry-sky>`

The living sky (WebGL2).

| Attribute | Default | |
|---|---|---|
| `focus` | 0.5 | Which horizontal slice of the panorama a narrow box shows (0.47 the great swirl, 0.89 the moon). |
| `stroke` | 1 | Brush length: the step of the line-integral convolution. |
| `dither` | 0.9 | Ordered-dither strength. 0 gives flat bands; 2 is very grainy. |

- **Pointer.** A vortex follows the pointer (strength settles in 0.45 s) and gets stronger while pressed. A click starts a ripple of light (`burst`, 60 ms attack, 1.1 s decay).
- **Keys.** ← → pan `focus` (Shift for bigger steps), Home and End jump to the ends, Space and Enter send a ripple.
- **Tour.** A soft vortex wanders the sky, and a star sends out a ripple every 7 s.
- **Readout.** `wind 0.21 at 12° · 6 swirls · 10 stars`, where the wind is `fieldAt` under the pointer.
- **Fallback.** Without WebGL2 it paints one still frame (bands, stars, moon) on a 2D canvas and sets `data-fallback="2d"`.

## `<starry-painting>`

Makes a still image flow (WebGL2).

| Attribute | Default | |
|---|---|---|
| `src` | — | Image URL. Cross-origin images need CORS headers. |
| `alt` | — | Becomes the `aria-label`. |
| `flow` | 1 | How far paint travels along the wind (0–4). Reduced motion sets it to 0. |
| `horizon` | 0.64 | Painting-space y below which nothing flows (the land). |
| `hold` | 0.16 | Brightness below which paint is held still (the cypress, dark roofs). |

- **How it works.** It uses a two-phase flow map: two samples offset along the wind by `phase − 0.5`, half a cycle apart, mixed with a triangle weight, so it loops with no reset. Stars shimmer in rings over bright paint. Sampling is nearest-texel on the image's own grid.
- **Mapping.** The image is cropped to the box ("cover"), and the full image maps onto the full painting space. Images that are not 2.5:1 still get every swirl, just in their own composition.
- **Pointer, keys and tour** work as in the sky.
- **Fallback.** Without WebGL2 it shows the plain image and sets `data-fallback="img"`.

## `<starry-swirl>`

Brush strokes in the wind (2D raster).

| Attribute | Default | |
|---|---|---|
| `count` | 1800 | Number of strokes (50–20000). |
| `trail` | 0.9 | Seconds a stroke takes to fade into the night. |
| `focus` | 0.5 | As for the sky. |

- **Strokes.** Each stroke lives 1.5–5 s, fades in over 0.4 s and out over 0.6 s, and its brightness comes from where it was born (a swirl's glow, a star, the moon, the river of cloud).
- **Pointer.** A vortex follows the pointer, and new strokes are born under it as bright light.
- **Keys.** Space bursts 160 bright strokes from the centre.
- **Readout.** `1800 strokes · wind 0.18`.

## `<starry-text>`

Words written in wind (2D raster).

| Attribute | Default | |
|---|---|---|
| `text` | the element's text content, or "Starry Night" | |
| `font` | `700 1em "Iowan Old Style", Palatino, Georgia, serif` | Any CSS font shorthand. The size is replaced so the text fits 86% of the width and 70% of the height. |
| `density` | 1 | Fraction of glyph pixels that get a particle (0.1–4). |

- **Behaviour.** Hover or focus scatters the word, leaving gathers it. Space toggles a forced state, and Escape releases it. The tour scatters the word for about 2.5 s every 12.6 s.
- **Physics.** `scatter` settles from 0 to 1. Each particle is pulled home by a spring with k = 60·(1 − scatter) and carried by the wind, scaled by scatter.
- **Re-layout.** Changing `text` reuses the old particles' positions, so the new word pours in from the old one.
- **Readout.** `Starry Night · 92% assembled`.

## `<starry-star>`

A star, the moon, or a spinner (2D raster).

| `variant` | |
|---|---|
| `star` (default) | Gold core, straw halo, stippled rings breathing outward. |
| `moon` | Straw disc, ochre crescent, wide ringed halo. |
| `spinner` | Two arms winding into a bright centre. Its role is `status` and its label "Loading". |

Hover or focus swells it (`settle`, 0.3 s). A click, Space or Enter sends a flare ring out (`burst`, 60 ms attack, 0.7 s decay). Add `transparent` for icon use.

## `<starry-cypress>`

The dark flame (2D raster, `role="slider"`).

| Attribute | Default | |
|---|---|---|
| `tongues` | 11 | Flame tongues around one broad body (3–24). |

- **Bending.** The tree bends on `spring(k 16, c 2.6)`, so it overshoots once. Wind comes from gusts, a push away from a hovering pointer, a drag that pulls the crown toward the pointer, and the tour.
- **Keys.** ← → push the crown, Home and Escape release, Space sends a gust.
- **Readout.** `lean +4.2° · gust 0.09`. `aria-valuenow` gives the lean in degrees.

## `<starry-village>`

The village (2D raster, `role="button"`, `aria-pressed`).

| Attribute | Default | |
|---|---|---|
| `houses` | 18 | Houses in two rows, plus the church (4–60). |
| `lights` | on | `off` starts dark. Changing it runs the cascade. |

- **Lights.** A click toggles every lamp in a cascade 45 ms apart, ordered by distance from the click. Each lamp settles in 0.09 s and then flickers. Space and Enter toggle from the bottom centre.
- **On load.** Night falls: the first cascade starts 0.6 s in, from the church.
- **Tour.** One window changes its mind every 1.6 s.
- **Smoke.** It rises from the chimneys and leans right with the wind.
- **Readout.** `17 of 24 windows lit`.

## Composing a scene

Layer back to front inside a positioned container, with one `pixel` value for every layer:

```html
<div class="scene">
  <starry-sky class="layer" pixel="3"></starry-sky>
  <starry-village class="layer village" transparent pixel="3" tabindex="-1"></starry-village>
  <starry-cypress class="layer cypress" transparent pixel="3" tabindex="-1"></starry-cypress>
</div>
<style>
  .scene { position: relative; height: 100svh; }
  .layer { position: absolute; }
  .scene starry-sky { inset: 0; height: 100%; --starry-aspect: auto; }
  .village { left: 0; right: 0; bottom: 0; height: 34%; --starry-aspect: auto; pointer-events: none; }
  .cypress { left: 1%; bottom: 0; height: 88%; aspect-ratio: 0.42; --starry-aspect: 0.42; pointer-events: none; }
</style>
<script type="module">
  // The sky takes the pointer; forward the same events to the layers above it.
  const scene = document.querySelector(".scene");
  const layers = scene.querySelectorAll(".village, .cypress");
  for (const type of ["pointermove", "pointerdown", "pointerup", "pointerleave"]) {
    scene.addEventListener(type, (e) => {
      for (const el of layers) {
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (type === "pointerdown" && !inside) continue;
        el.dispatchEvent(new PointerEvent(type, { clientX: e.clientX, clientY: e.clientY }));
      }
    });
  }
</script>
```

A title over a scene goes on a solid plate (`rgba(5, 10, 31, 0.78)`, 1 px frost border) placed over the hills or the land, not over the great swirl.

## Showing a component on a page

Frame each live figure in a card, following Anatomy's card grammar: `Fig n` top left, the tag or a short title top right, the interaction hint bottom left, and the live readout bottom right, fed by the `readout` event:

```js
el.addEventListener("readout", (e) => (output.textContent = e.detail));
```
