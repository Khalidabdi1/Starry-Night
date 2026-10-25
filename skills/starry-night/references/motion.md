# Motion and interaction

Adapted from Anatomy's motion rules for a painting instead of a machine: the sky is alive when its wind is calm enough to follow and everything in it agrees on where the wind goes.

## The loop (already in `StarryElement`)

- `dt` comes from rAF timestamps, clamped to 1/30 s, so a background tab never jumps.
- `update(dt, calm, touring)` is the only per-frame hook. Return `true` while you need more frames and `false` once you have settled.
- The loop stops when the element is offscreen (IntersectionObserver with `rootMargin: 120px 0px`, reading the newest entry), when it is `paused`, or when it has settled under reduced motion. `kick()` restarts it. Input calls it for you.
- `this.clock` is animated time: it does not advance while paused or calm. Multiply it by the `speed` attribute.

## Movers (`core.mjs`)

| Function | Use it for | Notes |
|---|---|---|
| `follow(x, target, dt, tau, calm)` | Pointer positions, gentle tracking | Exponential. τ 0.15–0.3 s. |
| `settle(s, target, dt, seconds, calm)` | Values that must arrive cleanly: scatter, swell, lamp brightness, pointer-vortex strength | Critically damped on `{x, v}`, sub-stepped at 240 Hz, snaps below 5e-4. Returns true while moving. |
| `spring(s, target, dt, k, c, calm)` | Springy things: the cypress trunk | Underdamped when c < 2√k. The cypress uses k 16, c 2.6: one overshoot. |
| `burst(age, rise, fall)` | One-off events: flares, ripples, gusts | Smoothstep attack over `rise` (40–150 ms), then exponential decay `fall`. Store the event's start time and compute from its age each frame. Two events simply add. |

Under `calm`, every mover jumps to its target and every burst is 0.

## Pointer

- `this.pointer` holds `{ x, y }` (eased, 0..1 of the box), `{ tx, ty }` (raw targets), `inside`/`insideT` (eased presence) and `down`.
- Hooks: `onPointerMove(x, y)`, `onPress(x, y)`, `onRelease()`, `onLeave()`.
- **Hover previews, press commits.** On touch there is no hover, so a tap must act. The host has `touch-action: pan-y`, so the page still scrolls.
- **Vortex strength.** A pointer vortex never appears at full strength. Its spin settles toward `insideT · base` (stronger while pressed) over about 0.45 s.

## Idle tour

- `touring` is true after 1.4 s with no interaction (3.6 s once someone has interacted). It is false while the element is hovered or focused, under reduced motion, or with `no-tour`.
- The tour drives **the same targets** a user would: a wandering virtual pointer, a ripple every 7 s, a window that changes its mind, the word breathing apart. Never write a separate animation path for the tour.

## Keyboard and accessibility

- `onKey(key, shift)` returns true when it handled the key (the base class then calls `preventDefault`).
  - Arrows step, Shift steps further.
  - Home, End and Escape reset or jump to the extremes.
  - Space and Enter trigger the component's event.
- Roles: `img` by default, `slider` for the cypress (with `aria-valuenow`, min and max), `button` with `aria-pressed` for the village, `status` for the spinner.
- `say(text)` updates `aria-valuetext` and fires `readout`. Write the readout in true units from the model, short, and read from where things actually are, not from targets: "14 of 24 windows lit" counts lamps above half brightness.

## Reduced motion

- `prefers-reduced-motion: reduce` or the `still` attribute makes `calm` true. Every component then draws one still frame:
  - the sky at t = 0
  - the painting unflowed
  - the swirl as long strokes, 24 steps deep
  - the text assembled
  - the village with its lamps steady
- Input still works: a still frame that ignores the pointer feels broken.

## Performance

- Backing canvases are `box / pixel`. A 1440 × 900 sky at pixel 3 is 480 × 300 = 144k fragments, each doing 21 field evaluations.
- Particles: 2k is comfortable on phones and 8k on desktops.
- Never allocate in `update`. Reuse arrays (`this.v`, `this.f`), and rasterise static layers (the village's hills and houses) once per resize.
- WebGL contexts are created with `preserveDrawingBuffer: true` so `snapshot()` works, `antialias: false` and no depth buffer.
