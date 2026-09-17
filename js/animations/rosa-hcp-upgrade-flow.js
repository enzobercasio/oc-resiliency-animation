/**
 * ROSA HCP upgrade flow: the same upgrade problem, a completely different
 * architecture.
 *
 * The direct companion to cluster-upgrade-flow, in Going deeper right after
 * it. Everything that animation's control-plane-first mode is about - three
 * master nodes, etcd quorum, a hard one-at-a-time sequence - does not exist
 * from a ROSA HCP customer's side at all. The control plane runs as pods in
 * a Red Hat-managed hosting cluster; a customer's account holds only worker
 * nodes, organised into NodePools that version independently of the control
 * plane by design. The third mode is the gotcha that decoupling creates: a
 * NodePool can fall far enough behind that the control plane itself refuses
 * to upgrade again until it catches up.
 *
 * One frame shape, assembled from whichever regions apply:
 *   { mgmt: [{ id, cls, sub }] | undefined,
 *     workers: ['ready'|'updating', ...] | undefined,
 *     controlPlane: { sub, cls } | undefined,
 *     pools: [{ id, sub, cls }] | undefined,
 *     note, badge, focus }
 * cls is 'run' | 'term' | 'pend', the site's usual ready / acting / waiting.
 */

const MODES = [
  { id: 'hosted-control-plane', label: 'Control plane lives elsewhere',
    caption: 'etcd, the API server, and the controllers run as pods in a Red Hat-managed hosting cluster — not as nodes in your account' },
  { id: 'nodepools-independent', label: 'NodePools upgrade independently',
    caption: 'Each NodePool has its own release image — upgrading the control plane never touches a worker' },
  { id: 'skew-limit', label: 'Version skew has a limit', advanced: true,
    caption: 'Leave a NodePool behind long enough and the control plane itself stops being able to upgrade' },
];

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'hosted-control-plane') {
    const pod = (id, cls, sub) => ({ id, cls, sub });
    const mgmt = (etcd, api, ctrl, sched) => [
      pod('etcd', etcd, etcd === 'run' ? 'Available' : 'Progressing'),
      pod('kube-apiserver', api, api === 'run' ? 'Available' : 'Progressing'),
      pod('kube-controller-manager', ctrl, ctrl === 'run' ? 'Available' : 'Progressing'),
      pod('kube-scheduler', sched, sched === 'run' ? 'Available' : 'Progressing'),
    ];
    const workers = ['ready', 'ready', 'ready'];

    push({ mgmt: mgmt('run', 'run', 'run', 'run'), workers,
      note: 'A customer requests an upgrade — nothing in their account looks like a master node',
      badge: 'The control plane already lives in a Red Hat-managed hosting cluster, as pods, not as nodes you can see or reboot' });
    push({ mgmt: mgmt('term', 'run', 'run', 'run'), workers,
      note: 'HyperShift rolls the HostedControlPlane pods — etcd first, same dependency order as any control plane',
      focus: ['release:', 'image: ocp-release'],
      badge: 'A new etcd pod starts, joins, and the old one is removed — a pod rollout, not a node reboot' });
    push({ mgmt: mgmt('run', 'term', 'term', 'run'), workers,
      note: 'kube-apiserver and kube-controller-manager follow',
      badge: 'Still nothing on your side has moved' });
    push({ mgmt: mgmt('run', 'run', 'run', 'term'), workers,
      note: 'kube-scheduler finishes last',
      badge: 'The whole sequence is minutes, not the tens of minutes a node-by-node master upgrade costs — there was never a node to reboot' });
    push({ mgmt: mgmt('run', 'run', 'run', 'run'), workers,
      note: 'Your worker nodes are still exactly where they were — nothing about this touched them',
      badge: 'Control plane and NodePools upgrade on separate tracks by design. The next mode is that track' });
  }

  if (modeId === 'nodepools-independent') {
    const pool = (id, ver, state) => ({ id, sub: `${ver} · ${state}`, cls: state === 'ready' ? 'run' : 'term' });
    const cp = { sub: '4.16.10 · Available', cls: 'run' };

    push({ controlPlane: cp,
      pools: [pool('NodePool-a', '4.15.9', 'ready'), pool('NodePool-b', '4.15.9', 'ready'), pool('NodePool-c', '4.15.9', 'ready')],
      note: 'Three NodePools, each with its own release image — independent of the control plane’s version',
      focus: ['release:', 'replicas: 3'],
      badge: 'Upgrading HostedCluster never touches a NodePool automatically — that has to be requested per pool' });
    push({ controlPlane: cp,
      pools: [pool('NodePool-a', '4.16.10', 'updating'), pool('NodePool-b', '4.15.9', 'ready'), pool('NodePool-c', '4.15.9', 'ready')],
      note: 'The canary pool upgrades first',
      badge: 'One pool, requested explicitly — nothing else in the fleet is affected yet' });
    push({ controlPlane: cp,
      pools: [pool('NodePool-a', '4.16.10', 'ready'), pool('NodePool-b', '4.15.9', 'ready'), pool('NodePool-c', '4.15.9', 'ready')],
      note: 'NodePool-a finishes at 4.16.10. b and c are still on 4.15.9, on purpose',
      badge: 'Watched in isolation before touching the rest — the blast radius of a bad node image is one pool, not the fleet' });
    push({ controlPlane: cp,
      pools: [pool('NodePool-a', '4.16.10', 'ready'), pool('NodePool-b', '4.16.10', 'updating'), pool('NodePool-c', '4.16.10', 'updating')],
      note: 'b and c follow once the canary looks healthy',
      badge: 'Still two explicit requests, not an automatic cascade from the control-plane upgrade' });
    push({ controlPlane: cp,
      pools: [pool('NodePool-a', '4.16.10', 'ready'), pool('NodePool-b', '4.16.10', 'ready'), pool('NodePool-c', '4.16.10', 'ready')],
      note: 'All three pools converge on the control plane’s version — on your schedule, not automatically',
      badge: 'Nothing here happened because the control plane upgraded. It happened because each pool was told to' });
  }

  if (modeId === 'skew-limit') {
    const pool = (id, ver, state) => ({ id, sub: `${ver} · ${state}`, cls: state === 'blocking' ? 'term' : state === 'updating' ? 'term' : 'run' });

    push({ controlPlane: { sub: '4.16.10 · Available', cls: 'run' },
      pools: [pool('NodePool-a', '4.16.10', 'ready'), pool('NodePool-b', '4.16.10', 'ready'), pool('NodePool-c', '4.14.20', 'ready')],
      note: 'Control plane at 4.16, NodePool-c still at 4.14 — two minor versions behind',
      badge: 'Still inside the supported skew — nothing blocks yet' });
    push({ controlPlane: { sub: '4.17.2 · Available', cls: 'run' },
      pools: [pool('NodePool-a', '4.17.2', 'ready'), pool('NodePool-b', '4.17.2', 'ready'), pool('NodePool-c', '4.14.20', 'ready')],
      note: 'The control plane upgrades again, to 4.17',
      badge: 'NodePool-c is now three minor versions behind — outside the supported skew' });
    push({ controlPlane: { sub: '4.17.2 · upgrade blocked', cls: 'term' },
      pools: [pool('NodePool-a', '4.17.2', 'ready'), pool('NodePool-b', '4.17.2', 'ready'), pool('NodePool-c', '4.14.20', 'blocking')],
      note: 'The next control-plane upgrade is refused while NodePool-c stays this far behind',
      focus: ['UnsupportedSkew', 'ValidReleaseImage'],
      badge: 'HyperShift will not let the gap widen further — NodePool-c has to catch up first' });
    push({ controlPlane: { sub: '4.17.2 · Available', cls: 'run' },
      pools: [pool('NodePool-a', '4.17.2', 'ready'), pool('NodePool-b', '4.17.2', 'ready'), pool('NodePool-c', '4.14.20', 'updating')],
      note: 'The fix has nothing to do with the control plane — upgrade NodePool-c, and the ceiling lifts itself',
      badge: 'The same shape as a Degraded ClusterOperator earlier — the stuck step is rarely the one you were staring at' });
  }

  return f;
}

function pill(x, y, w, h, cls, title, sub) {
  return `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 - 9}" text-anchor="middle" dominant-baseline="central">${title}</text>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${sub}</text></g>`;
}

const MGMT_X = [40, 190, 340, 490];
const MGMT_W = 130;
const NODE_X = [40, 260, 480];
const NODE_W = 190;

function renderSVG(frame) {
  let out = '';
  let y = 16;

  if (frame.mgmt) {
    out += `<text class="legend-text" x="40" y="${y}">Red Hat-managed hosting cluster · control plane pods</text>`;
    frame.mgmt.forEach((p, i) => { out += pill(MGMT_X[i], y + 16, MGMT_W, 68, p.cls, p.id, p.sub); });
    y += 16 + 68 + 22;
  }

  if (frame.workers) {
    out += `<text class="legend-text" x="40" y="${y}">Your ROSA cluster · worker nodes</text>`;
    frame.workers.forEach((st, i) => {
      out += pill(NODE_X[i], y + 16, NODE_W, 90, st === 'ready' ? 'run' : 'term', `worker-${i}`, st);
    });
    y += 16 + 90 + 22;
  }

  if (frame.controlPlane) {
    out += pill(40, y, 600, 54, frame.controlPlane.cls, 'HostedCluster control plane', frame.controlPlane.sub);
    y += 54 + 24;
  }

  if (frame.pools) {
    out += `<text class="legend-text" x="40" y="${y - 8}">NodePools</text>`;
    frame.pools.forEach((p, i) => { out += pill(NODE_X[i], y, NODE_W, 100, p.cls, p.id, p.sub); });
    y += 100 + 22;
  }

  out += `<text class="legend-text" x="40" y="${y}">solid = ready · dashed amber = updating or blocked · dotted = waiting</text>`;
  return out;
}

function metrics(frame) {
  const out = [];
  if (frame.mgmt) {
    const ready = frame.mgmt.filter((p) => p.cls === 'run').length;
    out.push({ label: 'Control plane pods', value: `${ready} / ${frame.mgmt.length}`, tone: ready === frame.mgmt.length ? 'ok' : 'warn' });
  }
  if (frame.workers) {
    const ready = frame.workers.filter((s) => s === 'ready').length;
    out.push({ label: 'Worker nodes', value: `${ready} / ${frame.workers.length}`, tone: ready === frame.workers.length ? 'ok' : 'warn' });
  }
  if (frame.controlPlane) {
    out.push({ label: 'Control plane', value: frame.controlPlane.sub, tone: frame.controlPlane.cls === 'run' ? 'ok' : 'bad' });
  }
  if (frame.pools) {
    const ready = frame.pools.filter((p) => p.cls === 'run').length;
    out.push({ label: 'NodePools ready', value: `${ready} / ${frame.pools.length}`, tone: ready === frame.pools.length ? 'ok' : 'warn' });
  }
  return out;
}

const NOTES = {
  'hosted-control-plane': [
    { heading: 'What to point at', text: 'There is no master-0, master-1, master-2 anywhere in this picture — compare that directly to the control-plane-first mode in the last animation.' },
    { heading: 'Line that lands', text: 'A control-plane upgrade here is a pod rollout Red Hat operates in its own cluster. Etcd quorum, node reboots, maxUnavailable on the master pool — none of it is your problem anymore.' },
    { ask: 'If someone on your team still pictures three master nodes when they hear "control plane," how would you correct that in one sentence?' },
  ],
  'nodepools-independent': [
    { heading: 'What to point at', text: 'NodePool-a finishing while b and c sit untouched, on an older version, on purpose.' },
    { heading: 'Line that lands', text: 'This is not a paused MachineConfigPool waiting to resume. Each NodePool has its own release field — they stay wherever you leave them until you say otherwise.' },
    { ask: 'Do you canary a single NodePool before rolling an upgrade to the rest of your fleet, or does everything move together?' },
  ],
  'skew-limit': [
    { heading: 'What to point at', text: 'The control plane itself refusing to upgrade further — not because anything is Degraded, but because of a NodePool nobody has touched.' },
    { heading: 'Line that lands', text: 'Decoupled versioning cuts both ways: NodePools upgrade independently, but they cannot fall arbitrarily far behind forever.' },
    { ask: 'Do you know today which of your NodePools is furthest behind your control plane, and by how many minor versions?' },
  ],
};

const YAML = {
  'hosted-control-plane': `apiVersion: hypershift.openshift.io/v1beta1
kind: HostedCluster
metadata:
  name: my-rosa-cluster
spec:
  release:
    image: ocp-release:4.16.10-x86_64
  controllerAvailabilityPolicy: HighlyAvailable

# spec.release is the only field that moves here.
# Every control-plane pod - etcd, kube-apiserver,
# kube-controller-manager, kube-scheduler - lives in
# Red Hat's management cluster as a Deployment, not
# as something in your account at all.
`,
  'nodepools-independent': `apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: workers-a
spec:
  clusterName: my-rosa-cluster
  release:
    image: ocp-release:4.15.9-x86_64
  replicas: 3

# Each NodePool has its own spec.release, separate
# from the HostedCluster's. Upgrading the control
# plane never touches this field - a NodePool
# upgrade is a distinct, explicit request per pool.
`,
  'skew-limit': `apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: workers-c
status:
  conditions:
    - type: ValidReleaseImage
      status: "False"
      reason: UnsupportedSkew
      message: "control plane is too far ahead"

# HyperShift enforces a supported skew between the
# HostedCluster's version and every NodePool's. Past
# that gap, the control plane itself cannot upgrade
# again until the lagging pool catches up.
`,
};

const FEATURES = {
  'hosted-control-plane': [
    { name: 'HostedCluster', kind: 'hypershift.openshift.io/v1beta1',
      what: 'Represents the cluster from the management side. spec.release is the field that drives a control-plane upgrade.' },
    { name: 'HostedControlPlane', kind: 'hypershift.openshift.io/v1beta1',
      what: 'The actual etcd, kube-apiserver, and controller pods, running in the management cluster and reconciled to match the HostedCluster spec.' },
    { name: 'HyperShift operator', kind: 'control plane',
      what: 'Runs in the management cluster and rolls the control-plane pods forward, the same dependency-ordered way any control plane upgrades.' },
  ],
  'nodepools-independent': [
    { name: 'NodePool', kind: 'hypershift.openshift.io/v1beta1',
      what: 'One resource per pool of worker nodes, with its own spec.release — independent of the HostedCluster it belongs to.' },
    { name: 'spec.release', kind: 'NodePool field',
      what: 'The only thing that changes to upgrade a pool. Upgrading the HostedCluster never touches this field on any NodePool.' },
    { name: 'Canary pool', kind: 'pattern',
      what: 'Upgrade one NodePool, watch it, then upgrade the rest — a first-class workflow here, not a manual MachineConfigPool pause.' },
  ],
  'skew-limit': [
    { name: 'Supported skew', kind: 'HyperShift policy',
      what: 'The maximum version gap HyperShift allows between a HostedCluster and any of its NodePools.' },
    { name: 'status.conditions: ValidReleaseImage', kind: 'NodePool',
      what: 'Turns False with reason UnsupportedSkew once a pool falls further behind than policy allows.' },
    { name: 'HyperShift operator', kind: 'control plane',
      what: 'Refuses the next HostedCluster upgrade while any NodePool sits outside the supported skew, rather than letting the gap widen further.' },
  ],
};

export default {
  id: 'rosa-hcp-upgrade-flow',
  advanced: true,
  title: 'ROSA HCP upgrade flow: hosted control planes and NodePools',
  summary: 'The same upgrade problem, a completely different architecture: the control plane runs as pods you never see, NodePools version independently by design, and falling too far behind has its own failure mode.',
  description: 'A HostedCluster’s control plane rolling as pods inside a Red Hat-managed hosting cluster while worker nodes stay untouched, three NodePools upgrading independently on their own schedule, and a NodePool left far enough behind that the control plane itself can no longer upgrade.',
  viewBox: '0 0 680 300',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
