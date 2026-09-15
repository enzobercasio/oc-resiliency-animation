/**
 * StatefulSets: what changes when the workload has state.
 *
 * Every other animation in this set treats pods as interchangeable. Here they
 * are not: each has a fixed ordinal, a stable DNS name and its own volume, and
 * that volume is the thing that makes a drain slow.
 *
 * Frame shape:
 *   { nodes: ['ready'|'cordoned'],
 *     pods: [{ id, ord, node: idx|null, s: 'r'|'t'|'p', ver: 'old'|'new',
 *              vol: 'attached'|'detaching'|'detached'|'attaching' }],
 *     note, badge, focus }
 */

const COL_X = [40, 245, 450];
const COL_W = 190;
const MEMBERS = 3;
const QUORUM = 2;

const MODES = [
  { id: 'identity', label: 'Stable identity',
    caption: 'Each pod keeps its name, its DNS address and its own volume — replacements are not new members' },
  { id: 'ordered-rollout', label: 'Ordered rollout',
    caption: 'updateStrategy RollingUpdate works down from the highest ordinal, one member at a time' },
  { id: 'node-drain', label: 'Drain with a volume', advanced: true,
    caption: 'Why a drained stateful pod takes far longer to come back than a stateless one' },
];

function pod(ord, node, s = 'r', vol = 'attached', ver = 'old') {
  return { id: `db-${ord}`, ord, node, s, vol, ver };
}

function buildFrames(modeId) {
  const f = [];
  const nodes = ['ready', 'ready', 'ready'];
  let pods = [pod(0, 0), pod(1, 1), pod(2, 2)];
  const push = (note, badge, focus) => f.push({
    nodes: [...nodes], pods: pods.map((p) => ({ ...p })), note, badge, focus,
  });

  if (modeId === 'identity') {
    push('Three members, each with a fixed ordinal and its own volume',
      'A Deployment names pods randomly and shares nothing. A StatefulSet gives each one an identity it keeps',
      ['volumeClaimTemplates', 'serviceName: db']);

    pods[1] = pod(1, 1, 't', 'detaching');
    push('The pod db-1 is lost',
      'Its volume begins detaching. Nothing about the PersistentVolumeClaim is deleted',
      ['accessModes: [ReadWriteOnce]']);

    pods[1] = pod(1, null, 'p', 'detached');
    push('The pod is gone; pvc-db-1 still exists and still holds the data',
      'The claim outlives the pod deliberately — this is the whole point of a volumeClaimTemplate',
      ['volumeClaimTemplates', 'name: data']);

    pods[1] = pod(1, 1, 'p', 'attaching');
    push('The replacement is created with the same name: db-1',
      'Not a new member with a new name. The StatefulSet controller recreates the specific ordinal that went missing',
      ['podManagementPolicy: OrderedReady']);

    pods[1] = pod(1, 1, 'r', 'attached');
    push('Same identity, same DNS record, same volume, same data',
      'db-1.db.svc.cluster.local resolves again — the headless Service gives every ordinal a stable address',
      ['serviceName: db']);

    push('This is what a StatefulSet buys you',
      'Pods stop being cattle. Each one is a specific member of a cluster, and the rest of the cluster knows it by name',
      ['kind: StatefulSet']);
  }

  if (modeId === 'ordered-rollout') {
    push('A new image is applied to all three members',
      'A Deployment would start replacing pods in parallel. A StatefulSet will not',
      ['updateStrategy:', 'type: RollingUpdate']);

    for (let ord = MEMBERS - 1; ord >= 0; ord -= 1) {
      pods[ord] = pod(ord, ord, 't', 'detaching');
      push(`Highest remaining ordinal goes first: db-${ord}`,
        'Reverse ordinal order, always. For a quorum database this keeps the leader — usually db-0 — until last',
        ['partition: 0']);
      pods[ord] = pod(ord, ord, 'r', 'attached', 'new');
      push(`db-${ord} is Ready again on the new version`,
        'Only now does the next member move. OrderedReady means a member that never becomes Ready stops the rollout dead',
        ['podManagementPolicy: OrderedReady']);
    }

    push('Rollout complete — three sequential restarts, each gated on Ready',
      'Slower than a Deployment by design. Raise partition to hold the low ordinals back and canary the high ones first',
      ['partition: 0']);
  }

  if (modeId === 'node-drain') {
    push('Three members, one per node. Quorum needs two of three',
      'The PDB is sized for quorum, not for capacity — losing a second member makes the cluster unwritable',
      ['minAvailable: 2']);

    nodes[2] = 'cordoned';
    push('The node holding db-2 is cordoned for an upgrade',
      'Same drain as any other workload. What follows is not the same',
      ['minAvailable: 2']);

    pods[2] = pod(2, 2, 't', 'detaching');
    push('db-2 is evicted and begins shutting down',
      'Quorum holds at 2 of 3. A database also wants a long grace period here to flush and checkpoint cleanly',
      ['terminationGracePeriodSeconds: 120']);

    pods[2] = pod(2, null, 'p', 'detached');
    push('The pod cannot start anywhere until the volume finishes detaching',
      'ReadWriteOnce means exactly one node may mount it. Detach-then-attach is a control-plane operation measured in tens of seconds',
      ['accessModes: [ReadWriteOnce]']);

    pods[2] = pod(2, 0, 'p', 'attaching');
    push('Scheduled onto node 1, and the volume attaches there',
      'A stateless pod would already be serving by now. This one is still waiting on storage',
      ['storageClassName: gp3-csi']);

    pods[2] = pod(2, 0, 'r', 'attached');
    push('db-2 is back, on a different node, with the same data',
      'The gap was far longer than a stateless restart — plan drain windows for stateful workloads on attach time, not pod start time',
      ['minAvailable: 2']);

    push('And this only worked because both nodes are in the same zone',
      'A zone-pinned block volume cannot attach to a node elsewhere. Spread constraints on a stateful set are bounded by where the storage can follow',
      ['volumeBindingMode: WaitForFirstConsumer']);
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  // nodes
  frame.nodes.forEach((st, n) => {
    const cls = st === 'cordoned' ? 'node-rect cordoned' : 'node-rect';
    out += `<rect class="${cls}" x="${COL_X[n]}" y="72" width="${COL_W}" height="106" rx="10"/>`;
    out += `<text class="svg-sub on-node" x="${COL_X[n] + 12}" y="92" text-anchor="start">node ${n + 1}${st === 'cordoned' ? ' · cordoned' : ''}</text>`;
  });

  // pods, drawn in their node
  frame.pods.forEach((p) => {
    if (p.node === null) return;
    const x = COL_X[p.node] + 18;
    const cls = p.s === 'r' ? 'run' : p.s === 't' ? 'term' : 'pend';
    const state = p.s === 'r' ? `ready · ${p.ver === 'new' ? 'v2' : 'v1'}` : p.s === 't' ? 'terminating' : 'starting';
    out += `<g class="pod ${cls}"><rect x="${x}" y="108" width="154" height="46" rx="6"/>`
        + `<text class="svg-sub" x="${x + 77}" y="122" text-anchor="middle" dominant-baseline="central">${p.id}</text>`
        + `<text class="svg-sub" x="${x + 77}" y="140" text-anchor="middle" dominant-baseline="central">${state}</text></g>`;
  });

  // claims, always in their ordinal's column - they do not move
  frame.pods.forEach((p) => {
    const x = COL_X[p.ord];
    const cls = p.vol === 'attached' ? 'run' : p.vol === 'detached' ? 'pend' : 'term';
    out += `<g class="pod ${cls}"><rect x="${x}" y="240" width="${COL_W}" height="44" rx="6"/>`
        + `<text class="svg-sub" x="${x + COL_W / 2}" y="254" text-anchor="middle" dominant-baseline="central">pvc-${p.id} · RWO</text>`
        + `<text class="svg-sub" x="${x + COL_W / 2}" y="271" text-anchor="middle" dominant-baseline="central">${p.vol}</text></g>`;

    // attachment path: pod to its claim. A diagonal means the volume had to
    // detach from one node and reattach to another.
    if (p.node !== null && p.vol !== 'detached') {
      const from = COL_X[p.node] + 95;
      const to = x + COL_W / 2;
      const cls2 = p.vol === 'attached' ? 'track-line' : 'marker-line';
      out += `<line class="${cls2}" x1="${from}" y1="156" x2="${to}" y2="238"/>`;
    }
  });

  const ready = frame.pods.filter((p) => p.s === 'r').length;
  out += `<text class="legend-text" x="40" y="306">`
      + `${ready} of ${MEMBERS} members ready · quorum needs ${QUORUM} · `
      + 'a diagonal means the volume detached from one node and reattached to another</text>';
  return out;
}

function metrics(frame) {
  const ready = frame.pods.filter((p) => p.s === 'r').length;
  const attached = frame.pods.filter((p) => p.vol === 'attached').length;
  const moving = frame.pods.filter((p) => p.vol === 'detaching' || p.vol === 'attaching').length;
  return [
    { label: 'Members ready', value: `${ready} / ${MEMBERS}`, tone: ready === MEMBERS ? 'ok' : ready >= QUORUM ? 'warn' : 'bad' },
    { label: 'Quorum', value: ready >= QUORUM ? 'held' : 'lost', tone: ready >= QUORUM ? 'ok' : 'bad' },
    { label: 'Volumes attached', value: `${attached} / ${MEMBERS}`, tone: attached === MEMBERS ? 'ok' : 'warn' },
    { label: 'Storage in flight', value: moving ? `${moving} moving` : 'settled', tone: moving ? 'warn' : 'ok' },
  ];
}

const BASE = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db                 # headless Service
  replicas: 3
  podManagementPolicy: OrderedReady
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      partition: 0              # canary high ordinals
  selector:
    matchLabels:
      app: db
  template:
    spec:
      terminationGracePeriodSeconds: 120
      containers:
        - name: db
          volumeMounts:
            - name: data
              mountPath: /var/lib/pgsql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: gp3-csi
        resources:
          requests:
            storage: 100Gi
`;

const PDB = `---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: db-pdb
spec:
  minAvailable: 2                 # quorum, not capacity
  selector:
    matchLabels:
      app: db
`;

const YAML = {
  identity: BASE + `
# Each replica gets its own PVC from the template:
#   data-db-0, data-db-1, data-db-2
# Deleting the StatefulSet does NOT delete them.
`,
  'ordered-rollout': BASE + `
# partition: 2 would update only db-2 and hold the
# rest - a canary for a stateful cluster.
# podManagementPolicy applies to scale-up and down,
# updateStrategy applies to template changes.
`,
  'node-drain': BASE + PDB + `
# The volume decides where the pod may go:
#   volumeBindingMode: WaitForFirstConsumer
# binds the PV in the zone the pod first lands in.
# After that, the pod cannot move out of that zone.
`,
};

const F = {
  sts: { name: 'StatefulSet', kind: 'apps/v1', what: 'For workloads where pods are not interchangeable. Guarantees a stable ordinal, a stable network identity and a stable volume per replica, at the cost of slower, serialised operations.' },
  svc: { name: 'spec.serviceName', kind: 'StatefulSet', what: 'The headless Service that gives each ordinal a predictable DNS name such as db-1.db.svc.cluster.local. This is how cluster members find each other rather than through a load balancer.' },
  vct: { name: 'volumeClaimTemplates', kind: 'StatefulSet', what: 'Creates one PersistentVolumeClaim per replica, named after the ordinal. The claim outlives the pod on purpose, so a replacement with the same name gets the same data back.' },
  pmp: { name: 'podManagementPolicy', kind: 'StatefulSet', what: 'OrderedReady starts and stops pods one at a time in ordinal order, waiting for Ready. Parallel does them all at once — correct only for members that do not need each other to start.' },
  upd: { name: 'updateStrategy', kind: 'StatefulSet', what: 'RollingUpdate replaces pods from the highest ordinal down, one at a time. OnDelete does nothing until you delete a pod yourself, which some database operators rely on.' },
  part: { name: 'rollingUpdate.partition', kind: 'StatefulSet', what: 'Only ordinals at or above this number are updated. Set it to 2 on a three-member set to canary db-2 alone, then lower it to roll the rest.' },
  rwo: { name: 'accessModes: ReadWriteOnce', kind: 'PVC', what: 'Exactly one node may mount the volume at a time. This is why a drained stateful pod waits for a detach before it can start elsewhere, and why two replicas cannot share a claim.' },
  vbm: { name: 'volumeBindingMode', kind: 'StorageClass', what: 'WaitForFirstConsumer binds the volume in whichever zone the pod is scheduled into, avoiding a volume stranded where no pod can reach it. After binding, the pod is pinned to that zone.' },
  csi: { name: 'CSI attach / detach', kind: 'storage', what: 'A control-plane operation taking tens of seconds, not milliseconds. It usually dominates stateful recovery time — size drain windows on attach time rather than on pod start time.' },
  pdb: { name: 'PodDisruptionBudget', kind: 'policy/v1', what: 'For a quorum system, size this for quorum rather than capacity: minAvailable: 2 of 3 keeps the cluster writable. Getting this wrong loses the database rather than degrading it.' },
  grace: { name: 'terminationGracePeriodSeconds', kind: 'pod spec', what: 'Stateful workloads need far longer than web services — enough to flush buffers, checkpoint and hand over a leader role. A SIGKILL mid-write is how you end up restoring from backup.' },
  spread: { name: 'topologySpreadConstraints', kind: 'pod spec', what: 'Still worth setting, but bounded by storage: a replica can only be spread to a zone its volume can follow. Stateful spread is a scheduling and storage decision together.' },
};

const FEATURES = {
  identity: [F.sts, F.svc, F.vct, F.rwo, F.pmp],
  'ordered-rollout': [F.sts, F.upd, F.part, F.pmp, F.grace],
  'node-drain': [F.sts, F.rwo, F.csi, F.vbm, F.pdb, F.grace, F.spread],
};

const NOTES = {
  identity: [
    { heading: 'What to point at', text: 'The replacement pod is called db-1, not a new random name. The claim in that column never moved or changed.' },
    { heading: 'The contrast to draw', text: 'Every earlier animation treated pods as cattle. Here the rest of the cluster knows this member by name, and a replacement has to be that same member.' },
    { ask: 'Which of your workloads are running as Deployments today but actually have per-instance state?' },
  ],
  'ordered-rollout': [
    { heading: 'What to point at', text: 'Highest ordinal first, one at a time, each gated on Ready. There is no maxSurge or maxUnavailable to tune here.' },
    { heading: 'The failure mode', text: 'OrderedReady means a member that never becomes Ready stops the rollout dead. That is usually correct for a database and very confusing the first time you meet it.' },
    { ask: 'For your stateful workloads, do you know whether the leader is the first or the last pod to be replaced?' },
  ],
  'node-drain': [
    { heading: 'The number that matters', text: 'Detach plus attach is tens of seconds before the pod can even start. Stateful drain windows should be sized on attach time, not pod start time.' },
    { heading: 'The constraint people miss', text: 'A zone-pinned block volume cannot attach to a node in another zone. Spread constraints on a StatefulSet are bounded by where the storage is allowed to follow.' },
    { ask: 'Are your stateful PDBs sized for quorum, or copied from a stateless workload?' },
  ],
};

export default {
  id: 'statefulsets',
  advanced: true,
  title: 'StatefulSets: when pods are not interchangeable',
  summary: 'Stable identity, ordered rollouts and the volume attach that dominates recovery time for stateful workloads.',
  description: 'A three-member stateful database with per-replica persistent volumes, through pod loss, an ordered rollout and a node drain.',
  viewBox: '0 0 680 320',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
