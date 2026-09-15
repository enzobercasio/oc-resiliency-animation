/**
 * Topology spread constraints: the scheduler-native way to balance replicas
 * across a topology domain, and what a hard limit costs when it runs out of
 * room.
 *
 * Sits right after pod-affinity because it is the same hard-vs-soft question
 * that animation ended on, asked again one mechanism over: maxSkew is a
 * looser, more scalable promise than podAntiAffinity's "never share a node,"
 * and whenUnsatisfiable is exactly the required-vs-preferred choice from the
 * previous animation's third mode, wearing a different name.
 *
 * Frame shape:
 *   { zones: ['ready'|'cordoned', 'ready'|'cordoned', 'ready'|'cordoned'],
 *     pods: [{ id, n: idx|null, s: 'r'|'p' }],
 *     note, badge, focus }
 */

const ZONES = ['a', 'b', 'c'];
const ZONE_X = [40, 260, 480];
const ZONE_W = 190;
const ZONE_Y = 76;

const MODES = [
  { id: 'even', label: 'Even spread',
    caption: 'maxSkew: 1 keeps every zone within one replica of the others' },
  { id: 'hard-limit', label: 'DoNotSchedule blocks',
    caption: 'A hard whenUnsatisfiable rule leaves a pod Pending rather than widen the skew' },
  { id: 'soft-limit', label: 'ScheduleAnyway proceeds', advanced: true,
    caption: 'The soft version schedules anyway and lets the skew widen instead' },
];

function pod(id, n, s) { return { id, n, s }; }

function buildFrames(modeId) {
  const f = [];
  const push = (zones, pods, note, badge, extra = {}) => f.push({
    zones, pods: pods.map((p) => ({ ...p })), note, badge, ...extra,
  });
  const READY = ['ready', 'ready', 'ready'];

  if (modeId === 'even') {
    push(READY, [],
      'Deployment: replicas: 6, one topologySpreadConstraint, maxSkew: 1',
      'maxSkew caps the difference in pod count between the fullest and emptiest zone — not zero, one',
      { focus: ['maxSkew: 1', 'topologyKey'] });
    push(READY, [pod('web-1', 0, 'r'), pod('web-2', 1, 'r'), pod('web-3', 2, 'r')],
      'First three replicas land one per zone',
      'With nothing placed yet, every zone is equally empty — any one is a valid start');
    push(READY, [pod('web-1', 0, 'r'), pod('web-2', 1, 'r'), pod('web-3', 2, 'r'), pod('web-4', 0, 'r')],
      'web-4 could go anywhere and keep skew at 0 — it lands in zone a',
      'Once zones differ, the scheduler prefers whichever placement keeps skew lowest');
    push(READY, [pod('web-1', 0, 'r'), pod('web-2', 1, 'r'), pod('web-3', 2, 'r'), pod('web-4', 0, 'r'), pod('web-5', 1, 'r'), pod('web-6', 2, 'r')],
      'web-5 and web-6 fill in the same way',
      'Two per zone, skew back to 0');
    push(READY, [pod('web-1', 0, 'r'), pod('web-2', 1, 'r'), pod('web-3', 2, 'r'), pod('web-4', 0, 'r'), pod('web-5', 1, 'r'), pod('web-6', 2, 'r')],
      'Six replicas, two per zone, skew never exceeded 1',
      'Compare to podAntiAffinity from the last animation: that guaranteed at most one pod per node. This guarantees at most a one-replica gap between zones — a looser, more scalable promise');
  }

  if (modeId === 'hard-limit' || modeId === 'soft-limit') {
    const settled = [pod('web-1', 0, 'r'), pod('web-2', 1, 'r'), pod('web-3', 2, 'r'),
      pod('web-4', 0, 'r'), pod('web-5', 1, 'r'), pod('web-6', 2, 'r')];

    push(READY, settled,
      'Steady state: two per zone, skew 0',
      'Same six replicas as the last mode, before anything changes');
    push(['ready', 'ready', 'cordoned'], settled,
      'Zone c is cordoned for maintenance',
      "Its two replicas keep running — nothing new can land there until it's uncordoned");
    push(['ready', 'ready', 'cordoned'], [...settled, pod('web-7', 0, 'r')],
      'Scale to replicas: 7 — it lands in zone a',
      'Zone a: 3, zone b: 2, zone c: 2 (cordoned, but still counted) — skew is 1, still in budget',
      { focus: ['maxSkew: 1'] });
    push(['ready', 'ready', 'cordoned'], [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r')],
      'Scale to replicas: 8 — zone b balances it back out',
      'Zone a: 3, zone b: 3, zone c: 2 — skew is 1 again, right at the limit');

    if (modeId === 'hard-limit') {
      push(['ready', 'ready', 'cordoned'],
        [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r'), pod('web-9', null, 'p')],
        'Scale to replicas: 9 — every remaining zone would push skew to 2',
        'Zone a to 4, or zone b to 4 — either way the gap to zone c is 2, past maxSkew: 1',
        { focus: ['maxSkew: 1'] });
      push(['ready', 'ready', 'cordoned'],
        [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r'), pod('web-9', null, 'p')],
        'web-9 stays Pending — not crash-looping, not scheduled somewhere worse',
        'DoNotSchedule means no placement at all beats a placement that breaks the constraint',
        { focus: ['whenUnsatisfiable: DoNotSchedule'] });
      push(['ready', 'ready', 'cordoned'],
        [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r'), pod('web-9', null, 'p')],
        'The only way out: uncordon zone c, add a node, or relax the constraint',
        'A hard spread constraint can block a scale-up exactly like a hard anti-affinity rule can');
    } else {
      push(['ready', 'ready', 'cordoned'],
        [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r'), pod('web-9', 0, 'r')],
        'Scale to replicas: 9 — ScheduleAnyway lets it land in zone a anyway',
        'Zone a: 4, zone b: 3, zone c: 2 — skew is now 2, past what the constraint asked for',
        { focus: ['whenUnsatisfiable: ScheduleAnyway'] });
      push(['ready', 'ready', 'cordoned'],
        [...settled, pod('web-7', 0, 'r'), pod('web-8', 1, 'r'), pod('web-9', 0, 'r')],
        'Nine replicas, all running, skew wider than requested',
        'The constraint became a preference the moment it could not be kept exactly');
    }
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  const queued = frame.pods.filter((p) => p.n === null);
  out += '<text class="legend-text" x="40" y="16">scheduler queue</text>';
  queued.forEach((p, i) => {
    const x = 40 + i * 100;
    out += `<g class="pod pend"><rect x="${x}" y="22" width="90" height="32" rx="6"/>`
        + `<text class="svg-sub" x="${x + 45}" y="39" text-anchor="middle" dominant-baseline="central">${p.id}</text></g>`;
  });

  frame.zones.forEach((st, n) => {
    const cls = st === 'ready' ? 'node-rect' : 'node-rect cordoned';
    out += `<rect class="${cls}" x="${ZONE_X[n]}" y="${ZONE_Y}" width="${ZONE_W}" height="170" rx="12"/>`;
    out += `<text class="svg-title on-node" x="${ZONE_X[n] + ZONE_W / 2}" y="${ZONE_Y + 22}" text-anchor="middle" dominant-baseline="central">zone ${ZONES[n]}</text>`;
    out += `<text class="svg-sub on-node" x="${ZONE_X[n] + ZONE_W / 2}" y="${ZONE_Y + 40}" text-anchor="middle" dominant-baseline="central">${st}</text>`;
  });

  const slot = [0, 0, 0];
  frame.pods.filter((p) => p.n !== null).forEach((p) => {
    const k = slot[p.n];
    slot[p.n] += 1;
    const col = k % 2;
    const row = (k - col) / 2;
    const x = ZONE_X[p.n] + 14 + col * 84;
    const y = ZONE_Y + 70 + row * 44;
    const cls = p.s === 'r' ? 'run' : 'pend';
    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="76" height="36" rx="6"/>`
        + `<text class="svg-sub" x="${x + 38}" y="${y + 18}" text-anchor="middle" dominant-baseline="central">${p.id}</text></g>`;
  });

  out += '<text class="legend-text" x="40" y="332">solid = ready · dashed = pending or queued · dashed zone = cordoned</text>';
  return out;
}

function metrics(frame) {
  const counts = [0, 0, 0];
  frame.pods.forEach((p) => { if (p.n !== null) counts[p.n] += 1; });
  const scheduled = frame.pods.filter((p) => p.n !== null).length;
  const total = frame.pods.length;
  const skew = scheduled ? Math.max(...counts) - Math.min(...counts) : 0;

  return [
    { label: 'Scheduled', value: `${scheduled} / ${total}`, tone: scheduled === total ? 'ok' : 'warn' },
    { label: 'Skew', value: String(skew), tone: skew > 1 ? 'bad' : skew === 1 ? 'warn' : 'ok' },
    { label: 'Zones used', value: String(counts.filter((c) => c > 0).length) },
  ];
}

const NOTES = {
  even: [
    { heading: 'What to point at', text: 'Each pair of replicas lands one per zone, holding skew at 0 or 1 the whole time with nobody choosing placement by hand.' },
    { heading: 'Line that lands', text: 'Compare this to the anti-affinity you just showed: that guaranteed at most one pod per node. This guarantees at most a one-replica gap between zones — a looser, more scalable promise for larger deployments.' },
    { ask: 'How many of your Deployments declare a topologySpreadConstraint today, versus just a replica count and hope?' },
  ],
  'hard-limit': [
    { heading: 'What to point at', text: 'Zone c stays cordoned and still counts toward the skew calculation — the 9th replica has no legal zone left, even though nothing actually failed.' },
    { heading: 'Line that lands', text: 'DoNotSchedule is the exact same hard-versus-soft choice as required-versus-preferred anti-affinity, one animation earlier — the same tradeoff shows up in both mechanisms.' },
    { ask: 'If a zone in your cluster went into maintenance right now, would you notice a stuck scale-up before someone paged you about it?' },
  ],
  'soft-limit': [
    { heading: 'What to point at', text: 'The 9th replica lands in zone a anyway, and skew quietly grows from 1 to 2.' },
    { heading: 'Line that lands', text: 'ScheduleAnyway keeps the deployment moving, but the constraint you wrote is no longer a promise — only a preference the scheduler tried to honor.' },
    { ask: 'Do you know today which of your topologySpreadConstraints are DoNotSchedule and which are ScheduleAnyway?' },
  ],
};

const YAML = {
  even: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 6
  template:
    metadata:
      labels:
        app: web
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: web
      containers:
        - name: web
          image: ubi9/httpd-24:latest
`,
  'hard-limit': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 9
  template:
    metadata:
      labels:
        app: web
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: web
      containers:
        - name: web
          image: ubi9/httpd-24:latest
      # zone c cordoned - nothing new lands there
`,
  'soft-limit': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 9
  template:
    metadata:
      labels:
        app: web
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: web
      containers:
        - name: web
          image: ubi9/httpd-24:latest
      # zone c cordoned - 9th lands anyway, skew widens
`,
};

const FEATURES = {
  even: [
    { name: 'topologySpreadConstraints', kind: 'pod spec',
      what: 'Tells the scheduler how to balance pods across a topology domain, rather than just declaring a replica count and hoping.' },
    { name: 'maxSkew', kind: 'topologySpreadConstraints',
      what: 'The maximum allowed difference in matching pod count between the fullest and emptiest domain.' },
    { name: 'topologyKey', kind: 'topologySpreadConstraints',
      what: 'Which node label defines a domain. topology.kubernetes.io/zone groups by zone; kubernetes.io/hostname would make it per-node instead.' },
    { name: 'whenUnsatisfiable', kind: 'topologySpreadConstraints',
      what: 'DoNotSchedule (hard) or ScheduleAnyway (soft) — what happens when no placement can satisfy maxSkew.' },
  ],
  'hard-limit': [
    { name: 'whenUnsatisfiable: DoNotSchedule', kind: 'topologySpreadConstraints',
      what: 'Treats the skew limit as a hard requirement — a pod that cannot satisfy it stays Pending rather than land somewhere uneven.' },
    { name: 'maxSkew', kind: 'topologySpreadConstraints',
      what: 'The maximum allowed difference in matching pod count between the fullest and emptiest domain.' },
    { name: 'kube-scheduler', kind: 'control plane',
      what: 'Re-evaluates every domain on every attempt. A cordoned zone still counts toward the skew calculation even though it cannot receive new pods.' },
  ],
  'soft-limit': [
    { name: 'whenUnsatisfiable: ScheduleAnyway', kind: 'topologySpreadConstraints',
      what: 'Treats the skew limit as a soft preference — the scheduler favors placements that satisfy it but never refuses to schedule because of it.' },
    { name: 'maxSkew', kind: 'topologySpreadConstraints',
      what: 'The same limit as the hard mode, now advisory rather than enforced.' },
  ],
};

export default {
  id: 'topology-spread',
  title: 'Topology spread constraints: maxSkew and whenUnsatisfiable',
  summary: 'The scheduler-native way to balance replicas across zones, and what happens when a hard limit runs out of room.',
  description: 'Replicas scheduled across three zones under a topologySpreadConstraint, including a cordoned zone that eventually blocks or bends the constraint depending on whenUnsatisfiable.',
  viewBox: '0 0 680 350',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
