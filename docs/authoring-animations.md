# Authoring animations

An animation is a single ES module under `js/animations/` exporting one default
object. The player imports it, drives frames, and paints whatever SVG string you
return. It has no Kubernetes knowledge and no opinion about your subject.

---

## The contract

```js
export default {
  // required
  id: 'my-animation',          // URL-safe; used in deep links
  title: 'Sidebar title',
  summary: 'One line shown under the title',
  modes: [ { id, label, caption } ],
  buildFrames(modeId) -> Frame[],
  renderSVG(frame, ctx) -> string,

  // optional
  viewBox: '0 0 680 350',      // defaults to '0 0 680 350'
  description: '…',            // screen-reader <desc> for the canvas
  metrics(frame, history) -> Metric[],
  speakerNotes(modeId) -> NoteBlock[],
  yaml(modeId) -> string,              // manifest shown in the config column
  features(modeId) -> Feature[],       // feature outline under the manifest
};
```

### Frame

Any shape you like, plus two fields the player reads:

```js
{
  note:  'The headline sentence for this step',   // rendered large
  badge: 'The supporting detail',                 // rendered small and muted
  /* …whatever your renderSVG needs… */
}
```

Give every frame a `note`. A frame with no narration is a frame the presenter
has to improvise over.

### Metric

```js
{ label: 'Ready now', value: '6 / 6', tone: 'ok' }   // tone: 'ok' | 'warn' | 'bad' | undefined
```

Keep to three or four. `value` must be a string or number — never `undefined`,
which renders literally.

### NoteBlock

```js
{ heading: 'What to point at', text: 'The ready count never leaves 6 of 6.' }
{ ask: 'A question to put to the room' }            // rendered with an accent rule
```

Notes are per mode. The most useful shape is two blocks and one `ask`: what to
point at, the line that lands, and the question that hands the conversation back.

---

## Rules that keep it looking right

**Never write a literal colour.** Use the semantic classes below, all defined in
`css/app.css` against variables in `css/tokens.css`. A hardcoded `#333` is
invisible in dark mode, which you will not notice until you are presenting in a
dark room.

| Class | Use |
|---|---|
| `.node-rect` | A container box (node, region, boundary) |
| `.node-rect.cordoned` / `.rebooting` | Same box in a dashed non-ready state |
| `.pod.run` / `.term` / `.pend` | A small state-carrying box: ready / terminating / starting |
| `.svg-title.on-node` | 14px medium label |
| `.svg-sub.on-node` | 12px muted label |
| `.legend-text` | 12px caption, usually along the bottom |
| `.track-line` | A solid connector or axis |
| `.marker-line` | A dashed leader, playhead or bypass path |

Put `.pod.run` etc. on a `<g>` wrapping both the `<rect>` and its `<text>` — the
text colour is a descendant rule, so a bare `<rect class="pod run">` renders with
the wrong label colour.

**Never rely on colour alone.** Every state also carries a stroke pattern: solid
for ready, `4 3` dashes for terminating, `2 4` for starting. This is already in
the CSS; do not override it.

**Stay inside the viewBox.** Width is fixed at 680 so coordinate units render 1:1
with CSS pixels. Before committing, run the bounds check:

```bash
node tools/check-bounds.mjs
```

**Text does not wrap in SVG.** At 12px, budget roughly 7px per character; at
14px, roughly 8px. A 60px box holds about 8 characters. If a label does not fit,
shorten it — put the detail in `badge`, which is HTML and wraps freely.

**Keep frames pure.** `renderSVG(frame)` must be a pure function of that one
frame. No module-level mutable state, no reading the previous frame. This is what
makes scrubbing backwards, deep-linking and reloading work without special cases.

---

## Frame count and pacing

At the default speed each frame is 1000ms.

| Frames | Runtime | Verdict |
|---|---|---|
| 5–12 | 5–12s | Ideal for a single concept |
| 13–25 | 13–25s | Fine for a multi-stage process |
| 26–40 | 26–40s | Only with a scrubber, and expect to step manually |
| 40+ | — | Split it into two animations |

The `c-pdb-only` mode of the upgrade animation runs to 35 frames because every
eviction is serialised — that length *is* the point being made, but present it by
stepping rather than playing.

---

## The config column

Two optional fields drive the pair of panels beneath the transport.

`yaml(modeId)` returns the manifest for that mode as a plain string. Show only
the fields the animation is about — a full production Deployment buries the point
under image pull policies. **Keep every line to 64 characters or fewer**: the
manifest shares the stage width with the feature outline, and a longer line
scrolls horizontally, which is bad in a live session. `check-animations.mjs`
fails the build on any line over budget. Use comments to make absence visible, because a
missing PDB is exactly what a partial configuration is trying to convey:

```yaml
      # no topologySpreadConstraints
      # the scheduler is free to bin-pack every replica onto one node
```

`features(modeId)` returns the outline rendered underneath:

```js
{ name: 'topologySpreadConstraints', kind: 'pod spec',
  what: 'One or two sentences on what it does and where it bites.' }
```

`kind` is the API group, resource or field path — whatever tells a reader where
the thing lives. Order features in the order the animation touches them.

### Highlighting lines as frames advance

Any frame may carry `focus`, an array of substrings. Manifest lines containing
any of them are highlighted while that frame is showing:

```js
push('Evicting one replica at a time', 'The budget allows exactly one',
     ['minAvailable', 'kind: PodDisruptionBudget']);
```

Two rules, both enforced by `tools/check-animations.mjs`:

- **Every focus string must match a line in that mode's manifest.** A string that
  matches nothing is a highlight that silently does nothing. This is easy to get
  wrong when modes share frame-building code but have different manifests — the
  `focus` then has to be conditional on the mode, exactly as the replacement-pod
  frame in `upgrade-resiliency` is.
- **At least one frame per mode should highlight something**, or the panel is
  just decoration sitting next to the animation.

---

## Showing and hiding elements

If you add UI that JS toggles with the `hidden` attribute, know this: `[hidden] {
display: none }` lives in the **user-agent** stylesheet, and any author-origin
`display` declaration beats it regardless of specificity. An element with
`display: flex` in `css/app.css` will therefore ignore `hidden` entirely — it
renders on page load and its close button appears to do nothing.

`css/app.css` carries a global guard for exactly this:

```css
[hidden] { display: none !important; }
```

Do not remove it, and do not work around a stuck overlay by adding
`style="display:none"` from JS — that diverges from the attribute the rest of the
code reads. `tools/check-hidden-toggles.mjs` fails the build if the guard goes
missing while anything still depends on it.

A note on testing this: jsdom does **not** model the UA-vs-author cascade
faithfully and reports these elements as correctly hidden either way, so a jsdom
test here gives false confidence. The static check is the reliable one.

---

## Worked example

A minimal two-frame animation:

```js
const MODES = [{ id: 'default', label: 'Default', caption: 'A worked example' }];

function buildFrames() {
  return [
    { on: false, note: 'Nothing is happening yet', badge: 'The steady state' },
    { on: true,  note: 'Now something is happening', badge: 'And here is why it matters' },
  ];
}

function renderSVG(frame) {
  return `<g class="pod ${frame.on ? 'term' : 'run'}">
      <rect x="280" y="140" width="120" height="44" rx="8"/>
      <text class="svg-sub" x="340" y="162" text-anchor="middle" dominant-baseline="central">
        ${frame.on ? 'busy' : 'idle'}
      </text>
    </g>`;
}

export default {
  id: 'worked-example',
  title: 'Worked example',
  summary: 'The smallest thing that works.',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics: (f) => [{ label: 'State', value: f.on ? 'busy' : 'idle', tone: f.on ? 'warn' : 'ok' }],
  speakerNotes: () => [{ heading: 'Point at', text: 'The box changes colour.' }],
};
```

Then two lines in `js/registry.js`:

```js
import workedExample from './animations/worked-example.js';
export const animations = [ /* … */ workedExample ];
```

Registry order is sidebar order, `J`/`K` cycle order, and therefore your running
order when presenting. Put the anchor animation first.

---

## Before you commit

```bash
node --check js/animations/your-file.js   # syntax
node tools/check-animations.mjs           # every frame of every mode builds and renders
node tools/check-bounds.mjs               # geometry inside the viewBox
node tools/check-hidden-toggles.mjs       # the [hidden] cascade guard is intact
node tools/check-links.mjs                # deep links in the docs still resolve
./scripts/serve.sh                        # then check it in BOTH themes (press T)
```

All five tools are dependency-free and safe to wire into CI.

The theme check is not optional. Dark mode is where hardcoded colours surface,
and it is the mode most people present in.
