#!/usr/bin/env node
/**
 * Verifies that every rendered frame stays inside its declared viewBox.
 * Off-canvas geometry is the most common SVG authoring mistake and is invisible
 * until the one frame where it clips.
 *
 *   node tools/check-bounds.mjs
 */
import { animations } from '../js/registry.js';

let fail = 0;

for (const a of animations) {
  const [, , vw, vh] = (a.viewBox || '0 0 680 350').split(' ').map(Number);
  let maxX = 0, maxY = 0, minX = Infinity, minY = Infinity;

  for (const m of a.modes) {
    for (const f of a.buildFrames(m.id)) {
      const svg = a.renderSVG(f, {});

      for (const r of svg.matchAll(/<rect[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*width="([-\d.]+)"[^>]*height="([-\d.]+)"/g)) {
        const [x, y, w, h] = [+r[1], +r[2], +r[3], +r[4]];
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
      }
      for (const t of svg.matchAll(/<text[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"/g)) {
        maxX = Math.max(maxX, +t[1]); maxY = Math.max(maxY, +t[2]);
        minX = Math.min(minX, +t[1]); minY = Math.min(minY, +t[2]);
      }
      for (const l of svg.matchAll(/<line[^>]*x1="([-\d.]+)"[^>]*y1="([-\d.]+)"[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/g)) {
        maxX = Math.max(maxX, +l[1], +l[3]); maxY = Math.max(maxY, +l[2], +l[4]);
        minX = Math.min(minX, +l[1], +l[3]); minY = Math.min(minY, +l[2], +l[4]);
      }
    }
  }

  const bad = minX < 0 || minY < 0 || maxX > vw || maxY > vh;
  if (bad) fail = 1;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${a.id.padEnd(24)} viewBox ${vw}x${vh}   content x:${minX}..${maxX}  y:${minY}..${maxY}`);
}

console.log(fail ? '\ngeometry escapes the viewBox - it will clip\n' : '\nall geometry inside bounds\n');
process.exit(fail);
