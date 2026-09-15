/**
 * Pod affinity and anti-affinity: who the scheduler will, and won't, put on
 * the same node.
 *
 * Sits right after multi-replica because it answers what that animation's
 * closing frame leaves open. podAntiAffinity is the rule that keeps replicas
 * apart - the fix for the "the-limit" scenario, one mechanism level below the
 * topology spread constraint the upgrade animation uses. podAffinity is the
 * same mechanism run in reverse, to pull a related pod toward one. The third
 * mode is the gotcha neither of the first two admits to: a required rule with
 * nowhere left to go leaves a pod Pending, not retried somewhere looser.
 *
 * Frame shape:
 *   { nodes: ['ready', 'ready', 'ready'],
 *     pods: [{ id, kind: 'api'|'cache'|'web', n: idx|null, s: 'r'|'p' }],
 *     nodeNote: [string, string, string] | undefined,
 *     note, badge, focus }
 */

const NODE_X = [40, 260, 480];
const NODE_W = 190;
const NODE_Y = 76;

const MODES = [
  { id: 'colocate', label: 'Affinity: pull together',
    caption: 'podAffinity requires cache to land on the same node as the api pod it talks to' },
  { id: 'apart', label: 'Anti-affinity: push apart',
    caption: "podAntiAffinity keeps replicas of the same app off each other's node" },
  { id: 'stuck', label: 'When required has no room', advanced: true,
    caption: 'The same required rule, one more replica than there are nodes to hold it' },
];

function pod(id, kind, n, s) { return { id, kind, n, s }; }

function buildFrames(modeId) {
  const f = [];
  const push = (pods, note, badge, extra = {}) => f.push({
    nodes: ['ready', 'ready', 'ready'],
    pods: pods.map((p) => ({ ...p })),
    note, badge, ...extra,
  });

  if (modeId === 'colocate') {
    push(
      [pod('api-1', 'api', 1, 'r')],
      'api is already running, scheduled on node 2',
      'One replica, already ready — this is the pod cache needs to sit beside',
    );
    push(
      [pod('api-1', 'api', 1, 'r'), pod('cache-1', 'cache', null, 'p')],
      'cache declares a podAffinity rule: land where api runs',
      'topologyKey: kubernetes.io/hostname means the exact same node, not just the same zone',
      { focus: ['podAffinity', 'requiredDuringSchedulingIgnoredDuringExecution'] },
    );
    push(
      [pod('api-1', 'api', 1, 'r'), pod('cache-1', 'cache', null, 'p')],
      'The scheduler checks every node against the rule',
      'Only a node already running a pod matching the label selector qualifies',
      { nodeNote: ['no api pod', 'match', 'no api pod'] },
    );
    push(
      [pod('api-1', 'api', 1, 'r'), pod('cache-1', 'cache', 1, 'p')],
      'Node 2 is the only match — cache is scheduled there',
      'Anywhere else would satisfy every other constraint and still be wrong for latency',
    );
    push(
      [pod('api-1', 'api', 1, 'r'), pod('cache-1', 'cache', 1, 'r')],
      'cache passes readiness next to the pod it talks to',
      'Same node means a loopback-speed hop instead of a network round trip to find it',
    );
  }

  if (modeId === 'apart') {
    push(
      [],
      'Same Deployment, replicas: 3, now with a podAntiAffinity rule',
      "The rule matches the Deployment's own labels — no replica may share a node with another",
      { focus: ['podAntiAffinity', 'requiredDuringSchedulingIgnoredDuringExecution'] },
    );
    push(
      [pod('web-1', 'web', 0, 'r')],
      'web-1 schedules first — every node still qualifies',
      'With nothing placed yet, the rule has nothing to exclude',
    );
    push(
      [pod('web-1', 'web', 0, 'r'), pod('web-2', 'web', 1, 'r')],
      'web-2 is scheduled — node 1 is now excluded for the rest',
      'One replica per node, enforced at scheduling time, not by convention',
    );
    push(
      [pod('web-1', 'web', 0, 'r'), pod('web-2', 'web', 1, 'r'), pod('web-3', 'web', 2, 'r')],
      'web-3 has exactly one legal node left',
      'Three replicas, three nodes, none of it left to luck',
    );
    push(
      [pod('web-1', 'web', 0, 'r'), pod('web-2', 'web', 1, 'r'), pod('web-3', 'web', 2, 'r')],
      'Compare this to replicas: 3 with no placement rule at all',
      'Nothing here stopped the scheduler bin-packing all three onto one node instead — the rule did',
    );
  }

  if (modeId === 'stuck') {
    const settled = [pod('web-1', 'web', 0, 'r'), pod('web-2', 'web', 1, 'r'), pod('web-3', 'web', 2, 'r')];
    push(
      [...settled, pod('web-4', 'web', null, 'p')],
      'Scale to replicas: 4 — same required rule, still three nodes',
      'Every node already holds a match, and the rule does not say "prefer" — it says "must not"',
      { focus: ['replicas: 4'] },
    );
    push(
      [...settled, pod('web-4', 'web', null, 'p')],
      'The scheduler checks all three nodes and rejects every one',
      "FailedScheduling: 0/3 nodes are available — 3 didn't match pod anti-affinity rules",
      { nodeNote: ['has web', 'has web', 'has web'] },
    );
    push(
      [...settled, pod('web-4', 'web', null, 'p')],
      'web-4 stays Pending — not crash-looping, not retried elsewhere. Waiting',
      'A fourth node joining the cluster is the only thing that unblocks it',
      { focus: ['requiredDuringSchedulingIgnoredDuringExecution'] },
    );
    push(
      [...settled, pod('web-4', 'web', null, 'p')],
      'preferredDuringSchedulingIgnoredDuringExecution would have scheduled it anyway',
      'Soft: best effort, always schedules. Hard: guaranteed spread, can block indefinitely — pick on purpose',
    );
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  // Scheduler queue: anything not yet assigned a node.
  const queued = frame.pods.filter((p) => p.n === null);
  out += '<text class="legend-text" x="40" y="16">scheduler queue</text>';
  queued.forEach((p, i) => {
    const x = 40 + i * 100;
    out += `<g class="pod pend"><rect x="${x}" y="22" width="90" height="32" rx="6"/>`
        + `<text class="svg-sub" x="${x + 45}" y="39" text-anchor="middle" dominant-baseline="central">${p.id}</text></g>`;
  });

  // Three nodes.
  frame.nodes.forEach((st, n) => {
    out += `<rect class="node-rect" x="${NODE_X[n]}" y="${NODE_Y}" width="${NODE_W}" height="170" rx="12"/>`;
    out += `<text class="svg-title on-node" x="${NODE_X[n] + NODE_W / 2}" y="${NODE_Y + 22}" text-anchor="middle" dominant-baseline="central">node ${n + 1}</text>`;
    out += `<text class="svg-sub on-node" x="${NODE_X[n] + NODE_W / 2}" y="${NODE_Y + 40}" text-anchor="middle" dominant-baseline="central">ready</text>`;
    if (frame.nodeNote && frame.nodeNote[n]) {
      out += `<text class="legend-text" x="${NODE_X[n] + NODE_W / 2}" y="${NODE_Y + 58}" text-anchor="middle">${frame.nodeNote[n]}</text>`;
    }
  });

  // Pods already placed on a node, two per row.
  const slot = [0, 0, 0];
  frame.pods.filter((p) => p.n !== null).forEach((p) => {
    const k = slot[p.n];
    slot[p.n] += 1;
    const col = k % 2;
    const row = (k - col) / 2;
    const x = NODE_X[p.n] + 14 + col * 84;
    const y = NODE_Y + 70 + row * 46;
    const cls = p.s === 'r' ? 'run' : 'pend';
    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="76" height="36" rx="6"/>`
        + `<text class="svg-sub" x="${x + 38}" y="${y + 18}" text-anchor="middle" dominant-baseline="central">${p.id}</text></g>`;
  });

  out += '<text class="legend-text" x="40" y="332">solid = ready · dashed = pending, queued or blocked</text>';
  return out;
}

function metrics(frame) {
  const total = frame.pods.length;
  const scheduled = frame.pods.filter((p) => p.n !== null).length;
  const ready = frame.pods.filter((p) => p.s === 'r').length;
  const nodesUsed = new Set(frame.pods.filter((p) => p.n !== null).map((p) => p.n)).size;

  return [
    { label: 'Scheduled', value: `${scheduled} / ${total}`, tone: scheduled === total ? 'ok' : 'warn' },
    { label: 'Ready', value: `${ready} / ${total}`, tone: ready === total ? 'ok' : 'warn' },
    { label: 'Nodes used', value: String(nodesUsed) },
  ];
}

const NOTES = {
  colocate: [
    { heading: 'What to point at', text: 'cache sitting in the scheduler queue while every node is checked, then landing next to api specifically.' },
    { heading: 'Line that lands', text: 'This is the opposite of the anti-affinity mode you are about to show — one rule pulls together, one holds apart, and it is the same mechanism both times.' },
    { ask: 'Do you have a pair of pods today that only ever talk across the network, purely because nothing told the scheduler they belong together?' },
  ],
  apart: [
    { heading: 'What to point at', text: 'Three replicas landing on three different nodes with no manual placement — the fix for the exact scenario multi-replica ended on.' },
    { heading: 'Line that lands', text: 'One rule, and the bin-packing that took the service down earlier in this session is no longer possible.' },
    { ask: 'Is this rule actually on any of your multi-replica deployments today, or did they just get lucky with placement?' },
  ],
  stuck: [
    { heading: 'What to point at', text: 'web-4 sitting Pending, unscheduled, next to three nodes each already claimed.' },
    { heading: 'Line that lands', text: 'required guarantees the spread and can block a rollout; preferred always schedules and never guarantees anything. Most teams pick one without knowing they had a choice.' },
    { ask: 'If this happened during a 2am scale-up, would your alerting say "Pending", or would it say nothing at all?' },
  ],
};

const YAML = {
  colocate: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: cache
spec:
  replicas: 1
  template:
    spec:
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - topologyKey: kubernetes.io/hostname
              labelSelector:
                matchLabels:
                  app: payments-api
      containers:
        - name: redis
          image: ubi9/redis-6:latest
`,
  apart: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: web
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - topologyKey: kubernetes.io/hostname
              labelSelector:
                matchLabels:
                  app: web
      containers:
        - name: web
          image: ubi9/httpd-24:latest
`,
  stuck: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 4
  template:
    metadata:
      labels:
        app: web
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            - topologyKey: kubernetes.io/hostname
              labelSelector:
                matchLabels:
                  app: web
      containers:
        - name: web
          image: ubi9/httpd-24:latest
      # only 3 nodes exist - the 4th replica has no legal node
`,
};

const FEATURES = {
  colocate: [
    { name: 'podAffinity', kind: 'affinity',
      what: 'Pulls a pod toward nodes that already run a match — the standard way to co-locate a cache or helper with the pod it serves.' },
    { name: 'requiredDuringSchedulingIgnoredDuringExecution', kind: 'affinity',
      what: 'Hard requirement: the pod stays Pending rather than land somewhere that does not match. Ignored for pods already running.' },
    { name: 'topologyKey', kind: 'affinity',
      what: 'The failure domain the rule is scoped to. kubernetes.io/hostname means this exact node; a zone label would mean anywhere in the same zone.' },
    { name: 'labelSelector', kind: 'affinity',
      what: 'Which pods count as a match — here, the api Deployment\'s own labels.' },
  ],
  apart: [
    { name: 'podAntiAffinity', kind: 'affinity',
      what: 'Pushes a pod away from nodes that already run a match — the standard way to keep replicas of the same app spread out.' },
    { name: 'requiredDuringSchedulingIgnoredDuringExecution', kind: 'affinity',
      what: 'The same hard/soft distinction as affinity. Required means the spread is guaranteed, never advisory.' },
    { name: 'topologyKey', kind: 'affinity',
      what: 'kubernetes.io/hostname keeps replicas off the same node; a zone key would keep them off the same zone at a coarser grain.' },
  ],
  stuck: [
    { name: 'requiredDuringSchedulingIgnoredDuringExecution', kind: 'affinity',
      what: 'Guarantees the spread and offers no fallback — a pod that cannot get a legal node stays Pending indefinitely.' },
    { name: 'preferredDuringSchedulingIgnoredDuringExecution', kind: 'affinity',
      what: 'The soft version: best effort, always schedules, and never actually guarantees the spread either.' },
    { name: 'kube-scheduler', kind: 'control plane',
      what: 'Reports FailedScheduling per node when a required rule cannot be satisfied, rather than falling back to a worse placement.' },
  ],
};

export default {
  id: 'pod-affinity',
  title: 'Pod affinity and anti-affinity: who schedules together',
  summary: 'One rule that pulls related pods onto the same node, one that holds replicas apart, and what happens when a hard rule has nowhere left to go.',
  description: 'Pods scheduled across three nodes under podAffinity and podAntiAffinity rules, including a required rule that leaves a pod Pending when no node qualifies.',
  viewBox: '0 0 680 350',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
