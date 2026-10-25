# Craft: the pixel-art Starry Night look

The reference is the panorama in `assets/starry-night.webp`: stippled pixel art in deep blues and straw yellows. Every stroke follows the wind. Stars sit in concentric halos, and the cypress is an almost-black flame flecked with cobalt.

## Palette

The ramp in `core.mjs`, darkest to brightest:

| Index | Name | Hex | Used for |
|---|---|---|---|
| 0 | ink | `#050a1f` | cypress, outlines, deepest night |
| 1 | night | `#0b1b52` | shadowed sky, cypress hatching |
| 2 | ultramarine | `#153a9c` | body of the sky, walls |
| 3 | cobalt | `#2763cf` | lit strokes, roofs |
| 4 | azure | `#4d93e6` | bright strokes |
| 5 | frost | `#a8d0ee` | pale ribbons, outer halos |
| 6 | straw | `#eedc7f` | star halos, the moon disc |
| 7 | gold | `#f7c844` | star cores, lamps |

Two extras sit outside the ramp: ochre `#c8912a` for the moon's crescent and `#ffd45a` for lamps. Nothing else is allowed. Express light as brightness (0..1) and let `rampIndex` or the shader's `rampOf` quantise it.

## Pixel grid

- Draw at `box / pixel` resolution. The canvas CSS uses `image-rendering: pixelated`. Never draw at device resolution and fake the pixels.
- Layers in one scene share a `pixel` value so their grids line up.
- Dither with the 4×4 Bayer matrix (`BAYER4`). It is stable from frame to frame, so a still region doesn't crawl. Random per-frame noise flickers: don't use it.
- Grain that should look hand-placed comes from `hash2(x, y)`, which is fixed per pixel.

## Brightness hierarchy

| Region | Brightness |
|---|---|
| Sky body | 0.28–0.36 |
| Bands, strokes, the river of cloud | 0.45–0.65 |
| Star halos, moon halo | 0.55–0.8 |
| Star cores, the moon disc, lamps | 0.86–1.0 |
| Hills | 0.14–0.4, nearer is darker |
| Cypress | 0.02–0.3, plus rare cobalt flecks at 0.42 |

In any small region, exactly one thing reaches gold. If everything glows, nothing does.

## Shapes

- **Swirls** are spirals, not rings: `sin(arms·θ − k·r^0.8 + wobble)`, mixed in by a Gaussian weight around the vortex. Rings without arms look like a target.
- **Stars** have a gold core, a straw inner halo, then stippled rings that move outward over time, fading to the sky by about 1.35 halo radii.
- **The cypress** is a broad flame body with tongues licking off it. Without the body it reads as grass. Each tongue swells over its first third, then tapers to a point. Hatching runs along the tongue, and moonlight catches the left edges.
- **The village** has gable roofs, with the right slope lit and the left in shadow. Walls have an ink edge. The church has a tower and a thin spire that rises well above the roofs. Lamps are 1–2 art pixels.
- **Hills** come in three ranges: far is lighter, near is darker. Each has a dark rim line on its ridge.

## Anti-patterns (each of these was tried and rejected)

- Concentric rings around every vortex: they look like targets, not brushwork. Add arms and a wobble.
- A cypress built only from separate tongues: sky shows through and it reads as grass. Add the body, and take coverage as the maximum over all tongues.
- A star whose core brightness was applied everywhere: the whole tile turned pale. Every brightness term needs a falloff.
- Regular diagonal stripes as a background: they read as a texture swatch. Bend them with a slow sine and add grain.
- Random-per-frame dither in a 2D fallback: vertical streaks and crawl. Use the Bayer matrix.
- A title plate over the great swirl: it hides the one thing the page is about. Put words over the land.
