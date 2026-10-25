#!/usr/bin/env node
// Headless Chrome capture for Starry Night components. Zero dependencies
// (Node 22+ for the global WebSocket). Prints every console message and page
// error, and exits 1 if the page threw.
//
//   node capture.mjs <url> [options]
//     --out shot.png           screenshot path (default shot.png)
//     --size 1400x900          viewport (default 1400x900)
//     --wait 2500              ms to let it animate before the shot
//     --full                   capture the full page height
//     --move 0.5,0.4           move the pointer to a fraction of the viewport first
//     --press                  press and release at the pointer
//     --key " "                send a key to the focused element
//     --focus "starry-sky"     focus the first element matching a selector
//     --scroll "#fig"          scroll an element into view first (components render only onscreen)
//     --eval "js"              evaluate an expression and print the result
//     --reduced-motion         emulate prefers-reduced-motion: reduce
//     --no-webgl               disable WebGL to test fallbacks
//     --frames 4 --gap 400     a strip of N shots, gap ms apart (out-1.png ...)
//     --chrome /path/to/chrome

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && !args[args.indexOf(a) - 1]?.startsWith("--")) || args[0];
const opt = (name, fallback) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
if (!url || url.startsWith("--")) {
  console.error("usage: node capture.mjs <url> [--out shot.png] [--size 1400x900] [--wait 2500] ...");
  process.exit(2);
}

const CHROMES = [
  opt("chrome"),
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter((p) => typeof p === "string");
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chrome found. Pass --chrome /path or set CHROME_PATH.");
  process.exit(2);
}

const [W, H] = String(opt("size", "1400x900")).split("x").map(Number);
const out = String(opt("out", "shot.png"));
const wait = Number(opt("wait", 2500));
const profile = mkdtempSync(join(tmpdir(), "starry-capture-"));
const flags = [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--force-device-scale-factor=1",
];
if (opt("no-webgl")) flags.push("--disable-webgl", "--disable-3d-apis");

const proc = spawn(chrome, [...flags, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  const t = setTimeout(() => reject(new Error("Chrome did not start")), 15000);
  proc.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) {
      clearTimeout(t);
      resolve(m[1]);
    }
  });
});

// Find the page target.
const port = new URL(wsUrl).port;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
let threw = false;
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method === "Runtime.consoleAPICalled") {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    console.log(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === "Runtime.exceptionThrown") {
    threw = true;
    const d = msg.params.exceptionDetails;
    console.log(`[page error] ${d.exception?.description || d.text} (${d.url || ""}:${d.lineNumber})`);
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    console.log(`[log error] ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 });
  if (opt("reduced-motion")) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  }
  const loaded = new Promise((r) => {
    const on = (ev) => {
      if (JSON.parse(ev.data).method === "Page.loadEventFired") {
        ws.removeEventListener("message", on);
        r();
      }
    };
    ws.addEventListener("message", on);
  });
  await send("Page.navigate", { url });
  await Promise.race([loaded, sleep(10000)]);

  const scroll = opt("scroll");
  if (scroll) {
    await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(scroll)})?.scrollIntoView({ block: "start", behavior: "instant" })` });
    await sleep(300);
  }
  const focus = opt("focus");
  if (focus) await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(focus)})?.focus()` });
  const move = opt("move");
  if (move) {
    const [fx, fy] = String(move).split(",").map(Number);
    const x = fx * W,
      y = fy * H;
    for (let i = 0; i <= 10; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x * (0.6 + 0.04 * i), y });
      await sleep(30);
    }
    if (opt("press")) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await sleep(80);
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    }
  }
  const key = opt("key");
  if (key) {
    const k = key === true ? " " : key;
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k.length === 1 ? k : undefined });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k });
  }

  await sleep(wait);

  const expr = opt("eval");
  if (expr) {
    const r = await send("Runtime.evaluate", { expression: String(expr), returnByValue: true, awaitPromise: true });
    console.log("[eval]", JSON.stringify(r.result.value ?? r.result.description));
  }

  const shoot = async (path) => {
    let clip;
    if (opt("full")) {
      const m = await send("Page.getLayoutMetrics");
      const h = Math.ceil(m.cssContentSize?.height || m.contentSize.height);
      clip = { x: 0, y: 0, width: W, height: h, scale: 1 };
    }
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) });
    writeFileSync(path, Buffer.from(shot.data, "base64"));
    console.log("[shot]", path);
  };
  const frames = Number(opt("frames", 1));
  if (frames > 1) {
    const gap = Number(opt("gap", 400));
    for (let i = 1; i <= frames; i++) {
      await shoot(out.replace(/\.png$/, `-${i}.png`));
      if (i < frames) await sleep(gap);
    }
  } else await shoot(out);
} catch (err) {
  console.error(err);
  threw = true;
} finally {
  ws.close();
  proc.kill();
  await sleep(200);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
process.exit(threw ? 1 : 0);
