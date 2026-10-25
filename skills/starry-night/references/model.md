# The model

`kit/model.mjs` is the single source of truth for the sky. It is pure: no DOM, no state, no time except the `t` you pass in.

## Painting space

- The panorama is `PAINT_W = 2.5` units wide and 1 unit tall. x runs right and y runs **down**, like the screen.
- All positions were measured off `assets/starry-night.webp` (1983 × 793 px): a fraction `fx` of the image width becomes `x = fx · 2.5`.
- A component maps its box into painting space with `viewOf(aspect, focus)`, a "cover" fit. A wide box shows the full height and crops the sides, a tall box shows a vertical slice centred on `focus · PAINT_W`. Element fraction (u, v) becomes painting space `(x0 + u·w, y0 + v·h)`.

## The wind: `fieldAt(x, y, t, out, extra?)`

Writes the velocity at a point into `out[0], out[1]`. Units are painting units per second.

1. **Drift.** `vx = 0.16 + 0.05·sin(6.3y + 0.21t)`, plus a small vertical wave. The wind blows right with long waves.
2. **River of cloud.** Along `riverY(x)`, the wind leans upward on the right side, so the bright band rises toward the moon.
3. **Vortices.** Each one is a Lamb–Oseen core with a Gaussian reach:

   ```
   r² = dx² + dy²
   s  = spin · (1 − exp(−r²/core²)) / r² · exp(−r²/reach²)
   v += (−dy·s, dx·s)
   ```

   Near the centre it turns like a solid disc, further out it falls off as 1/r, and past `reach` it fades out, so every swirl stays local. The peak tangential speed is about `0.64 · spin / core`, at r ≈ 1.1 core. `spin > 0` turns clockwise on screen, because y points down.
4. **`extra`.** Extra vortices with the same shape (`{x, y, spin, core, reach}`). This is how pointers and clicks join the wind.

| Vortex | x (fraction) | y | spin* | core | reach | arms | lum |
|---|---|---|---|---|---|---|---|
| great swirl, upper lobe | 0.47 | 0.33 | 0.034 | 0.085 | 0.30 | 2 | 0.32 |
| great swirl, lower lobe | 0.385 | 0.43 | −0.026 | 0.07 | 0.24 | 2 | 0.22 |
| right swirl | 0.655 | 0.42 | 0.028 | 0.06 | 0.22 | 3 | 0.28 |
| tight curl | 0.575 | 0.535 | 0.016 | 0.03 | 0.10 | 3 | 0.30 |
| moon's halo | 0.89 | 0.20 | −0.03 | 0.09 | 0.28 | 1 | 0.12 |
| left edge | 0.10 | 0.22 | 0.02 | 0.07 | 0.22 | 1 | 0.12 |

\* The listed spin is multiplied by 1.5 inside `V()`.

`arms` and `lum` are not part of the wind. They tell the sky shader how many spiral arms to paint in the bands and how much a swirl brightens the sky (its yellow streaks).

## Stars and moon

- `STARS` holds ten `{x, y, size, phase}`: `size` is the halo radius and `phase` offsets the twinkle.
- `MOON` is `{x, y, r, cut: [dx, dy, r2]}`. The crescent is the inside of a disc of radius 0.66·r, minus a disc of radius `r2` offset by (dx, dy).

## JS and GLSL parity

`GLSL_FIELD` is the same field in GLSL ES 3.00. Upload the uniforms with `packVortices()` and `packStars()`: `uV[i] = (x, y, spin, core)`, `uW[i] = (reach, arms, sign(spin), lum)`, and `uPtr = (x, y, spin, core)` with `uPtrReach` for the pointer vortex.

**Rule:** if you change `fieldAt`, change `field()` in `GLSL_FIELD` the same way, in the same commit. A shader and a particle system that disagree about the wind look broken the moment they are layered.

## Extending the model

- **A new swirl for one component.** Pass it in `extra` (JS) or reuse the pointer slot (GLSL). The model stays untouched.
- **A new swirl for every component.** Add it to `VORTICES`. The GLSL loop handles up to 8.
- **A new star.** Add it to `STARS`. Up to 12 fit in the shader.
- **A different painting.** Write a new model module with the same exports. Every component imports from `./model.mjs`, so swap the import or make the model a constructor argument in your fork. Keep `PAINT_W` equal to the new image's aspect.
