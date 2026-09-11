/**
 * Graceful shutdown: the endpoint-removal race.
 *
 * Two parallel tracks on a timeline - what the router is doing, and what the
 * container is doing. Without a preStop hook they overlap and the overlap is
 * where users see 502s at full replica count.
 *
 * Frame shape:
 *   { t: seconds elapsed, router: 'routing'|'removing'|'removed',
 *     container: 'serving'|'prestop'|'sigterm'|'gone',
 *     failing: bool, note, badge }
 */

const MODES = [
  { id: 'with-prestop', label: 'With preStop', preStop: true,
    caption: 'preStop sleep 15 + terminationGracePeriodSeconds 45' },
  { id: 'no-prestop', label: 'Without preStop', preStop: false,
    caption: 'No preStop hook — SIGTERM fires the moment the pod is deleted' },
];

const W = 560;      // timeline width in user units
const X0 = 70;      // timeline left edge
const SPAN = 50;    // seconds represented across the timeline

const xOf = (t) => X0 + (t / SPAN) * W;

function buildFrames(modeId) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  const f = [];
  const push = (t, router, container, failing, note, badge) =>
    f.push({ t, router, container, failing, note, badge });

  if (mode.preStop) {
    push(0, 'routing', 'serving', false,
      'Pod is deleted — two things start happening at once',
      'The kubelet begins termination and the endpoints controller begins removing this pod from the Service');
    push(1, 'removing', 'prestop', false,
      'preStop runs first — the container has NOT been signalled yet',
      'This is the whole trick: preStop executes before SIGTERM, buying time for endpoint removal to propagate');
    push(6, 'removing', 'prestop', false,
      'Endpoint removal propagating to the router',
      'Still serving in-flight requests normally; the sleep is doing nothing except waiting');
    push(12, 'removed', 'prestop', false,
      'Router has dropped this pod from its backend pool',
      'No new requests are arriving. In-flight ones are still being answered');
    push(15, 'removed', 'sigterm', false,
      'preStop finishes — now SIGTERM is delivered',
      'The application starts its own shutdown with no traffic pointed at it');
    push(22, 'removed', 'sigterm', false,
      'Application drains its remaining in-flight requests',
      'terminationGracePeriodSeconds 45 leaves ample room — the app exits well before the deadline');
    push(28, 'removed', 'gone', false,
      'Container exits cleanly, pod removed',
      'Zero failed requests. Replica count never mattered here — this is purely about ordering');
  } else {
    push(0, 'routing', 'serving', false,
      'Pod is deleted — two things start happening at once',
      'Identical starting point. The difference is what happens in the next second');
    push(1, 'routing', 'sigterm', true,
      'SIGTERM fires immediately — but the router still has this pod',
      'The application begins refusing or dropping connections while traffic is still being sent to it');
    push(4, 'removing', 'sigterm', true,
      'Users are seeing 502s',
      'Replica count is still 6 of 6. Every dashboard says healthy. The failures are real');
    push(9, 'removing', 'gone', true,
      'Container has already exited; endpoint removal is still in flight',
      'This gap is asynchronous and takes seconds — it is the entire failure window');
    push(13, 'removed', 'gone', false,
      'Router finally drops the pod from its pool',
      'Errors stop. The window was roughly ten seconds, per pod, per drain');
    push(20, 'removed', 'gone', false,
      'Steady state restored',
      'Multiply that window by every pod on the node, then by every node in the upgrade');
  }
  return f;
}

function renderSVG(frame) {
  const routerY = 96;
  const contY = 186;
  let out = '';

  // axis
  out += `<line class="track-line" x1="${X0}" y1="${routerY + 22}" x2="${X0 + W}" y2="${routerY + 22}"/>`;
  out += `<line class="track-line" x1="${X0}" y1="${contY + 22}" x2="${X0 + W}" y2="${contY + 22}"/>`;

  out += `<text class="svg-sub on-node" x="${X0}" y="66" text-anchor="start">Router / Service endpoints</text>`;
  out += `<text class="svg-sub on-node" x="${X0}" y="156" text-anchor="start">Container lifecycle</text>`;

  // state bars
  const bar = (y, from, to, cls, label) => {
    const x = xOf(from);
    const w = Math.max(6, xOf(to) - x);
    return `<g class="pod ${cls}"><rect x="${x}" y="${y}" width="${w}" height="44" rx="6"/>`
         + `<text class="svg-sub" x="${x + w / 2}" y="${y + 22}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
  };

  const t = frame.t;
  const routerLabel = { routing: 'routing traffic here', removing: 'removing endpoint…', removed: 'endpoint removed' }[frame.router];
  const routerCls = { routing: 'run', removing: 'term', removed: 'pend' }[frame.router];
  out += bar(routerY, 0, Math.max(t, 3), routerCls, routerLabel);

  const contLabel = { serving: 'serving', prestop: 'preStop sleep', sigterm: 'SIGTERM — shutting down', gone: 'exited' }[frame.container];
  const contCls = { serving: 'run', prestop: 'term', sigterm: 'term', gone: 'pend' }[frame.container];
  out += bar(contY, 0, Math.max(t, 3), contCls, contLabel);

  // playhead
  out += `<line class="marker-line" x1="${xOf(t)}" y1="56" x2="${xOf(t)}" y2="250"/>`;
  out += `<text class="legend-text" x="${xOf(t)}" y="48" text-anchor="middle">t+${t}s</text>`;

  // failure banner
  if (frame.failing) {
    out += '<g class="pod term"><rect x="70" y="266" width="230" height="30" rx="6"/>'
        + '<text class="svg-sub" x="185" y="282" text-anchor="middle" dominant-baseline="central">users are seeing 502s</text></g>';
  }

  out += `<text class="legend-text" x="${X0}" y="326">Both tracks start at the same instant. The overlap between "routing traffic here" and "shutting down" is the failure window.</text>`;
  return out;
}

function metrics(frame) {
  return [
    { label: 'Elapsed', value: `t+${frame.t}s` },
    { label: 'Router', value: frame.router === 'removed' ? 'endpoint removed' : frame.router === 'removing' ? 'removing' : 'sending traffic',
      tone: frame.router === 'routing' && frame.container !== 'serving' ? 'bad' : 'ok' },
    { label: 'Container', value: frame.container },
    { label: 'Requests', value: frame.failing ? 'failing' : 'served', tone: frame.failing ? 'bad' : 'ok' },
  ];
}

const NOTES = {
  'with-prestop': [
    { heading: 'The one-sentence version', text: 'preStop runs before SIGTERM, so the sleep buys time for endpoint removal to propagate before the app is asked to stop.' },
    { heading: 'Sizing it', text: 'terminationGracePeriodSeconds must exceed preStop sleep plus p99 request duration plus a margin, or the kubelet SIGKILLs mid-request.' },
    { ask: 'Do your services have a preStop hook today, or does SIGTERM fire while the router is still sending traffic?' },
  ],
  'no-prestop': [
    { heading: 'Why this surprises people', text: 'Replica count is 6 of 6 the entire time. Every capacity dashboard says healthy while users get 502s.' },
    { heading: 'Second thing to check', text: 'If PID 1 is a shell, the app never receives SIGTERM at all, waits out the full grace period and is then killed. Check with: oc exec POD -- ps -p 1 -o comm=' },
    { ask: 'Have you ever seen unexplained 502s during a node drain and blamed the network?' },
  ],
};

export default {
  id: 'graceful-shutdown',
  title: 'Graceful shutdown: the ordering race',
  summary: 'Why a pod can return errors during termination even at full replica count, and what a preStop hook actually buys you.',
  description: 'A timeline with two tracks: router endpoint state and container lifecycle state, shown with and without a preStop hook.',
  viewBox: '0 0 680 340',
  modes: MODES.map(({ id, label, caption }) => ({ id, label, caption })),
  buildFrames,
  renderSVG,
  metrics,
  speakerNotes: (modeId) => NOTES[modeId],
};
