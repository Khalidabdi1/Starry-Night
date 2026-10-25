# Verify

Find the faults before anyone else does. Capture, read every PNG, and fix.

## Commands

Serve the page first (any static server, for example `python3 -m http.server 8000`), because modules don't load from `file://`. Then:

```sh
S=scripts/capture.mjs
node $S http://localhost:8000/ --size 1440x900 --wait 3000 --out shots/desktop.png
node $S http://localhost:8000/ --size 390x844 --wait 3000 --out shots/phone.png --eval "document.documentElement.scrollWidth"
node $S http://localhost:8000/ --scroll "#swirl" --wait 2500 --out shots/swirl.png      # below the fold
node $S http://localhost:8000/ --move 0.4,0.35 --press --wait 600 --out shots/press.png   # interaction
node $S http://localhost:8000/ --focus "starry-sky" --key " " --wait 400 --out shots/key.png
node $S http://localhost:8000/ --frames 4 --gap 250 --out shots/motion.png               # motion strip
node $S http://localhost:8000/ --reduced-motion --frames 2 --gap 800 --out shots/rm.png   # must be identical
node $S http://localhost:8000/ --no-webgl --wait 2000 --out shots/fallback.png
```

The script prints every console message and page error and exits 1 if the page threw. `--eval` prints a value: use it to read `aria-valuetext`, `data-fallback` or the scroll width.

To prove two frames are identical (reduced motion), diff them:

```sh
python3 -c "from PIL import Image, ImageChops as C; a,b=[Image.open(f'shots/rm-{i}.png').convert('RGB') for i in (1,2)]; print(C.difference(a,b).getbbox())"
```

`None` means still.

## Checklist

Look at each PNG and ask:

- **Is it the painting?** Swirls read as brushwork spirals, stars sit in ringed halos, the moon has its crescent, and the cypress is a solid dark flame.
- **One palette?** No colour outside the ramp, no smooth gradients, the dither is stable, and there are no streaks.
- **Brightness hierarchy:** one gold thing per region, and the land darker than the sky.
- **Layers line up:** same pixel grid, no sky showing through the cypress, no seam where a transparent layer ends.
- **Composition:** words sit over the land, not the great swirl. On narrow boxes `focus` shows the part that matters. There is no horizontal scroll at 390 px.
- **Motion strip:** strokes move along the wind and nothing jumps between frames. Particles fade in and out rather than popping.
- **Interaction:** a press makes a visible ripple, flare or cascade, the readout changes, and keys work with a visible focus ring.
- **Reduced motion:** the two frames are identical, and the still frame is a good picture on its own.
- **Fallback:** without WebGL the page still reads (2D sky, plain image) and nothing throws.
- **Console:** no page errors. A missing favicon 404 on a bare test page is fine.
- **Offscreen:** components below the fold are blank in a full-page capture. That is correct, because they render only when onscreen. Use `--scroll` to check them.
