#!/usr/bin/env node
/**
 * Guards against a specific, easy-to-reintroduce bug.
 *
 * `[hidden] { display: none }` lives in the USER-AGENT stylesheet. Any
 * author-origin `display` declaration beats it, regardless of specificity. So
 * an element that JS shows and hides via the hidden attribute, but which also
 * carries a `display` rule in our CSS, never actually hides - it renders on
 * page load and its close button appears to do nothing.
 *
 * css/app.css carries a global `[hidden] { display: none !important; }` guard.
 * This check fails if that guard is removed while elements still rely on it.
 *
 *   node tools/check-hidden-toggles.mjs
 *
 * Static analysis only - no browser, no dependencies. jsdom is NOT a valid
 * substitute here: it does not model the UA-vs-author cascade faithfully and
 * reports these elements as correctly hidden either way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');

let fail = 0;

const guard = /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css);

// Which element ids does the player toggle via the hidden attribute?
const toggled = new Set();
for (const m of js.matchAll(/el\('([a-z-]+)'\)\.hidden/g)) toggled.add(m[1]);
for (const m of js.matchAll(/(?:const|let)\s+(\w+)\s*=\s*el\('([a-z-]+)'\)/g)) {
  if (new RegExp(`${m[1]}\\.hidden`).test(js)) toggled.add(m[2]);
}
// tabs is reached through a local variable assigned from getElementById
if (/tabs\.hidden/.test(js)) toggled.add('mode-tabs');

// For each, find the classes it carries in the markup, then look for a
// `display` declaration on any of those class selectors.
const atRisk = [];
for (const id of toggled) {
  const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`));
  if (!tag) { console.log(`WARN  no element with id="${id}" in index.html`); continue; }
  const classAttr = tag[0].match(/class="([^"]+)"/);
  const classes = classAttr ? classAttr[1].split(/\s+/) : [];
  for (const c of classes) {
    const rule = css.match(new RegExp(`\\.${c}\\s*\\{[^}]*\\}`, 'g')) || [];
    if (rule.some((r) => /(^|[;{\s])display\s*:/.test(r))) {
      atRisk.push(`#${id} (.${c})`);
    }
  }
}

if (atRisk.length) {
  console.log(`elements toggled via [hidden] that also carry a display rule:\n  ${atRisk.join('\n  ')}`);
  if (guard) {
    console.log('\nok   the global [hidden] { display: none !important } guard is present');
  } else {
    console.log('\nFAIL the global [hidden] guard is MISSING from css/app.css.');
    console.log('     These elements will render on page load and refuse to close.');
    fail = 1;
  }
} else {
  console.log(guard
    ? 'ok   no elements currently depend on the guard, but it is present (harmless)'
    : 'ok   no elements toggled via [hidden] carry a display rule');
}

process.exit(fail);
