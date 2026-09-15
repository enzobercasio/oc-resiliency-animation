/**
 * Rolling update strategy: maxSurge vs maxUnavailable.
 *
 * A deliberately separate animation from the drain-based ones, because the two
 * are constantly confused. A Deployment rollout is the controller replacing its
 * own pods - it never calls the eviction API, so a PodDisruptionBudget does not
 * constrain it. These two fields do.
 *
 * Frame shape:
 *   { pods: [{ v: 1|2, s: 'r'|'p'|'t' }], note, badge, focus }
 */

const DESIRED = 4;
const LANE_Y = { 1: 116, 2: 196 };
const POD_X = (i) => 150 + i * 82;

const MODES = [
  { id: 'surge', label: 'maxSurge: 1',
    caption: 'maxSurge: 1, maxUnavailable: 0 — a new pod is added before any old one is removed' },
  { id: 'unavailable', label: 'maxUnavailable: 1',
    caption: 'maxSurge: 0, maxUnavailable: 1 — an old pod is removed before its replacement exists' },
  { id: 'defaults', label: 'The 25% default',
    caption: 'maxSurge: 25%, maxUnavailable: 25% — both levers at once, which is what you get if you set neither' },
];

function buildFrames(modeId) {
  const f = [];
  let pods = Array.from({ length: DESIRED }, () => ({ v: 1, s: 'r' }));
  const push = (note, badge, focus) => f.push({ pods: pods.map((p) => ({ ...p })), note, badge, focus });

  push('Steady state: four replicas on the old version',
    'A rollout replaces these in place. Note this is the controller replacing its own pods, not an eviction',
    ['replicas: 4']);

  for (let cycle = 0; cycle < DESIRED; cycle += 1) {
    const oldIdx = pods.findIndex((p) => p.v === 1 && p.s === 'r');

    if (modeId === 'surge') {
      pods.push({ v: 2, s: 'p' });
      push(`Surge pod ${cycle + 1} of 4 is created — total is now 5`,
        'Capacity never dips: all four old pods are still serving while the new one starts',
        ['maxSurge: 1', 'maxUnavailable: 0']);
      pods[pods.length - 1].s = 'r';
      pods.splice(oldIdx, 1);
      push('It passes readiness, and only then is an old pod removed',
        'Four serving throughout — but you needed one extra pod\u2019s worth of cluster capacity to do it',
        ['maxSurge: 1']);
    }

    if (modeId === 'unavailable') {
      pods.splice(oldIdx, 1);
      pods.push({ v: 2, s: 'p' });
      push(`Old pod ${cycle + 1} of 4 is removed first, then replaced`,
        'Total never exceeds four, but only three are serving while the new pod starts cold',
        ['maxSurge: 0', 'maxUnavailable: 1']);
      pods[pods.length - 1].s = 'r';
      push('The replacement passes readiness — back to four serving',
        'No extra capacity was needed. You paid for it in availability instead',
        ['maxUnavailable: 1']);
    }

    if (modeId === 'defaults') {
      pods[oldIdx].s = 't';
      pods.push({ v: 2, s: 'p' });
      push(`Cycle ${cycle + 1} of 4: both levers move at once`,
        'One old pod terminating AND one surge pod starting — total 5, serving 3',
        ['maxSurge: 25%', 'maxUnavailable: 25%']);
      pods[pods.length - 1].s = 'r';
      pods = pods.filter((p) => p.s !== 't');
      push('The new pod is ready and the old one is gone',
        'Faster than either pure strategy, and it briefly costs you both capacity and availability',
        ['maxSurge: 25%']);
    }
  }

  const closing = {
    surge: ['Rollout complete — four serving at every single step',
      'The right default for anything customer-facing, provided you have the spare capacity for the surge pod'],
    unavailable: ['Rollout complete — but you ran at three of four for most of it',
      'Appropriate on a capacity-constrained cluster where a surge pod would simply stay Pending'],
    defaults: ['Rollout complete — this is what you get if you set neither field',
      'Fine for a stateless internal service. Rarely what you want for a payments API'],
  }[modeId];
  push(closing[0], closing[1], ['strategy:']);
  return f;
}

function renderSVG(frame) {
  let out = '';

  [1, 2].forEach((v) => {
    out += `<text class="svg-sub on-node" x="40" y="${LANE_Y[v] + 18}" text-anchor="start">`
        + `${v === 1 ? 'v1 (old)' : 'v2 (new)'}</text>`;
    out += `<line class="track-line" x1="140" y1="${LANE_Y[v] + 44}" x2="640" y2="${LANE_Y[v] + 44}"/>`;
  });

  const lane = { 1: 0, 2: 0 };
  frame.pods.forEach((p) => {
    const i = lane[p.v];
    lane[p.v] += 1;
    const cls = p.s === 'r' ? 'run' : p.s === 't' ? 'term' : 'pend';
    const label = p.s === 'r' ? `v${p.v}` : p.s === 't' ? 'term' : 'init';
    out += `<g class="pod ${cls}"><rect x="${POD_X(i)}" y="${LANE_Y[p.v]}" width="70" height="36" rx="6"/>`
        + `<text class="svg-sub" x="${POD_X(i) + 35}" y="${LANE_Y[p.v] + 18}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  });

  const total = frame.pods.length;
  const serving = frame.pods.filter((p) => p.s === 'r').length;
  out += `<text class="svg-sub on-node" x="40" y="276" text-anchor="start">desired ${DESIRED}</text>`;
  out += `<line class="marker-line" x1="140" y1="272" x2="640" y2="272"/>`;
  out += `<text class="legend-text" x="140" y="292">total pods ${total} · serving ${serving} · a surge pod above 4 needs spare cluster capacity or it stays Pending</text>`;
  return out;
}

function metrics(frame) {
  const total = frame.pods.length;
  const serving = frame.pods.filter((p) => p.s === 'r').length;
  const neu = frame.pods.filter((p) => p.v === 2 && p.s === 'r').length;
  return [
    { label: 'Total pods', value: String(total), tone: total > DESIRED ? 'warn' : 'ok' },
    { label: 'Serving', value: `${serving} / ${DESIRED}`, tone: serving === DESIRED ? 'ok' : serving === 0 ? 'bad' : 'warn' },
    { label: 'On new version', value: `${neu} / ${DESIRED}` },
    { label: 'Extra capacity', value: total > DESIRED ? `+${total - DESIRED} pod` : 'none needed', tone: total > DESIRED ? 'warn' : 'ok' },
  ];
}

const YAML = {
  surge: `apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080

# maxUnavailable: 0 means a surge pod must fit somewhere.
# Its resources.requests decide whether it can be scheduled
# at all - if nothing fits, it stays Pending and the rollout
# stalls rather than failing loudly.
`,
  unavailable: `apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080

# maxSurge: 0 needs no spare capacity at all, which is why
# it suits a tightly packed cluster. The cost is that you
# run at 3 of 4 for the whole rollout.
`,
  defaults: `apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 4
  # strategy omitted entirely - these are the defaults:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%

# Percentages are rounded up for surge, down for unavailable.
# With an HPA moving the replica count, percentages stay
# correct where a fixed number silently goes stale.
#
# A PodDisruptionBudget does NOT constrain any of this:
# the controller deletes its own pods rather than evicting.
`,
};

const F = {
  surge: { name: 'maxSurge', kind: 'rollingUpdate', what: 'How many pods may exist above the desired count during a rollout. Adds the new pod before removing an old one, so capacity never dips — at the cost of needing somewhere to put it.' },
  unavail: { name: 'maxUnavailable', kind: 'rollingUpdate', what: 'How many pods may be missing below the desired count. Removes an old pod first, so no extra capacity is needed — at the cost of running short while the replacement starts.' },
  strategy: { name: 'strategy.type', kind: 'Deployment', what: 'RollingUpdate replaces pods gradually. Recreate terminates every pod before starting any new one — correct only where two versions genuinely cannot coexist.' },
  resources: { name: 'resources.requests', kind: 'container', what: 'What the scheduler reserves. It decides whether a surge pod fits anywhere at all; with maxUnavailable: 0 and no room, the rollout stalls on a Pending pod rather than failing visibly.' },
  limits: { name: 'resources.limits', kind: 'container', what: 'The ceiling enforced at runtime. Exceeding a memory limit gets the container OOM-killed, which is an involuntary disruption no budget or constraint protects against.' },
  probe: { name: 'readinessProbe', kind: 'container', what: 'Decides when a new pod counts as available. An inaccurate probe lets the rollout move to the next pod too early, so the strategy is satisfied on paper while real capacity is not.' },
  hpa: { name: 'HorizontalPodAutoscaler', kind: 'autoscaling/v2', what: 'Moves spec.replicas based on load. Express surge and unavailable as percentages when an HPA is in play, or a fixed number becomes wrong the moment it scales.' },
  pdbNot: { name: 'PodDisruptionBudget', kind: 'policy/v1', what: 'Listed for what it does NOT do here: the deployment controller deletes its own pods rather than evicting them, so a PDB never constrains a rollout. A frequent and expensive misconception.' },
};

const FEATURES = {
  surge: [F.strategy, F.surge, F.unavail, F.resources, F.probe, F.pdbNot],
  unavailable: [F.strategy, F.unavail, F.surge, F.resources, F.limits, F.probe],
  defaults: [F.strategy, F.surge, F.unavail, F.hpa, F.pdbNot],
};

const NOTES = {
  surge: [
    { heading: 'What to point at', text: 'Total pods hits 5 while serving stays at 4. The extra pod is the price of never dipping.' },
    { heading: 'The catch', text: 'The surge pod has to fit somewhere. On a full cluster it stays Pending and the rollout quietly stalls rather than failing.' },
    { ask: 'Do your clusters carry enough headroom for one extra pod per rolling workload?' },
  ],
  unavailable: [
    { heading: 'What to point at', text: 'Total never exceeds 4, serving sits at 3 for most of the rollout. Same event, opposite trade.' },
    { heading: 'When this is right', text: 'A capacity-constrained cluster where a surge pod would never schedule. Choosing this deliberately is fine; inheriting it by accident is not.' },
    { ask: 'Which of your rollouts are running this way because someone chose it, versus because nobody set the field?' },
  ],
  defaults: [
    { heading: 'The point of this mode', text: 'This is what you get if you write no strategy block at all — both levers moving, briefly costing capacity and availability together.' },
    { heading: 'Line that lands', text: 'A PodDisruptionBudget does not constrain a rollout. The controller deletes its own pods; it never calls the eviction API.' },
    { ask: 'Has anyone on your team assumed the PDB was protecting deployments as well as drains?' },
  ],
};

export default {
  id: 'rollout-strategy',
  advanced: true,
  title: 'Rolling update: maxSurge vs maxUnavailable',
  summary: 'How a Deployment replaces its own pods during an application rollout, and why a pod disruption budget has nothing to do with it.',
  description: 'Four replicas moving from an old version to a new one under three different rolling update strategies.',
  viewBox: '0 0 680 310',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
