/**
 * Player shell.
 *
 * Knows nothing about OpenShift. It loads animation modules from the registry,
 * drives frames, and paints whatever SVG a module hands back. Adding an
 * animation never requires touching this file - see docs/authoring-animations.md
 */
import { animations } from './registry.js';

const el = (id) => document.getElementById(id);

const state = {
  anim: null,        // the active animation module
  mode: null,        // active mode id
  frames: [],        // frames for the active mode
  i: 0,              // current frame index
  timer: null,       // interval handle when playing
  speed: 1000,       // ms per frame
  yamlRaw: '',       // active manifest, for the copy button
};

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function buildSidebar() {
  const list = el('anim-list');
  list.innerHTML = '';
  animations.forEach((a, n) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<span class="num">${String(n + 1).padStart(2, '0')}</span>${a.title}`;
    b.onclick = () => selectAnimation(a.id);
    b.dataset.animId = a.id;
    li.appendChild(b);
    list.appendChild(li);
  });
}

function markSidebar() {
  document.querySelectorAll('#anim-list button').forEach((b) => {
    b.setAttribute('aria-current', String(b.dataset.animId === state.anim.id));
  });
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function selectAnimation(id, modeId, step) {
  const anim = animations.find((a) => a.id === id) || animations[0];
  state.anim = anim;
  el('anim-title').textContent = anim.title;
  el('anim-summary').textContent = anim.summary;
  el('canvas').setAttribute('viewBox', anim.viewBox || '0 0 680 350');
  el('canvas-title').textContent = anim.title;
  el('canvas-desc').textContent = anim.description || anim.summary;

  const tabs = el('mode-tabs');
  tabs.innerHTML = '';
  anim.modes.forEach((m) => {
    const b = document.createElement('button');
    b.textContent = m.label;
    b.setAttribute('role', 'tab');
    b.dataset.modeId = m.id;
    b.onclick = () => selectMode(m.id);
    tabs.appendChild(b);
  });
  tabs.hidden = anim.modes.length < 2;

  markSidebar();
  selectMode(modeId && anim.modes.some((m) => m.id === modeId) ? modeId : anim.modes[0].id, step);
}

function selectMode(modeId, step) {
  stop();
  state.mode = modeId;
  state.frames = state.anim.buildFrames(modeId);
  state.i = clampStep(step);

  document.querySelectorAll('#mode-tabs button').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.modeId === modeId));
  });
  const mode = state.anim.modes.find((m) => m.id === modeId);
  el('mode-caption').textContent = mode.caption || '';
  renderConfig(modeId);

  el('scrub').max = String(Math.max(0, state.frames.length - 1));
  renderNotes();
  render();
}

function clampStep(step) {
  const n = parseInt(step, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(state.frames.length - 1, n));
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  const frame = state.frames[state.i];
  if (!frame) return;

  el('scene').innerHTML = state.anim.renderSVG(frame, { index: state.i, frames: state.frames });

  const metrics = state.anim.metrics ? state.anim.metrics(frame, state.frames.slice(0, state.i + 1)) : [];
  el('metrics').innerHTML = metrics
    .map((m) => `<div class="metric"><div class="m-label">${esc(m.label)}</div>
                 <div class="m-value ${m.tone || ''}">${esc(m.value)}</div></div>`)
    .join('');

  applyFocus(frame);
  el('note').textContent = frame.note || '';
  el('badge').textContent = frame.badge || '';
  el('scrub').value = String(state.i);
  el('counter').textContent = `${state.i + 1} / ${state.frames.length}`;

  writeHash();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderNotes() {
  const n = state.anim.speakerNotes ? state.anim.speakerNotes(state.mode) : null;
  el('notes-body').innerHTML = n
    ? n.map((b) => (b.ask ? `<p class="ask">${esc(b.ask)}</p>`
                          : `${b.heading ? `<h3>${esc(b.heading)}</h3>` : ''}<p>${esc(b.text || '')}</p>`)).join('')
    : '<p>No notes for this animation.</p>';
}

/* ------------------------------------------------------------------ */
/* Config column: manifest + feature outline                           */
/* ------------------------------------------------------------------ */

/* The manifest is fixed for a mode, so it is painted once on mode change.
   Only the per-line highlight changes as frames advance. */
function renderConfig(modeId) {
  const yamlPanel = el('yaml-panel');
  const featPanel = el('features-panel');

  const yaml = state.anim.yaml ? state.anim.yaml(modeId) : null;
  yamlPanel.hidden = !yaml;
  if (yaml) {
    state.yamlRaw = yaml.trim();
    el('yaml-code').innerHTML = state.yamlRaw.split('\n').map(highlightLine).join('');
  }

  const features = state.anim.features ? state.anim.features(modeId) : null;
  featPanel.hidden = !features || !features.length;
  if (features && features.length) {
    el('features-list').innerHTML = features.map((f) =>
      `<dt>${esc(f.name)}${f.kind ? `<span class="kind">${esc(f.kind)}</span>` : ''}</dt>`
      + `<dd>${esc(f.what)}</dd>`).join('');
  }
}

/* Deliberately minimal: comments muted, keys accented, list markers marked.
   This is a readability aid, not a YAML parser - anything it cannot classify
   is left as plain text rather than guessed at. */
function highlightLine(line) {
  const raw = esc(line);
  let html;

  const commentOnly = line.match(/^(\s*)(#.*)$/);
  const keyValue = line.match(/^(\s*-?\s*)([\w.\/-]+)(:)(.*)$/);

  if (commentOnly) {
    html = `${esc(commentOnly[1])}<span class="yc">${esc(commentOnly[2])}</span>`;
  } else if (keyValue) {
    const [, indent, key, colon, rest] = keyValue;
    const trailing = rest.match(/^(.*?)(\s+#.*)$/);
    const value = trailing ? trailing[1] : rest;
    const comment = trailing ? `<span class="yc">${esc(trailing[2])}</span>` : '';
    const marker = indent.includes('-') ? `<span class="ym">${esc(indent)}</span>` : esc(indent);
    html = `${marker}<span class="yk">${esc(key)}</span>${colon}${esc(value)}${comment}`;
  } else {
    html = raw;
  }

  return `<span class="yl" data-src="${esc(line)}">${html || '&nbsp;'}</span>`;
}

/* A frame may name the manifest lines it is currently about, as an array of
   substrings on frame.focus. Matching lines light up. */
function applyFocus(frame) {
  const focus = frame.focus || [];
  document.querySelectorAll('#yaml-code .yl').forEach((lineEl) => {
    const src = lineEl.dataset.src || '';
    lineEl.classList.toggle('hl', focus.some((f) => src.includes(f)));
  });
}

async function copyYaml() {
  const btn = el('yaml-copy');
  try {
    await navigator.clipboard.writeText(state.yamlRaw || '');
    btn.textContent = 'Copied';
  } catch (e) {
    btn.textContent = 'Select it';   // clipboard API needs a secure context
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function step(d) { stop(); state.i = clampStep(state.i + d); render(); }
function jump(v) { stop(); state.i = clampStep(v); render(); }
function reset() { stop(); state.i = 0; render(); }

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  el('btn-play').textContent = '▶';
}

function play() {
  if (state.timer) { stop(); return; }
  if (state.i >= state.frames.length - 1) state.i = 0;
  el('btn-play').textContent = '❙❙';
  state.timer = setInterval(() => {
    if (state.i >= state.frames.length - 1) { stop(); return; }
    state.i += 1;
    render();
  }, state.speed);
}

/* ------------------------------------------------------------------ */
/* Deep links: #animation-id/mode-id/step                              */
/* ------------------------------------------------------------------ */

let suppressHash = false;

function writeHash() {
  suppressHash = true;
  location.replace(`#${state.anim.id}/${state.mode}/${state.i}`);
  setTimeout(() => { suppressHash = false; }, 0);
}

function readHash() {
  const [id, mode, step] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!id) return false;
  if (!animations.some((a) => a.id === id)) return false;
  selectAnimation(id, mode, step);
  return true;
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
}

function toggleNotes(force) {
  const p = el('notes-panel');
  const open = force !== undefined ? force : p.hidden;
  p.hidden = !open;
  el('btn-notes').setAttribute('aria-pressed', String(open));
}

/* Presentation mode is a class flip on <body>, never the Fullscreen API -
   the API is unavailable in several embedding contexts and leaves a dead
   control behind when it fails. */
function togglePresent(force) {
  const on = force !== undefined ? force : !document.body.classList.contains('presenting');
  document.body.classList.toggle('presenting', on);
  el('btn-present').setAttribute('aria-pressed', String(on));
}

function toggleHelp(force) {
  const h = el('help');
  h.hidden = force !== undefined ? !force : !h.hidden;
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  el('btn-play').onclick = play;
  el('btn-prev').onclick = () => step(-1);
  el('btn-next').onclick = () => step(1);
  el('scrub').oninput = (e) => jump(e.target.value);
  el('speed').onchange = (e) => {
    state.speed = parseInt(e.target.value, 10);
    if (state.timer) { stop(); play(); }
  };
  el('yaml-copy').onclick = copyYaml;
  el('btn-theme').onclick = toggleTheme;
  el('btn-notes').onclick = () => toggleNotes();
  el('btn-present').onclick = () => togglePresent();
  el('btn-help').onclick = () => toggleHelp(true);
  el('help-close').onclick = () => toggleHelp(false);
  el('help').onclick = (e) => { if (e.target === el('help')) toggleHelp(false); };

  window.addEventListener('hashchange', () => { if (!suppressHash) readHash(); });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); play(); return; }
    if (k === 'ArrowRight') { step(1); return; }
    if (k === 'ArrowLeft') { step(-1); return; }
    if (k === 'Home') { jump(0); return; }
    if (k === 'End') { jump(state.frames.length - 1); return; }
    if (k === 'r' || k === 'R') { reset(); return; }
    if (k === 'n' || k === 'N') { toggleNotes(); return; }
    if (k === 't' || k === 'T') { toggleTheme(); return; }
    if (k === 'f' || k === 'F') { togglePresent(); return; }
    if (k === '?') { toggleHelp(true); return; }
    if (k === 'Escape') {
      if (!el('help').hidden) toggleHelp(false);
      else if (document.body.classList.contains('presenting')) togglePresent(false);
      return;
    }
    if (k === 'j' || k === 'J' || k === 'k' || k === 'K') {
      const idx = animations.findIndex((a) => a.id === state.anim.id);
      const next = (k.toLowerCase() === 'k' ? idx + 1 : idx - 1 + animations.length) % animations.length;
      selectAnimation(animations[next].id);
      return;
    }
    if (/^[1-9]$/.test(k)) {
      const m = state.anim.modes[parseInt(k, 10) - 1];
      if (m) selectMode(m.id);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) document.documentElement.dataset.theme = saved;
    else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.theme = 'dark';
  } catch (e) { /* ignore */ }

  buildSidebar();
  wire();
  if (!readHash()) selectAnimation(animations[0].id);
}

boot();
