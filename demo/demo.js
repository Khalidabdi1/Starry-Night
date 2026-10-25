// Starry Night demo wiring: readouts, controls, copy button, motion switch,
// and pointer forwarding for the layered hero scene.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Live readouts: each <output data-readout-for="sel"> mirrors that component.
for (const out of $$("[data-readout-for]")) {
  const el = $(out.dataset.readoutFor);
  if (!el) continue;
  out.textContent = el.getAttribute("aria-valuetext") || "";
  el.addEventListener("readout", (e) => {
    out.textContent = e.detail;
  });
}

// Fig 1 controls: sliders write attributes, and the snippet shows the tag.
for (const form of $$("[data-controls]")) {
  const el = $(form.dataset.controls);
  const code = $("[data-code]", form);
  const defaults = {};
  const sync = () => {
    const attrs = [];
    for (const input of $$("input[type=range]", form)) {
      const v = input.value;
      input.nextElementSibling.textContent = v;
      el.setAttribute(input.name, v);
      if (v !== defaults[input.name]) attrs.push(`${input.name}="${v}"`);
    }
    code.textContent = `<starry-sky${attrs.length ? " " + attrs.join(" ") : ""}>\n</starry-sky>`;
  };
  for (const input of $$("input[type=range]", form)) {
    defaults[input.name] = input.defaultValue;
    input.addEventListener("input", sync);
  }
  sync();
}

// Fig 4: write your own words.
for (const input of $$("[data-text-for]")) {
  const el = $(input.dataset.textFor);
  let t = 0;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => el.setAttribute("text", input.value || " "), 120);
  });
}

// Copy the install command.
for (const btn of $$("[data-copy]")) {
  btn.addEventListener("click", async () => {
    const note = $(".copied", btn);
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      note.textContent = "copied to clipboard";
    } catch {
      note.textContent = "select and copy the command";
    }
    setTimeout(() => (note.textContent = ""), 1800);
  });
}

// Motion switch: `still` on every component (same as prefers-reduced-motion).
const motionBtn = $("[data-motion]");
const all = () => $$("starry-sky, starry-swirl, starry-star, starry-cypress, starry-village, starry-painting, starry-text");
motionBtn.addEventListener("click", () => {
  const still = motionBtn.getAttribute("aria-pressed") !== "true";
  motionBtn.setAttribute("aria-pressed", String(still));
  motionBtn.textContent = still ? "Play motion" : "Pause motion";
  for (const el of all()) el.toggleAttribute("still", still);
});
if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
  motionBtn.setAttribute("aria-pressed", "true");
  motionBtn.textContent = "Motion reduced";
}

// Hero: the sky takes the pointer itself; the village and cypress layers sit
// on top with pointer-events: none, so forward the same events to them.
const scene = $("[data-scene]");
if (scene) {
  const layers = $$(".village, .cypress", scene);
  const forward = (e) => {
    for (const el of layers) {
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      // Presses only reach a layer when they land on it; moves always do, so the
      // cypress feels the pointer coming before it arrives.
      if (e.type === "pointerdown" && !inside) continue;
      if (e.type === "pointermove" && !inside && el.classList.contains("village")) continue;
      el.dispatchEvent(new PointerEvent(e.type, { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, bubbles: false }));
    }
  };
  for (const type of ["pointermove", "pointerdown", "pointerup", "pointerleave", "pointercancel"]) {
    scene.addEventListener(type, forward);
  }
}
