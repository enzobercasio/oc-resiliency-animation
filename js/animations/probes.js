/**
 * Startup, readiness, and liveness probes: three different questions asked
 * about the same pod, with three different consequences for a wrong answer.
 *
 * Sits right after upgrade-resiliency, before graceful-shutdown: the
 * placement, budget and drain-rate animations covered how many replicas
 * survive and how fast they may be taken away. This one covers how the
 * platform decides a single pod's own state - can it take traffic, has it
 * hung, is it still starting - which graceful-shutdown then assumes when it
 * narrows to the one probe (readiness) that matters during termination.
 *
 * Frame shape:
 *   { podLabel, podCls,
 *     startupLabel, startupCls, readinessLabel, readinessCls,
 *     livenessLabel, livenessCls, endpointLabel, endpointCls,
 *     note, badge, focus }
 * cls is one of 'run' | 'term' | 'pend', matching the site's pod state
 * classes: solid/ready, dashed-amber/acting, dotted/waiting.
 */

const MODES = [
  { id: 'readiness', label: 'Readiness gates traffic',
    caption: 'Failing readiness pulls a pod from Service endpoints — it keeps running, it just stops receiving requests' },
  { id: 'liveness', label: 'Liveness triggers a restart',
    caption: 'Failing liveness restarts the container in place — same pod, new process' },
  { id: 'crash-loop', label: 'A slow starter without startupProbe',
    caption: 'A liveness probe with no room to wait kills the container before it ever finishes starting' },
  { id: 'startup-fix', label: 'startupProbe buys it time',
    caption: 'Readiness and liveness stand down until startupProbe succeeds once' },
];

function buildFrames(modeId) {
  const f = [];
  const push = (o) => f.push(o);
  const base = {
    podLabel: 'running', podCls: 'run',
    startupLabel: 'passed once', startupCls: 'run',
    readinessLabel: 'pass', readinessCls: 'run',
    livenessLabel: 'pass', livenessCls: 'run',
    endpointLabel: 'in Service endpoints', endpointCls: 'run',
  };

  if (modeId === 'readiness') {
    push({ ...base,
      note: 'app-1 is Running, passing every probe',
      badge: 'Startup already succeeded once; readiness and liveness both run continuously from here on' });
    push({ ...base, readinessLabel: 'fail (1/3)', readinessCls: 'pend',
      note: 'A downstream dependency starts timing out',
      focus: ['readinessProbe'],
      badge: 'The readiness probe checks that dependency. Liveness does not — it is still passing' });
    push({ ...base, readinessLabel: 'fail (3/3)', readinessCls: 'term', endpointLabel: 'removed from endpoints', endpointCls: 'term',
      note: 'Readiness fails three times in a row — past failureThreshold',
      focus: ['failureThreshold: 3'],
      badge: 'The kubelet does exactly one thing about it: remove the pod from Service endpoints' });
    push({ ...base, readinessLabel: 'fail (3/3)', readinessCls: 'term', endpointLabel: 'removed from endpoints', endpointCls: 'term',
      note: 'The pod is still Running. Nothing restarted it',
      badge: 'Liveness never asked about the dependency, so it never had a reason to act' });
    push({ ...base,
      note: 'The dependency recovers, readiness passes, the endpoint returns',
      badge: 'No restart, no dropped connections that were already routed elsewhere — just a clean pause in traffic' });
  }

  if (modeId === 'liveness') {
    push({ ...base,
      note: 'app-1 is Running, passing every probe',
      badge: 'Same three probes as the last mode — watch which one acts this time' });
    push({ ...base, readinessLabel: 'fail (1/3)', readinessCls: 'pend', livenessLabel: 'fail (1/3)', livenessCls: 'pend',
      note: 'A deadlocked thread pool hangs the process — it never responds again',
      focus: ['livenessProbe'],
      badge: 'Readiness would fail too, eventually. Liveness is the one whose failure does something more' });
    push({ ...base, readinessLabel: 'fail (3/3)', readinessCls: 'term', livenessLabel: 'fail (3/3)', livenessCls: 'term', endpointLabel: 'removed from endpoints', endpointCls: 'term',
      note: 'Liveness fails three times — past failureThreshold',
      focus: ['failureThreshold: 3'],
      badge: 'This is the one probe whose failure is not just a Service endpoints update' });
    push({ podLabel: 'restarting', podCls: 'term',
      startupLabel: 'pending', startupCls: 'pend',
      readinessLabel: 'pending', readinessCls: 'pend',
      livenessLabel: 'pending', livenessCls: 'pend',
      endpointLabel: 'removed from endpoints', endpointCls: 'term',
      note: 'The kubelet kills the container and starts a fresh one',
      badge: 'Same pod identity, same IP — a brand-new attempt at the process. This is a restart, not a reschedule' });
    push({ ...base,
      note: 'The new process starts clean and passes every probe again',
      badge: 'The deadlock is gone because the process is gone — liveness cannot fix a hang, only replace it' });
  }

  if (modeId === 'crash-loop') {
    push({ podLabel: 'starting (0s)', podCls: 'pend',
      startupLabel: 'no startupProbe', startupCls: 'pend',
      readinessLabel: 'not ready', readinessCls: 'pend',
      livenessLabel: 'waiting', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'app-1 needs about 90 seconds to finish loading — only a livenessProbe is configured',
      focus: ['livenessProbe', 'initialDelaySeconds: 10'],
      badge: 'initialDelaySeconds: 10, periodSeconds: 10, failureThreshold: 3' });
    push({ podLabel: 'starting (10s)', podCls: 'pend',
      startupLabel: 'no startupProbe', startupCls: 'pend',
      readinessLabel: 'not ready', readinessCls: 'pend',
      livenessLabel: 'fail (1/3)', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'At 10 seconds the first liveness check runs — the app is still loading',
      badge: 'livenessProbe does not know the difference between "not ready yet" and "never going to answer"' });
    push({ podLabel: 'starting (30s)', podCls: 'pend',
      startupLabel: 'no startupProbe', startupCls: 'pend',
      readinessLabel: 'not ready', readinessCls: 'pend',
      livenessLabel: 'fail (3/3)', livenessCls: 'term',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'At 30 seconds, three failures in a row — past failureThreshold',
      focus: ['failureThreshold: 3'],
      badge: 'The app was 30 of the 90 seconds it needed. The probe has no way to know that' });
    push({ podLabel: 'restarting', podCls: 'term',
      startupLabel: 'no startupProbe', startupCls: 'pend',
      readinessLabel: 'not ready', readinessCls: 'pend',
      livenessLabel: 'pending', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'The kubelet kills it and starts over, from zero',
      badge: 'Elapsed progress toward the 90 seconds is not saved — the next attempt starts the same countdown' });
    push({ podLabel: 'starting (0s)', podCls: 'pend',
      startupLabel: 'no startupProbe', startupCls: 'pend',
      readinessLabel: 'not ready', readinessCls: 'pend',
      livenessLabel: 'waiting', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'This repeats forever — it can never survive past 30 seconds to reach the 90 it needs',
      badge: 'CrashLoopBackOff, and the actual cause is a probe configuration, not an application bug' });
  }

  if (modeId === 'startup-fix') {
    push({ podLabel: 'starting (0s)', podCls: 'pend',
      startupLabel: 'checking', startupCls: 'pend',
      readinessLabel: 'disabled', readinessCls: 'pend',
      livenessLabel: 'disabled', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'Same 90-second app, now with a startupProbe added',
      focus: ['startupProbe', 'failureThreshold: 10'],
      badge: 'While startupProbe is running, readiness and liveness do not execute at all' });
    push({ podLabel: 'starting (40s)', podCls: 'pend',
      startupLabel: 'fail (4/10)', startupCls: 'pend',
      readinessLabel: 'disabled', readinessCls: 'pend',
      livenessLabel: 'disabled', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'The kubelet checks startupProbe every 10 seconds and finds it still loading — that is fine',
      badge: 'failureThreshold: 10 means up to 100 seconds of patience before anything is treated as a problem' });
    push({ podLabel: 'starting (90s)', podCls: 'pend',
      startupLabel: 'passed once', startupCls: 'run',
      readinessLabel: 'disabled', readinessCls: 'pend',
      livenessLabel: 'disabled', livenessCls: 'pend',
      endpointLabel: 'not in endpoints yet', endpointCls: 'pend',
      note: 'At 90 seconds the app finishes loading and startupProbe finally passes',
      badge: 'That is the only thing startupProbe ever needs to do once — succeed a single time' });
    push({ ...base,
      note: 'Only now do readiness and liveness switch on',
      badge: 'From this point on it behaves exactly like the other two modes you already saw' });
    push({ ...base,
      note: 'One extra probe, and a 90-second app can actually finish starting',
      badge: 'Compare to the last mode: same app, same livenessProbe settings, zero crash loops' });
  }

  return f;
}

function box(x, y, w, h, cls, title, sub) {
  return `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 - 9}" text-anchor="middle" dominant-baseline="central">${title}</text>`
      + `<text class="svg-sub" x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" dominant-baseline="central">${sub}</text></g>`;
}

function renderSVG(frame) {
  let out = '';
  out += box(40, 40, 220, 74, frame.podCls, 'app-1', frame.podLabel);
  out += box(40, 134, 220, 74, frame.endpointCls, 'Service endpoints', frame.endpointLabel);
  out += box(300, 40, 220, 54, frame.startupCls, 'Startup', frame.startupLabel);
  out += box(300, 104, 220, 54, frame.readinessCls, 'Readiness', frame.readinessLabel);
  out += box(300, 168, 220, 54, frame.livenessCls, 'Liveness', frame.livenessLabel);
  out += '<text class="legend-text" x="40" y="240">solid = passing/ready · dotted = waiting or not-yet-checked · dashed amber = failed/acting</text>';
  return out;
}

function toneFromCls(cls) {
  return cls === 'run' ? 'ok' : cls === 'term' ? 'bad' : 'warn';
}

function metrics(frame) {
  return [
    { label: 'Pod', value: frame.podLabel, tone: toneFromCls(frame.podCls) },
    { label: 'Readiness', value: frame.readinessLabel, tone: toneFromCls(frame.readinessCls) },
    { label: 'Liveness', value: frame.livenessLabel, tone: toneFromCls(frame.livenessCls) },
  ];
}

const NOTES = {
  readiness: [
    { heading: 'What to point at', text: 'The pod stays Running the entire time — only the Service endpoints box changes.' },
    { heading: 'Line that lands', text: 'Readiness failing is not a problem being reported. It is the platform correctly hiding a pod that cannot currently do its job.' },
    { ask: 'Do your dashboards distinguish "pod not Ready" from "pod down," or does one alert fire for both?' },
  ],
  liveness: [
    { heading: 'What to point at', text: 'Compare this to the readiness mode you just showed: same three probes, but this time the pod itself restarts.' },
    { heading: 'Line that lands', text: 'Liveness cannot fix a hang — it can only notice one and throw the process away. If the app cannot self-diagnose a deadlock, this is the only mechanism that ever will.' },
    { ask: 'Does your livenessProbe check anything a downstream dependency could make fail — and if so, is that actually what you want restarting?' },
  ],
  'crash-loop': [
    { heading: 'What to point at', text: 'The app restarts at 30 seconds, every time, and never gets anywhere close to the 90 it actually needs.' },
    { heading: 'Line that lands', text: 'CrashLoopBackOff usually reads as "the application is broken." Here the application is fine — the probe configuration is the entire incident.' },
    { ask: 'Do you know the slowest real startup time of your largest service, or was initialDelaySeconds copied from a template?' },
  ],
  'startup-fix': [
    { heading: 'What to point at', text: 'The 90-second wait is now uneventful — startupProbe just keeps checking in, patiently, until it finally passes once.' },
    { heading: 'Line that lands', text: 'startupProbe does not replace livenessProbe. It stands in front of it, so a slow first boot and a later hang are governed by two different budgets instead of one compromise number.' },
    { ask: 'Which of your slow-starting services still tunes initialDelaySeconds instead of adding a startupProbe?' },
  ],
};

const PROBE_PAIR = `          readinessProbe:
            httpGet:
              path: /healthz/ready
              port: 8080
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /healthz/live
              port: 8080
            periodSeconds: 10
            failureThreshold: 3
`;

const YAML = {
  readiness: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
${PROBE_PAIR}`,
  liveness: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
${PROBE_PAIR}`,
  'crash-loop': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          livenessProbe:
            httpGet:
              path: /healthz/live
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

      # no startupProbe - liveness starts checking
      # at 10s and gives up by 30s. This app needs
      # about 90s to finish loading.
`,
  'startup-fix': `apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
        - name: app
          startupProbe:
            httpGet:
              path: /healthz/live
              port: 8080
            periodSeconds: 10
            failureThreshold: 10
${PROBE_PAIR}
      # readiness and liveness do not run at all
      # until startupProbe succeeds once.
`,
};

const FEATURES = {
  readiness: [
    { name: 'readinessProbe', kind: 'container',
      what: "Decides whether a pod's IP is in the Service's endpoint list. Failing it removes traffic, nothing more." },
    { name: 'Service endpoints', kind: 'v1/Endpoints', what: "Only Ready pods appear here — a load balancer or kube-proxy never sends traffic to an address that isn't listed." },
    { name: 'failureThreshold', kind: 'probe field',
      what: 'Consecutive failures before the verdict changes. The same field name means something different on each of the three probes.' },
  ],
  liveness: [
    { name: 'livenessProbe', kind: 'container',
      what: 'The only one of the three whose failure causes the kubelet to kill and restart the container.' },
    { name: 'restartPolicy', kind: 'pod spec',
      what: 'Governs whether that restart actually happens — on some workload types it might not.' },
    { name: 'kubelet', kind: 'node agent',
      what: "Runs every probe locally on the node and acts on livenessProbe failures without involving the scheduler at all." },
  ],
  'crash-loop': [
    { name: 'livenessProbe', kind: 'container',
      what: 'With no startupProbe, this is checked from initialDelaySeconds regardless of how long the app actually needs.' },
    { name: 'CrashLoopBackOff', kind: 'pod status reason',
      what: 'What shows up in oc get pods. The actual cause here is a probe, not an application bug.' },
    { name: 'initialDelaySeconds', kind: 'probe field',
      what: 'A single flat number that has to cover the worst-case startup, forever — or be wrong for either a fast or a slow one.' },
  ],
  'startup-fix': [
    { name: 'startupProbe', kind: 'container',
      what: 'Readiness and liveness do not run at all until this succeeds once — a slow starter gets its own budget instead of borrowing liveness’s.' },
    { name: 'failureThreshold × periodSeconds', kind: 'arithmetic',
      what: 'The effective startup budget. 10 × 10s here covers a 90-second app with room to spare.' },
    { name: 'livenessProbe', kind: 'container',
      what: 'Takes over unchanged the moment startupProbe succeeds — nothing about it needs tuning for startup time anymore.' },
  ],
};

export default {
  id: 'probes',
  title: 'Startup, readiness, and liveness probes: three different questions',
  summary: 'Readiness gates traffic, liveness triggers a restart, and startupProbe is the difference between a slow boot and a crash loop that never ends.',
  description: 'A single pod checked against startup, readiness, and liveness probes: readiness pulling it from Service endpoints without a restart, liveness restarting a hung container, and a slow-starting app crash-looping until a startupProbe is added.',
  viewBox: '0 0 680 260',
  modes: MODES,
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
  yaml: (modeId) => YAML[modeId],
  features: (modeId) => FEATURES[modeId],
};
