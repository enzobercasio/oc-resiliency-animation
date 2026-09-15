/**
 * PriorityClass and preemption: the number that decides who gets to keep a
 * spot on a full node, and the disruption path that never asks a
 * PodDisruptionBudget for permission.
 *
 * Sits in Going deeper, right after graceful-shutdown, as the natural sequel
 * to requests-limits: that animation ends with a pod going Pending because it
 * does not fit, and name-drops PriorityClass as the un-shown fix. This one
 * shows it, then shows the edge nobody expects - preemption deletes a pod
 * directly rather than calling the eviction subresource, which is the third
 * disruption category next to the voluntary/involuntary split from
 * disruption-types: not admin-initiated, not accidental, and invisible to
 * any PodDisruptionBudget no matter how it is written.
 *
 * Frame shape:
 *   { queued: [{ id, priority }],
 *     node: [{ id, priority, s: 'r'|'t', protected: boolean }],
 *     note, badge, focus }
 */

const MODES = [
  { id: 'stuck', label: 'Pending, regardless of priority',
    caption: 'Without a PriorityClass, an important pod waits exactly like an unimportant one' },
  { id: 'preemption', label: 'A higher priority preempts to make room',
    caption: 'The scheduler removes a lower-priority pod so a higher-priority one can fit' },
  { id: 'bypasses-pdb', label: 'Preemption bypasses the eviction API', advanced: true,
    caption: 'A PodDisruptionBudget never gets a vote — preemption deletes the pod directly' },
];

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  const running = (extra = {}) => [
    { id: 'api', priority: 0, s: 'r' },
    { id: 'worker', priority: 0, s: 'r' },
    { id: 'batch-job', priority: 0, s: 'r', ...extra },
  ];

  if (modeId === 'stuck') {
    push({ queued: [], node: running(),
      note: 'A node is fully reserved: three pods, zero room left',
      badge: 'Every pod here has the same, default priority: 0' });
    push({ queued: [{ id: 'critical-job', priority: 0 }], node: running(),
      note: 'critical-job needs to schedule. It matters a great deal to the business',
      focus: ['no priorityClassName'],
      badge: 'The scheduler has no way to know that — no priorityClassName means priority: 0, same as everything already running' });
    push({ queued: [{ id: 'critical-job', priority: 0 }], node: running(),
      note: 'It stays Pending. Nothing here evaluates "how important," only "does it fit"',
      badge: 'Priority is not the same as urgency, and neither exists here at all' });
    push({ queued: [{ id: 'critical-job', priority: 0 }], node: running(),
      note: 'This is the exact problem PriorityClass exists to solve',
      badge: 'Not more capacity — a way to say which pod gets to keep the capacity that exists' });
  }

  if (modeId === 'preemption') {
    push({ queued: [{ id: 'critical-job', priority: 1000000 }], node: running(),
      note: 'Same full node. critical-job now carries priorityClassName: business-critical',
      focus: ['priorityClassName', 'value: 1000000'],
      badge: 'Priority is a number. Higher always outranks lower when the scheduler must choose' });
    push({ queued: [{ id: 'critical-job', priority: 1000000 }], node: running(),
      note: 'The scheduler looks for the smallest set of lower-priority pods it can remove',
      badge: 'Not simply the lowest-priority pod on the cluster — whichever victim actually frees enough room here' });
    push({ queued: [{ id: 'critical-job', priority: 1000000 }], node: running({ s: 't' }),
      note: 'batch-job, priority 0, is chosen and terminated',
      badge: 'This is a deletion the scheduler decided on — no administrator ran anything' });
    push({ queued: [], node: [
      { id: 'api', priority: 0, s: 'r' },
      { id: 'worker', priority: 0, s: 'r' },
      { id: 'critical-job', priority: 1000000, s: 'r' },
    ],
      note: 'Once batch-job clears, critical-job schedules into the freed capacity',
      badge: 'Priority did not create capacity. It decided who gets to keep it' });
  }

  if (modeId === 'bypasses-pdb') {
    push({ queued: [{ id: 'critical-job', priority: 1000000 }],
      node: running({ protected: true }),
      note: 'batch-job now carries a PodDisruptionBudget: minAvailable equal to its own replica count',
      focus: ['minAvailable: 1'],
      badge: 'The exact deadlock-shaped budget from two animations ago — no voluntary drain could ever touch it' });
    push({ queued: [{ id: 'critical-job', priority: 1000000 }],
      node: running({ protected: true }),
      note: 'critical-job still cannot fit anywhere else on the cluster',
      badge: 'The scheduler has exactly one candidate victim, and it is budget-protected' });
    push({ queued: [{ id: 'critical-job', priority: 1000000 }],
      node: running({ s: 't', protected: true }),
      note: 'The scheduler prefers not to — but with no other option, it deletes batch-job anyway',
      focus: ['Preemption deletes the pod directly'],
      badge: 'Preemption never calls the eviction subresource, so the PDB is never consulted, no matter its value' });
    push({ queued: [], node: [
      { id: 'api', priority: 0, s: 'r' },
      { id: 'worker', priority: 0, s: 'r' },
      { id: 'critical-job', priority: 1000000, s: 'r' },
    ],
      note: 'critical-job schedules. The PDB never even got a vote',
      badge: 'A third category, next to voluntary and involuntary: a scheduler deletion that no budget can see coming' });
  }

  return f;
}

function pill(x, y, w, h, cls, title, sub) {
  return `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 - 9}" text-anchor="middle" dominant-baseline="central">${title}</text>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${sub}</text></g>`;
}

function renderSVG(frame) {
  let out = '';

  out += '<text class="legend-text" x="40" y="16">scheduler queue</text>';
  frame.queued.forEach((p, i) => {
    const x = 40 + i * 190;
    out += pill(x, 22, 170, 44, 'pend', p.id, `priority: ${p.priority}`);
  });

  out += '<text class="svg-sub on-node" x="340" y="66" text-anchor="middle">node 1 · ready</text>';
  out += '<rect class="node-rect" x="40" y="76" width="600" height="160" rx="12"/>';

  const colX = [56, 346];
  const rowY = [92, 168];
  frame.node.forEach((p, i) => {
    const col = i % 2;
    const row = (i - col) / 2;
    const cls = p.s === 't' ? 'term' : 'run';
    const sub = `priority: ${p.priority}${p.protected ? ' · PDB' : ''}`;
    out += pill(colX[col], rowY[row], 270, 64, cls, p.id, sub);
  });

  out += '<text class="legend-text" x="40" y="264">solid = scheduled and running · dashed amber = being deleted · dotted = queued</text>';
  return out;
}

function metrics(frame) {
  const running = frame.node.filter((p) => p.s === 'r').length;
  const pending = frame.queued.length;
  const maxPriority = Math.max(0, ...frame.node.map((p) => p.priority), ...frame.queued.map((p) => p.priority));
  return [
    { label: 'On the node', value: String(running), tone: 'ok' },
    { label: 'Pending', value: String(pending), tone: pending ? 'warn' : 'ok' },
    { label: 'Highest priority waiting', value: String(frame.queued[0]?.priority ?? '—') },
  ];
}

const NOTES = {
  stuck: [
    { heading: 'What to point at', text: 'critical-job and the pods already running are, to the scheduler, completely indistinguishable.' },
    { heading: 'Line that lands', text: 'Priority is not urgency and it is not importance — it is a number, and by default every pod has the same one.' },
    { ask: 'Do any of your business-critical workloads run at the same default priority as a batch job?' },
  ],
  preemption: [
    { heading: 'What to point at', text: 'The scheduler does not pick the lowest-priority pod on the cluster — it picks whichever victim actually frees enough room.' },
    { heading: 'Line that lands', text: 'Preemption does not create capacity. It decides who gets to keep the capacity that already exists.' },
    { ask: "If two teams' workloads both claimed a \"business critical\" priority, whose actually wins?" },
  ],
  'bypasses-pdb': [
    { heading: 'What to point at', text: 'The exact deadlock-shaped PDB from two animations ago, and it does not save batch-job here.' },
    { heading: 'Line that lands', text: "A PodDisruptionBudget is a defence against oc adm drain. It was never a defence against a higher-priority pod needing the room — preemption does not ask." },
    { ask: "Does anyone on your team believe a PDB protects a workload from preemption? What changes for them once they know it doesn't?" },
  ],
};

const YAML = {
  stuck: `apiVersion: v1
kind: Pod
metadata:
  name: critical-job
spec:
  # no priorityClassName - defaults to 0,
  # identical to everything already running
  containers:
    - name: job
      resources:
        requests:
          memory: 1Gi
`,
  preemption: `apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: business-critical
value: 1000000
preemptionPolicy: PreemptLowerPriority
---
apiVersion: v1
kind: Pod
metadata:
  name: critical-job
spec:
  priorityClassName: business-critical
  containers:
    - name: job
      resources:
        requests:
          memory: 1Gi
`,
  'bypasses-pdb': `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: batch-job-pdb
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: batch-job

# Preemption deletes the pod directly - it never
# calls the eviction subresource, so this budget
# is never consulted, no matter its value.
`,
};

const FEATURES = {
  stuck: [
    { name: 'PriorityClass', kind: 'scheduling.k8s.io/v1',
      what: 'Absent here — every pod defaults to priority 0, so nothing distinguishes "business critical" from "can wait."' },
    { name: 'kube-scheduler', kind: 'control plane',
      what: 'Only evaluates whether a pod fits. Fit is the entire question until a PriorityClass says otherwise.' },
  ],
  preemption: [
    { name: 'PriorityClass', kind: 'scheduling.k8s.io/v1',
      what: 'A named, numeric priority. Higher always outranks lower when the scheduler has to choose a victim.' },
    { name: 'Preemption', kind: 'scheduling behavior',
      what: 'The scheduler picks the smallest set of lower-priority pods it can remove to fit the pending one — not simply the lowest-priority pod on the cluster.' },
    { name: 'status.nominatedNodeName', kind: 'pod status',
      what: 'Records where a preempting pod is expected to land while its victim is still terminating.' },
  ],
  'bypasses-pdb': [
    { name: 'PodDisruptionBudget', kind: 'policy/v1',
      what: 'Governs the eviction subresource specifically. Preemption never calls it.' },
    { name: 'Eviction API', kind: 'pods/eviction',
      what: 'The code path a PDB actually protects. Preemption deletes pods directly and skips it entirely.' },
    { name: 'kube-scheduler', kind: 'control plane',
      what: 'Prefers a victim with no PDB when one is available, but will violate a budget if there is no other way to fit a higher-priority pod.' },
  ],
};

export default {
  id: 'priority-preemption',
  advanced: true,
  title: 'PriorityClass and preemption: who gets to keep the room',
  summary: 'A number that decides which pod gets evicted to make room for another — and the one disruption path that never asks a PodDisruptionBudget for permission.',
  description: 'A full node, a pending pod stuck with no priority, the same pod preempting a lower-priority one once given a PriorityClass, and a PodDisruptionBudget that is never consulted because preemption deletes pods directly.',
  viewBox: '0 0 680 280',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
