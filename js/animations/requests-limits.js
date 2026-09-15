/**
 * Requests and limits: the reservation, the ceiling, and what they decide.
 *
 * Requests are a scheduling contract - they decide where a pod can go and
 * whether a drained pod fits anywhere at all. Limits are a runtime ceiling.
 * Together they set the QoS class, which decides who the kubelet kills first
 * when a node runs short. None of that is governed by a PodDisruptionBudget.
 *
 * Geometry: each node is a bucket. A pod's solid box is its memory REQUEST
 * (what the scheduler reserved), the dashed outline above it is the headroom
 * up to its LIMIT, and the marker line is actual usage.
 *
 * Frame shape:
 *   { nodes: ['ready'|'cordoned'|'pressure'],
 *     pods: [{ id, node: idx|null, req, lim, used, s: 'r'|'t'|'p' }],
 *     note, badge, focus }
 */

const ALLOCATABLE = 4096;          // Mi per node
const NODE_X = [40, 270];
const NODE_W = 200;
const NODE_TOP = 82;
const NODE_BOTTOM = 272;
const SCALE = (NODE_BOTTOM - NODE_TOP) / ALLOCATABLE;
const GI = 1024;

const MODES = [
  { id: 'qos-classes', label: 'QoS classes',
    caption: 'Requests and limits together decide a pod\u2019s quality-of-service class, which nobody sets directly' },
  { id: 'node-pressure', label: 'Node under pressure', advanced: true,
    caption: 'When a node runs short of memory the kubelet evicts by QoS class — and never asks a disruption budget' },
  { id: 'scheduling-fit', label: 'Fitting on a drain',
    caption: 'Requests are what must fit on a surviving node. Get them wrong and the drain never finishes' },
];

function pod(id, node, req, lim, used, s = 'r') {
  return { id, node, req, lim, used, s };
}

function qosOf(p) {
  if (!p.req && !p.lim) return 'BestEffort';
  if (p.req === p.lim) return 'Guaranteed';
  return 'Burstable';
}

function buildFrames(modeId) {
  const f = [];
  const nodes = ['ready', 'ready'];
  let pods = [];
  const push = (note, badge, focus) => f.push({
    nodes: [...nodes], pods: pods.map((p) => ({ ...p })), note, badge, focus,
  });

  if (modeId === 'qos-classes') {
    push('An empty worker node with 4Gi allocatable',
      'Allocatable is what is left after the kubelet and system reserves — not the machine\u2019s total memory',
      ['resources:']);

    pods = [pod('api', 0, GI, GI, 700)];
    push('api requests 1Gi and limits 1Gi — requests equal limits',
      'Quality of service: Guaranteed. The last to be evicted under pressure, and the only class that can get exclusive CPU',
      ['requests:', 'limits:']);

    pods = [...pods, pod('worker', 0, 512, 2 * GI, 400)];
    push('worker requests 512Mi but may burst to 2Gi',
      'Quality of service: Burstable. The dashed area is headroom it is allowed to use and not guaranteed to get',
      ['limits:', 'enforced at runtime']);

    pods = [...pods, pod('tools', 0, 0, 0, 300)];
    push('tools sets neither requests nor limits',
      'Quality of service: BestEffort. The scheduler reserved nothing for it, so it is first out when the node runs short',
      ['# no resources block at all']);

    push('Three pods, three classes, and nobody set a class field',
      'QoS is derived from requests and limits. It is the single most consequential thing most teams never configure deliberately',
      ['requests:', 'limits:']);
  }

  if (modeId === 'node-pressure') {
    pods = [pod('api', 0, GI, GI, 900), pod('worker', 0, 512, 2 * GI, 500), pod('tools', 0, 0, 0, 400)];
    push('Steady state: 1.5Gi reserved of 4Gi, everyone within their request',
      'The node looks comfortable. Reserved capacity and actual usage are different numbers, and this is where that matters',
      ['requests:']);

    pods = [pods[0], { ...pods[1], used: 1800 }, pods[2]];
    push('worker bursts into its headroom — 1.8Gi used against a 512Mi request',
      'Entirely legal: it is under its 2Gi limit. But it is now using far more than the scheduler reserved for it',
      ['limits:', 'enforced at runtime']);

    pods = [pods[0], pods[1], { ...pods[2], used: 1200 }];
    nodes[0] = 'pressure';
    push('tools grows too and the node crosses its eviction threshold',
      'The kubelet must reclaim memory now. It does not consult a PodDisruptionBudget, because this is not an eviction API call',
      ['--eviction-hard=memory.available<500Mi']);

    pods = [pods[0], pods[1], { ...pods[2], s: 't' }];
    push('BestEffort goes first: tools is killed',
      'It requested nothing, so it is ranked lowest regardless of how important you think it is',
      ['1. BestEffort']);

    pods = [pods[0], pods[1]];
    push('If that is not enough, Burstable pods over their request go next',
      'worker is using 1.8Gi against a 512Mi request, which puts it at the front of that queue',
      ['2. Burstable, furthest above its request first']);

    pods = [pods[0], { ...pods[1], s: 't' }];
    push('worker is evicted too — it was the furthest above its request',
      'Setting a request close to real usage is what moves a pod down this ranking. It is not just a scheduling hint',
      ['requests:']);

    pods = [pods[0]];
    push('api survives: Guaranteed, and never above its request',
      'No budget was consulted, no drain was involved, and no amount of spread constraint would have changed the order',
      ['limits:']);
  }

  if (modeId === 'scheduling-fit') {
    pods = [
      pod('api-1', 0, GI, GI, 800),
      pod('api-2', 0, GI, GI, 800),
      pod('cache', 0, 1536, 2 * GI, 900),
      pod('batch', 1, GI, GI, 700),
    ];
    push('Two nodes. Node 1 holds 3.5Gi of reservations, node 2 holds 1Gi',
      'Requests are a capacity contract. The scheduler only looks at these numbers, never at actual usage',
      ['requests:']);

    nodes[0] = 'cordoned';
    push('Node 1 is cordoned for an upgrade',
      'Everything on it has to be rescheduled — and each pod needs its full request to fit somewhere',
      ['requests:']);

    pods = pods.map((p) => (p.id === 'api-1' ? { ...p, node: 1 } : p));
    push('api-1 needs 1Gi and node 2 has 3Gi free — it fits',
      'Node 2 now holds 2Gi of reservations',
      ['requests:']);

    pods = pods.map((p) => (p.id === 'api-2' ? { ...p, node: 1 } : p));
    push('api-2 also fits. Node 2 is now at 3Gi of 4Gi reserved',
      '1Gi of reservable memory left, whatever the actual usage on the node happens to be',
      ['requests:']);

    pods = pods.map((p) => (p.id === 'cache' ? { ...p, node: null, s: 'p' } : p));
    push('cache requests 1.5Gi. Only 1Gi is reservable. It does not fit',
      'It goes Pending — not because the node lacks free memory, but because it lacks unreserved memory',
      ['memory: 1536Mi']);

    push('The pod stays Pending and the drain never completes',
      'The MachineConfigPool stops making progress. The cause is a resource request, several layers away from where you will start looking',
      ['memory: 1536Mi']);

    push('Requests too high strand capacity; too low invites OOMKill',
      'This is the tuning nobody owns. Set them from observed usage, then re-check after every significant traffic change',
      ['limits:']);
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  frame.nodes.forEach((st, n) => {
    const cls = st === 'ready' ? 'node-rect' : st === 'cordoned' ? 'node-rect cordoned' : 'node-rect failed';
    out += `<rect class="${cls}" x="${NODE_X[n]}" y="${NODE_TOP - 10}" width="${NODE_W}" height="${NODE_BOTTOM - NODE_TOP + 20}" rx="10"/>`;
    const reserved = frame.pods.filter((p) => p.node === n).reduce((s, p) => s + p.req, 0);
    const label = st === 'pressure' ? 'under memory pressure' : st === 'cordoned' ? 'cordoned' : 'ready';
    out += `<text class="svg-sub on-node" x="${NODE_X[n] + NODE_W / 2}" y="${NODE_TOP - 22}" text-anchor="middle">node ${n + 1} · ${label}</text>`;
    out += `<text class="legend-text" x="${NODE_X[n] + NODE_W / 2}" y="${NODE_BOTTOM + 24}" text-anchor="middle">`
        + `${(reserved / GI).toFixed(1)}Gi reserved of 4Gi</text>`;
  });

  // pods stack from the bottom of their node, height proportional to request
  const cursor = [NODE_BOTTOM, NODE_BOTTOM];
  frame.pods.forEach((p) => {
    if (p.node === null) return;
    const h = Math.max(18, p.req * SCALE);
    const y = cursor[p.node] - h;
    cursor[p.node] = y - 4;
    const x = NODE_X[p.node] + 12;
    const w = NODE_W - 24;
    const cls = p.s === 't' ? 'term' : 'run';

    // headroom up to the limit
    if (p.lim > p.req) {
      const hh = Math.min((p.lim - p.req) * SCALE, y - NODE_TOP);
      out += `<rect x="${x}" y="${y - hh}" width="${w}" height="${hh}" rx="4" fill="none" `
          + 'stroke="var(--term-stroke)" stroke-width="1" stroke-dasharray="3 3"/>';
    }

    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>`
        + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central">`
        + `${p.id} · ${p.req ? `${p.req}Mi` : 'no request'}</text></g>`;

    // actual usage, which may sit above the request
    const uy = (y + h) - p.used * SCALE;
    if (uy > NODE_TOP) {
      out += `<line class="marker-line" x1="${x - 4}" y1="${uy}" x2="${x + w + 4}" y2="${uy}"/>`;
    }
  });

  // right-hand key, and any pod that could not be placed
  out += '<text class="svg-sub on-node" x="500" y="88" text-anchor="start">key</text>';
  out += '<text class="legend-text" x="500" y="108" text-anchor="start">solid = request (reserved)</text>';
  out += '<text class="legend-text" x="500" y="126" text-anchor="start">dashed = headroom to limit</text>';
  out += '<text class="legend-text" x="500" y="144" text-anchor="start">line = actual usage</text>';

  const pending = frame.pods.filter((p) => p.node === null);
  if (pending.length) {
    out += '<text class="svg-sub on-node" x="500" y="180" text-anchor="start">unschedulable</text>';
    pending.forEach((p, i) => {
      out += `<g class="pod pend"><rect x="500" y="${192 + i * 40}" width="150" height="32" rx="5"/>`
          + `<text class="svg-sub" x="575" y="${208 + i * 40}" text-anchor="middle" dominant-baseline="central">`
          + `${p.id} · Pending</text></g>`;
    });
  }

  return out;
}

function metrics(frame) {
  const placed = frame.pods.filter((p) => p.node !== null);
  const reserved = placed.reduce((s, p) => s + p.req, 0);
  const used = placed.reduce((s, p) => s + p.used, 0);
  const pending = frame.pods.filter((p) => p.node === null).length;
  const classes = [...new Set(placed.map(qosOf))];
  return [
    { label: 'Reserved', value: `${(reserved / GI).toFixed(1)}Gi`, tone: '' },
    { label: 'Actually used', value: `${(used / GI).toFixed(1)}Gi`, tone: used > reserved ? 'warn' : 'ok' },
    { label: 'QoS classes', value: classes.length ? classes.map((c) => c[0]).join(' ') : '—' },
    { label: 'Unschedulable', value: String(pending), tone: pending ? 'bad' : 'ok' },
  ];
}

const BASE = `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:             # reserved by the scheduler
              cpu: 250m
              memory: 1Gi
            limits:               # enforced at runtime
              cpu: 500m
              memory: 1Gi
`;

const YAML = {
  'qos-classes': BASE + `
# QoS is derived, never set directly:
#   Guaranteed  requests == limits, for every container
#   Burstable   requests set, limits higher or absent
#   BestEffort  # no resources block at all
#
# oc get pod POD -o jsonpath='{.status.qosClass}'
`,
  'node-pressure': BASE + `
# The kubelet reclaims when it crosses a threshold:
#   --eviction-hard=memory.available<500Mi
#
# Eviction order under memory pressure:
#   1. BestEffort
#   2. Burstable, furthest above its request first
#   3. Guaranteed, last
#
# This is the kubelet killing pods directly. No
# eviction API call, so no PDB is consulted.
`,
  'scheduling-fit': `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: cache
          resources:
            requests:
              memory: 1536Mi      # must fit as a whole
            limits:
              memory: 2Gi
---
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
spec:
  limits:
    - type: Container
      defaultRequest:
        memory: 256Mi
      default:
        memory: 512Mi

# A LimitRange stops BestEffort pods appearing by
# accident in a namespace. It sets defaults only -
# it does not correct a request that is simply wrong.
`,
};

const F = {
  req: { name: 'resources.requests', kind: 'container', what: 'What the scheduler reserves on a node. It decides where a pod can be placed and whether a drained pod fits anywhere at all. The scheduler looks only at this number, never at actual usage.' },
  lim: { name: 'resources.limits', kind: 'container', what: 'The runtime ceiling. Exceeding a memory limit gets the container OOMKilled immediately; exceeding a CPU limit throttles it instead, which looks like latency rather than failure and is far harder to spot.' },
  qos: { name: 'QoS class', kind: 'derived', what: 'Guaranteed when requests equal limits, Burstable when requests are lower, BestEffort when neither is set. Nobody configures this field — it falls out of the two above and decides eviction order.' },
  evict: { name: 'kubelet eviction', kind: 'node', what: 'Under memory pressure the kubelet kills pods directly: BestEffort first, then Burstable furthest above its request, Guaranteed last. No eviction API call, so no PodDisruptionBudget applies.' },
  oom: { name: 'OOMKilled', kind: 'container state', what: 'A container exceeding its memory limit is killed by the kernel with no grace period and no preStop. Under-setting a limit converts a traffic spike into an involuntary disruption.' },
  throttle: { name: 'CPU throttling', kind: 'runtime', what: 'A CPU limit does not kill, it throttles. The symptom is p99 latency climbing while the pod looks healthy — often mistaken for a network or database problem.' },
  overcommit: { name: 'Overcommit', kind: 'cluster', what: 'Limits may sum to more than the node has; requests may not. A node can be fully reserved while sitting at 30% real usage, which is what makes capacity planning from usage graphs misleading.' },
  limitrange: { name: 'LimitRange', kind: 'v1', what: 'Per-namespace defaults, so a pod with no resources block does not silently become BestEffort. It sets defaults only — it cannot correct a request that is simply wrong.' },
  quota: { name: 'ResourceQuota', kind: 'v1', what: 'Caps total requests and limits for a namespace. In a regulated multi-tenant cluster this is what stops one team reserving the headroom every other team\u2019s drain depends on.' },
  priority: { name: 'PriorityClass', kind: 'scheduling.k8s.io/v1', what: 'When a pod does not fit, a higher-priority pod can preempt lower-priority ones to make room. It changes who gets stranded, not whether the arithmetic works.' },
  vpa: { name: 'VerticalPodAutoscaler', kind: 'autoscaling.k8s.io/v1', what: 'Recommends or applies requests from observed usage. Its recommend-only mode is a safe way to find out how wrong your current numbers are before changing anything.' },
  pending: { name: 'Pending (Unschedulable)', kind: 'pod status', what: 'What a pod that cannot fit looks like. During a drain this stalls the MachineConfigPool — check pod events before suspecting the pool itself.' },
};

const FEATURES = {
  'qos-classes': [F.req, F.lim, F.qos, F.limitrange, F.overcommit],
  'node-pressure': [F.qos, F.evict, F.oom, F.throttle, F.req, F.lim],
  'scheduling-fit': [F.req, F.pending, F.overcommit, F.priority, F.quota, F.vpa],
};

const NOTES = {
  'qos-classes': [
    { heading: 'The point to make early', text: 'Nobody sets a QoS field. It is derived from two numbers most teams copy from another manifest and never revisit.' },
    { heading: 'What to point at', text: 'The dashed area above worker is headroom it is allowed to use and not guaranteed to get. That gap is where surprises live.' },
    { ask: 'Do you know the QoS class of your most important workload right now?' },
  ],
  'node-pressure': [
    { heading: 'Why this belongs in a resiliency session', text: 'Everything else today has been voluntary disruption. This is the kubelet killing pods directly — no eviction API, no budget, no warning.' },
    { heading: 'The lever', text: 'Setting a request close to real usage moves a pod down the eviction ranking. That is a resiliency control, not just a scheduling hint.' },
    { ask: 'If a node ran short of memory tonight, do you know which of your pods would be killed first?' },
  ],
  'scheduling-fit': [
    { heading: 'The failure to recognise', text: 'cache goes Pending not because the node lacks free memory, but because it lacks unreserved memory. Those are different numbers and the scheduler only reads one.' },
    { heading: 'Line that lands', text: 'The drain stalls, the pool stops, and the root cause is a resource request several layers from where anyone will start looking.' },
    { ask: 'When did anyone last review the requests on your largest workloads against real usage?' },
  ],
};

export default {
  id: 'requests-limits',
  advanced: true,
  title: 'Requests and limits: reservation vs ceiling',
  summary: 'What the scheduler reserves, what the runtime enforces, and how the two together decide who gets killed first when a node runs short.',
  description: 'Pods stacked on worker nodes by memory request, showing quality-of-service classes, kubelet eviction under pressure, and a pod that cannot be rescheduled during a drain.',
  viewBox: '0 0 680 310',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
