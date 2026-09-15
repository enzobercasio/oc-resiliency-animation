/**
 * MachineConfigPool: how many nodes upgrade at once, and which ones.
 *
 * Everything else in this set is workload-level. This is the cluster-level
 * control that decides the shape of the upgrade your workloads have to survive.
 *
 * Frame shape:
 *   { nodes: [{ pool, ver: 'old'|'new', s: 'ready'|'working' }], note, badge, focus }
 */

const NODE_X = [40, 245, 450];
const NODE_Y = [98, 202];
const NODE_W = 190;
const NODE_H = 84;
const COUNT = 6;

const MODES = [
  { id: 'serial', label: 'maxUnavailable: 1',
    caption: 'The default worker pool: one node at a time, six sequential reboots' },
  { id: 'parallel', label: 'maxUnavailable: 2',
    caption: 'Two nodes at a time — half the window, double the capacity gone at once' },
  { id: 'custom-pools', label: 'Custom pools',
    caption: 'Split the workers into separate pools so one set upgrades and is validated before the other starts' },
];

function buildFrames(modeId) {
  const f = [];
  const poolOf = (i) => (modeId === 'custom-pools' ? (i < 2 ? 'canary' : 'prod') : 'worker');
  const nodes = Array.from({ length: COUNT }, (_, i) => ({ pool: poolOf(i), ver: 'old', s: 'ready' }));
  const push = (note, badge, focus) => f.push({ nodes: nodes.map((n) => ({ ...n })), note, badge, focus });

  if (modeId === 'serial') {
    push('Six workers, all on the current version',
      'The MachineConfigPool owns the rollout. Your PDBs and spread constraints decide what it costs you',
      ['maxUnavailable: 1']);
    for (let i = 0; i < COUNT; i += 1) {
      nodes[i].s = 'working';
      push(`Worker ${i + 1} cordons, drains and reboots`,
        'One node unavailable at a time. Every pod on it has to go somewhere else first',
        ['maxUnavailable: 1']);
      nodes[i].s = 'ready';
      nodes[i].ver = 'new';
      push(`Worker ${i + 1} rejoins on the new version`,
        `${i + 1} of 6 done — the pool moves to the next node only now`,
        ['maxUnavailable: 1']);
    }
    push('Upgrade complete: six sequential drain-and-reboot cycles',
      'The safest shape and the slowest. On a large pool this is what makes an upgrade window run past its slot',
      ['maxUnavailable: 1']);
  }

  if (modeId === 'parallel') {
    push('Same six workers, pool tuned to move faster',
      'maxUnavailable: 2 halves the number of cycles — and doubles how much capacity disappears at once',
      ['maxUnavailable: 2']);
    for (let i = 0; i < COUNT; i += 2) {
      nodes[i].s = 'working';
      nodes[i + 1].s = 'working';
      push(`Workers ${i + 1} and ${i + 2} drain and reboot together`,
        'A third of the cluster is unavailable. Every workload now needs its replicas spread across the other four',
        ['maxUnavailable: 2']);
      nodes[i].s = 'ready'; nodes[i].ver = 'new';
      nodes[i + 1].s = 'ready'; nodes[i + 1].ver = 'new';
      push(`Both rejoin on the new version — ${i + 2} of 6 done`,
        'Three cycles instead of six',
        ['maxUnavailable: 2']);
    }
    push('Upgrade complete in half the cycles',
      'Only safe if your PDBs have the headroom and your workloads are spread widely enough to lose two nodes at once',
      ['maxUnavailable: 2', 'disruptionsAllowed']);
  }

  if (modeId === 'custom-pools') {
    push('The same six workers, split into two pools',
      'Two canary nodes and four production nodes. A node belongs to a pool by label, not by name',
      ['machineconfiguration.openshift.io/role', 'nodeSelector']);
    nodes[0].s = 'working';
    push('The canary pool upgrades first, one node at a time',
      'Only workloads scheduled onto these two nodes are exposed to the new version',
      ['name: canary', 'maxUnavailable: 1']);
    nodes[0].s = 'ready'; nodes[0].ver = 'new';
    nodes[1].s = 'working';
    push('First canary node is on the new version; the second follows',
      'This is the blast radius you actually control — which nodes, not just how many',
      ['name: canary']);
    nodes[1].s = 'ready'; nodes[1].ver = 'new';
    push('Canary pool complete — now you stop and look',
      'The production pool is paused, so validation happens before the other four nodes move at all',
      ['paused: true']);
    for (let i = 2; i < COUNT; i += 2) {
      nodes[i].s = 'working';
      nodes[i + 1].s = 'working';
      push(`Production pool unpaused: workers ${i + 1} and ${i + 2} upgrade`,
        'A separate pool can carry a different maxUnavailable from the canary one',
        ['name: prod', 'maxUnavailable: 2']);
      nodes[i].s = 'ready'; nodes[i].ver = 'new';
      nodes[i + 1].s = 'ready'; nodes[i + 1].ver = 'new';
      push(`Workers ${i + 1} and ${i + 2} rejoin on the new version`, 'Production continues in pairs', ['name: prod']);
    }
    push('Upgrade complete, with a validation gate in the middle',
      'The pool decides the shape of the disruption; your PDBs and spread constraints decide whether it is felt',
      ['paused: true']);
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  frame.nodes.forEach((n, i) => {
    const col = i % 3;
    const row = (i - col) / 3;
    const x = NODE_X[col];
    const y = NODE_Y[row];
    const cls = n.s === 'working' ? 'node-rect cordoned' : 'node-rect';
    out += `<rect class="${cls}" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10"/>`;
    out += `<text class="svg-title on-node" x="${x + 14}" y="${y + 22}" text-anchor="start">worker-${i + 1}</text>`;
    out += `<text class="svg-sub on-node" x="${x + 14}" y="${y + 40}" text-anchor="start">pool: ${n.pool}</text>`;

    const badgeCls = n.s === 'working' ? 'term' : n.ver === 'new' ? 'run' : 'pend';
    const badgeText = n.s === 'working' ? 'draining' : n.ver === 'new' ? 'v4.19' : 'v4.18';
    out += `<g class="pod ${badgeCls}"><rect x="${x + 108}" y="${y + 48}" width="68" height="26" rx="6"/>`
        + `<text class="svg-sub" x="${x + 142}" y="${y + 61}" text-anchor="middle" dominant-baseline="central">${badgeText}</text></g>`;
  });

  const done = frame.nodes.filter((n) => n.ver === 'new' && n.s === 'ready').length;
  const busy = frame.nodes.filter((n) => n.s === 'working').length;
  out += `<text class="legend-text" x="40" y="312">`
      + `${done} of ${COUNT} on the new version · ${busy} unavailable right now · `
      + 'each unavailable node drains its pods onto the others first</text>';
  return out;
}

function metrics(frame) {
  const done = frame.nodes.filter((n) => n.ver === 'new' && n.s === 'ready').length;
  const busy = frame.nodes.filter((n) => n.s === 'working').length;
  const capacity = COUNT - busy;
  return [
    { label: 'Upgraded', value: `${done} / ${COUNT}`, tone: done === COUNT ? 'ok' : '' },
    { label: 'Unavailable', value: String(busy), tone: busy === 0 ? 'ok' : busy > 1 ? 'warn' : '' },
    { label: 'Worker capacity', value: `${Math.round((capacity / COUNT) * 100)}%`, tone: capacity < COUNT * 0.7 ? 'warn' : 'ok' },
    { label: 'Pools', value: String(new Set(frame.nodes.map((n) => n.pool)).size) },
  ];
}

const YAML = {
  serial: `apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: worker
spec:
  maxUnavailable: 1
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/worker: ""

# The default. One node drains and reboots at a time.
# Safest shape, slowest window - on a 50-node pool this
# is what makes an upgrade run past its change slot.
#
# oc get mcp
# oc describe mcp worker | grep -A6 Conditions
`,
  parallel: `apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: worker
spec:
  maxUnavailable: 2
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/worker: ""

# Halves the number of cycles. Before setting this, check
# every workload can lose two nodes at once:
#
#   oc get pdb -A -o custom-columns=\\
#     NAME:.metadata.name,\\
#     ALLOWED:.status.disruptionsAllowed
`,
  'custom-pools': `apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: canary
spec:
  maxUnavailable: 1
  machineConfigSelector:
    matchExpressions:
      - key: machineconfiguration.openshift.io/role
        operator: In
        values: [worker, canary]
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/canary: ""
---
apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: prod
spec:
  maxUnavailable: 2
  paused: true          # unpause after canary validates
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/prod: ""

# Label a node into a pool:
#   oc label node NODE \\
#     node-role.kubernetes.io/canary=""
`,
};

const F = {
  mcp: { name: 'MachineConfigPool', kind: 'machineconfiguration.openshift.io/v1', what: 'The OpenShift object that rolls a machine config or an upgrade across a set of nodes. It owns the shape of the disruption your workloads then have to survive.' },
  maxUnavail: { name: 'spec.maxUnavailable', kind: 'MachineConfigPool', what: 'How many nodes in the pool may be drained and rebooted at once. Defaults to 1. Raising it shortens the window and widens the blast radius in exact proportion.' },
  paused: { name: 'spec.paused', kind: 'MachineConfigPool', what: 'Holds a pool at its current config. The mechanism behind a canary upgrade: let one pool move, validate, then unpause the rest.' },
  selector: { name: 'nodeSelector', kind: 'MachineConfigPool', what: 'Which nodes belong to the pool, matched by label. This is what lets you control which nodes are exposed to a new version rather than only how many.' },
  pdb: { name: 'PodDisruptionBudget', kind: 'policy/v1', what: 'The other half of the equation: the pool decides how many nodes drain at once, the budget decides how fast pods may leave each one. Raising maxUnavailable without checking budgets is how upgrades stall.' },
  spread: { name: 'topologySpreadConstraints', kind: 'pod spec', what: 'With two nodes down at once, a workload needs its replicas spread across the remaining four. Pool concurrency and workload spread have to be chosen together.' },
  priority: { name: 'PriorityClass', kind: 'scheduling.k8s.io/v1', what: 'When drained pods compete for the surviving nodes, higher priority pods can preempt lower ones. It decides who gets rescheduled first when the cluster is temporarily short.' },
  drain: { name: 'oc adm drain', kind: 'command', what: 'What the pool performs on each node it takes. Same eviction path as a manual drain, which is why a PDB with no headroom stalls an automated upgrade.' },
};

const FEATURES = {
  serial: [F.mcp, F.maxUnavail, F.drain, F.pdb],
  parallel: [F.mcp, F.maxUnavail, F.pdb, F.spread, F.priority],
  'custom-pools': [F.mcp, F.selector, F.paused, F.maxUnavail, F.spread],
};

const NOTES = {
  serial: [
    { heading: 'Where this fits', text: 'Everything else in this set is workload-level. This is the cluster-level control that decides the shape of the upgrade those workloads have to survive.' },
    { heading: 'The arithmetic to do out loud', text: 'Drain plus reboot plus rejoin is often 10 to 15 minutes per node. Multiply by the pool size before promising a change window.' },
    { ask: 'How long did your last worker-pool upgrade actually take, end to end?' },
  ],
  parallel: [
    { heading: 'What to point at', text: 'Worker capacity drops to 67%. Every workload now needs replicas spread across the remaining four nodes, not just across three zones.' },
    { heading: 'The order of operations', text: 'Check disruptionsAllowed across all namespaces before raising this. Doubling pool concurrency against budgets with no headroom just stalls the pool twice as often.' },
    { ask: 'Would you know today whether your workloads can lose two nodes simultaneously?' },
  ],
  'custom-pools': [
    { heading: 'The idea', text: 'A pool is defined by a node label, so you choose which nodes are exposed to a new version, not just how many at a time.' },
    { heading: 'Why regulated accounts like this', text: 'paused: true is a genuine validation gate inside the upgrade rather than a promise to watch dashboards. That is an auditable control.' },
    { ask: 'Do you have a way to validate a new version on a small set of nodes before the rest of the cluster follows?' },
  ],
};

export default {
  id: 'machine-config-pools',
  advanced: true,
  title: 'MachineConfigPools: how many nodes at once',
  summary: 'The cluster-level control behind an upgrade — pool concurrency, and custom pools that let you choose which nodes move first.',
  description: 'Six worker nodes upgrading under three different MachineConfigPool configurations.',
  viewBox: '0 0 680 326',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
