/**
 * Voluntary vs involuntary disruption.
 *
 * The same workload, the same PDB, two different ways of losing a node. One
 * goes through the eviction API and is checked against the budget; the other
 * does not exist as an API call at all. This is the animation that explains
 * why a PDB is not a substitute for a spread constraint.
 *
 * Frame shape:
 *   { actor, arrow, checked, verdict, pods: ['r'|'t'|'x', ...], note, badge }
 */

const MODES = [
  { id: 'voluntary', label: 'Drain (voluntary)', voluntary: true,
    caption: 'oc adm drain — goes through the eviction API, so the PDB is consulted' },
  { id: 'involuntary', label: 'Node failure (involuntary)', voluntary: false,
    caption: 'Node loses power — nothing calls the eviction API, so nothing is consulted' },
];

function buildFrames(modeId) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const f = [];
  const push = (o) => f.push(o);

  const allReady = ['r', 'r', 'r', 'r', 'r', 'r'];

  if (mode.voluntary) {
    push({ actor: 'idle', arrow: false, checked: false, verdict: '',
      pods: [...allReady],
      note: 'Six replicas running, PDB minAvailable: 5 in force',
      badge: 'disruptionsAllowed is 1 — the budget has exactly one pod of headroom' });
    push({ actor: 'drain', arrow: true, checked: false, verdict: '',
      pods: [...allReady],
      note: 'An administrator runs oc adm drain',
      badge: 'The drain does not delete pods. It calls POST /pods/{name}/eviction for each one' });
    push({ actor: 'drain', arrow: true, checked: true, verdict: 'allowed',
      pods: [...allReady],
      note: 'The API server asks the PDB controller: would this breach the budget?',
      badge: '5 of 6 would remain, which satisfies minAvailable: 5 — eviction allowed' });
    push({ actor: 'drain', arrow: true, checked: true, verdict: 'allowed',
      pods: ['t', 'r', 'r', 'r', 'r', 'r'],
      note: 'One pod terminates gracefully',
      badge: 'disruptionsAllowed drops to 0 while the replacement comes up' });
    push({ actor: 'drain', arrow: true, checked: true, verdict: 'denied',
      pods: ['t', 'r', 'r', 'r', 'r', 'r'],
      note: 'The drain immediately requests the next eviction — and is refused',
      badge: 'HTTP 429 Too Many Requests. The drain retries in a loop rather than proceeding' });
    push({ actor: 'drain', arrow: true, checked: true, verdict: 'allowed',
      pods: ['r', 'r', 'r', 'r', 'r', 'r'],
      note: 'Replacement passes readiness, budget recovers, next eviction is admitted',
      badge: 'This retry loop is what makes an upgrade slow and safe rather than fast and disruptive' });
    push({ actor: 'idle', arrow: false, checked: false, verdict: '',
      pods: [...allReady],
      note: 'The PDB did exactly its job',
      badge: 'It capped the rate of a disruption that something chose to perform' });
  } else {
    push({ actor: 'idle', arrow: false, checked: false, verdict: '',
      pods: [...allReady],
      note: 'Identical starting point: six replicas, same PDB minAvailable: 5',
      badge: 'disruptionsAllowed is 1. Nothing about this configuration has changed' });
    push({ actor: 'failure', arrow: false, checked: false, verdict: '',
      pods: [...allReady],
      note: 'A node loses power',
      badge: 'No API call is made. No controller is asked for permission. There is nothing to refuse' });
    push({ actor: 'failure', arrow: false, checked: false, verdict: 'bypassed',
      pods: ['x', 'x', 'x', 'r', 'r', 'r'],
      note: 'Every pod on that node is gone at once',
      badge: 'The PDB was in force the entire time and had no mechanism to intervene' });
    push({ actor: 'failure', arrow: false, checked: false, verdict: 'bypassed',
      pods: ['p', 'p', 'p', 'r', 'r', 'r'],
      note: 'The controller notices and schedules replacements',
      badge: 'They pay a full cold start. How bad this is depends entirely on where the survivors were' });
    push({ actor: 'idle', arrow: false, checked: false, verdict: '',
      pods: [...allReady],
      note: 'Recovered — and the outcome was decided by placement, not by the budget',
      badge: 'Had all six been on that node, this frame would be a total outage. That is the spread constraint\u2019s job' });
  }
  return f;
}

function renderSVG(frame) {
  let out = '';

  // actor box (left)
  const actorLabel = { drain: 'oc adm drain', failure: 'node power loss', idle: 'cluster' }[frame.actor];
  const actorCls = frame.actor === 'failure' ? 'term' : frame.actor === 'drain' ? 'run' : 'pend';
  out += `<g class="pod ${actorCls}"><rect x="40" y="120" width="150" height="56" rx="8"/>`
      + `<text class="svg-sub" x="115" y="148" text-anchor="middle" dominant-baseline="central">${actorLabel}</text></g>`;

  // eviction API gate (middle)
  const gateCls = frame.verdict === 'denied' ? 'term' : frame.verdict === 'allowed' ? 'run' : 'pend';
  out += `<g class="pod ${gateCls}"><rect x="250" y="108" width="180" height="80" rx="8"/>`
      + `<text class="svg-sub" x="340" y="136" text-anchor="middle" dominant-baseline="central">eviction API</text>`
      + `<text class="svg-sub" x="340" y="158" text-anchor="middle" dominant-baseline="central">PDB admission check</text></g>`;

  // arrow from actor to gate, only when something actually calls it
  if (frame.arrow) {
    out += '<line class="track-line" x1="192" y1="148" x2="246" y2="148"/>';
  } else if (frame.actor === 'failure') {
    // the bypass path: straight past the gate to the pods
    out += '<path class="marker-line" d="M115 178 L115 250 L560 250 L560 214" fill="none"/>';
    out += '<text class="legend-text" x="330" y="266" text-anchor="middle">no API call is made — the gate is not on this path</text>';
  }

  if (frame.verdict) {
    const label = { allowed: 'allowed', denied: 'denied — HTTP 429', bypassed: 'never consulted' }[frame.verdict];
    out += `<text class="legend-text" x="340" y="202" text-anchor="middle">${label}</text>`;
  }

  // pods (right)
  frame.pods.forEach((s, i) => {
    const col = i % 3;
    const row = (i - col) / 3;
    const x = 480 + col * 62;
    const y = 112 + row * 46;
    const cls = s === 'r' ? 'run' : s === 't' ? 'term' : 'pend';
    const label = s === 'x' ? 'gone' : s === 't' ? 'term' : s === 'p' ? 'init' : 'ready';
    out += `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="54" height="34" rx="6"/>`
        + `<text class="svg-sub" x="${x + 27}" y="${y + 17}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  });

  out += '<text class="svg-sub on-node" x="480" y="96" text-anchor="start">workload replicas</text>';
  out += '<text class="legend-text" x="40" y="316">A PodDisruptionBudget is an admission check on one specific API call. If nothing makes that call, the budget cannot help.</text>';
  return out;
}

function metrics(frame) {
  const ready = frame.pods.filter((s) => s === 'r').length;
  return [
    { label: 'Ready', value: `${ready} / 6`, tone: ready === 0 ? 'bad' : ready < 6 ? 'warn' : 'ok' },
    { label: 'PDB consulted', value: frame.checked ? 'yes' : 'no', tone: frame.checked ? 'ok' : 'warn' },
    { label: 'Verdict', value: frame.verdict || '—', tone: frame.verdict === 'denied' ? 'warn' : frame.verdict === 'bypassed' ? 'bad' : '' },
  ];
}

const NOTES = {
  voluntary: [
    { heading: 'The mechanism', text: 'A drain never deletes pods. It calls the eviction subresource, which is admission-checked against every matching PDB. A refusal is an HTTP 429 and the drain retries.' },
    { heading: 'Where this bites', text: 'If disruptionsAllowed is permanently 0 — minAvailable equal to replicas, or pods in CrashLoopBackOff — the retry loop never succeeds and the MachineConfigPool stalls.' },
    { ask: 'When did you last check disruptionsAllowed across your namespaces?' },
  ],
  involuntary: [
    { heading: 'The point of the whole set', text: 'Same workload, same budget, no API call. The PDB is not weaker here — it is simply not on this code path.' },
    { heading: 'What actually decides the outcome', text: 'Placement. If the survivors are spread across other zones you degrade; if every replica was on the failed node you are at zero.' },
    { ask: 'Which of your workloads would be at zero if a single node disappeared right now?' },
  ],
};

export default {
  id: 'disruption-types',
  title: 'Voluntary vs involuntary disruption',
  summary: 'Why a pod disruption budget protects a drain but does nothing for a node that loses power — the same workload, two code paths.',
  description: 'A drain calling the eviction API and being admission-checked against a PDB, contrasted with a node failure that bypasses the API entirely.',
  viewBox: '0 0 680 330',
  modes: MODES.map(({ id, label, caption }) => ({ id, label, caption })),
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
};
