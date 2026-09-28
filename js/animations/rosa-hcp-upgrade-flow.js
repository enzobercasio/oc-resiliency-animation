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
 * The last three modes zoom in from pools to nodes to compare the worker
 * upgrade patterns side by side: in-place rolling (the pool itself rolls,
 * surge one node in, drain one out), blue-green (a second pool on the new
 * version, workload moved across, the old pool kept as the rollback), and
 * canary (a one-node pool soaks the new version before the main pool moves).
 *
 * One frame shape, assembled from whichever regions apply:
 *   { mgmt: [{ id, cls, sub }] | undefined,
 *     workers: ['ready'|'updating', ...] | undefined,
 *     controlPlane: { sub, cls } | undefined,
 *     pools: [{ id, sub, cls }] | undefined,
 *     rows: [{ pool: { id, sub, cls }, nodes: [node | null] }] | undefined,
 *     note, badge, focus }
 * node is { name, ver, state, pods } with state one of ready | provisioning |
 * draining | cordoned | idle; null is an empty slot, so a node keeps its
 * position while its neighbours come and go.
 * cls is 'run' | 'term' | 'pend', the site's usual ready / acting / waiting.
 */

const MODES = [
  { id: 'hosted-control-plane', label: 'Control plane lives elsewhere',
    caption: 'etcd, the API server, and the controllers run as pods in a Red Hat-managed hosting cluster — not as nodes in your account' },
  { id: 'nodepools-independent', label: 'NodePools upgrade independently',
    caption: 'Each NodePool has its own release image — upgrading the control plane never touches a worker' },
  { id: 'skew-limit', label: 'Version skew has a limit', advanced: true,
    caption: 'Leave a NodePool behind long enough and the control plane itself stops being able to upgrade' },
  { id: 'in-place', label: 'In-place rolling',
    caption: 'The existing NodePool is upgraded where it stands — surge one new node in, drain one old node out, repeat' },
  { id: 'blue-green', label: 'Blue-green pools',
    caption: 'Stand up a second NodePool on the new version, move the workload across, keep the old pool as the rollback' },
  { id: 'canary', label: 'Canary pool',
    caption: 'A one-node pool takes the new version and real traffic first — the main pool moves only after it passes a soak' },
];

const CP_UPGRADED = { sub: '4.16.10 · Available', cls: 'run' };
const node = (name, ver, state, pods = 0) => ({ name, ver, state, pods });

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

  if (modeId === 'in-place') {
    const pool = (sub, cls) => ({ id: 'workers', sub, cls });
    const settled = (ver) => pool(`${ver} · 3 nodes`, 'run');
    const rolling = pool('→ 4.16 · rolling', 'term');
    const row = (p, nodes) => ({ controlPlane: CP_UPGRADED, rows: [{ pool: p, nodes }] });

    push({ ...row(settled('4.15.9'), [node('w-1', '4.15', 'ready', 2), node('w-2', '4.15', 'ready', 2), node('w-3', '4.15', 'ready', 2), null]),
      note: 'One NodePool, three nodes on 4.15 — the upgrade happens to this pool, where it stands',
      focus: ['replicas: 3'],
      badge: 'No second pool and no workload moving between pools. The control plane is already on 4.16' });
    push({ ...row(rolling, [node('w-1', '4.15', 'ready', 2), node('w-2', '4.15', 'ready', 2), node('w-3', '4.15', 'ready', 2), node('w-4', '4.16', 'provisioning')]),
      note: 'maxSurge: 1 — a fresh 4.16 node is provisioned before anything is drained',
      focus: ['maxSurge: 1', 'image: ocp-release'],
      badge: 'One field changed on the pool: spec.release. Everything after this is the pool reconciling toward it' });
    push({ ...row(rolling, [node('w-1', '4.15', 'draining'), node('w-2', '4.15', 'ready', 2), node('w-3', '4.15', 'ready', 2), node('w-4', '4.16', 'ready', 2)]),
      note: 'Only once w-4 is Ready is w-1 cordoned and drained — its pods land on the new node',
      focus: ['maxUnavailable: 0'],
      badge: 'Drain is eviction-based, so every PodDisruptionBudget is honoured exactly as in the upgrade-resiliency animation' });
    push({ ...row(rolling, [node('w-5', '4.16', 'provisioning'), node('w-2', '4.15', 'ready', 2), node('w-3', '4.15', 'ready', 2), node('w-4', '4.16', 'ready', 2)]),
      note: 'w-1 is deleted, and the next surge node is already coming up in its place',
      focus: ['upgradeType: Replace'],
      badge: 'On ROSA HCP “in place” means the pool, not the machine — each old instance is replaced by a new one' });
    push({ ...row(rolling, [node('w-5', '4.16', 'ready', 2), node('w-2', '4.15', 'draining'), node('w-3', '4.15', 'ready', 2), node('w-4', '4.16', 'ready', 2)]),
      note: 'Same step again: w-5 Ready, w-2 drained',
      badge: 'Schedulable capacity never drops below three nodes — the price is time, one node per cycle' });
    push({ ...row(rolling, [node('w-5', '4.16', 'ready', 2), node('w-6', '4.16', 'provisioning'), node('w-3', '4.15', 'ready', 2), node('w-4', '4.16', 'ready', 2)]),
      note: 'w-2 is gone; w-6 surges in for the last old node',
      badge: 'A 30-node pool at maxSurge 1 is 30 of these cycles. Raising maxSurge buys speed with extra temporary nodes' });
    push({ ...row(rolling, [node('w-5', '4.16', 'ready', 2), node('w-6', '4.16', 'ready', 2), node('w-3', '4.15', 'draining'), node('w-4', '4.16', 'ready', 2)]),
      note: 'w-3, the last 4.15 node, drains',
      badge: 'There is no rollback lever mid-roll short of pointing spec.release back — which is another full roll' });
    push({ ...row(settled('4.16.10'), [node('w-5', '4.16', 'ready', 2), node('w-6', '4.16', 'ready', 2), null, node('w-4', '4.16', 'ready', 2)]),
      note: 'Three nodes, all on 4.16 — cheapest pattern, slowest pattern, no parallel pool to fall back to',
      badge: 'Good default for stateless, PDB-protected workloads. The next two modes trade money for a faster exit' });
  }

  if (modeId === 'blue-green') {
    const blueNodes = (s1, s2, s3) => [s1, s2, s3].map((s, i) => node(`blue-${i + 1}`, '4.15', s[0], s[1]));
    const greenNodes = (s1, s2, s3) => [s1, s2, s3].map((s, i) => node(`green-${i + 1}`, '4.16', s[0], s[1]));
    const blue = (sub, cls, nodes) => ({ pool: { id: 'workers-blue', sub, cls }, nodes });
    const green = (sub, cls, nodes) => ({ pool: { id: 'workers-green', sub, cls }, nodes });
    const R2 = ['ready', 2];
    const R0 = ['ready', 0];

    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · serving', 'run', blueNodes(R2, R2, R2)), green('not created', 'pend', [])],
      note: 'Blue is the pool serving everything today, on 4.15',
      badge: 'Blue will never be upgraded. It will be replaced by a pool that was born on the new version' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · serving', 'run', blueNodes(R2, R2, R2)),
        green('4.16.10 · creating', 'term', greenNodes(['provisioning'], ['provisioning'], ['provisioning']))],
      note: 'Create a second NodePool — green — directly on 4.16',
      focus: ['name: workers-green', 'image: ocp-release', 'pool: green'],
      badge: 'No existing node is touched. From here until blue is deleted you are running — and paying for — six nodes' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · serving', 'run', blueNodes(R2, R2, R2)), green('4.16.10 · empty', 'run', greenNodes(R0, R0, R0))],
      note: 'Green is Ready and empty — validate the new node image before any workload lands',
      badge: 'Smoke-test DaemonSets, CSI drivers, security agents on a node nobody depends on yet' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · cordoned', 'term', blueNodes(['cordoned', 2], ['cordoned', 2], ['cordoned', 2])), green('4.16.10 · empty', 'run', greenNodes(R0, R0, R0))],
      note: 'Cordon every blue node — nothing new schedules there, running pods stay put',
      focus: ['adm cordon'],
      badge: 'From this moment any new or rescheduled pod can only land on green' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · draining', 'term', blueNodes(['draining', 0], ['cordoned', 2], ['cordoned', 2])), green('4.16.10 · filling', 'run', greenNodes(R2, R0, R0))],
      note: 'Drain blue node by node — each evicted pod is recreated on green',
      focus: ['oc adm drain'],
      badge: 'Eviction-based, so PDBs pace it. Drain everything at once and you are back to the disruption-types problem' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('4.15.9 · drained', 'pend', blueNodes(['idle', 0], ['idle', 0], ['idle', 0])), green('4.16.10 · serving', 'run', greenNodes(R2, R2, R2))],
      note: 'All six pods on green. Blue is empty but still exists',
      focus: ['uncordon'],
      badge: 'This is the rollback window: uncordon blue, drain green, and you are back on 4.15 in minutes — no reinstall' });
    push({ controlPlane: CP_UPGRADED,
      rows: [blue('deleted', 'pend', []), green('4.16.10 · serving', 'run', greenNodes(R2, R2, R2))],
      note: 'Delete blue once green has proven itself — back to three nodes',
      badge: 'Fastest exit and the cleanest rollback, at the cost of double the nodes for the whole window — check EC2 quota and subnet IPs first' });
  }

  if (modeId === 'canary') {
    const canary = (sub, cls, nodes) => ({ pool: { id: 'workers-canary', sub, cls }, nodes });
    const main = (sub, cls, nodes) => ({ pool: { id: 'workers-main', sub, cls }, nodes });
    const mainOld = [node('main-1', '4.15', 'ready', 2), node('main-2', '4.15', 'ready', 2), node('main-3', '4.15', 'ready', 2), null];
    const mainIdle = main('4.15.9 · 3 nodes', 'run', mainOld);

    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.15.9 · 1 node', 'run', [node('canary-1', '4.15', 'ready', 1), null]), mainIdle],
      note: 'A one-node canary pool carries a real slice of production traffic',
      focus: ['name: workers-canary', 'replicas: 1', 'pool: canary'],
      badge: 'Not a test cluster — the same app, same traffic, a small share of its replicas pinned or spread onto this pool' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('→ 4.16 · rolling', 'term', [node('canary-1', '4.15', 'ready', 1), node('canary-2', '4.16', 'provisioning')]), mainIdle],
      note: 'Only the canary pool’s release is changed — a 4.16 node surges in beside it',
      focus: ['image: ocp-release'],
      badge: 'workers-main has not been asked to do anything, so it does nothing' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.16.10 · soaking', 'pend', [node('canary-2', '4.16', 'ready', 1), null]), mainIdle],
      note: 'canary-1 is replaced. The new version now serves real traffic — on one node',
      focus: ['soak'],
      badge: 'Soak for an agreed window — hours or a day — watching error rate, restarts, latency and node alerts' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.16.10 · passed', 'run', [node('canary-2', '4.16', 'ready', 1), null]), mainIdle],
      note: 'Go / no-go: the canary passed its gate',
      badge: 'Had it failed, one node’s share of traffic saw it — roll the canary back and the main pool never knew' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.16.10 · passed', 'run', [node('canary-2', '4.16', 'ready', 1), null]),
        main('→ 4.16 · rolling', 'term', [node('main-1', '4.15', 'ready', 2), node('main-2', '4.15', 'ready', 2), node('main-3', '4.15', 'ready', 2), node('main-4', '4.16', 'provisioning')])],
      note: 'Promote: workers-main gets the same release, and rolls exactly like the in-place mode',
      focus: ['Promote'],
      badge: 'Same surge-then-drain cycle — but the image it is rolling out has already survived production' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.16.10 · passed', 'run', [node('canary-2', '4.16', 'ready', 1), null]),
        main('→ 4.16 · rolling', 'term', [node('main-5', '4.16', 'ready', 2), node('main-2', '4.15', 'draining'), node('main-3', '4.15', 'ready', 2), node('main-4', '4.16', 'ready', 2)])],
      note: 'Node by node, the main pool follows',
      badge: 'PDBs pace the drains here just as anywhere else' });
    push({ controlPlane: CP_UPGRADED,
      rows: [canary('4.16.10 · 1 node', 'run', [node('canary-2', '4.16', 'ready', 1), null]),
        main('4.16.10 · 3 nodes', 'run', [node('main-5', '4.16', 'ready', 2), node('main-6', '4.16', 'ready', 2), null, node('main-4', '4.16', 'ready', 2)])],
      note: 'Everything on 4.16 — and the risky moment happened on one node, not three',
      badge: 'Costs one small permanent pool. Pays off most for fleets where a bad node image would hurt everyone at once' });
  }

  f.forEach((x) => { x.mode = modeId; });
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

const SLOT_X = [206, 316, 426, 536];
const SLOT_W = 100;
const ROW_H = 76;
const NODE_CLS = { ready: 'run', provisioning: 'pend', idle: 'pend', draining: 'term', cordoned: 'term' };

function nodeSub(n) {
  if (n.state !== 'ready') return n.state;
  return `${n.ver} · ${n.pods} pod${n.pods === 1 ? '' : 's'}`;
}

function renderRows(frame) {
  let out = `<g class="pod ${frame.controlPlane.cls}"><rect x="40" y="10" width="600" height="34" rx="8"/>`
      + `<text class="svg-sub" x="340" y="27" text-anchor="middle" dominant-baseline="central">HostedCluster control plane · ${frame.controlPlane.sub}</text></g>`;
  let y = 64;
  frame.rows.forEach((r) => {
    out += pill(40, y, 150, ROW_H, r.pool.cls, r.pool.id, r.pool.sub);
    r.nodes.forEach((n, i) => {
      if (n) out += pill(SLOT_X[i], y + 6, SLOT_W, ROW_H - 12, NODE_CLS[n.state], n.name, nodeSub(n));
    });
    y += ROW_H + 22;
  });
  out += `<text class="legend-text" x="40" y="${y + 4}">solid = ready · dashed amber = draining or rolling · dotted = provisioning or idle</text>`;
  return out;
}

function renderSVG(frame) {
  if (frame.rows) return renderRows(frame);
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

const BASELINE_NODES = { 'in-place': 3, 'blue-green': 3, canary: 4 };

function rowMetrics(frame) {
  const nodes = frame.rows.flatMap((r) => r.nodes).filter(Boolean);
  const baseline = BASELINE_NODES[frame.mode];
  const extra = nodes.length - baseline;
  const pods = nodes.reduce((s, n) => s + n.pods, 0);
  const podsTotal = baseline === 4 ? 7 : 6;
  const upgraded = nodes.filter((n) => n.ver === '4.16' && n.state === 'ready').length;
  return [
    { label: 'Workload pods placed', value: `${pods} / ${podsTotal}`, tone: pods === podsTotal ? 'ok' : 'warn' },
    { label: 'Worker nodes running', value: extra > 0 ? `${nodes.length} (+${extra} temporary)` : `${nodes.length}`, tone: extra > 0 ? 'warn' : 'ok' },
    { label: 'Ready on 4.16', value: `${upgraded} / ${nodes.length}`, tone: upgraded === nodes.length ? 'ok' : undefined },
  ];
}

function metrics(frame) {
  if (frame.rows) return rowMetrics(frame);
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
  'in-place': [
    { heading: 'What to point at', text: 'The node count: it goes to four and back to three every cycle, and the schedulable count never drops below three. maxSurge 1, maxUnavailable 0.' },
    { heading: 'Line that lands', text: 'Cheapest and simplest — one field on one pool — but slow on a big pool, and there is no parallel pool to fall back to mid-roll.' },
    { ask: 'How long would a node-by-node roll of your largest pool take today, and is that inside your maintenance window?' },
  ],
  'blue-green': [
    { heading: 'What to point at', text: 'The frame where blue is drained but still exists. That is the whole reason to pay for this pattern.' },
    { heading: 'Line that lands', text: 'Blue-green buys a rollback measured in minutes — uncordon blue, drain green — with double the nodes for as long as the window stays open.' },
    { ask: 'Do you have the EC2 quota and subnet IP headroom to run two copies of your biggest pool at the same time?' },
  ],
  canary: [
    { heading: 'What to point at', text: 'The soak frame: one node on 4.16 serving real traffic while the main pool has not been asked to do anything.' },
    { heading: 'Line that lands', text: 'A canary only proves something if real workload runs on it. An empty canary pool is a blue-green with fewer nodes, not a canary.' },
    { ask: 'What signal would make you stop a node upgrade, and who is watching for it during the soak?' },
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
  'in-place': `apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: workers
spec:
  clusterName: my-rosa-cluster
  replicas: 3
  release:
    image: ocp-release:4.16.10-x86_64
  management:
    upgradeType: Replace
    replace:
      strategy: RollingUpdate
      rollingUpdate:
        maxSurge: 1
        maxUnavailable: 0

# The pool is upgraded where it stands: surge one
# new node in, drain one old node out, repeat.
# ROSA HCP rolls by replacing instances; HyperShift
# also defines upgradeType: InPlace on platforms that
# support it. Verify which applies to yours.
`,
  'blue-green': `apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: workers-green
spec:
  clusterName: my-rosa-cluster
  replicas: 3
  nodeLabels:
    pool: green
  release:
    image: ocp-release:4.16.10-x86_64

# workers-blue (pool: blue) stays on 4.15.9.
# Move the workload across, PDBs honoured:
#   oc adm cordon -l pool=blue
#   oc adm drain -l pool=blue --ignore-daemonsets \\
#     --delete-emptydir-data
# Rollback while blue still exists:
#   oc adm uncordon -l pool=blue
`,
  canary: `apiVersion: hypershift.openshift.io/v1beta1
kind: NodePool
metadata:
  name: workers-canary
spec:
  clusterName: my-rosa-cluster
  replicas: 1
  nodeLabels:
    pool: canary
  release:
    image: ocp-release:4.16.10-x86_64

# workers-main (replicas: 3) stays on 4.15.9 while
# the canary serves a real slice of traffic and
# passes an agreed soak window.
# Promote = set the same spec.release on
# workers-main, which then rolls like in-place.
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
  'in-place': [
    { name: 'spec.release', kind: 'NodePool field',
      what: 'The only change requested. The pool reconciles its own nodes toward it — no second pool is involved.' },
    { name: 'maxSurge / maxUnavailable', kind: 'spec.management.replace.rollingUpdate',
      what: 'How many extra nodes may be created ahead, and how many may be missing. 1 / 0 never drops capacity but is the slowest roll; a higher maxSurge buys speed with temporary nodes.' },
    { name: 'upgradeType', kind: 'spec.management',
      what: 'Replace provisions a new machine per old one — what ROSA HCP does. InPlace reboots existing machines where the platform supports it. Check the docs for yours.' },
    { name: 'PodDisruptionBudget', kind: 'policy/v1',
      what: 'Every drain is eviction-based, so a budget with no headroom stalls the roll here exactly as it does on self-managed OpenShift.' },
  ],
  'blue-green': [
    { name: 'Second NodePool', kind: 'hypershift.openshift.io/v1beta1',
      what: 'Created directly on the target release, alongside the old one. No existing node is touched by creating it.' },
    { name: 'spec.nodeLabels', kind: 'NodePool field',
      what: 'Labels every node in the pool, so cordon, drain and nodeSelector can address a whole pool with one selector.' },
    { name: 'oc adm cordon / drain', kind: 'CLI',
      what: 'Moves the workload: cordon stops new placement on blue, drain evicts what is running, respecting PDBs.' },
    { name: 'Rollback window', kind: 'pattern',
      what: 'While blue exists, rollback is uncordon blue and drain green. Deleting blue closes the window — and ends the double cost.' },
  ],
  canary: [
    { name: 'Canary NodePool', kind: 'hypershift.openshift.io/v1beta1',
      what: 'A deliberately small pool — one node here — that takes the new release first.' },
    { name: 'nodeSelector / topology spread', kind: 'pod spec',
      what: 'How real replicas land on the canary. A canary with no workload on it proves the node boots, nothing more.' },
    { name: 'Soak and gate', kind: 'pattern',
      what: 'An agreed window and agreed signals — error rate, restarts, latency, node alerts — decided before the upgrade, not during it.' },
    { name: 'Promotion', kind: 'NodePool spec.release',
      what: 'Set the same release on the main pool, which then rolls exactly like the in-place mode.' },
  ],
};

export default {
  id: 'rosa-hcp-upgrade-flow',
  advanced: true,
  title: 'ROSA HCP upgrade flow: hosted control planes and NodePools',
  summary: 'The same upgrade problem, a completely different architecture: the control plane runs as pods you never see, NodePools version independently by design, falling too far behind has its own failure mode — and three patterns for upgrading the workers themselves.',
  description: 'A HostedCluster’s control plane rolling as pods inside a Red Hat-managed hosting cluster while worker nodes stay untouched, three NodePools upgrading independently on their own schedule, a NodePool left far enough behind that the control plane itself can no longer upgrade, and three worker upgrade patterns compared node by node: in-place rolling, blue-green pools, and a canary pool.',
  viewBox: '0 0 680 300',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
