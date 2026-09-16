/**
 * Pod disruption budgets: the arithmetic behind disruptionsAllowed, before
 * disruption-types puts it up against a code path that never calls it.
 *
 * Sits right after topology-spread, before disruption-types, on purpose: this
 * one covers the budget in isolation - an absolute floor versus a percentage
 * ceiling, a floor set equal to the replica count deadlocking a drain from
 * the moment it exists, and the failure mode none of those three admit to, a
 * replacement that never becomes Ready. disruption-types then assumes this is
 * already understood and spends its whole runtime on voluntary vs
 * involuntary instead of re-deriving what a PDB is.
 *
 * Frame shape:
 *   { pods: ['r'|'t'|'p', ...], ready, total, allowed, thresholdLabel,
 *     note, badge, focus }
 */

const MODES = [
  { id: 'min-available', label: 'minAvailable: an absolute floor',
    caption: 'disruptionsAllowed is ready replicas minus minAvailable — nothing more' },
  { id: 'deadlock', label: 'minAvailable = replicas: deadlock', antiPattern: true,
    caption: 'Zero headroom by design — a node drain retries forever and never succeeds' },
  { id: 'max-unavailable', label: 'maxUnavailable: a scaling ceiling',
    caption: 'A percentage recalculates automatically on every scale event' },
  { id: 'stuck', label: 'When it never recovers', advanced: true,
    caption: 'A replacement stuck in ImagePullBackOff never becomes Ready — and neither does the budget' },
];

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);

  if (modeId === 'min-available') {
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r'], ready: 6, total: 6, allowed: 1,
      thresholdLabel: 'minAvailable: 5',
      note: 'Deployment: replicas: 6. PodDisruptionBudget: minAvailable: 5',
      focus: ['minAvailable: 5'],
      badge: 'disruptionsAllowed is just arithmetic: 6 ready minus 5 required equals 1' });
    push({ pods: ['t', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'A single eviction spends that one unit of headroom',
      badge: 'disruptionsAllowed drops to 0 the instant a pod starts terminating' });
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r'], ready: 6, total: 6, allowed: 1,
      thresholdLabel: 'minAvailable: 5',
      note: 'It recovers the moment the replacement passes readiness',
      badge: 'Back to 6 ready, back to 1 of headroom — exactly as designed' });
    push({ pods: ['r', 'r', 'r', 'r', 'r'], ready: 5, total: 5, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'Now scale the Deployment down to replicas: 5 for a quiet period',
      focus: ['minAvailable: 5'],
      badge: "Nothing about the PDB changed — minAvailable is still exactly 5" });
    push({ pods: ['r', 'r', 'r', 'r', 'r'], ready: 5, total: 5, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'disruptionsAllowed is now 0 — permanently, at this replica count',
      badge: '5 ready minus minAvailable: 5 leaves zero headroom, not a temporary dip' });
    push({ pods: ['r', 'r', 'r', 'r', 'r'], ready: 5, total: 5, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'Every drain from here blocks until you scale back up or edit the budget',
      badge: 'A budget written for one replica count can silently stop protecting anything after the next scale-down' });
  }

  if (modeId === 'deadlock') {
    push({ pods: ['r', 'r', 'r', 'r'], ready: 4, total: 4, allowed: 0,
      thresholdLabel: 'minAvailable: 4',
      note: 'replicas: 4, minAvailable: 4 — "zero downtime," by one reading of the docs',
      focus: ['minAvailable: 4'],
      badge: 'disruptionsAllowed is 4 minus 4. It was never going to be anything but 0' });
    push({ pods: ['r', 'r', 'r', 'r'], ready: 4, total: 4, allowed: 0,
      thresholdLabel: 'minAvailable: 4',
      note: 'A node holding one of these replicas needs to drain for maintenance',
      badge: 'oc adm drain calls the eviction API exactly like any other voluntary disruption' });
    push({ pods: ['r', 'r', 'r', 'r'], ready: 4, total: 4, allowed: 0,
      thresholdLabel: 'minAvailable: 4',
      note: 'The eviction request is refused before the pod moves at all',
      focus: ['minAvailable: 4'],
      badge: 'HTTP 429 — not a retry that eventually succeeds. The budget cannot grant this, ever' });
    push({ pods: ['r', 'r', 'r', 'r'], ready: 4, total: 4, allowed: 0,
      thresholdLabel: 'minAvailable: 4',
      note: 'The drain retries in a loop, forever, and never proceeds',
      badge: 'Nothing changes disruptionsAllowed while all four stay Ready — and the one request that would is the one being refused' });
    push({ pods: ['r', 'r', 'r', 'r'], ready: 4, total: 4, allowed: 0,
      thresholdLabel: 'minAvailable: 4',
      note: 'This is why minAvailable should never equal the replica count',
      badge: 'Written to protect every replica, it ends up protecting none of them from ever being drained — write minAvailable: 3 instead' });
  }

  if (modeId === 'max-unavailable') {
    push({ pods: ['r', 'r', 'r', 'r', 'r'], ready: 5, total: 5, allowed: 1,
      thresholdLabel: 'maxUnavailable: 20%',
      note: 'Same idea, expressed differently: maxUnavailable: 20%, replicas: 5',
      focus: ['maxUnavailable: 20%'],
      badge: '20% of 5 rounds down to 1 — disruptionsAllowed starts at 1, same as the last mode' });
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], ready: 10, total: 10, allowed: 1,
      thresholdLabel: 'maxUnavailable: 20%',
      note: 'Scale up to replicas: 10 for a traffic spike',
      badge: 'Nothing about the PodDisruptionBudget manifest changed' });
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], ready: 10, total: 10, allowed: 2,
      thresholdLabel: 'maxUnavailable: 20%',
      note: 'disruptionsAllowed recalculates to 2, automatically',
      badge: '20% of 10 is 2 — the same 20% now tolerates twice the concurrent disruption' });
    push({ pods: ['t', 't', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], ready: 8, total: 10, allowed: 0,
      thresholdLabel: 'maxUnavailable: 20%',
      note: 'Two concurrent evictions proceed at once from that headroom',
      badge: 'Both come from the same 20% — the drain moves twice as fast and nobody touched the PDB' });
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], ready: 10, total: 10, allowed: 2,
      thresholdLabel: 'maxUnavailable: 20%',
      note: 'A percentage tracks the replica count; an absolute floor has to be maintained by hand',
      badge: 'This is the mode most teams should default to under an HPA' });
  }

  if (modeId === 'stuck') {
    push({ pods: ['r', 'r', 'r', 'r', 'r', 'r'], ready: 6, total: 6, allowed: 1,
      thresholdLabel: 'minAvailable: 5',
      note: 'replicas: 6, minAvailable: 5 — a routine drain begins',
      focus: ['minAvailable: 5'],
      badge: 'disruptionsAllowed is 1, same arithmetic as the first mode' });
    push({ pods: ['t', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'One pod is evicted — disruptionsAllowed drops to 0 as expected',
      badge: 'So far this is identical to the healthy case' });
    push({ pods: ['p', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'The replacement comes up — into ImagePullBackOff',
      badge: 'The pod exists and is Running. It is not, and will not become, Ready' });
    push({ pods: ['p', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'disruptionsAllowed stays at 0 — not briefly, indefinitely',
      focus: ['minAvailable: 5'],
      badge: '5 ready minus minAvailable: 5 is zero for as long as that one pod stays broken' });
    push({ pods: ['p', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'Every later eviction in this drain retries and is refused, forever',
      badge: 'The drain is not stuck on your rollout — it is stuck on this one broken image' });
    push({ pods: ['p', 'r', 'r', 'r', 'r', 'r'], ready: 5, total: 6, allowed: 0,
      thresholdLabel: 'minAvailable: 5',
      note: 'The fix has nothing to do with the PDB',
      badge: 'Fix or roll back the broken pod and disruptionsAllowed recovers on its own — the budget was never the problem' });
  }

  return f;
}

function renderSVG(frame) {
  let out = '';

  const budgetCls = frame.allowed > 0 ? 'run' : 'term';
  out += `<g class="pod ${budgetCls}"><rect x="40" y="36" width="300" height="64" rx="8"/>`
      + '<text class="svg-sub" x="190" y="56" text-anchor="middle" dominant-baseline="central">PodDisruptionBudget</text>'
      + `<text class="svg-sub" x="190" y="74" text-anchor="middle" dominant-baseline="central">${frame.thresholdLabel}</text>`
      + `<text class="svg-sub" x="190" y="92" text-anchor="middle" dominant-baseline="central">disruptionsAllowed: ${frame.allowed}</text></g>`;

  const cols = frame.total > 6 ? 5 : 3;
  frame.pods.forEach((s, i) => {
    const col = i % cols;
    const row = (i - col) / cols;
    const x = 40 + col * 84;
    const y = 140 + row * 46;
    const cls = s === 'r' ? 'run' : s === 't' ? 'term' : 'pend';
    const label = s === 'r' ? 'ready' : s === 't' ? 'term' : 'broken';
    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="76" height="36" rx="6"/>`
        + `<text class="svg-sub" x="${x + 38}" y="${y + 18}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  });

  out += '<text class="legend-text" x="40" y="284">disruptionsAllowed = ready replicas minus the floor — it only ever counts Ready</text>';
  return out;
}

function metrics(frame) {
  return [
    { label: 'Ready', value: `${frame.ready} / ${frame.total}`, tone: frame.ready === frame.total ? 'ok' : 'warn' },
    { label: 'disruptionsAllowed', value: String(frame.allowed), tone: frame.allowed > 0 ? 'ok' : 'bad' },
    { label: 'Budget', value: frame.thresholdLabel },
  ];
}

const NOTES = {
  'min-available': [
    { heading: 'What to point at', text: 'The scale-down frame — the PDB manifest never changes, but the headroom it grants goes from 1 to 0 anyway.' },
    { heading: 'Line that lands', text: 'minAvailable is correct for the replica count you wrote it for, and silently wrong the moment you scale without revisiting it.' },
    { ask: 'Do any of your PodDisruptionBudgets use an absolute minAvailable on a Deployment that also has an HPA?' },
  ],
  deadlock: [
    { heading: 'What to point at', text: 'Frame 1. Nothing has scaled and nothing is unhealthy yet — the deadlock exists the instant this manifest is applied.' },
    { heading: 'Line that lands', text: 'minAvailable: 4 on 4 replicas is not a stricter version of minAvailable: 3 — it is a different thing entirely. It removes the budget’s only degree of freedom.' },
    { ask: 'Grep your PodDisruptionBudgets for minAvailable equal to the Deployment’s replica count — how many do you find?' },
  ],
  'max-unavailable': [
    { heading: 'What to point at', text: 'disruptionsAllowed recalculating from 1 to 2 with zero edits to the PDB, purely because the Deployment scaled.' },
    { heading: 'Line that lands', text: 'A percentage is not a nicer syntax for the same idea — it is the version that stays correct after a scaling event the PDB author never saw coming.' },
    { ask: 'Which of your budgets would you trust to still make sense after next quarter’s traffic growth?' },
  ],
  stuck: [
    { heading: 'What to point at', text: 'The single broken pod sitting at "broken" while disruptionsAllowed reads 0 for the rest of the animation.' },
    { heading: 'Line that lands', text: 'The drain is not stuck on policy. It is stuck on one pod’s readiness probe, and the budget has no way to tell the difference between "recovering" and "never going to recover."' },
    { ask: 'The last time a drain or upgrade hung, did anyone check disruptionsAllowed, or did everyone assume it was the network?' },
  ],
};

const YAML = {
  'min-available': `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payments-api-pdb
spec:
  minAvailable: 5
  selector:
    matchLabels:
      app: payments-api

# disruptionsAllowed = ready replicas - minAvailable
# minAvailable is an absolute number - it does not
# move when you scale the Deployment.
`,
  deadlock: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payments-api-pdb
spec:
  minAvailable: 4
  selector:
    matchLabels:
      app: payments-api

# replicas: 4, minAvailable: 4 - disruptionsAllowed
# is 4 - 4 = 0 from the moment this budget exists.
# A drain touching any of these replicas retries
# the eviction forever and never succeeds.
`,
  'max-unavailable': `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payments-api-pdb
spec:
  maxUnavailable: 20%
  selector:
    matchLabels:
      app: payments-api

# disruptionsAllowed = floor(replicas * 0.20)
# a percentage recalculates on every scale event -
# nothing here has to be touched by hand.
`,
  stuck: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payments-api-pdb
spec:
  minAvailable: 5
  selector:
    matchLabels:
      app: payments-api

# disruptionsAllowed only counts Ready pods.
# A replacement stuck in ImagePullBackOff never
# becomes Ready, so the budget never recovers.
`,
};

const FEATURES = {
  'min-available': [
    { name: 'PodDisruptionBudget', kind: 'policy/v1',
      what: 'Caps concurrent voluntary evictions by keeping a minimum number of matching pods available at all times.' },
    { name: 'minAvailable', kind: 'PDB spec',
      what: 'An absolute floor. Correct for the replica count you wrote it for, and silently wrong the moment you scale without revisiting it.' },
    { name: 'status.disruptionsAllowed', kind: 'PDB status',
      what: 'Live headroom, recomputed as ready count minus the floor. Zero means every voluntary eviction blocks, not just the next one.' },
  ],
  deadlock: [
    { name: 'minAvailable', kind: 'PDB spec',
      what: 'Set equal to the replica count, this does not protect the last replica — it removes the budget’s only degree of freedom, so disruptionsAllowed is permanently 0.' },
    { name: 'Eviction API', kind: 'pods/eviction',
      what: 'Every request against this budget returns 429, forever. The retry loop that normally makes a drain slow and safe here just makes it never.' },
    { name: 'oc adm drain', kind: 'command',
      what: 'Has no default timeout on eviction retries — a permanently-zero budget means the command hangs indefinitely instead of failing loudly.' },
  ],
  'max-unavailable': [
    { name: 'maxUnavailable', kind: 'PDB spec',
      what: 'A percentage ceiling. Recalculates automatically on every scale event, so the same manifest keeps the same relative headroom at 5 replicas or 500.' },
    { name: 'status.disruptionsAllowed', kind: 'PDB status',
      what: 'Here it is floor(replicas * percentage) instead of a fixed number.' },
    { name: 'HorizontalPodAutoscaler', kind: 'autoscaling/v2',
      what: 'The reason most teams should default to a percentage: an absolute minAvailable has no idea the HPA just changed the replica count under it.' },
  ],
  stuck: [
    { name: 'status.disruptionsAllowed', kind: 'PDB status',
      what: 'Only counts Ready pods toward the floor. A replacement that never becomes Ready keeps this at its worst value indefinitely.' },
    { name: 'unhealthyPodEvictionPolicy', kind: 'PDB field',
      what: 'AlwaysAllow lets an already-unhealthy pod be evicted regardless of the budget, so a broken replica cannot also consume eviction attempts.' },
    { name: 'kube-controller-manager', kind: 'control plane',
      what: 'Recomputes disruptionsAllowed continuously and never times out — there is no "stuck" state to the PDB itself, only a ready count that stopped moving.' },
  ],
};

export default {
  id: 'pod-disruption-budget',
  title: 'Pod disruption budgets: minAvailable, maxUnavailable, and getting stuck',
  summary: 'The rate limiter for voluntary disruption — an absolute floor or a percentage ceiling, and what happens when disruptionsAllowed never recovers.',
  description: 'A PodDisruptionBudget’s disruptionsAllowed counter tracked across a scale-down, a floor set equal to the replica count that deadlocks a node drain, a scale-up under a percentage rule, and a replacement pod that never becomes Ready.',
  viewBox: '0 0 680 300',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
