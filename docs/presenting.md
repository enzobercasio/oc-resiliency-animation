# Presenting

The site is built to be driven live. This is the running order, the deep links to
open on, and what to say over each animation.

Total runtime **46–56 minutes** for all nine, which is the right length for the
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
- [ ] Decide your running order against the sidebar groups. **Core** is the
      first five and stands alone; **Going deeper** is the rest, separated by a
      rule. An **advanced** pill on a mode tab means that mode is dense even for
      its group — currently the required-rule-with-no-room, node-pressure and
      drain-with-a-volume modes.
- [ ] For a beginner audience, press **Beginner** (or `B`) before you start. The
      sidebar drops to the core five and the advanced modes disappear from the
      tab rows, so there is nothing on screen to get asked about mid-session.
      The setting persists, so check its state before a session with a different
      audience. Your prepared deep links still work either way — opening one
      that points into hidden material switches the toggle off for you.
- [ ] Set speed to **slow** if you tend to talk over the animation, **fast** if
      you plan to narrate afterwards.
- [ ] Scroll down once to confirm the manifest and feature outline sit side by
      side beneath the transport. Below about 720px of browser width they stack,
      which only happens on a phone or a very narrow window.
- [ ] Have the deep links below in a scratch file so you are not navigating the
      sidebar while people watch.

If you are screen-sharing rather than projecting, share the browser tab rather
than the whole screen — presentation mode hides the chrome but not your
notifications.

---

## Running order

### 1. Multi-replica pods (4 min)

Open: `#multi-replica/reconcile/0`

Start here even with an experienced platform team. It takes four minutes, it
establishes the vocabulary, and its last frame is the question the rest of the
session answers. Skipping it is the most common way this deck falls flat — the
later animations all assume the reconciliation loop is understood.

Play **The control loop** without much commentary. The beat is the ReplicaSet box:

> "You never told it to start four pods. You told it four is correct, and
> something is now permanently responsible for making that true."

Switch to **Self-healing** (`2`). Let the recovery land as a genuine win before
you start pulling it apart:

> "Actual dropped to three, a replacement came up, back to four. Nobody was
> paged. That is real resiliency and it is not nothing."

Then **Where it stops** (`3`). This is the hinge of the whole session:

> "Same four replicas, all on one node. The second node sat idle the entire
> time — the capacity to survive this was already paid for and simply wasn't
> used. The controller behaved perfectly and the service was still down."

**Ask:** *"If a single node in your cluster disappeared right now, which services
would go to zero rather than degrade?"*

Close on the final frame and read it out: `replicas: 4` answers how many, never
where or how fast they may be taken away. Those are the next two animations.

---

### 2. Pod affinity and anti-affinity (4 min)

Open: `#pod-affinity/colocate/0`

This answers the "where" half of the question multi-replica just ended on,
directly and by name.

Play **Affinity: pull together**. Land the scheduling-check frame:

> "Only one node passes: the one already running the pod cache needs to sit
> beside. Affinity pulls a pod toward a match — the mechanism you are about to
> see run in reverse."

Switch to **Anti-affinity: push apart** (`2`):

> "Same idea, opposite direction. Every replica excludes the node the last one
> landed on. This is the actual fix for 'all four replicas, one node' from the
> previous animation — not a bigger replica count, a placement rule."

**Ask:** *"Is this rule on any of your multi-replica deployments today, or did
they just get lucky with placement?"*

If the audience is past the core set, switch to **When required has no room**
(`3`, marked advanced):

> "Scale to four replicas, still three nodes. required does not mean 'try to
> spread' — it means 'never co-locate,' and when nothing satisfies that, the
> pod sits Pending. Not retried elsewhere. Waiting."

---

### 3. Voluntary vs involuntary disruption (4 min)

Open: `#disruption-types/voluntary/0`

This picks up the "how fast can they be taken away" half of the question the
previous animation ended on.

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

### 4. Rolling upgrade, four configurations (8 min)

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

Then flip back to the involuntary case of the previous animation (`J`, then `2`) for ten seconds
to make the connection explicit. That callback is the strongest moment in the
session.

**d. Spread + PDB** — `#upgrade-resiliency/d-full/0`

Play it end to end without commentary, then:

> "Same cluster, same upgrade, same image. About twelve lines of YAML."

---

### 5. Graceful shutdown (4 min)

Open: `#graceful-shutdown/no-prestop/0`

This closes the core set. Everything so far has been about how many replicas and
where; this is the one that is about a single request.

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

### 6. Requests and limits (5 min)

Open: `#requests-limits/qos-classes/0`

Worth running for any team that has copied a `resources` block from another
manifest and never revisited it, which is most of them.

Play **QoS classes**. The framing to open with:

> "Nobody sets a quality-of-service field. It's derived from two numbers — your
> requests and your limits — and it decides who gets killed first when a node
> runs short."

Point at the dashed area above `worker`: headroom it is *allowed* to use and not
*guaranteed* to get.

Switch to **Node under pressure** (`2`). This mode is marked advanced; it is the
one that belongs in a resiliency session:

> "Everything else today has been voluntary disruption — something chose to move
> a pod and a budget got a say. This is the kubelet killing pods directly. No
> eviction API, no PDB, no warning. BestEffort first, then Burstable furthest
> above its request."

Then **Fitting on a drain** (`3`), which is the one that changes behaviour:

> "cache goes Pending not because the node is out of memory, but because it is
> out of *unreserved* memory. Different numbers, and the scheduler only reads
> one. The drain stalls, the pool stops, and the root cause is a resource
> request several layers from where anyone will start looking."

**Ask:** *"When did anyone last review the requests on your largest workloads
against real usage?"* If they mention a VerticalPodAutoscaler in recommend-only
mode, they are further ahead than most.

---

### 7. MachineConfigPools (5 min)

Open: `#machine-config-pools/serial/0`

Everything so far has been workload-level. This zooms out to the control that
sets the shape of the upgrade those workloads have to survive.

Play **maxUnavailable: 1**. The arithmetic is the point:

> "Drain, reboot, rejoin is ten to fifteen minutes per node. Six nodes is a
> morning. Fifty nodes is why your last upgrade ran past its change window."

Switch to **maxUnavailable: 2** (`2`). Point at worker capacity dropping to 67%:

> "Half the cycles, and now a third of the cluster is gone at once. Every
> workload needs to survive losing two nodes, not one. Raising this without
> checking your budgets just stalls the pool twice as often."

Then **Custom pools** (`3`):

> "A pool is defined by a node label, so you choose *which* nodes are exposed to
> the new version, not just how many at a time. And `paused: true` is a real
> validation gate inside the upgrade — not a promise to watch dashboards."

**Ask:** *"Do you have a way to validate a new version on a small set of nodes
before the rest of the cluster follows?"* In regulated accounts this is usually
the most commercially interesting five minutes of the session.

---

### 8. Rolling update strategy (4 min)

Open: `#rollout-strategy/surge/0`

This one corrects a specific and expensive misconception, so do not skip it with
an experienced team — they are the ones most likely to hold it.

Play **maxSurge: 1**. Point at total pods hitting 5 while serving stays at 4.

> "A new pod is created and passes readiness *before* any old one is removed.
> Capacity never dips — and you needed one extra pod's worth of room to do it."

Switch to **maxUnavailable: 1** (`2`):

> "Same rollout, opposite trade. Total never exceeds four, and you ran at three
> of four throughout. Right choice on a packed cluster, wrong one by accident."

Then **The 25% default** (`3`) and land the correction:

> "This is what you get if you write no strategy block. And note what is *not*
> involved: a PodDisruptionBudget does not constrain a rollout. The deployment
> controller deletes its own pods — it never calls the eviction API."

**Ask:** *"Has anyone on your team assumed the PDB was protecting deployments as
well as drains?"* Hands usually go up.

---

### 9. StatefulSets (6 min)

Open: `#statefulsets/identity/0`

Everything up to this point has treated pods as interchangeable. Open by saying
so — this animation exists because that assumption breaks.

Play **Stable identity**. The beat is the replacement pod:

> "It came back as db-1. Not a new random name — the same member, the same DNS
> record, the same volume, the same data. Every other animation we've run today
> treated pods as cattle. The rest of this cluster knows this one by name."

Switch to **Ordered rollout** (`2`):

> "Highest ordinal first, one at a time, each gated on Ready. There is no
> maxSurge here to tune. And OrderedReady means a member that never goes Ready
> stops the rollout dead — correct for a database, deeply confusing the first
> time you meet it."

Then **Drain with a volume** (`3`), which is the one that changes plans:

> "Watch the pod sit in 'starting' while the volume is still detaching.
> ReadWriteOnce means exactly one node may mount it, and detach-then-attach is a
> control-plane operation measured in tens of seconds. A stateless pod would be
> serving by now."

Close on the final frame — the zone constraint:

> "And that only worked because both nodes were in the same zone. A zone-pinned
> block volume cannot attach to a node elsewhere. Spread constraints on a
> StatefulSet are bounded by where the storage is allowed to follow."

**Ask:** *"Are your stateful PDBs sized for quorum, or copied from a stateless
workload?"* `minAvailable: 2` of 3 keeps a database writable; the stateless
instinct of "one at a time is fine" can lose the cluster instead of degrading it.

---

## Using the config column

Beneath the transport sit two panels side by side: the manifest for whichever
mode is active, and the outline of the features in play. Two ways to use them:

**Point at it when someone asks "how do I actually do that".** Switching modes
swaps the manifest, so the difference between Scenario B and Scenario D is
visible as a diff rather than described. That is usually the moment a platform
engineer takes a photo of the screen.

**Let the highlighting do the work.** As frames advance, the lines the current
step is about light up — the PDB during an eviction, the spread constraint when a
replacement is placed. You do not need to narrate it; people follow it on their
own and it keeps the YAML from being wallpaper.

The **Copy** button puts the manifest on the clipboard, which is the fastest
possible follow-up: paste it into the chat or the ticket while the conversation
is still live. It needs a secure context, so it works on HTTPS and on
`localhost` but not over plain HTTP to a remote host — the button says "Select
it" instead when the API is unavailable.

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

**The core five (24 min)** — run animations 1 to 5 and stop. They are grouped
under **Core** in the sidebar for exactly this reason, and they are a complete
session on their own.

Add from **Going deeper** by audience rather than by time available: requests
and limits for anyone who has ever had a pod stuck Pending, MachineConfigPools
for a platform team that owns the cluster, rolling update strategy and
StatefulSets for application teams. The drain-with-a-volume mode of
StatefulSets is marked advanced even within that group — it is the densest thing
here and is safe to skip unless someone asks why stateful recovery is slow.

**5 minutes** — `#multi-replica/the-limit/0` played once, then
`#upgrade-resiliency/d-full/0`. The first shows the problem, the second the fix.

**10 minutes** — add `#disruption-types/voluntary/0` in between, both modes.

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
