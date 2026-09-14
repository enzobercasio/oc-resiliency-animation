/**
 * Multi-replica pods: what `replicas: N` actually gets you.
 *
 * The foundation animation. It establishes the reconciliation loop, shows the
 * genuine resiliency it provides (automatic pod replacement), and then walks
 * into its limit - which is the question the other three animations answer.
 *
 * Frame shape:
 *   { desired, rsExists, nodes: ['ready'|'failed', ...],
 *     pods: [{ n, s: 'r'|'p'|'x', id }], note, badge }
 */

const NODE_X = [250, 460];
const NODE_W = 190;
const DESIRED = 4;

const MODES = [
  { id: 'reconcile', label: 'The control loop',
    caption: 'replicas: 4 is a declared desired state, not an instruction to start four things' },
  { id: 'self-healing', label: 'Self-healing',
    caption: 'What multi-replica genuinely buys you: automatic recovery from losing a pod' },
  { id: 'the-limit', label: 'Where it stops',
    caption: 'The same four replicas, all on one node — and what replicas: 4 never said' },
];

function pod(n, s, id) { return { n, s, id }; }

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push({ desired: DESIRED, rsExists: true, nodes: ['ready', 'ready'], ...o });

  if (modeId === 'reconcile') {
    push({ rsExists: false, pods: [],
      note: 'You declare how many replicas you want — not how to get them',
      focus: ['replicas: 4'],
      badge: 'replicas: 4 in the Deployment spec is a desired state. Nothing has been started yet' });
    push({ pods: [],
      note: 'The Deployment creates a ReplicaSet to own that desired state',
      badge: 'One ReplicaSet per revision of the pod template — this is what a rollout swaps between' });
    push({ pods: [],
      note: 'The ReplicaSet compares desired with actual: 4 against 0',
      badge: 'Observe, diff, act. This loop runs continuously and never finishes' });
    push({ pods: [pod(0, 'p', 'p1'), pod(0, 'p', 'p2'), pod(1, 'p', 'p3'), pod(1, 'p', 'p4')],
      note: 'It creates four pods to close the gap',
      focus: ['selector', 'matchLabels', 'app: payments-api'],
      badge: 'The scheduler decides which node each one lands on — the ReplicaSet has no say in placement' });
    push({ pods: [pod(0, 'r', 'p1'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      note: 'Four pods pass their readiness probes and start serving',
      focus: ['readinessProbe', 'httpGet', 'path: /', 'port: 8080'],
      badge: 'Desired now equals actual, so the loop goes quiet — but it keeps checking forever' });
    push({ pods: [pod(0, 'r', 'p1'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      note: 'Nothing here is ever "done"',
      badge: 'That permanently running loop is what makes the next scenario work without anyone being paged' });
  }

  if (modeId === 'self-healing') {
    const steady = () => [pod(0, 'r', 'p1'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')];
    push({ pods: steady(),
      note: 'Steady state: four replicas, desired matches actual',
      badge: 'Two on each node, though nothing in the spec asked for that — it is just how they landed' });
    push({ pods: [pod(0, 'x', 'p1'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      focus: ['replicas: 4'],
      note: 'A container exceeds its memory limit and the pod is killed',
      badge: 'Involuntary: nothing planned this and no API call asked permission first' });
    push({ pods: [pod(0, 'x', 'p1'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      note: 'Actual drops to 3. Desired is still 4',
      badge: 'The ReplicaSet notices within about a second — nobody has been paged and nobody needs to be' });
    push({ pods: [pod(1, 'p', 'p5'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      focus: ['selector', 'matchLabels', 'app: payments-api'],
      note: 'A replacement pod is created and scheduled',
      badge: 'A new pod with a new name — pods are cattle, the ReplicaSet only cares about the count' });
    push({ pods: [pod(1, 'r', 'p5'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      focus: ['readinessProbe', 'httpGet', 'path: /', 'port: 8080'],
      note: 'Back to four ready. Total human involvement: none',
      badge: 'This is the real value of multi-replica, and it is not nothing' });
    push({ pods: [pod(1, 'r', 'p5'), pod(0, 'r', 'p2'), pod(1, 'r', 'p3'), pod(1, 'r', 'p4')],
      note: 'But notice what the controller never asked',
      badge: 'It replaced a pod. It never asked where the pods were, or how many could be lost at once' });
  }

  if (modeId === 'the-limit') {
    const packed = (s) => [pod(0, s, 'p1'), pod(0, s, 'p2'), pod(0, s, 'p3'), pod(0, s, 'p4')];
    push({ pods: packed('r'),
      note: 'Same four replicas — but the scheduler put all of them on one node',
      badge: 'Perfectly legal. Nothing in replicas: 4 says a word about placement' });
    push({ nodes: ['failed', 'ready'], pods: packed('x'),
      note: 'That node fails',
      badge: 'Actual falls from 4 to 0 in a single step. The other node is idle and always was' });
    push({ nodes: ['failed', 'ready'], pods: packed('x'),
      note: 'The service is down, and the controller is working exactly as designed',
      badge: 'Desired 4, actual 0. It will fix this — but "eventually" is not the same as "now"' });
    push({ nodes: ['failed', 'ready'],
      pods: [pod(1, 'p', 'p5'), pod(1, 'p', 'p6'), pod(1, 'p', 'p7'), pod(1, 'p', 'p8')],
      note: 'Replacements are scheduled onto the surviving node',
      badge: 'Image pull, process start, readiness probe — seconds to minutes, and users feel every one of them' });
    push({ nodes: ['failed', 'ready'],
      pods: [pod(1, 'r', 'p5'), pod(1, 'r', 'p6'), pod(1, 'r', 'p7'), pod(1, 'r', 'p8')],
      note: 'Recovered',
      badge: 'Multi-replica gave us recovery. It did not give us continuity — there was a real outage in between' });
    push({ nodes: ['failed', 'ready'],
      pods: [pod(1, 'r', 'p5'), pod(1, 'r', 'p6'), pod(1, 'r', 'p7'), pod(1, 'r', 'p8')],
      note: 'replicas: 4 answers how many. It never answers where, or how fast they may be taken away',
      focus: ['no topologySpreadConstraints', 'no PodDisruptionBudget', 'nothing here constrains placement'],
      badge: 'Those two questions are the topology spread constraint and the pod disruption budget' });
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  // Controller column: Deployment above ReplicaSet.
  out += '<g class="pod pend"><rect x="40" y="100" width="160" height="52" rx="8"/>'
      + '<text class="svg-sub" x="120" y="120" text-anchor="middle" dominant-baseline="central">Deployment</text>'
      + `<text class="svg-sub" x="120" y="138" text-anchor="middle" dominant-baseline="central">replicas: ${frame.desired}</text></g>`;

  if (frame.rsExists) {
    const actual = frame.pods.filter((p) => p.s !== 'x').length;
    const settled = actual === frame.desired && frame.pods.every((p) => p.s === 'r');
    out += `<line class="track-line" x1="120" y1="152" x2="120" y2="186"/>`;
    out += `<g class="pod ${settled ? 'run' : 'term'}"><rect x="40" y="188" width="160" height="52" rx="8"/>`
        + '<text class="svg-sub" x="120" y="208" text-anchor="middle" dominant-baseline="central">ReplicaSet</text>'
        + `<text class="svg-sub" x="120" y="226" text-anchor="middle" dominant-baseline="central">${frame.desired} desired / ${actual} actual</text></g>`;
    out += '<line class="track-line" x1="200" y1="214" x2="244" y2="214"/>';
  } else {
    out += '<text class="legend-text" x="120" y="214" text-anchor="middle">no ReplicaSet yet</text>';
  }

  // Cluster: two nodes.
  frame.nodes.forEach((st, n) => {
    out += `<rect class="node-rect${st === 'failed' ? ' failed' : ''}" x="${NODE_X[n]}" y="80" width="${NODE_W}" height="180" rx="12"/>`;
    out += `<text class="svg-title on-node" x="${NODE_X[n] + NODE_W / 2}" y="102" text-anchor="middle" dominant-baseline="central">node ${n + 1}</text>`;
    out += `<text class="svg-sub on-node" x="${NODE_X[n] + NODE_W / 2}" y="119" text-anchor="middle" dominant-baseline="central">${st === 'failed' ? 'failed' : 'ready'}</text>`;
  });

  // Pods, two per row inside their node.
  const slot = [0, 0];
  frame.pods.forEach((p) => {
    const k = slot[p.n];
    slot[p.n] += 1;
    const col = k % 2;
    const row = (k - col) / 2;
    const x = NODE_X[p.n] + 14 + col * 84;
    const y = 138 + row * 46;
    const cls = p.s === 'r' ? 'run' : p.s === 'x' ? 'pend' : 'pend';
    const label = p.s === 'r' ? p.id : p.s === 'x' ? 'lost' : 'init';
    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="76" height="36" rx="6"/>`
        + `<text class="svg-sub" x="${x + 38}" y="${y + 18}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  });

  out += '<text class="legend-text" x="40" y="292">The loop runs forever: observe actual, compare with desired, create or delete pods to close the gap.</text>';
  return out;
}

function metrics(frame) {
  const live = frame.pods.filter((p) => p.s !== 'x');
  const ready = frame.pods.filter((p) => p.s === 'r').length;
  const nodesWithReady = new Set(frame.pods.filter((p) => p.s === 'r').map((p) => p.n)).size;
  const tone = ready === 0 ? 'bad' : ready < frame.desired ? 'warn' : 'ok';

  return [
    { label: 'Desired', value: String(frame.desired) },
    { label: 'Actual', value: String(live.length), tone: live.length === frame.desired ? 'ok' : 'warn' },
    { label: 'Ready', value: `${ready} / ${frame.desired}`, tone },
    { label: 'Nodes serving', value: String(nodesWithReady), tone: nodesWithReady === 0 ? 'bad' : nodesWithReady === 1 ? 'warn' : 'ok' },
  ];
}

const NOTES = {
  reconcile: [
    { heading: 'What to point at', text: 'The ReplicaSet box showing desired against actual. Everything in Kubernetes is this loop — declare a target, let a controller close the gap.' },
    { heading: 'Line that lands', text: 'You never told it to start four pods. You told it four is correct, and something is now permanently responsible for making that true.' },
    { ask: 'When something in your platform drifts from its declared state today, what notices — a controller, or a person?' },
  ],
  'self-healing': [
    { heading: 'What to point at', text: 'Actual drops to 3 and recovers to 4 with no human involved. That is real resiliency and worth naming as a win before you start pulling it apart.' },
    { heading: 'The pivot', text: 'It replaced a pod. It never asked where the pods were, or how many could be lost at once. Those two gaps are the rest of the session.' },
    { ask: 'How many of your production incidents were a single pod dying, versus something bigger?' },
  ],
  'the-limit': [
    { heading: 'What to point at', text: 'The second node sat idle throughout. The capacity to survive this was already paid for and simply was not used.' },
    { heading: 'Line that lands', text: 'Multi-replica gave us recovery, not continuity. The controller behaved perfectly and the service was still down.' },
    { ask: 'If a single node in your cluster disappeared right now, which services would go to zero rather than degrade?' },
  ],
};

const YAML = {
  "reconcile": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 4\n  selector:\n    matchLabels:\n      app: payments-api\n  template:\n    metadata:\n      labels:\n        app: payments-api\n    spec:\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          readinessProbe:\n            httpGet:\n              path: /\n              port: 8080\n",
  "self-healing": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 4\n  selector:\n    matchLabels:\n      app: payments-api\n  template:\n    metadata:\n      labels:\n        app: payments-api\n    spec:\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          readinessProbe:\n            httpGet:\n              path: /\n              port: 8080\n",
  "the-limit": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 4\n  selector:\n    matchLabels:\n      app: payments-api\n  template:\n    metadata:\n      labels:\n        app: payments-api\n    spec:\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          readinessProbe:\n            httpGet:\n              path: /\n              port: 8080\n\n# nothing here constrains placement:\n#   no topologySpreadConstraints -> all 4 on one node\n#   no podAntiAffinity           -> nothing keeps them apart\n#   no PodDisruptionBudget       -> no cap on removal rate\n"
};

const FEATURES = {
  "reconcile": [
    {
      "name": "Deployment",
      "kind": "apps/v1",
      "what": "Owns the desired state and creates a ReplicaSet for each revision of the pod template. What you actually write."
    },
    {
      "name": "ReplicaSet",
      "kind": "apps/v1",
      "what": "The control loop that keeps actual pod count equal to desired. Created for you; you rarely touch it directly."
    },
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "The desired pod count. A declared target, not an instruction - a controller is permanently responsible for making it true."
    },
    {
      "name": "selector.matchLabels",
      "kind": "Deployment",
      "what": "How the controller identifies the pods it owns. The same label set is what a Service, and later a PodDisruptionBudget, selects on."
    },
    {
      "name": "kube-scheduler",
      "kind": "control plane",
      "what": "Decides which node each new pod lands on. The ReplicaSet has no say in placement, which is why replica count alone tells you nothing about blast radius."
    },
    {
      "name": "readinessProbe",
      "kind": "container",
      "what": "Gates traffic. A pod that is Running but not Ready receives no requests and does not count toward availability."
    }
  ],
  "self-healing": [
    {
      "name": "ReplicaSet",
      "kind": "apps/v1",
      "what": "The control loop that keeps actual pod count equal to desired. Created for you; you rarely touch it directly."
    },
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "The desired pod count. A declared target, not an instruction - a controller is permanently responsible for making it true."
    },
    {
      "name": "readinessProbe",
      "kind": "container",
      "what": "Gates traffic. A pod that is Running but not Ready receives no requests and does not count toward availability."
    },
    {
      "name": "kube-scheduler",
      "kind": "control plane",
      "what": "Decides which node each new pod lands on. The ReplicaSet has no say in placement, which is why replica count alone tells you nothing about blast radius."
    }
  ],
  "the-limit": [
    {
      "name": "PodDisruptionBudget",
      "kind": "policy/v1",
      "what": "Also absent. It would not have helped here anyway - a node failing is involuntary, and a budget only governs evictions. But its absence means a planned drain would be just as abrupt."
    },
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "The desired pod count. A declared target, not an instruction - a controller is permanently responsible for making it true."
    },
    {
      "name": "kube-scheduler",
      "kind": "control plane",
      "what": "Decides which node each new pod lands on. The ReplicaSet has no say in placement, which is why replica count alone tells you nothing about blast radius."
    },
    {
      "name": "resources.requests",
      "kind": "container",
      "what": "What the scheduler reserves on a node. Together with node capacity this is what decides whether four pods fit on one node or have to spread out."
    },
    {
      "name": "podAntiAffinity",
      "kind": "affinity",
      "what": "Absent here, which is part of why all four landed together. It would have kept replicas on separate nodes - see the upgrade animation for the modern alternative."
    }
  ]
};

export default {
  id: 'multi-replica',
  title: 'Multi-replica pods: what replicas: N buys you',
  summary: 'The reconciliation loop behind a Deployment, the automatic recovery it genuinely provides, and the two questions a replica count never answers.',
  description: 'A Deployment and ReplicaSet reconciling desired state against pods running on two nodes, through creation, pod failure and node failure.',
  viewBox: '0 0 680 310',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
