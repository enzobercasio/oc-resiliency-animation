# OpenShift resiliency — animated explainers

A zero-dependency static site for **presenting** the workload-resiliency
concepts: a rolling upgrade across three zones, voluntary vs involuntary
disruption, and the graceful-shutdown ordering race.

Built to be driven live in front of a customer — keyboard transport, speaker
notes, a presentation mode that strips the chrome, and deep links so you can
jump straight to the frame you want to open on.

Under every animation, side by side, sit the **manifest for the active scenario**
and an **outline of the features in play**: switching modes swaps the YAML, so a
partial configuration reads as a diff against the golden path, and the lines each
step is about highlight as the animation runs.

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
| **Multi-replica pods: what `replicas: N` buys you** | The reconciliation loop, the automatic pod recovery it genuinely provides, and the two questions a replica count never answers |
| **Pod affinity and anti-affinity: who schedules together** | A rule that pulls related pods onto one node, one that holds replicas apart, and a required rule with nowhere left to go |
| **Topology spread constraints: maxSkew and whenUnsatisfiable** | The scheduler-native way to balance replicas across zones, and a hard limit that runs out of room |
| **Pod disruption budgets: minAvailable, maxUnavailable, and getting stuck** | An absolute floor vs a percentage ceiling, a floor that deadlocks a drain by design, and a replacement pod that never becomes Ready |
| **Voluntary vs involuntary disruption** | Why a drain is admission-checked against the PDB and a node failure simply isn't |
| **Rolling upgrade: four configurations** | The same six-replica workload drained across three zones with Spread+PDB, spread only, PDB only, and neither |
| **Startup, readiness, and liveness probes: three different questions** | Readiness gates traffic, liveness restarts a hung container, and a slow starter crash-loops without a startupProbe |
| **Graceful shutdown: the ordering race** | Why a pod returns 502s at full replica count without a `preStop` hook |
| *Going deeper* | |
| **Requests and limits: reservation vs ceiling** | QoS classes, kubelet eviction order under node pressure, and why a drained pod can fail to fit |
| **PriorityClass and preemption: who gets to keep the room** | A pod that preempts a lower-priority one to fit, and a PodDisruptionBudget that preemption never consults |
| **HPA, VPA, and ClusterResourceOverride** | Horizontal scales how many, vertical scales how much, running both fights, and an admission webhook can rewrite either one |
| **MachineConfigPools: how many nodes at once** | Pool concurrency and custom pools — the cluster-level control that sets the shape of the upgrade |
| **Rolling update: maxSurge vs maxUnavailable** | A Deployment replacing its own pods, and why a PDB has nothing to do with it |
| **StatefulSets: when pods are not interchangeable** | Stable identity, ordered rollouts, and the volume attach that dominates stateful recovery time |
| **PersistentVolumeClaims and PersistentVolumes: binding, zones, and reclaim** | How a claim becomes a volume, a binding-mode zone mismatch that strands a pod, and what reclaimPolicy does to the data |
| **RHOCP upgrade flow: CVO, ClusterOperators, and the control plane** | The graph every other animation happens inside, the control plane's one-node-at-a-time rule, and a Degraded operator that freezes the whole upgrade |

Each has 2–4 modes you switch between live, and they are ordered to build on
each other — start at the top.

The sidebar groups them into **Core** and **Going deeper**, and the **Beginner**
toggle in the top bar narrows it to the core eight — a complete session on its
own. An **advanced** pill on a mode tab marks a mode that is dense even for its
group; beginner mode hides those too.

Nothing is lost when the toggle is on: a button under the sidebar says how many
animations are hidden and switches back, and a deep link into hidden material
turns the toggle off rather than failing. The preference persists between
visits. `docs/presenting.md` has both running orders. The point of the modes is comparison:
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
| `B` | beginner mode — core set only |
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
