#!/usr/bin/env node
/**
 * Validates every deep link written in the docs against the real animations.
 *
 * Deep links are `#animation-id/mode-id/step`. A frame index that drifts because
 * someone inserted a step turns a link you sent a customer last week into the
 * wrong moment - and nothing else in the build would notice.
 *
 *   node tools/check-links.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { animations } from '../js/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['README.md', 'docs/presenting.md', 'docs/deploying.md', 'docs/authoring-animations.md'];

let fail = 0;
let checked = 0;

for (const f of files) {
  const full = path.join(root, f);
  if (!fs.existsSync(full)) continue;
  const txt = fs.readFileSync(full, 'utf8');

  for (const m of txt.matchAll(/#([a-z-]+)\/([a-z-]+)\/(\d+)/g)) {
    const [link, id, mode, step] = m;
    checked += 1;
    const a = animations.find((x) => x.id === id);
    if (!a) { console.log(`FAIL ${f}: no animation "${id}"  (${link})`); fail = 1; continue; }
    if (!a.modes.some((x) => x.id === mode)) {
      console.log(`FAIL ${f}: "${id}" has no mode "${mode}"  (${link})`); fail = 1; continue;
    }
    const n = a.buildFrames(mode).length;
    if (Number(step) >= n) {
      console.log(`FAIL ${f}: ${link} but "${mode}" has only ${n} frames (0-${n - 1})`); fail = 1;
    }
  }
}

console.log(fail ? '\nbroken deep links in the docs\n' : `\nall ${checked} documented deep links resolve\n`);
process.exit(fail);
