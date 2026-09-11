# Presenting

The site is built to be driven live. This is the running order, the deep links to
open on, and what to say over each animation.

Total runtime **12–18 minutes** for all three, which is the right length for the
concept half of a session before you move to the live cluster demo.

---

## Before the room

- [ ] Open the site and press `T` until the theme matches the room. Dark for a
      projector in a dark room, light for a screen share — check which.
- [ ] Press `F` for presentation mode. Confirm the note text is readable from the
      back row; if not, zoom the browser to 125% and check again.
- [ ] Press `N` and read the notes for the modes you plan to use. They do not
      render in presentation mode on a single screen — read them beforehand or
      run a second window on your laptop display.
- [ ] Set speed to **slow** if you tend to talk over the animation, **fast** if
      you plan to narrate afterwards.
- [ ] Have the deep links below in a scratch file so you are not navigating the
      sidebar while people watch.

If you are screen-sharing rather than projecting, share the browser tab rather
than the whole screen — presentation mode hides the chrome but not your
notifications.

---

## Running order

### 1. Voluntary vs involuntary disruption (4 min)

Open: `#disruption-types/voluntary/0`

Start here, not with the big animation. It sets up the distinction everything
else depends on, and it is short enough that nobody's attention has drifted by
the time you reach the punchline.

Play through the voluntary case. The beat to land is frame 4 — the HTTP 429:

> "A drain never deletes pods. It calls the eviction API, and the API server asks
> the disruption budget for permission. When the answer is no, the drain doesn't
> fail — it retries. That retry loop is what makes an upgrade slow and safe."

Then switch to **Node failure** (`2`) and play it.

> "Same workload. Same budget. Nobody called the eviction API, so there was
> nothing to consult. The PDB isn't weaker here — it's simply not on this code
> path."

**Ask:** *"Which of your workloads would be at zero if a single node disappeared
right now?"* Let the silence sit.

---

### 2. Rolling upgrade, four configurations (8 min)

Open: `#upgrade-resiliency/a-none/0`

Deliberately start on the worst case. Press `1`–`4` to move between scenarios;
the tab order is Spread+PDB, Spread only, PDB only, Neither, so you are stepping
*backwards* through the tabs as you improve the configuration. Alternatively open
each scenario by deep link in the order below.

**a. Neither** — `#upgrade-resiliency/a-none/0`

> "Six replicas. The deployment reported six healthy pods right up to the moment
> the drain started. Multi-replica told us how many pods, not where they were or
> how fast they could be taken away."

Point at **Worst so far** hitting 0 of 6. Note it happens twice — the workload
ping-pongs between nodes as the upgrade rolls.

**b. Spread only** — `#upgrade-resiliency/b-spread-only/0`

> "No outage — that's a real improvement. But look at the ready count: a third of
> capacity gone in one step, for the length of a cold start, three times."

**Ask:** *"Could you absorb losing a third of this service for ninety seconds at
Friday peak?"*

**c. PDB only** — `#upgrade-resiliency/c-pdb-only/0`

This one runs 35 frames because every eviction is serialised. **Step through it
rather than playing it** — the length is the point, and watching it in real time
is tedious. Jump to the end with `End`.

> "Best-looking availability graph of the three, and the most dangerous. Never
> below 5 of 6 — and every replica in one failure domain the whole time."

Then flip back to animation 1's involuntary case (`J`, then `2`) for ten seconds
to make the connection explicit. That callback is the strongest moment in the
session.

**d. Spread + PDB** — `#upgrade-resiliency/d-full/0`

Play it end to end without commentary, then:

> "Same cluster, same upgrade, same image. About twelve lines of YAML."

---

### 3. Graceful shutdown (4 min)

Open: `#graceful-shutdown/no-prestop/0`

> "This one has nothing to do with replica counts. We're at six of six the entire
> time and users are still getting 502s."

Play through. Land frame 3:

> "The container has already exited. The router still has it in the pool. That
> gap is asynchronous, it takes seconds, and it's the entire failure window —
> per pod, per drain, per node."

Switch to **With preStop** (`1`).

> "preStop runs *before* SIGTERM. The sleep does nothing except wait for endpoint
> removal to propagate. By the time the app is asked to stop, no traffic is
> pointed at it."

**Ask:** *"Have you ever seen unexplained 502s during a node drain and blamed the
network?"* Someone in the room always has.

---

## Handing over to the live demo

The animations build the model; the companion repo proves it isn't a cartoon.
The transition that works:

> "That's the theory. It takes about four minutes to show you the same thing
> against a real cluster with a real HTTP probe running — shall we?"

Then run `ocp-workload-resiliency-demo` scenarios A and D. You do not need all
four live; the animation already covered the middle ground.

---

## Short versions

**5 minutes** — `#disruption-types/voluntary/0`, both modes, then
`#upgrade-resiliency/d-full/0` played once. That is enough to make the point.

**90 seconds, no narration** — `#upgrade-resiliency/a-none/0` on fast, then
`#upgrade-resiliency/d-full/0` on fast. Works as a booth loop or a Slack link.

---

## Embedding

The site is a plain page and iframes cleanly:

```html
<iframe src="https://your-host/ocp-resiliency-showcase/#upgrade-resiliency/d-full/0"
        width="100%" height="720" style="border:0"
        title="OpenShift rolling upgrade with spread constraint and PDB"></iframe>
```

Presentation mode works inside an iframe because it is a CSS class flip rather
than the Fullscreen API, which is blocked in most embedding contexts.

For a slide deck that cannot iframe, screenshot the frame you want — every frame
is reachable by deep link, so the screenshots stay reproducible.
