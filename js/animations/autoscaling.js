/**
 * HPA, VPA, and ClusterResourceOverride: three controllers that all rewrite
 * numbers requests-limits told you to set deliberately.
 *
 * Sits in Going deeper, right after priority-preemption. HorizontalPodAutoscaler
 * changes how many replicas exist; VerticalPodAutoscaler changes what one
 * replica is allowed to use - the exact mirror image, and the fix for the
 * "copied from a template" requests problem requests-limits raised and never
 * resolved. The third mode is what happens when both watch the same metric
 * on the same workload, which Kubernetes' own docs say not to do. The fourth
 * is OpenShift-specific and the most surprising of all: ClusterResourceOverride
 * can silently rewrite what a manifest declares before the scheduler ever
 * sees the pod, changing its QoS class along the way.
 *
 * Frame shape:
 *   { boxes: [{ x, y, w, h, cls, title, sub }],
 *     pods:  [{ id, cls, sub }],
 *     note, badge, focus }
 */

const MODES = [
  { id: 'hpa', label: 'HPA: how many',
    caption: 'Replica count scales with an observed metric — nothing about one pod’s own resources changes' },
  { id: 'vpa', label: 'VPA: how much',
    caption: 'Requests and limits scale with observed usage — nothing about replica count changes' },
  { id: 'conflict', label: 'Both, on the same metric', antiPattern: true,
    caption: 'HPA and VPA targeting the same CPU signal fight each other, exactly as the docs warn' },
  { id: 'cro', label: 'ClusterResourceOverride rewrites it', advanced: true,
    caption: 'An admission webhook can silently change what a manifest declares before the pod is ever scheduled' },
];

function pod(id, cls, sub) { return { id, cls, sub }; }
function box(x, y, w, h, cls, title, sub) { return { x, y, w, h, cls, title, sub }; }

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'hpa') {
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'HorizontalPodAutoscaler', '2 replicas · 20% of 50% target CPU')],
      pods: [pod('web-1', 'run', '20% CPU'), pod('web-2', 'run', '20% CPU')],
      note: 'Two replicas, comfortably under the 50% CPU target',
      badge: 'HPA does nothing while utilization sits inside the target — there is nothing to correct',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'term', 'HorizontalPodAutoscaler', '2 replicas · 90% of 50% target CPU')],
      pods: [pod('web-1', 'term', '90% CPU'), pod('web-2', 'term', '90% CPU')],
      note: 'Load rises — both replicas hit 90% CPU',
      focus: ['averageUtilization: 50'],
      badge: 'Well past the 50% target the HPA was told to hold',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'pend', 'HorizontalPodAutoscaler', 'scaling 2 → 4 replicas')],
      pods: [pod('web-1', 'term', '90% CPU'), pod('web-2', 'term', '90% CPU'), pod('web-3', 'pend', 'starting'), pod('web-4', 'pend', 'starting')],
      note: 'desired = ceil(2 × 90 / 50) = 4 replicas',
      badge: 'It only ever changes replica count — nothing about what one pod is allowed to use',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'HorizontalPodAutoscaler', '4 replicas · 45% of 50% target CPU')],
      pods: [pod('web-1', 'run', '45% CPU'), pod('web-2', 'run', '45% CPU'), pod('web-3', 'run', '45% CPU'), pod('web-4', 'run', '45% CPU')],
      note: 'Four replicas share the load; utilization settles back near target',
      badge: 'Same request, same limit, on every pod — HPA never touched either',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'HorizontalPodAutoscaler', '4 replicas · 45% of 50% target CPU')],
      pods: [pod('web-1', 'run', '45% CPU'), pod('web-2', 'run', '45% CPU'), pod('web-3', 'run', '45% CPU'), pod('web-4', 'run', '45% CPU')],
      note: 'HPA changes how many. It never touches what one is allowed to use',
      badge: 'That is the other half of this story',
    });
  }

  if (modeId === 'vpa') {
    push({
      boxes: [box(40, 20, 320, 64, 'pend', 'VerticalPodAutoscaler (Auto)', 'observing usage')],
      pods: [pod('web-1', 'run', 'request: 250m / 256Mi')],
      note: 'web-1 requests 250m CPU and 256Mi memory — copied from a template months ago',
      badge: 'Real usage has been running closer to 800m and 900Mi the entire time',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'recommends 800m / 900Mi')],
      pods: [pod('web-1', 'run', 'request: 250m / 256Mi')],
      note: 'VPA recommends new requests based on observed usage',
      focus: ['updateMode: "Auto"'],
      badge: 'In Auto mode the recommendation is not just a suggestion — it gets applied',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'recommends 800m / 900Mi')],
      pods: [pod('web-1', 'term', 'evicted to resize')],
      note: 'Requests cannot change on a live pod, so VPA evicts it to apply the new numbers',
      badge: 'This goes through the same eviction API a drain uses — a PodDisruptionBudget can delay it here',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'applied 800m / 900Mi')],
      pods: [pod('web-1', 'pend', 'starting with new request')],
      note: 'The replacement comes up with request: 800m / 900Mi',
      badge: 'Same pod name pattern, a brand-new resource footprint',
    });
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'applied 800m / 900Mi')],
      pods: [pod('web-1', 'run', 'request: 800m / 900Mi')],
      note: 'VPA changes what one pod is allowed to use. It never touches how many there are',
      badge: 'The mirror image of the mode you just watched',
    });
  }

  if (modeId === 'conflict') {
    push({
      boxes: [
        box(40, 20, 290, 64, 'run', 'HorizontalPodAutoscaler', 'target: 50% CPU'),
        box(350, 20, 290, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'target: CPU usage'),
      ],
      pods: [pod('web-1', 'run', '50% CPU'), pod('web-2', 'run', '50% CPU')],
      note: 'Both configured on the same Deployment, both watching CPU',
      focus: ['kind: HorizontalPodAutoscaler', 'kind: VerticalPodAutoscaler'],
      badge: 'Kubernetes’ own documentation says not to do this. It still happens constantly',
    });
    push({
      boxes: [
        box(40, 20, 290, 64, 'term', 'HorizontalPodAutoscaler', 'sees 95% — wants to scale out'),
        box(350, 20, 290, 64, 'term', 'VerticalPodAutoscaler (Auto)', 'sees 95% — wants to scale up'),
      ],
      pods: [pod('web-1', 'term', '95% CPU'), pod('web-2', 'term', '95% CPU')],
      note: 'Load rises. Both controllers react to the exact same signal, differently',
      badge: 'One wants more pods. The other wants bigger ones. Neither knows about the other',
    });
    push({
      boxes: [
        box(40, 20, 290, 64, 'pend', 'HorizontalPodAutoscaler', 'adding a replica'),
        box(350, 20, 290, 64, 'pend', 'VerticalPodAutoscaler (Auto)', 'evicting to resize'),
      ],
      pods: [pod('web-1', 'term', 'evicted to resize'), pod('web-2', 'run', '95% CPU'), pod('web-3', 'pend', 'starting')],
      note: 'VPA evicts a pod to resize it while HPA is mid-way through adding capacity',
      badge: 'Two independent controllers disrupting the same workload for two different reasons, at once',
    });
    push({
      boxes: [
        box(40, 20, 290, 64, 'pend', 'HorizontalPodAutoscaler', 'average utilization just dropped'),
        box(350, 20, 290, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'applied a bigger request'),
      ],
      pods: [pod('web-1', 'run', '40% of new, bigger request'), pod('web-2', 'run', '95% CPU'), pod('web-3', 'run', '40% CPU')],
      note: 'The bigger request VPA just applied drops that pod’s utilization — real load has not changed',
      badge: 'HPA reads that lower percentage and starts planning to scale back in',
    });
    push({
      boxes: [
        box(40, 20, 290, 64, 'term', 'HorizontalPodAutoscaler', 'scaling back to 2 replicas'),
        box(350, 20, 290, 64, 'run', 'VerticalPodAutoscaler (Auto)', 'applied a bigger request'),
      ],
      pods: [pod('web-1', 'run', '40% of new, bigger request'), pod('web-2', 'term', '95% CPU')],
      note: 'The workload thrashes between too few and too many pods, resized underneath itself the whole time',
      badge: 'Target HPA and VPA on different metrics, or run VPA in recommend-only mode — never both on the same one',
    });
  }

  if (modeId === 'cro') {
    push({
      boxes: [box(40, 20, 320, 64, 'run', 'Declared (your manifest)', 'requests: 1Gi · limits: 1Gi')],
      pods: [],
      note: 'A Deployment declares requests: 1Gi, limits: 1Gi — Guaranteed, by the numbers you wrote',
      focus: ['requests:', 'limits:'],
      badge: 'Every calculation in the requests-limits animation assumed these numbers are what actually runs',
    });
    push({
      boxes: [
        box(40, 20, 320, 64, 'run', 'Declared (your manifest)', 'requests: 1Gi · limits: 1Gi'),
        box(370, 20, 270, 64, 'pend', 'ClusterResourceOverride', 'memoryRequestToLimitPercent: 50'),
      ],
      pods: [],
      note: 'ClusterResourceOverride is enabled cluster-wide',
      focus: ['memoryRequestToLimitPercent'],
      badge: 'An admission webhook that runs before the pod is ever scheduled — before your numbers ever take effect',
    });
    push({
      boxes: [
        box(40, 20, 320, 64, 'run', 'Declared (your manifest)', 'requests: 1Gi · limits: 1Gi'),
        box(370, 20, 270, 64, 'term', 'Applied (what actually runs)', 'requests: 1Gi · limits: 2Gi'),
      ],
      pods: [],
      note: 'The pod that actually gets created has limits: 2Gi — the override doubled it',
      badge: 'What you wrote and what is running are no longer the same numbers',
    });
    push({
      boxes: [
        box(40, 20, 320, 64, 'run', 'Declared (your manifest)', 'QoS as written: Guaranteed'),
        box(370, 20, 270, 64, 'term', 'Applied (what actually runs)', 'QoS as scheduled: Burstable'),
      ],
      pods: [],
      note: 'The QoS class changes too: Guaranteed becomes Burstable, silently',
      badge: 'Nobody edited the manifest. The eviction ranking from several animations ago just changed underneath it',
    });
    push({
      boxes: [
        box(40, 20, 320, 64, 'run', 'Declared (your manifest)', 'QoS as written: Guaranteed'),
        box(370, 20, 270, 64, 'term', 'Applied (what actually runs)', 'QoS as scheduled: Burstable'),
      ],
      pods: [],
      note: 'Always check oc get pod -o yaml — not just what you applied',
      badge: 'A cluster-wide override can make every one of your manifests inaccurate at once',
    });
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  frame.boxes.forEach((b) => {
    out += `<g class="pod ${b.cls}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8"/>`
        + `<text class="svg-sub" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 - 9}" text-anchor="middle" dominant-baseline="central">${b.title}</text>`
        + `<text class="svg-sub" x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${b.sub}</text></g>`;
  });

  const colX = [56, 356];
  const rowY = [104, 172];
  frame.pods.forEach((p, i) => {
    const col = i % 2;
    const row = (i - col) / 2;
    out += `<g class="pod ${p.cls}"><rect x="${colX[col]}" y="${rowY[row]}" width="270" height="60" rx="8"/>`
        + `<text class="svg-sub" x="${colX[col] + 135}" y="${rowY[row] + 21}" text-anchor="middle" dominant-baseline="central">${p.id}</text>`
        + `<text class="svg-sub" x="${colX[col] + 135}" y="${rowY[row] + 41}" text-anchor="middle" dominant-baseline="central">${p.sub}</text></g>`;
  });

  out += '<text class="legend-text" x="40" y="252">solid = steady · dashed amber = acting or over target · dotted = starting or observing</text>';
  return out;
}

function metrics(frame) {
  const running = frame.pods.filter((p) => p.cls === 'run').length;
  const acting = frame.pods.filter((p) => p.cls !== 'run').length;
  return [
    { label: 'Pods', value: String(frame.pods.length) },
    { label: 'Steady', value: String(running), tone: acting ? 'warn' : 'ok' },
    { label: 'In flux', value: String(acting), tone: acting ? 'warn' : 'ok' },
  ];
}

const NOTES = {
  hpa: [
    { heading: 'What to point at', text: 'The replica count changing, and only the replica count — every pod keeps the same request and limit throughout.' },
    { heading: 'Line that lands', text: 'HPA answers "how many." It has no opinion at all about what one pod is allowed to use — that is a completely separate controller.' },
    { ask: 'Does your HPA target a resource metric, or something that actually reflects load, like requests-per-second?' },
  ],
  vpa: [
    { heading: 'What to point at', text: 'The eviction in the middle — VPA cannot change a live pod’s resources, so Auto mode recreates it.' },
    { heading: 'Line that lands', text: 'This is the fix for "the requests were copied from a template and never revisited" — but it costs a pod restart every time it acts.' },
    { ask: 'Have you run VPA in recommend-only mode on your biggest workload just to see how wrong the current requests are?' },
  ],
  conflict: [
    { heading: 'What to point at', text: 'The moment utilization drops for the wrong reason — a bigger denominator, not less load — and HPA acts on it anyway.' },
    { heading: 'Line that lands', text: 'Neither controller is malfunctioning. Each is doing exactly its job, on a shared signal neither knows the other is also changing.' },
    { ask: 'Do you know whether any of your workloads have both an HPA and a VPA watching the same metric right now?' },
  ],
  cro: [
    { heading: 'What to point at', text: 'The Declared and Applied boxes disagreeing, and the QoS class flipping with no change to the Deployment at all.' },
    { heading: 'Line that lands', text: 'requests-limits assumed your manifest was the truth. ClusterResourceOverride is the reason that assumption can be wrong cluster-wide, for every workload, at once.' },
    { ask: 'Is ClusterResourceOverride enabled anywhere in your fleet, and does the platform team know which teams’ QoS classes it has silently changed?' },
  ],
};

const YAML = {
  hpa: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
`,
  vpa: `apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-vpa
spec:
  targetRef:
    kind: Deployment
    name: web
  updateMode: "Auto"
`,
  conflict: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    kind: Deployment
    name: web
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
---
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: web-vpa
spec:
  targetRef:
    kind: Deployment
    name: web
  updateMode: "Auto"

# Both watch the same signal on the same workload.
# Kubernetes' own docs say not to do this.
`,
  cro: `apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: web
          resources:
            requests:
              memory: 1Gi
            limits:
              memory: 1Gi
---
apiVersion: operator.autoscaling.openshift.io/v1
kind: ClusterResourceOverride
metadata:
  name: cluster
spec:
  podResourceOverride:
    spec:
      memoryRequestToLimitPercent: 50

# Runs at admission time, before the scheduler ever
# sees the pod. requests: 1Gi / limits: 1Gi becomes
# requests: 1Gi / limits: 2Gi no matter what the
# Deployment says.
`,
};

const FEATURES = {
  hpa: [
    { name: 'HorizontalPodAutoscaler', kind: 'autoscaling/v2',
      what: 'Changes replica count based on an observed metric — the only one of these controllers that adds or removes capacity.' },
    { name: 'averageUtilization', kind: 'HPA metric field',
      what: "The target, expressed as a percentage of each pod's own request — which is why a wrong request quietly changes what \"50%\" even means." },
    { name: 'minReplicas / maxReplicas', kind: 'HPA spec',
      what: 'The floor and ceiling the controller will never cross, no matter what the metric says.' },
  ],
  vpa: [
    { name: 'VerticalPodAutoscaler', kind: 'autoscaling.k8s.io/v1',
      what: 'Recommends, or in Auto mode applies, requests and limits from observed usage.' },
    { name: 'updateMode', kind: 'VPA spec',
      what: 'Off just recommends; Initial sets requests only at pod creation; Auto evicts and recreates a running pod to apply a new recommendation.' },
    { name: 'Eviction API', kind: 'pods/eviction',
      what: "VPA's Auto mode resizes through a normal eviction, unlike preemption — a PodDisruptionBudget can delay it here." },
  ],
  conflict: [
    { name: 'HorizontalPodAutoscaler + VerticalPodAutoscaler', kind: 'autoscaling',
      what: "Both reacting to the same CPU signal on the same workload is explicitly against Kubernetes' own guidance." },
    { name: 'averageUtilization', kind: 'HPA metric field',
      what: "Measured against each pod's request — which VPA is changing out from under it in real time." },
    { name: 'updateMode: Auto', kind: 'VPA spec',
      what: 'Each resize is itself a disruption, landing at the exact moment HPA is also trying to change capacity.' },
  ],
  cro: [
    { name: 'ClusterResourceOverride', kind: 'operator.autoscaling.openshift.io/v1',
      what: "An OpenShift admission webhook that rewrites a pod's requests and limits by a cluster-wide ratio, before the scheduler ever sees it." },
    { name: 'memoryRequestToLimitPercent', kind: 'CRO field',
      what: 'One of several ratios (CPU has equivalents) an admin sets once, applied to every matching pod cluster-wide.' },
    { name: 'QoS class', kind: 'derived',
      what: 'Can change from Guaranteed to Burstable purely from an override, with no change to the Deployment that was actually applied.' },
  ],
};

export default {
  id: 'autoscaling',
  advanced: true,
  title: 'HPA, VPA, and ClusterResourceOverride',
  summary: 'Horizontal scales how many, vertical scales how much, running both on the same metric fights, and a cluster-wide override can rewrite either without touching your manifest.',
  description: 'A Deployment scaled horizontally by an HPA, resized vertically by a VPA, both fighting over the same CPU signal, and a ClusterResourceOverride silently changing what a manifest declares before the pod is ever scheduled.',
  viewBox: '0 0 680 270',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
