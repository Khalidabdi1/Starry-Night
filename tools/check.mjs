#!/usr/bin/env node
// Repository checks, zero dependencies: `node tools/check.mjs`.
//  1. SKILL.md frontmatter follows the Agent Skills spec (skills.sh).
//  2. Every file SKILL.md points at exists.
//  3. Every kit module parses.
//  4. The model is sane: finite wind everywhere, swirls turn the right way.
//  5. The JS and GLSL fields use the same constants.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "skills", "starry-night");
let failed = 0;
const ok = (msg) => console.log("  ok  " + msg);
const bad = (msg) => {
  failed++;
  console.log("  FAIL " + msg);
};

// 1. Frontmatter
console.log("SKILL.md");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const fm = skill.match(/^---\n([\s\S]*?)\n---\n/);
if (!fm) bad("no YAML frontmatter");
else {
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [])[1];
  const name = get("name");
  const desc = get("description");
  if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) bad(`name "${name}" must be lowercase-hyphenated, at most 64 chars`);
  else if (name !== "starry-night") bad(`name "${name}" must match its folder`);
  else ok(`name: ${name}`);
  if (!desc) bad("description missing");
  else if (desc.length > 1024) bad(`description is ${desc.length} chars (max 1024)`);
  else ok(`description: ${desc.length} chars`);
}

// 2. Paths named in SKILL.md
const paths = new Set([...skill.matchAll(/`((?:kit|references|scripts|assets|evals|agents)\/[\w./-]+)`/g)].map((m) => m[1]));
for (const p of paths) {
  const full = join(skillDir, p.replace(/\/$/, ""));
  existsSync(full) ? ok(`exists: ${p}`) : bad(`missing: ${p}`);
}

// 3. Every module parses
console.log("kit");
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const f of walk(join(skillDir, "kit")).concat(walk(join(skillDir, "scripts")), [join(root, "demo", "demo.js"), join(root, "tools", "check.mjs")])) {
  if (!/\.(mjs|js)$/.test(f)) continue;
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    ok(`parses: ${f.slice(root.length + 1)}`);
  } catch (e) {
    bad(`syntax: ${f.slice(root.length + 1)}\n${e.stderr}`);
  }
}

// 4. Model sanity (model.mjs is pure: no DOM).
console.log("model");
const M = await import(join(skillDir, "kit", "model.mjs"));
const out = [0, 0];
let finite = true,
  maxSpeed = 0;
for (let i = 0; i <= 100; i++)
  for (let j = 0; j <= 40; j++) {
    M.fieldAt((i / 100) * M.PAINT_W, j / 40, 3.7, out);
    if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) finite = false;
    maxSpeed = Math.max(maxSpeed, Math.hypot(out[0], out[1]));
  }
finite ? ok("wind is finite on a 101 x 41 grid") : bad("wind has NaN or Infinity");
maxSpeed < 2 ? ok(`peak wind ${maxSpeed.toFixed(2)} (calm enough to follow)`) : bad(`peak wind ${maxSpeed.toFixed(2)} is too fast`);
// Each vortex turns the way its spin says: sample the swirl relative to the drift.
for (const v of M.VORTICES) {
  const r = v.core * 1.1;
  const above = M.fieldAt(v.x, v.y - r, 0, [0, 0])[0];
  const below = M.fieldAt(v.x, v.y + r, 0, [0, 0])[0];
  const clockwise = above > below; // y down: clockwise means faster rightward on top
  clockwise === v.spin > 0 ? ok(`vortex at (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) turns ${clockwise ? "clockwise" : "anticlockwise"}`) : bad(`vortex at ${v.x}, ${v.y} turns the wrong way`);
}
const view = M.viewOf(0.5, 0.47);
view.x0 >= 0 && view.x0 + view.w <= M.PAINT_W + 1e-9 ? ok("viewOf keeps narrow views inside the painting") : bad("viewOf leaves the painting");

// 5. JS / GLSL parity: every constant in fieldAt appears in GLSL_FIELD.
const src = readFileSync(join(skillDir, "kit", "model.mjs"), "utf8");
const jsBody = src.slice(src.indexOf("export function fieldAt"), src.indexOf("function addVortex"));
const nums = new Set([...jsBody.matchAll(/\b\d+\.\d+\b/g)].map((m) => m[0]));
const missing = [...nums].filter((n) => !M.GLSL_FIELD.includes(n));
missing.length ? bad(`GLSL_FIELD is missing constants from fieldAt: ${missing.join(", ")}`) : ok(`GLSL and JS fields share all ${nums.size} constants`);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
