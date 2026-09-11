#!/usr/bin/env node
/**
 * Builds every frame of every mode of every registered animation and renders
 * each one, checking the module contract and the emitted SVG.
 *
 *   node tools/check-animations.mjs
 *
 * Exits non-zero on any failure, so it is safe to wire into CI.
 */
import { animations } from '../js/registry.js';

let fail = 0;
const required = ['id', 'title', 'summary', 'modes', 'buildFrames', 'renderSVG'];

for (const a of animations) {
  for (const k of required) {
    if (a[k] === undefined) { console.log(`FAIL ${a.id}: missing required field "${k}"`); fail = 1; }
  }
  console.log(`\n=== ${a.id} (${a.modes.length} mode${a.modes.length > 1 ? 's' : ''})`);

  for (const m of a.modes) {
    const frames = a.buildFrames(m.id);
    if (!Array.isArray(frames) || !frames.length) {
      console.log(`  FAIL ${m.id}: buildFrames returned no frames`); fail = 1; continue;
    }

    let noteless = 0;
    let svgBytes = 0;

    frames.forEach((f, i) => {
      const svg = a.renderSVG(f, { index: i, frames });
      if (typeof svg !== 'string' || !svg.length) {
        console.log(`  FAIL ${m.id} frame ${i}: renderSVG returned nothing`); fail = 1; return;
      }
      svgBytes += svg.length;

      // Unbalanced tags render as nothing at all in the browser, silently.
      for (const tag of ['g', 'text', 'rect']) {
        const open = (svg.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
        const close = (svg.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        const self = tag === 'rect' ? (svg.match(/<rect[^>]*\/>/g) || []).length : 0;
        if (open - self !== close) {
          console.log(`  FAIL ${m.id} frame ${i}: <${tag}> open=${open} self-closing=${self} close=${close}`);
          fail = 1;
        }
      }

      // Hardcoded colours break dark mode.
      const hex = svg.match(/#[0-9a-fA-F]{3,6}\b/g);
      if (hex) { console.log(`  FAIL ${m.id} frame ${i}: hardcoded colour(s) ${[...new Set(hex)].join(', ')} - use a CSS class`); fail = 1; }

      if (!f.note) noteless += 1;

      if (a.metrics) {
        const ms = a.metrics(f, frames.slice(0, i + 1));
        if (!Array.isArray(ms)) { console.log(`  FAIL ${m.id}: metrics() did not return an array`); fail = 1; }
        else for (const x of ms) {
          if (x.value === undefined || String(x.value) === 'undefined') {
            console.log(`  FAIL ${m.id} frame ${i}: metric "${x.label}" has an undefined value`); fail = 1;
          }
        }
      }
    });

    if (noteless) { console.log(`  WARN ${m.id}: ${noteless} frame(s) have no note - the presenter has to improvise`); }
    const notes = a.speakerNotes ? a.speakerNotes(m.id) : null;
    if (!notes || !notes.length) { console.log(`  WARN ${m.id}: no speaker notes`); }

    const secs = (frames.length * 1000) / 1000;
    const pace = frames.length > 40 ? '  <-- too long, split it' : '';
    console.log(`  ${m.id.padEnd(18)} frames=${String(frames.length).padStart(3)}  ~${secs}s at default speed  avg svg=${Math.round(svgBytes / frames.length)}b${pace}`);
  }
}

console.log(fail ? '\nFAILURES\n' : '\nall checks passed\n');
process.exit(fail);
