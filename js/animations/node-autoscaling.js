/**
 * Node autoscaling: the cluster autoscaler and Karpenter.
 *
 * The direct sequel to autoscaling. HPA adds pods; when no node has room for
 * them they go Pending, and something has to add a node. Both controllers
 * here react to exactly that - Pending pods, judged by requests, never by
 * CPU usage. The cluster autoscaler grows a node group of one fixed instance
 * type (an OpenShift MachineSet, bounded by a MachineAutoscaler) and shrinks
 * it when a node's pods fit elsewhere - unless a pod says it must not move.
 * Karpenter skips node groups entirely: it sizes and launches an instance per
 * batch of Pending pods, then consolidates nodes afterwards to cut cost, at
 * the price of pod restarts nobody asked for.
 *
 * Frame shape:
 *   { ctl: { title, sub, cls },
 *     pending: ['pod-id', ...],
 *     nodes: [{ name, sub, state, pods: [{ id, cls }] } | null],
 *     note, badge, focus }
 * state is ready | provisioning | draining; null is an empty node slot, so a
 * node keeps its position while its neighbours come and go.
 */

const MODES = [
  { id: 'ca-scale-up', label: 'Cluster autoscaler: scale up',
    caption: 'Pending pods trigger it — it grows a MachineSet of one fixed instance type, within MachineAutoscaler bounds' },
  { id: 'ca-scale-down', label: 'Cluster autoscaler: scale down',
    caption: 'An underused node is drained and removed — unless one of its pods refuses to move' },
  { id: 'karpenter', label: 'Karpenter: right-sized nodes',
    caption: 'No node groups: Pending pods are batched and a best-fit instance type is launched directly' },
  { id: 'karpenter-consolidation', label: 'Karpenter: consolidation', advanced: true,
    caption: 'Karpenter keeps removing or replacing nodes to cut cost — every move is a pod restart' },
];

const SLOTS = 4;
const p = (id, cls = 'run') => ({ id, cls });
const n = (name, sub, state, pods = []) => ({ name, sub, state, pods });
const FULL_A = [p('web-1'), p('web-2'), p('api-1'), p('api-2')];
const FULL_B = [p('web-3'), p('web-4'), p('api-3'), p('db-0')];

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'ca-scale-up') {
    const a = n('node-a', 'm5.xlarge', 'ready', FULL_A);
    const b = n('node-b', 'm5.xlarge', 'ready', FULL_B);
    const ctl = (sub, cls) => ({ title: 'Cluster autoscaler', sub, cls });

    push({ ctl: ctl('watching for Pending pods · 2 of max 6 nodes', 'run'), pending: [], nodes: [a, b, null],
      note: 'Two workers, every slot taken — by requests, not necessarily by usage',
      badge: 'Node autoscalers count requests, the same numbers the scheduler uses. CPU at 30% can still mean full' });
    push({ ctl: ctl('2 pods Pending · Insufficient memory', 'term'), pending: ['web-5', 'web-6'], nodes: [a, b, null],
      note: 'HPA adds two replicas. Neither fits anywhere, so both go Pending',
      badge: '“0/2 nodes are available: Insufficient memory.” That FailedScheduling event is the autoscaler’s only trigger' });
    push({ ctl: ctl('simulating: would a new MachineSet node fit them?', 'pend'), pending: ['web-5', 'web-6'], nodes: [a, b, null],
      note: 'It simulates scheduling the Pending pods onto each MachineSet’s template',
      focus: ['kind: MachineSet'],
      badge: 'A node group is one fixed instance type. The autoscaler only picks which group to grow — never the machine size' });
    push({ ctl: ctl('MachineSet worker-us-east-1a: 2 → 3', 'term'), pending: ['web-5', 'web-6'],
      nodes: [a, b, n('node-c', 'provisioning', 'provisioning')],
      note: 'It raises the MachineSet’s replicas — never past MachineAutoscaler’s maxReplicas',
      focus: ['maxReplicas: 6', 'maxNodesTotal'],
      badge: 'A new Machine means an EC2 instance booting, joining and getting its config. Minutes, not seconds' });
    push({ ctl: ctl('node-c Ready', 'run'), pending: ['web-5', 'web-6'],
      nodes: [a, b, n('node-c', 'm5.xlarge', 'ready')],
      note: 'The node is Ready. Only now can the Pending pods be scheduled',
      badge: 'All the time between Pending and Ready, users were short of that capacity — this is why HPA headroom matters' });
    push({ ctl: ctl('idle · 3 of max 6 nodes', 'run'), pending: [],
      nodes: [a, b, n('node-c', 'm5.xlarge', 'ready', [p('web-5'), p('web-6')])],
      note: 'Scheduled. The autoscaler never placed a pod — it only made room for the scheduler',
      badge: 'At maxReplicas or maxNodesTotal it stops, and anything still Pending simply stays Pending' });
  }

  if (modeId === 'ca-scale-down') {
    const a = n('node-a', 'm5.xlarge', 'ready', FULL_A);
    const ctl = (sub, cls) => ({ title: 'Cluster autoscaler · scale-down', sub, cls });

    push({ ctl: ctl('evaluating nodes below 40% requested', 'run'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('web-3'), p('api-3')]), n('node-c', 'm5.xlarge', 'ready', [p('web-5')])],
      note: 'Load drops and HPA scales in — node-c is left holding a single pod',
      focus: ['utilizationThreshold'],
      badge: 'One pod’s requests out of node-c’s allocatable: well under the utilizationThreshold' });
    push({ ctl: ctl('node-c unneeded for 5m · web-5 fits on node-b', 'pend'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('web-3'), p('api-3')]), n('node-c', 'm5.xlarge', 'ready', [p('web-5')])],
      note: 'It stays under the threshold for unneededTime, and every pod on it has somewhere else to go',
      focus: ['unneededTime'],
      badge: 'Both conditions, not either: low utilization alone never removes a node' });
    push({ ctl: ctl('draining node-c', 'term'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('web-3'), p('api-3'), p('web-5', 'pend')]), n('node-c', 'draining', 'draining', [p('web-5', 'term')])],
      note: 'node-c is cordoned and drained — through the eviction API, so PDBs apply',
      badge: 'The same eviction path an upgrade drain uses. A PDB with no headroom stalls it here too' });
    push({ ctl: ctl('MachineSet worker-us-east-1a: 3 → 2', 'run'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('web-3'), p('api-3'), p('web-5')]), null],
      note: 'node-c’s Machine is deleted and the instance terminated',
      focus: ['minReplicas: 2'],
      badge: 'Never below the MachineAutoscaler’s minReplicas, however idle the pool gets' });
    push({ ctl: ctl('node-b not removable: cache-0 safe-to-evict "false"', 'term'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('cache-0')]), null],
      note: 'Later, node-b is down to one pod — and that pod says it must not be evicted',
      focus: ['safe-to-evict'],
      badge: 'node-b stays up, paid for and nearly empty, until someone changes the pod. The autoscaler logs why, and waits' });
  }

  if (modeId === 'karpenter') {
    const a = n('node-a', 'm5.xlarge', 'ready', FULL_A);
    const b = n('node-b', 'm5.xlarge', 'ready', FULL_B);
    const burst = ['web-5', 'web-6', 'web-7', 'web-8'];
    const ctl = (sub, cls) => ({ title: 'Karpenter', sub, cls });

    push({ ctl: ctl('watching for Pending pods · NodePool general', 'run'), pending: [], nodes: [a, b, null],
      note: 'Same starting point: two full workers and a burst on the way',
      badge: 'No MachineSets, no node groups to grow — Karpenter launches instances itself' });
    push({ ctl: ctl('4 pods Pending · batching', 'term'), pending: burst, nodes: [a, b, null],
      note: 'HPA adds four replicas at once. All four go Pending',
      badge: 'Karpenter waits a few seconds to batch them, so one launch can be sized for all four' });
    push({ ctl: ctl('4 × web requests → cheapest fit in c, m, r families', 'pend'), pending: burst, nodes: [a, b, null],
      note: 'It sums their requests and picks the cheapest instance type the NodePool allows',
      focus: ['instance-category', 'capacity-type'],
      badge: 'Instance type is chosen per launch, not fixed per group — the core difference from the cluster autoscaler' });
    push({ ctl: ctl('NodeClaim → EC2 instance c6i.2xlarge', 'term'), pending: burst,
      nodes: [a, b, n('node-k', 'provisioning', 'provisioning')],
      note: 'A NodeClaim becomes an EC2 instance directly — nothing like a MachineSet in between',
      focus: ['kind: NodePool', 'nodeClassRef'],
      badge: 'Usually quicker to Ready than growing a node group, but the instance still has to boot and join' });
    push({ ctl: ctl('idle · 3 nodes · within limits cpu 1000', 'run'), pending: [],
      nodes: [a, b, n('node-k', 'c6i.2xlarge', 'ready', burst.map((id) => p(id)))],
      note: 'One right-sized node, all four pods scheduled on it',
      focus: ['cpu: "1000"'],
      badge: 'The limits field is the ceiling. The cluster autoscaler would have added nodes of the group’s fixed size, possibly two' });
  }

  if (modeId === 'karpenter-consolidation') {
    const a = n('node-a', 'm5.xlarge', 'ready', FULL_A);
    const ctl = (sub, cls) => ({ title: 'Karpenter · disruption', sub, cls });

    push({ ctl: ctl('consolidationPolicy: WhenEmptyOrUnderutilized', 'run'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('api-3')]), n('node-k', 'c6i.2xlarge', 'ready', [p('web-5'), p('web-6')])],
      note: 'Load drops. node-b and node-k are both mostly empty',
      focus: ['consolidationPolicy'],
      badge: 'Karpenter keeps asking whether the cluster could be cheaper, not just whether it is full' });
    push({ ctl: ctl('simulating: can node-b be deleted or replaced?', 'pend'), pending: [],
      nodes: [a, n('node-b', 'm5.xlarge', 'ready', [p('api-3')]), n('node-k', 'c6i.2xlarge', 'ready', [p('web-5'), p('web-6')])],
      note: 'It checks every node: delete it if its pods fit elsewhere, replace it if a cheaper instance would hold them',
      focus: ['consolidateAfter'],
      badge: 'api-3 fits on node-k, so node-b can simply go' });
    push({ ctl: ctl('disrupting node-b · budget allows 10% of nodes', 'term'), pending: [],
      nodes: [a, n('node-b', 'draining', 'draining', [p('api-3', 'term')]), n('node-k', 'c6i.2xlarge', 'ready', [p('web-5'), p('web-6'), p('api-3', 'pend')])],
      note: 'node-b is tainted and drained. PDBs still apply to every eviction',
      focus: ['nodes: "10%"'],
      badge: 'The NodePool’s disruption budget caps how many nodes it may disrupt at once' });
    push({ ctl: ctl('node-b deleted · 3 → 2 nodes', 'run'), pending: [],
      nodes: [a, null, n('node-k', 'c6i.2xlarge', 'ready', [p('web-5'), p('web-6'), p('api-3')])],
      note: 'A cheaper cluster — paid for with a pod restart nobody asked for',
      focus: ['do-not-disrupt', 'schedule:'],
      badge: 'Annotate pods that must not move with karpenter.sh/do-not-disrupt, and use a scheduled budget to block business hours' });
  }

  return f;
}

const NODE_X = [180, 300, 420, 540];
const NODE_W = 110;
const TOP = 76;
const BOX_H = 162;
const POD_W = 90;
const POD_H = 22;

function podBox(x, y, pd) {
  return `<g class="pod ${pd.cls}"><rect x="${x}" y="${y}" width="${POD_W}" height="${POD_H}" rx="5"/>`
      + `<text class="svg-sub" x="${x + POD_W / 2}" y="${y + POD_H / 2}" text-anchor="middle" dominant-baseline="central">${pd.id}</text></g>`;
}

function emptySlot(x, y) {
  return `<rect class="marker-line" x="${x}" y="${y}" width="${POD_W}" height="${POD_H}" rx="5" fill="none"/>`;
}

function renderSVG(frame) {
  let out = `<g class="pod ${frame.ctl.cls}"><rect x="40" y="10" width="600" height="50" rx="8"/>`
      + `<text class="svg-sub" x="340" y="26" text-anchor="middle" dominant-baseline="central">${frame.ctl.title}</text>`
      + `<text class="svg-sub" x="340" y="44" text-anchor="middle" dominant-baseline="central">${frame.ctl.sub}</text></g>`;

  out += `<rect class="node-rect${frame.pending.length ? ' cordoned' : ''}" x="40" y="${TOP}" width="${NODE_W}" height="${BOX_H}" rx="8"/>`
      + `<text class="svg-title on-node" x="95" y="${TOP + 18}" text-anchor="middle">Pending</text>`
      + `<text class="svg-sub on-node" x="95" y="${TOP + 34}" text-anchor="middle">${frame.pending.length ? 'no node fits' : 'none'}</text>`;
  frame.pending.forEach((id, i) => { out += podBox(50, TOP + 44 + i * 28, p(id, 'pend')); });

  frame.nodes.forEach((nd, i) => {
    if (!nd) return;
    const x = NODE_X[i];
    const cls = nd.state === 'ready' ? '' : nd.state === 'draining' ? ' cordoned' : ' rebooting';
    out += `<rect class="node-rect${cls}" x="${x}" y="${TOP}" width="${NODE_W}" height="${BOX_H}" rx="8"/>`
        + `<text class="svg-title on-node" x="${x + NODE_W / 2}" y="${TOP + 18}" text-anchor="middle">${nd.name}</text>`
        + `<text class="svg-sub on-node" x="${x + NODE_W / 2}" y="${TOP + 34}" text-anchor="middle">${nd.sub}</text>`;
    for (let s = 0; s < SLOTS; s++) {
      const y = TOP + 44 + s * 28;
      out += nd.pods[s] ? podBox(x + 10, y, nd.pods[s]) : emptySlot(x + 10, y);
    }
  });

  out += `<text class="legend-text" x="40" y="${TOP + BOX_H + 22}">each node has 4 pod slots by requests · dotted pod = Pending or starting · dashed = evicting</text>`;
  return out;
}

function metrics(frame) {
  const nodes = frame.nodes.filter(Boolean);
  const ready = nodes.filter((nd) => nd.state === 'ready').length;
  const running = nodes.flatMap((nd) => nd.pods).filter((pd) => pd.cls === 'run').length;
  const flux = nodes.flatMap((nd) => nd.pods).filter((pd) => pd.cls !== 'run').length;
  return [
    { label: 'Nodes Ready', value: `${ready} / ${nodes.length}`, tone: ready === nodes.length ? 'ok' : 'warn' },
    { label: 'Pods running', value: String(running) },
    { label: 'Pending', value: String(frame.pending.length), tone: frame.pending.length ? 'bad' : 'ok' },
    { label: 'Moving', value: String(flux), tone: flux ? 'warn' : 'ok' },
  ];
}

const NOTES = {
  'ca-scale-up': [
    { heading: 'What to point at', text: 'The gap between frame 2 and frame 5: pods Pending the whole time a machine boots. That wait is the real cost of running without headroom.' },
    { heading: 'Line that lands', text: 'The cluster autoscaler never looks at CPU. It reacts to pods that cannot be scheduled by their requests, and it can only grow a node group of a size someone chose in advance.' },
    { ask: 'How long does a new worker take to go from Machine created to Ready in your environment — and what does your HPA do in the meantime?' },
  ],
  'ca-scale-down': [
    { heading: 'What to point at', text: 'The last frame: a nearly empty node that will never be removed, because of one annotation on one pod.' },
    { heading: 'Line that lands', text: 'Scale-down needs two things: low utilization and a new home for every pod. PDBs with no headroom, safe-to-evict "false", and bare pods with no controller all take the second one away.' },
    { ask: 'Do you know which of your nodes the autoscaler has been trying to remove, and what has been stopping it?' },
  ],
  karpenter: [
    { heading: 'What to point at', text: 'The simulating frame: one decision covers instance type, size and capacity type for the whole batch of Pending pods.' },
    { heading: 'Line that lands', text: 'The cluster autoscaler asks which group to grow. Karpenter asks what machine these pods need — there are no groups to grow.' },
    { ask: 'How many MachineSets do you keep today purely to offer different instance sizes, and how many of them sit mostly empty?' },
  ],
  'karpenter-consolidation': [
    { heading: 'What to point at', text: 'api-3 moving from node-b to node-k even though nothing was wrong with it — the only reason was cost.' },
    { heading: 'Line that lands', text: 'Consolidation is a disruption source that runs all the time, not just at upgrade time. Budgets, PDBs and do-not-disrupt are how you control when it bites.' },
    { ask: 'Which of your workloads could not tolerate being moved in the middle of the business day to save money?' },
  ],
};

const YAML = {
  'ca-scale-up': `apiVersion: autoscaling.openshift.io/v1
kind: ClusterAutoscaler
metadata:
  name: default
spec:
  resourceLimits:
    maxNodesTotal: 12
---
apiVersion: autoscaling.openshift.io/v1beta1
kind: MachineAutoscaler
metadata:
  name: worker-us-east-1a
  namespace: openshift-machine-api
spec:
  minReplicas: 2
  maxReplicas: 6
  scaleTargetRef:
    apiVersion: machine.openshift.io/v1beta1
    kind: MachineSet
    name: worker-us-east-1a

# On ROSA the machine pool carries the bounds:
#   rosa edit machinepool --enable-autoscaling \\
#     --min-replicas 2 --max-replicas 6
`,
  'ca-scale-down': `apiVersion: autoscaling.openshift.io/v1
kind: ClusterAutoscaler
metadata:
  name: default
spec:
  scaleDown:
    enabled: true
    delayAfterAdd: 10m
    unneededTime: 5m
    utilizationThreshold: "0.4"
---
# MachineAutoscaler worker-us-east-1a:
#   minReplicas: 2 / maxReplicas: 6
---
# The pod that pins node-b in place:
metadata:
  annotations:
    cluster-autoscaler.kubernetes.io/safe-to-evict: "false"
`,
  karpenter: `apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general
spec:
  template:
    spec:
      requirements:
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand", "spot"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
  limits:
    cpu: "1000"

# Not the HyperShift NodePool from the ROSA HCP
# animation - same kind name, different API group.
`,
  'karpenter-consolidation': `apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: general
spec:
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
    budgets:
      - nodes: "10%"
      - nodes: "0"
        schedule: "0 9 * * mon-fri"
        duration: 8h
---
# On a pod that must never be moved for cost:
metadata:
  annotations:
    karpenter.sh/do-not-disrupt: "true"
`,
};

const FEATURES = {
  'ca-scale-up': [
    { name: 'Pending pods', kind: 'trigger',
      what: 'The only scale-up signal: pods the scheduler could not place by their requests. Node CPU or memory usage plays no part.' },
    { name: 'MachineAutoscaler', kind: 'autoscaling.openshift.io/v1beta1',
      what: 'Puts min and max replica bounds on one MachineSet — one node group, one fixed instance type.' },
    { name: 'ClusterAutoscaler', kind: 'autoscaling.openshift.io/v1',
      what: 'The cluster-wide singleton: overall limits such as maxNodesTotal, and the scale-down behaviour.' },
    { name: 'ROSA machine pools', kind: 'rosa CLI',
      what: 'On ROSA, autoscaling is enabled per machine pool with a min and max; check the ROSA docs for your cluster type.' },
  ],
  'ca-scale-down': [
    { name: 'utilizationThreshold', kind: 'ClusterAutoscaler scaleDown',
      what: 'Nodes whose requested share of allocatable is below this become candidates for removal.' },
    { name: 'unneededTime / delayAfterAdd', kind: 'ClusterAutoscaler scaleDown',
      what: 'How long a node must stay unneeded, and how long after a scale-up before scale-down is considered, to avoid flapping.' },
    { name: 'safe-to-evict: "false"', kind: 'pod annotation',
      what: 'Tells the autoscaler never to evict this pod, which pins its node. PDBs with no headroom and pods with no controller block removal too.' },
    { name: 'Eviction API', kind: 'pods/eviction',
      what: 'Scale-down drains through normal evictions, so PDBs and graceful termination apply exactly as in an upgrade.' },
  ],
  karpenter: [
    { name: 'NodePool', kind: 'karpenter.sh/v1',
      what: 'Constraints, not a group: which instance families, capacity types and zones Karpenter may choose from. Not the HyperShift NodePool.' },
    { name: 'NodeClaim', kind: 'karpenter.sh/v1',
      what: 'One requested node. Karpenter creates it and the cloud provider turns it into an instance — no MachineSet in between.' },
    { name: 'EC2NodeClass', kind: 'karpenter.k8s.aws/v1',
      what: 'AWS specifics: AMI, subnets, security groups, instance profile.' },
    { name: 'Availability', kind: 'platform',
      what: 'Karpenter is a Kubernetes SIGs project with an AWS provider. Support on OpenShift and ROSA is newer — check the Red Hat docs for its status.' },
  ],
  'karpenter-consolidation': [
    { name: 'consolidationPolicy', kind: 'NodePool disruption',
      what: 'WhenEmpty removes only empty nodes; WhenEmptyOrUnderutilized also moves pods to delete or downsize nodes.' },
    { name: 'budgets', kind: 'NodePool disruption',
      what: 'Caps how many nodes may be disrupted at once, optionally on a cron schedule — "0" during business hours blocks it entirely.' },
    { name: 'karpenter.sh/do-not-disrupt', kind: 'pod annotation',
      what: 'Karpenter will not voluntarily disrupt a node running this pod — the counterpart of the cluster autoscaler’s safe-to-evict.' },
    { name: 'PodDisruptionBudget', kind: 'policy/v1',
      what: 'Still honoured on every eviction. Consolidation is a constant source of voluntary disruption, so PDBs matter all day, not just at upgrade time.' },
  ],
};

export default {
  id: 'node-autoscaling',
  advanced: true,
  title: 'Node autoscaling: cluster autoscaler and Karpenter',
  summary: 'HPA adds pods; something has to add nodes. The cluster autoscaler grows fixed-size node groups when pods go Pending, Karpenter picks a right-sized instance per batch — and both remove nodes again, which is a disruption of its own.',
  description: 'Pending pods triggering the cluster autoscaler to grow a MachineSet, an underused node being drained and removed until a safe-to-evict annotation pins one in place, Karpenter launching one right-sized instance for a batch of Pending pods, and Karpenter consolidation moving a pod to delete a node for cost.',
  viewBox: '0 0 680 270',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
