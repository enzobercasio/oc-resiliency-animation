# OpenShift resiliency — animated explainers

A zero-dependency static site for **presenting** the workload-resiliency
concepts: a rolling upgrade across three zones, voluntary vs involuntary
disruption, and the graceful-shutdown ordering race.

Built to be driven live in front of a customer — keyboard transport, speaker
notes, a presentation mode that strips the chrome, and deep links so you can
jump straight to the frame you want to open on.

No build step, no framework, no npm install. The repository root *is* the site.

---

## Run it

```bash
git clone <this-repo> && cd ocp-resiliency-showcase
./scripts/serve.sh            # http://localhost:8080
```

ES modules are blocked by CORS over `file://`, so it must be served over HTTP —
but any static server works. `python3 -m http.server` is all `serve.sh` does.

---

## What's in it

| Animation | What it shows |
|---|---|
| **Rolling upgrade: four configurations** | The same six-replica workload drained across three zones with Spread+PDB, spread only, PDB only, and neither |
| **Voluntary vs involuntary disruption** | Why a drain is admission-checked against the PDB and a node failure simply isn't |
| **Graceful shutdown: the ordering race** | Why a pod returns 502s at full replica count without a `preStop` hook |

Each has 2–4 modes you switch between live. The point of the modes is comparison:
run the same event twice and let the audience see the difference rather than
being told it.

---

## Presenting

| Key | Action |
|---|---|
| `Space` | play / pause |
| `←` `→` | step back / forward |
| `Home` `End` | first / last frame |
| `1`–`4` | switch scenario within the animation |
| `J` `K` | previous / next animation |
| `N` | speaker notes panel |
| `T` | light / dark |
| `F` | presentation mode (hides chrome, scales up) |
| `R` | reset to first frame |
| `Esc` | close overlay / leave presentation mode |
| `?` | shortcuts |

**Deep links.** Every frame is addressable as `#animation-id/mode-id/step`:

```
#upgrade-resiliency/a-none/0          open on the failure case
#upgrade-resiliency/d-full/26         the closing frame of the golden path
#disruption-types/involuntary/2       the moment the PDB is bypassed
```

Put those straight into a slide deck, a meeting invite or a follow-up email —
the audience lands exactly where you left off.

See [`docs/presenting.md`](docs/presenting.md) for a full running order with talk
tracks, or open the notes panel (`N`) which carries the same material per mode.

---

## Deploying

Three options, in increasing order of effort:

**GitHub Pages** — push to `main`. `.github/workflows/pages.yml` publishes the
repository root as-is. Enable Pages with source "GitHub Actions" once.

**Any static host** — Netlify, S3, an nginx sidecar. Copy `index.html`, `css/`
and `js/`. There is nothing to build.

**On OpenShift itself** — a nice touch when the audience is a platform team, and
the manifests deliberately practise what the animations preach (two replicas, a
spread constraint, a PDB, a readiness probe):

```bash
oc new-project resiliency-showcase
oc apply -f deploy/openshift.yaml
oc start-build resiliency-showcase --from-dir=. --follow
oc get route resiliency-showcase
```

Details in [`docs/deploying.md`](docs/deploying.md), including the air-gapped
route for customer sites with no internet egress.

---

## Adding an animation

An animation is one file exporting one object. The player knows nothing about
Kubernetes — it drives frames and paints whatever SVG string a module returns.

```js
export default {
  id: 'my-animation',
  title: 'Shown in the sidebar',
  summary: 'One line under the title',
  viewBox: '0 0 680 350',
  modes: [{ id: 'default', label: 'Default', caption: 'Shown under the tabs' }],
  buildFrames(modeId) { return [{ note: 'Step one', badge: 'detail' }]; },
  renderSVG(frame)    { return '<rect class="node-rect" x="40" y="40" width="100" height="60" rx="8"/>'; },
  metrics(frame, history) { return [{ label: 'Ready', value: '6 / 6', tone: 'ok' }]; },
  speakerNotes(modeId)    { return [{ heading: 'Point at', text: '…' }, { ask: 'A question for the room' }]; },
};
```

Register it in `js/registry.js` and it appears in the sidebar. Full contract,
styling classes and the geometry rules in
[`docs/authoring-animations.md`](docs/authoring-animations.md).

---

## Design constraints worth knowing

**Every colour comes from `css/tokens.css`.** Animations use semantic classes
(`.pod.run`, `.node-rect.cordoned`) rather than literal colours, so light and
dark mode both work and a customer-branded theme is a single file swap.

**Presentation mode is a CSS class, never the Fullscreen API.** The Fullscreen
API is unavailable or silently broken in several embedding contexts and leaves a
dead control behind when it fails. Flipping a class on `<body>` always works,
including inside an iframe in someone else's slide tool.

**Frames are pure data.** `buildFrames()` returns an array; `renderSVG()` is a
pure function of one frame. Nothing animates by mutating the DOM over time, which
is why scrubbing backwards, deep-linking to frame 26 and printing all work
without special cases.

**Motion is CSS transitions on fills and strokes only.** No animation library,
and `prefers-reduced-motion` disables them.

---

## Related

The runnable cluster demo — manifests, drain scripts and the pre-upgrade audit —
lives in the companion repository `ocp-workload-resiliency-demo`. These
animations explain the concepts; that repo proves them against a real cluster.
The usual sequence is animation first to build the mental model, then the live
drain to show it is not a cartoon.

## Contributing

No customer data in this repository. Use the generic vertical convention
(`FSI-1`, `HC-1`, `PS-1`, `TEL-1`) for any account reference.

## License

Apache License 2.0
