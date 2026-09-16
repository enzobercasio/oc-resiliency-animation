/**
 * The RHOCP upgrade flow: what oc adm upgrade actually orchestrates above
 * every animation in this set.
 *
 * Closes the set, in Going deeper, after statefulsets. Every other animation
 * happens somewhere inside this one: machine-config-pools is the per-pool
 * node concurrency this delegates to once the control plane clears, and
 * upgrade-resiliency/rollout-strategy are what happens to a single workload
 * during the node-drain step this zooms past. This is the layer above all
 * of them - the Cluster Version Operator reconciling a graph of
 * ClusterOperators, the control plane's own one-at-a-time rule, and the
 * single most common way a real upgrade actually stalls.
 *
 * Two frame shapes, switched on `kind`:
 *   { kind: 'cluster', cvoCls, cvoSub,
 *     cos: [{ id, cls, sub }], note, badge, focus }
 *   { kind: 'nodes', nodes: [{ id, status, cls }], quorum,
 *     note, badge, focus }
 */

const MODES = [
  { id: 'orchestration', label: 'CVO orchestrates the graph',
    caption: 'The Cluster Version Operator updates ClusterOperators in dependency order, not all at once' },
  { id: 'control-plane-first', label: 'Control plane before workers',
    caption: 'Master nodes update one at a time to protect etcd quorum, before any worker pool starts' },
  { id: 'degraded-blocks', label: 'A degraded operator blocks everything', advanced: true,
    caption: 'CVO will not move the version forward while any ClusterOperator reports Degraded' },
];

const CO_IDS = ['etcd', 'kube-apiserver', 'network', 'machine-config', 'ingress'];

function co(id, cls, sub) { return { id, cls, sub }; }
function allCos(map) { return CO_IDS.map((id) => co(id, map[id]?.[0] ?? 'pend', map[id]?.[1] ?? 'Available (old)')); }

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'orchestration' || modeId === 'degraded-blocks') {
    if (modeId === 'orchestration') {
      push({ kind: 'cluster', cvoCls: 'pend', cvoSub: 'target 4.15.9 · starting',
        cos: allCos({}),
        note: 'Admin runs oc adm upgrade to 4.15.9 — CVO fetches the release image',
        focus: ['desiredUpdate:', 'version: 4.15.9'],
        badge: 'The image carries a graph of ClusterOperator manifests in dependency order' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['term', 'Progressing'] }),
        note: 'CVO updates etcd first — the foundation everything else depends on',
        badge: 'Nothing else starts until etcd reports Available at the new version' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['term', 'Progressing'], network: ['term', 'Progressing'] }),
        note: 'etcd finishes. kube-apiserver and network update next, in parallel',
        badge: 'Some operators update together once their dependencies clear — this is a graph, not a strict list' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['run', 'Available (new)'], 'machine-config': ['term', 'Progressing'] }),
        note: 'machine-config updates next — the operator that will actually touch every node',
        badge: 'Everything so far has been control-plane software only. No worker node has rebooted yet' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['run', 'Available (new)'], 'machine-config': ['run', 'Available (new)'], ingress: ['term', 'Progressing'] }),
        note: 'ingress updates last in this group',
        badge: 'Order here comes from the manifest graph, not from alphabetical or arbitrary listing' });
      push({ kind: 'cluster', cvoCls: 'run', cvoSub: 'target 4.15.9 · Available',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['run', 'Available (new)'], 'machine-config': ['run', 'Available (new)'], ingress: ['run', 'Available (new)'] }),
        note: 'Every ClusterOperator now reports Available at 4.15.9',
        badge: 'CVO marks the control-plane software complete — the nodes themselves still have to reboot into it' });
    } else {
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['term', 'Progressing'] }),
        note: 'Further along the same graph — network is updating',
        badge: 'Same sequence as before, nothing unusual yet' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['term', 'Degraded'] }),
        note: 'network reports Degraded — a rollout of its own pods failed health checks',
        focus: ['Degraded'],
        badge: 'This is not the same as Progressing. Degraded means something is actually broken' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing (stalled)',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['term', 'Degraded'] }),
        note: 'CVO stops here. No other ClusterOperator advances while this stands',
        badge: 'The cluster keeps serving traffic on its current mix of versions — the upgrade itself is frozen' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing (stalled)',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['term', 'Degraded'] }),
        note: 'machine-config and ingress sit untouched — not even reached yet',
        badge: 'The most common real "stuck upgrade" is a Degraded operator, not a stuck node drain' });
      push({ kind: 'cluster', cvoCls: 'term', cvoSub: 'target 4.15.9 · Progressing (stalled)',
        cos: allCos({ etcd: ['run', 'Available (new)'], 'kube-apiserver': ['run', 'Available (new)'], network: ['term', 'Degraded'] }),
        note: 'oc get clusteroperators is where you find this before checking a single node',
        badge: 'oc adm upgrade status shows the same thing with less typing' });
    }
  }

  if (modeId === 'control-plane-first') {
    const N = (m0, m1, m2) => ['ready', 'ready', 'ready'].map((s, i) => [s, m0, m1, m2][i] || s);
    push({ kind: 'nodes', nodes: N(), quorum: '3 / 3',
      note: 'Three control plane nodes, three etcd voting members',
      badge: 'Losing one still keeps quorum (2 of 3). Losing two does not — that never changes, upgrade or not' });
    push({ kind: 'nodes', nodes: N('cordoned'), quorum: '3 / 3',
      note: 'master-0 cordons and drains — control-plane pods reschedule to the other two',
      focus: ['maxUnavailable: 1'],
      badge: 'Exactly one control-plane node at a time. There is no maxUnavailable that changes this' });
    push({ kind: 'nodes', nodes: N('rebooting'), quorum: '2 / 3',
      note: 'master-0 reboots into the new version',
      badge: 'Quorum holds at 2 of 3 for the entire window — that is the number this whole process protects' });
    push({ kind: 'nodes', nodes: N('ready', 'cordoned'), quorum: '3 / 3',
      note: 'master-0 rejoins and re-establishes 3 of 3 before master-1 even starts',
      badge: 'The next node does not begin until the previous one is fully back — a hard sequence, not a concurrency setting' });
    push({ kind: 'nodes', nodes: N('ready', 'ready', 'cordoned'), quorum: '3 / 3',
      note: 'master-1 finishes the same way. master-2 starts last',
      badge: 'Same rule, same reason, every single time' });
    push({ kind: 'nodes', nodes: N('ready', 'ready', 'ready'), quorum: '3 / 3',
      note: 'All three control plane nodes are on the new version',
      badge: 'Only now do worker pools begin — using the maxUnavailable you already configured per MachineConfigPool' });
  }

  return f;
}

function pill(x, y, w, h, cls, title, sub) {
  return `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 - 9}" text-anchor="middle" dominant-baseline="central">${title}</text>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${sub}</text></g>`;
}

const CO_X = [20, 150, 280, 410, 540];
const CO_W = 120;
const NODE_X = [40, 260, 480];
const NODE_W = 190;

function renderSVG(frame) {
  let out = '';

  if (frame.kind === 'cluster') {
    out += pill(40, 20, 600, 54, frame.cvoCls, 'ClusterVersionOperator', frame.cvoSub);
    frame.cos.forEach((c, i) => {
      out += pill(CO_X[i], 100, CO_W, 64, c.cls, c.id, c.sub);
    });
    out += '<text class="legend-text" x="40" y="200">solid = Available (new) · dashed amber = Progressing or Degraded · dotted = not started</text>';
    return out;
  }

  // kind === 'nodes'
  out += `<text class="legend-text" x="40" y="16">etcd quorum: ${frame.quorum}</text>`;
  frame.nodes.forEach((st, n) => {
    const cls = st === 'ready' ? 'node-rect' : `node-rect ${st}`;
    out += `<rect class="${cls}" x="${NODE_X[n]}" y="40" width="${NODE_W}" height="150" rx="12"/>`;
    out += `<text class="svg-title on-node" x="${NODE_X[n] + NODE_W / 2}" y="62" text-anchor="middle" dominant-baseline="central">master-${n}</text>`;
    out += `<text class="svg-sub on-node" x="${NODE_X[n] + NODE_W / 2}" y="80" text-anchor="middle" dominant-baseline="central">${st}</text>`;
  });
  out += '<text class="legend-text" x="40" y="216">solid = ready · dashed = cordoned · dashed (reboot) = rebooting</text>';
  return out;
}

function metrics(frame) {
  if (frame.kind === 'cluster') {
    const done = frame.cos.filter((c) => c.cls === 'run').length;
    const progressing = frame.cos.filter((c) => c.sub === 'Progressing' || c.sub === 'Degraded').length;
    const degraded = frame.cos.some((c) => c.sub === 'Degraded');
    return [
      { label: 'ClusterOperators updated', value: `${done} / ${CO_IDS.length}`, tone: done === CO_IDS.length ? 'ok' : 'warn' },
      { label: 'Progressing', value: String(progressing), tone: progressing ? 'warn' : 'ok' },
      { label: 'Degraded', value: degraded ? 'yes' : 'no', tone: degraded ? 'bad' : 'ok' },
    ];
  }
  const ready = frame.nodes.filter((n) => n === 'ready').length;
  return [
    { label: 'Control plane ready', value: `${ready} / 3`, tone: ready === 3 ? 'ok' : 'warn' },
    { label: 'etcd quorum', value: frame.quorum, tone: frame.quorum === '3 / 3' ? 'ok' : 'warn' },
  ];
}

const NOTES = {
  orchestration: [
    { heading: 'What to point at', text: 'etcd finishing before anything else even starts — the graph has a real dependency order, not just a list.' },
    { heading: 'Line that lands', text: 'Every other animation in this set happens inside the machine-config step of this graph. This is the process they were always part of.' },
    { ask: 'When your last cluster upgrade felt slow, could you actually name which ClusterOperator it was waiting on?' },
  ],
  'control-plane-first': [
    { heading: 'What to point at', text: 'Quorum sitting at 2 of 3 for the entire window a master is down — that number is the whole reason this is one at a time.' },
    { heading: 'Line that lands', text: 'The master MachineConfigPool has a maxUnavailable field too. It exists, and etcd quorum makes it academic.' },
    { ask: 'Do you know how long your control plane spends in this one-at-a-time phase before worker pools even begin?' },
  ],
  'degraded-blocks': [
    { heading: 'What to point at', text: 'machine-config and ingress sitting untouched the whole time network is Degraded.' },
    { heading: 'Line that lands', text: 'A stuck upgrade is usually not a stuck node drain. It is usually one ClusterOperator, and the fix belongs to that operator, not to any workload.' },
    { ask: 'Is oc get clusteroperators the first thing your team checks when an upgrade looks stalled, or the fifth?' },
  ],
};

const YAML = {
  orchestration: `apiVersion: config.openshift.io/v1
kind: ClusterVersion
metadata:
  name: version
spec:
  channel: stable-4.15
  desiredUpdate:
    version: 4.15.9
status:
  conditions:
    - type: Progressing
      status: "True"
      message: "Working towards 4.15.9: 340 of 754 done"
`,
  'control-plane-first': `apiVersion: machineconfiguration.openshift.io/v1
kind: MachineConfigPool
metadata:
  name: master
spec:
  maxUnavailable: 1
  nodeSelector:
    matchLabels:
      node-role.kubernetes.io/master: ""

# maxUnavailable: 1 is the field, but etcd quorum is
# what actually enforces one node at a time - raising
# this number here would not change that.
`,
  'degraded-blocks': `apiVersion: config.openshift.io/v1
kind: ClusterOperator
metadata:
  name: network
status:
  conditions:
    - type: Degraded
      status: "True"
      reason: RolloutHung
    - type: Progressing
      status: "True"
    - type: Available
      status: "True"

# CVO will not advance the ClusterVersion while any
# ClusterOperator reports Degraded: "True".
`,
};

const FEATURES = {
  orchestration: [
    { name: 'ClusterVersionOperator', kind: 'config.openshift.io/v1',
      what: "Reads the release image's manifest graph and applies ClusterOperator updates in dependency order — some serial, some in parallel." },
    { name: 'ClusterOperator', kind: 'config.openshift.io/v1',
      what: 'One per cluster capability (etcd, network, ingress, ...). Each reports its own Available/Progressing/Degraded independently.' },
    { name: 'spec.desiredUpdate', kind: 'ClusterVersion field',
      what: 'What oc adm upgrade actually sets. CVO reconciles toward this exactly like any other controller reconciles toward a spec.' },
  ],
  'control-plane-first': [
    { name: 'MachineConfigPool: master', kind: 'machineconfiguration.openshift.io/v1',
      what: 'The pool covering control-plane nodes — effectively always one node at a time, regardless of maxUnavailable.' },
    { name: 'etcd quorum', kind: 'control plane',
      what: 'Two of three voting members must stay up. This is the real constraint, not a configured field.' },
    { name: 'MachineConfigPool: worker', kind: 'machineconfiguration.openshift.io/v1',
      what: "Unaffected by any of this — its own maxUnavailable only starts applying once the control plane finishes." },
  ],
  'degraded-blocks': [
    { name: 'status.conditions: Degraded', kind: 'ClusterOperator',
      what: 'The signal that stops the whole upgrade, not just that one operator’s own progress.' },
    { name: 'oc adm upgrade status', kind: 'command',
      what: 'The single command that shows CVO phase and every ClusterOperator’s condition together.' },
    { name: 'ClusterVersion: Progressing', kind: 'condition',
      what: 'Stays True but stalled — the version field itself never advances while a Degraded operator blocks it.' },
  ],
};

export default {
  id: 'cluster-upgrade-flow',
  advanced: true,
  title: 'RHOCP upgrade flow: CVO, ClusterOperators, and the control plane',
  summary: 'What oc adm upgrade actually orchestrates above every other animation in this set: a graph of ClusterOperators, a control plane that always goes one node at a time, and the one failure mode that freezes all of it.',
  description: 'The Cluster Version Operator updating ClusterOperators through a dependency graph, three control-plane nodes updating one at a time to protect etcd quorum, and a Degraded ClusterOperator halting the entire upgrade.',
  viewBox: '0 0 680 230',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
