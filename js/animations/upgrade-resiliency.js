/**
 * Rolling upgrade across three zones, run four times with different resiliency
 * settings. This is the anchor animation of the set.
 *
 * Frame shape:
 *   { nodes: ['ready'|'cordoned'|'rebooting', ...],
 *     pods:  [{ n: nodeIndex, s: 'r'|'t'|'p', id: 'p1' }, ...],
 *     note, badge }
 */

const ZONES = ['a', 'b', 'c'];
const NODE_X = [40, 260, 480];
const REPLICAS = 6;

const MODES = [
  { id: 'd-full', label: 'Spread + PDB',
    caption: 'topologySpreadConstraints + PodDisruptionBudget — the golden path',
    spread: true, pdb: true },
  { id: 'b-spread-only', label: 'Spread only',
    caption: 'topologySpreadConstraints only — nothing caps concurrent evictions',
    spread: true, pdb: false },
  { id: 'c-pdb-only', label: 'PDB only',
    caption: 'PodDisruptionBudget only — every replica in one failure domain',
    spread: false, pdb: true },
  { id: 'a-none', label: 'Neither',
    caption: '6 replicas and nothing else — multi-replica on its own',
    spread: false, pdb: false },
];

const CLOSING = {
  'd-full': ['Upgrade complete — 6 of 6 at every single step',
    'Zero downtime, and the workload is still evenly spread for whatever comes next'],
  'b-spread-only': ['Upgrade complete — no outage, but capacity fell to 4 of 6 three times',
    'Survivable only if that headroom is real. At peak load, losing a third of capacity is an incident'],
  'c-pdb-only': ['Upgrade complete — never below 5 of 6, but the whole workload migrated twice',
    'The PDB protected the planned upgrade. It does nothing for an unplanned node or zone failure'],
  'a-none': ['Upgrade complete — after two separate outages',
    'Multi-replica alone is not resiliency: it says how many pods, not where they sit or how fast they may leave'],
};

function buildFrames(modeId) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const { spread, pdb } = mode;

  const frames = [];
  const nodes = ['ready', 'ready', 'ready'];
  let counter = REPLICAS;

  // Initial placement. With a spread constraint the scheduler balances across
  // zones; without one it is free to bin-pack onto a single node.
  let pods = Array.from({ length: REPLICAS }, (_, i) => ({
    n: spread ? Math.floor(i / 2) : 0,
    s: 'r',
    id: `p${i + 1}`,
  }));

  const push = (note, badge, focus) => frames.push({
    nodes: [...nodes],
    pods: pods.map((p) => ({ ...p })),
    note,
    badge,
    focus,
  });

  // Where does a replacement pod go? With spread: the emptiest eligible zone.
  // Without: the first node with room, which is how bin-packing behaves.
  const pickTarget = (draining) => {
    let best = -1;
    let bestCount = Infinity;
    for (let t = 0; t < 3; t += 1) {
      if (t === draining || nodes[t] !== 'ready') continue;
      const count = pods.filter((p) => p.n === t).length;
      if (spread) {
        if (count < bestCount) { bestCount = count; best = t; }
      } else if (best < 0) {
        best = t;
      }
    }
    return best;
  };

  push(
    spread ? 'Steady state: 6 replicas, 2 in every zone'
           : 'Steady state: all 6 replicas packed onto one node',
    spread ? 'The spread constraint balances the deployment across failure domains'
           : 'Nothing tells the scheduler to spread, so it bin-packed into a single node',
    spread ? ['topologyKey', 'maxSkew'] : ['no topologySpreadConstraints', 'bin-pack'],
  );

  for (let k = 0; k < 3; k += 1) {
    const here = pods.filter((p) => p.n === k).length;
    nodes[k] = 'cordoned';
    push(
      `Zone ${ZONES[k]} node cordoned — upgrade starts here`,
      here
        ? `${here} replica${here > 1 ? 's' : ''} live on this node and must be moved`
        : 'No replicas here, so there is nothing to drain',
    );

    if (here) {
      const idxs = pods.map((p, i) => (p.n === k ? i : -1)).filter((i) => i >= 0);

      if (pdb) {
        // The eviction API refuses the next eviction until the budget recovers,
        // so each replacement must become Ready before the next pod goes.
        idxs.forEach((i) => {
          pods[i].s = 't';
          push(
            `Evicting ${pods[i].id} — one replica at a time`,
            'PDB minAvailable: 5 caps the drain at a single pod; the next eviction has to wait',
            ['minAvailable', 'kind: PodDisruptionBudget'],
          );
          const t = pickTarget(k);
          counter += 1;
          pods[i] = { n: t, s: 'r', id: `p${counter}` };
          push(
            `${pods[i].id} comes up in zone ${ZONES[t]} and passes readiness`,
            'Back to 6 of 6, so disruptionsAllowed returns to 1 and the drain continues',
            spread ? ['topologyKey', 'whenUnsatisfiable']
                   : ['no topologySpreadConstraints', 'bin-pack'],
          );
        });
      } else {
        idxs.forEach((i) => { pods[i].s = 't'; });
        push(
          `The drain evicts all ${here} replicas on this node at once`,
          'No PodDisruptionBudget, so nothing caps how many go down together',
          ['no PodDisruptionBudget', 'may evict every replica'],
        );
        idxs.forEach((i) => {
          const t = pickTarget(k);
          counter += 1;
          pods[i] = { n: t, s: 'p', id: `p${counter}` };
        });
        const left = pods.filter((p) => p.s === 'r').length;
        push(
          'Replacements scheduled and starting cold',
          left
            ? `Serving on ${left} of 6 — image pull and readiness probes take real time`
            : 'Every replica is down at once — the service is returning errors',
        );
        idxs.forEach((i) => { pods[i].s = 'r'; });
        push('Replacements pass readiness — back to 6 of 6', 'Capacity restored');
      }
    }

    nodes[k] = 'rebooting';
    push(`Zone ${ZONES[k]} node reboots into the new version`,
      'The node is empty now, so the reboot itself costs the workload nothing');
    nodes[k] = 'ready';
    push(`Zone ${ZONES[k]} node rejoins the cluster, uncordoned`,
      'Schedulable again for the next reschedule');
  }

  const [note, badge] = CLOSING[mode.id];
  push(note, badge);
  return frames;
}

function renderSVG(frame) {
  let out = '';

  frame.nodes.forEach((st, n) => {
    const cls = st === 'ready' ? 'node-rect' : `node-rect ${st}`;
    out += `<rect class="${cls}" x="${NODE_X[n]}" y="80" width="160" height="230" rx="12"/>`;
    out += `<text class="svg-title on-node" x="${NODE_X[n] + 80}" y="104" text-anchor="middle" dominant-baseline="central">zone ${ZONES[n]}</text>`;
    out += `<text class="svg-sub on-node" x="${NODE_X[n] + 80}" y="122" text-anchor="middle" dominant-baseline="central">${st}</text>`;
  });

  const slot = [0, 0, 0];
  frame.pods.forEach((p) => {
    const k = slot[p.n];
    slot[p.n] += 1;
    const col = k % 2;
    const row = (k - col) / 2;
    const x = NODE_X[p.n] + 16 + col * 68;
    const y = 136 + row * 44;
    const cls = p.s === 'r' ? 'run' : p.s === 't' ? 'term' : 'pend';
    out += `<g class="pod ${cls}">`
        + `<rect x="${x}" y="${y}" width="60" height="34" rx="6"/>`
        + `<text class="svg-sub" x="${x + 30}" y="${y + 17}" text-anchor="middle" dominant-baseline="central">${p.id}</text>`
        + '</g>';
  });

  out += '<text class="legend-text" x="40" y="336">'
      + 'solid = ready · dashed amber = terminating · dotted = starting · dashed node = cordoned or rebooting'
      + '</text>';
  return out;
}

function metrics(frame, history) {
  const ready = frame.pods.filter((p) => p.s === 'r').length;
  const zones = new Set(frame.pods.filter((p) => p.s === 'r').map((p) => p.n)).size;
  const worst = history.reduce(
    (min, f) => Math.min(min, f.pods.filter((p) => p.s === 'r').length),
    REPLICAS,
  );
  const tone = (v) => (v === 0 ? 'bad' : v < REPLICAS ? 'warn' : 'ok');

  return [
    { label: 'Ready now', value: `${ready} / ${REPLICAS}`, tone: tone(ready) },
    { label: 'Zones covered', value: String(zones), tone: zones === 3 ? 'ok' : zones === 0 ? 'bad' : 'warn' },
    { label: 'Worst so far', value: `${worst} / ${REPLICAS}`, tone: tone(worst) },
    {
      label: 'Status',
      value: ready === 0 ? 'Outage' : ready < REPLICAS ? 'Degraded' : 'Available',
      tone: tone(ready),
    },
  ];
}

const NOTES = {
  'd-full': [
    { heading: 'What to point at', text: 'The ready count never leaves 6 of 6, and the replacement always lands in the emptiest remaining zone.' },
    { heading: 'Line that lands', text: 'Same cluster, same upgrade, same image. The difference is about twelve lines of YAML.' },
    { ask: 'How many replicas does your most critical workload run, and do you know which nodes they are on right now?' },
  ],
  'b-spread-only': [
    { heading: 'What to point at', text: 'No outage — that is a real improvement. But capacity drops by a third in one step and stays down for a cold start.' },
    { heading: 'The trap', text: 'Fine at 40% utilisation. At Friday peak it is an incident, and the upgrade has two more nodes to go.' },
    { ask: 'What is your actual peak utilisation, and could you absorb losing a third of this service for ninety seconds?' },
  ],
  'c-pdb-only': [
    { heading: 'What to point at', text: 'This looks best on the availability graph and is the most dangerous of the three. Never below 5 of 6 — and every replica in one failure domain.' },
    { heading: 'The pivot', text: 'A PDB is an admission check on the eviction API. A dying node does not call the eviction API.' },
    { ask: 'What happens if that node loses power instead of being drained politely?' },
  ],
  'a-none': [
    { heading: 'What to point at', text: 'The deployment reported six healthy pods right up to the moment the drain started.' },
    { heading: 'Line that lands', text: 'Multi-replica told us how many pods, not where they were or how fast they could be taken away.' },
    { ask: 'If I drained one node in your cluster right now, how many of your services would notice?' },
  ],
};

const YAML = {
  "d-full": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 6\n  template:\n    spec:\n      priorityClassName: platform-critical\n      terminationGracePeriodSeconds: 45\n      topologySpreadConstraints:\n        - maxSkew: 1\n          topologyKey: topology.kubernetes.io/zone\n          whenUnsatisfiable: DoNotSchedule\n          labelSelector:\n            matchLabels:\n              app: payments-api\n      # older equivalent: affinity.podAntiAffinity with\n      # topologyKey kubernetes.io/hostname - but that\n      # caps replicas at your node count\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          lifecycle:\n            preStop:\n              exec:\n                command: [\"/bin/sh\", \"-c\", \"sleep 15\"]\n---\napiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: payments-api-pdb\nspec:\n  minAvailable: 5\n  # with an HPA moving replicas, prefer a percentage:\n  #   maxUnavailable: 20%\n  unhealthyPodEvictionPolicy: AlwaysAllow\n  selector:\n    matchLabels:\n      app: payments-api\n",
  "b-spread-only": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 6\n  template:\n    spec:\n      priorityClassName: platform-critical\n      terminationGracePeriodSeconds: 45\n      topologySpreadConstraints:\n        - maxSkew: 1\n          topologyKey: topology.kubernetes.io/zone\n          whenUnsatisfiable: DoNotSchedule\n          labelSelector:\n            matchLabels:\n              app: payments-api\n      # older equivalent: affinity.podAntiAffinity with\n      # topologyKey kubernetes.io/hostname - but that\n      # caps replicas at your node count\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          lifecycle:\n            preStop:\n              exec:\n                command: [\"/bin/sh\", \"-c\", \"sleep 15\"]\n\n# no PodDisruptionBudget exists for this workload\n# a drain may evict every replica on a node at once\n",
  "c-pdb-only": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 6\n  template:\n    spec:\n      priorityClassName: platform-critical\n      terminationGracePeriodSeconds: 45\n      # no topologySpreadConstraints\n      # scheduler may bin-pack all 6 onto one node\n      # (podAntiAffinity would have prevented this too)\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          lifecycle:\n            preStop:\n              exec:\n                command: [\"/bin/sh\", \"-c\", \"sleep 15\"]\n---\napiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: payments-api-pdb\nspec:\n  minAvailable: 5\n  # with an HPA moving replicas, prefer a percentage:\n  #   maxUnavailable: 20%\n  unhealthyPodEvictionPolicy: AlwaysAllow\n  selector:\n    matchLabels:\n      app: payments-api\n",
  "a-none": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: payments-api\nspec:\n  replicas: 6\n  template:\n    spec:\n      priorityClassName: platform-critical\n      terminationGracePeriodSeconds: 45\n      # no topologySpreadConstraints\n      # scheduler may bin-pack all 6 onto one node\n      # (podAntiAffinity would have prevented this too)\n      containers:\n        - name: api\n          image: ubi9/httpd-24:latest\n          resources:\n            requests:\n              cpu: 100m\n              memory: 256Mi\n          lifecycle:\n            preStop:\n              exec:\n                command: [\"/bin/sh\", \"-c\", \"sleep 15\"]\n\n# no PodDisruptionBudget exists for this workload\n# a drain may evict every replica on a node at once\n"
};

const FEATURES = {
  "d-full": [
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "How many pods the controller keeps running. Necessary, nowhere near sufficient - it says nothing about placement or eviction rate."
    },
    {
      "name": "topologySpreadConstraints",
      "kind": "pod spec",
      "what": "Distributes pods evenly across a topology domain. DoNotSchedule enforces it; ScheduleAnyway is advisory and may be silently ignored under capacity pressure."
    },
    {
      "name": "podAntiAffinity",
      "kind": "affinity",
      "what": "The older way to keep replicas apart. requiredDuringScheduling with topologyKey kubernetes.io/hostname enforces one pod per node, which caps replicas at your node count - prefer topology spread for new workloads."
    },
    {
      "name": "PodDisruptionBudget",
      "kind": "policy/v1",
      "what": "Caps how many pods may be voluntarily evicted at once. An admission check on the eviction API, so it governs drains and upgrades and nothing else."
    },
    {
      "name": "unhealthyPodEvictionPolicy",
      "kind": "PDB field",
      "what": "AlwaysAllow lets a CrashLoopBackOff replica be evicted instead of consuming the budget and blocking the drain. Requires OCP 4.14+."
    },
    {
      "name": "HorizontalPodAutoscaler",
      "kind": "autoscaling/v2",
      "what": "Moves spec.replicas with load. Express the budget as maxUnavailable: 20% rather than minAvailable: 5, or it silently goes stale the moment the workload scales."
    },
    {
      "name": "resources.requests",
      "kind": "container",
      "what": "What the scheduler reserves. A replacement pod only lands on a surviving node if its requests fit - on a tight cluster this is what turns a drain into a Pending pod."
    },
    {
      "name": "PriorityClass",
      "kind": "scheduling.k8s.io/v1",
      "what": "Decides who gets rescheduled first when drained pods compete for the remaining nodes, and whose pods may be preempted to make room."
    },
    {
      "name": "lifecycle.preStop",
      "kind": "container",
      "what": "Runs before SIGTERM so endpoint removal can propagate - the pod stops receiving traffic before it stops serving."
    },
    {
      "name": "terminationGracePeriodSeconds",
      "kind": "pod spec",
      "what": "How long the kubelet waits after SIGTERM before SIGKILL. Must exceed preStop plus your p99 request duration."
    },
    {
      "name": "oc adm drain",
      "kind": "command",
      "what": "What the Machine Config Operator performs on each node during an upgrade. Calls the eviction API per pod rather than deleting them."
    }
  ],
  "b-spread-only": [
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "How many pods the controller keeps running. Necessary, nowhere near sufficient - it says nothing about placement or eviction rate."
    },
    {
      "name": "topologySpreadConstraints",
      "kind": "pod spec",
      "what": "Distributes pods evenly across a topology domain. DoNotSchedule enforces it; ScheduleAnyway is advisory and may be silently ignored under capacity pressure."
    },
    {
      "name": "podAntiAffinity",
      "kind": "affinity",
      "what": "The older way to keep replicas apart. requiredDuringScheduling with topologyKey kubernetes.io/hostname enforces one pod per node, which caps replicas at your node count - prefer topology spread for new workloads."
    },
    {
      "name": "resources.requests",
      "kind": "container",
      "what": "What the scheduler reserves. A replacement pod only lands on a surviving node if its requests fit - on a tight cluster this is what turns a drain into a Pending pod."
    },
    {
      "name": "PriorityClass",
      "kind": "scheduling.k8s.io/v1",
      "what": "Decides who gets rescheduled first when drained pods compete for the remaining nodes, and whose pods may be preempted to make room."
    },
    {
      "name": "lifecycle.preStop",
      "kind": "container",
      "what": "Runs before SIGTERM so endpoint removal can propagate - the pod stops receiving traffic before it stops serving."
    },
    {
      "name": "terminationGracePeriodSeconds",
      "kind": "pod spec",
      "what": "How long the kubelet waits after SIGTERM before SIGKILL. Must exceed preStop plus your p99 request duration."
    },
    {
      "name": "oc adm drain",
      "kind": "command",
      "what": "What the Machine Config Operator performs on each node during an upgrade. Calls the eviction API per pod rather than deleting them."
    }
  ],
  "c-pdb-only": [
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "How many pods the controller keeps running. Necessary, nowhere near sufficient - it says nothing about placement or eviction rate."
    },
    {
      "name": "PodDisruptionBudget",
      "kind": "policy/v1",
      "what": "Caps how many pods may be voluntarily evicted at once. An admission check on the eviction API, so it governs drains and upgrades and nothing else."
    },
    {
      "name": "unhealthyPodEvictionPolicy",
      "kind": "PDB field",
      "what": "AlwaysAllow lets a CrashLoopBackOff replica be evicted instead of consuming the budget and blocking the drain. Requires OCP 4.14+."
    },
    {
      "name": "HorizontalPodAutoscaler",
      "kind": "autoscaling/v2",
      "what": "Moves spec.replicas with load. Express the budget as maxUnavailable: 20% rather than minAvailable: 5, or it silently goes stale the moment the workload scales."
    },
    {
      "name": "resources.requests",
      "kind": "container",
      "what": "What the scheduler reserves. A replacement pod only lands on a surviving node if its requests fit - on a tight cluster this is what turns a drain into a Pending pod."
    },
    {
      "name": "PriorityClass",
      "kind": "scheduling.k8s.io/v1",
      "what": "Decides who gets rescheduled first when drained pods compete for the remaining nodes, and whose pods may be preempted to make room."
    },
    {
      "name": "lifecycle.preStop",
      "kind": "container",
      "what": "Runs before SIGTERM so endpoint removal can propagate - the pod stops receiving traffic before it stops serving."
    },
    {
      "name": "terminationGracePeriodSeconds",
      "kind": "pod spec",
      "what": "How long the kubelet waits after SIGTERM before SIGKILL. Must exceed preStop plus your p99 request duration."
    },
    {
      "name": "oc adm drain",
      "kind": "command",
      "what": "What the Machine Config Operator performs on each node during an upgrade. Calls the eviction API per pod rather than deleting them."
    }
  ],
  "a-none": [
    {
      "name": "spec.replicas",
      "kind": "Deployment",
      "what": "How many pods the controller keeps running. Necessary, nowhere near sufficient - it says nothing about placement or eviction rate."
    },
    {
      "name": "resources.requests",
      "kind": "container",
      "what": "What the scheduler reserves. A replacement pod only lands on a surviving node if its requests fit - on a tight cluster this is what turns a drain into a Pending pod."
    },
    {
      "name": "PriorityClass",
      "kind": "scheduling.k8s.io/v1",
      "what": "Decides who gets rescheduled first when drained pods compete for the remaining nodes, and whose pods may be preempted to make room."
    },
    {
      "name": "lifecycle.preStop",
      "kind": "container",
      "what": "Runs before SIGTERM so endpoint removal can propagate - the pod stops receiving traffic before it stops serving."
    },
    {
      "name": "terminationGracePeriodSeconds",
      "kind": "pod spec",
      "what": "How long the kubelet waits after SIGTERM before SIGKILL. Must exceed preStop plus your p99 request duration."
    },
    {
      "name": "oc adm drain",
      "kind": "command",
      "what": "What the Machine Config Operator performs on each node during an upgrade. Calls the eviction API per pod rather than deleting them."
    }
  ]
};

export default {
  id: 'upgrade-resiliency',
  title: 'Rolling upgrade: four configurations',
  summary: 'The same six-replica workload during a three-node rolling upgrade, with and without a topology spread constraint and a pod disruption budget.',
  description: 'Three worker nodes are cordoned, drained and rebooted one at a time while six replicas are rescheduled around them.',
  viewBox: '0 0 680 350',
  modes: MODES.map(({ id, label, caption }) => ({ id, label, caption })),
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
