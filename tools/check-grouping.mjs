#!/usr/bin/env node
/**
 * Guards the Core / Going deeper grouping.
 *
 * Both halves of this have failed before: the flags were right while the styles
 * rendered the markers invisibly, which is indistinguishable from not shipping
 * them. This checks the data AND that the styling is still strong enough to see.
 *
 *   node tools/check-grouping.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { animations } from '../js/registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
const player = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');

let fail = 0;
const check = (label, cond, hint) => {
  if (!cond) { fail = 1; console.log(`FAIL ${label}${hint ? `\n     ${hint}` : ''}`); }
  else console.log(`ok   ${label}`);
};

const core = animations.filter((a) => !a.advanced);
const deeper = animations.filter((a) => a.advanced);

check('both groups are populated', core.length > 0 && deeper.length > 0,
  'every animation is in one group - the split conveys nothing');
check('core stays small enough to be a session', core.length <= 8,
  `core has ${core.length}; keep it small enough that the docs' promised "core" stays true`);
check('registry lists core animations first',
  animations.findIndex((a) => a.advanced) === core.length,
  'sidebar numbering will disagree with the presenting guide');

check('sidebar builds groups', /label: 'Core'/.test(player) && /label: 'Going deeper'/.test(player));
check('deeper entries are tagged', /li\.className = 'deeper'/.test(player));

// styling strong enough to notice
check('group headings are not muted', /\.anim-list \.group-label \{[^}]*--text-secondary/.test(css),
  'muted headings read as decoration - this shipped once and was invisible');
check('groups separated by a divider', /group-label:not\(:first-child\)[^}]*border-top/.test(css));
check('advanced mode marker is a word, not a shape',
  /\.tabs button\.adv::after \{[^}]*content: "advanced"/.test(css),
  'a small dot is not noticeable at presentation distance');

// The toggle filters on the same flag, so both halves have to stay wired.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check('beginner/advanced switch exists in the markup',
  /id="btn-level-beginner"/.test(html) && /id="btn-level-advanced"/.test(html));
check('a way back out of beginner mode exists', /id="level-hint"/.test(html),
  'hidden content with no affordance to restore it is content the user has lost');
check('sidebar and tabs both honour the filter',
  /visibleAnimations\(\)/.test(player) && /visibleModes\(/.test(player));
check('a deep link into hidden material overrides the toggle',
  /if \(isHidden\(anim, mode\)\) toggleLevel\(false\)/.test(player),
  'otherwise a prepared link silently shows the wrong thing');
check('the preference is persisted', /localStorage\.setItem\('beginner'/.test(player));

const advModes = animations.flatMap((a) => a.modes.filter((m) => m.advanced).map((m) => `${a.id}/${m.id}`));
console.log(`\n  core: ${core.map((a) => a.id).join(', ')}`);
console.log(`  deeper: ${deeper.map((a) => a.id).join(', ')}`);
console.log(`  advanced modes: ${advModes.join(', ') || 'none'}`);

console.log(fail ? '\ngrouping is broken or invisible\n' : '\ngrouping is intact and visible\n');
process.exit(fail);
