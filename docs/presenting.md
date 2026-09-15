# Presenting

The site is built to be driven live. This is the running order, the deep links to
open on, and what to say over each animation.

Total runtime **69–80 minutes** for all fourteen, which is the right length
for the concept half of a session before you move to the live cluster demo.

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
      first eight and stands alone; **Going deeper** is the rest, separated by a
      rule. An **advanced** pill on a mode tab means that mode is dense even for
      its group — currently the required-rule-with-no-room,
      ScheduleAnyway-proceeds, when-it-never-recovers,
      preemption-bypasses-the-eviction-API,
      ClusterResourceOverride-rewrites-it, node-pressure and
      drain-with-a-volume modes.
- [ ] For a beginner audience, press **Beginner** (or `B`) before you start. The
      sidebar drops to the core eight and the advanced modes disappear from the
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

### 3. Topology spread constraints (4 min)

Open: `#topology-spread/even/0`

Same hard-versus-soft question as the last animation, one mechanism over — say
so explicitly, it is the connective tissue of this whole middle stretch.

Play **Even spread**. Land the closing frame:

> "Anti-affinity guaranteed at most one pod per node. This guarantees at most a
> one-replica gap between zones — looser, and it scales to any replica count
> without the pairwise comparisons anti-affinity needs."

Switch to **DoNotSchedule blocks** (`2`):

> "Zone c is cordoned, not failed — its two replicas keep running. Scale twice
> and the third scale-up has no legal zone left at all. Every option pushes the
> gap to two, and the constraint says no."

Point at the **Skew** metric hitting the limit, then blocking the next scale-up
entirely.

**Ask:** *"If a zone in your cluster went into maintenance right now, would you
notice a stuck scale-up before someone paged you about it?"*

If the audience is past the core set, switch to **ScheduleAnyway proceeds**
(`3`, marked advanced):

> "Same scenario, soft version. It schedules anyway, and skew quietly grows
> past the number in your YAML. The constraint you wrote is now a preference,
> not a promise — know which one you meant to write."

---

### 4. Pod disruption budgets (5 min)

Open: `#pod-disruption-budget/min-available/0`

The last two animations were about where a pod lands. This one is about the
budget on evicting it once it has — the mechanism the next animation assumes
you already understand.

Play **minAvailable: an absolute floor**. Land the scale-down frame:

> "Nobody touched the PodDisruptionBudget. The Deployment just scaled from six
> replicas to five, and disruptionsAllowed went from one to zero — permanently,
> at this replica count, not for a moment."

Switch to **minAvailable = replicas: deadlock** (`2`):

> "This one doesn't need a scale-down or anything to go wrong first. Four
> replicas, minAvailable: 4 — disruptionsAllowed is zero from the moment this
> budget exists. Drain a node holding one of these pods and the eviction is
> refused before anything moves. Not a slow retry that eventually succeeds —
> it cannot succeed, ever, while all four stay healthy."

**Ask:** *"Grep your PodDisruptionBudgets for minAvailable equal to the
Deployment's replica count — how many turn up?"*

Switch to **maxUnavailable: a scaling ceiling** (`3`):

> "Same idea, written as a percentage instead. Scale up to ten and
> disruptionsAllowed recalculates itself to two. Nobody edited this manifest —
> a percentage is the version that survives the next scaling event."

**Ask:** *"Do any of your budgets use an absolute minAvailable on a Deployment
that also has an HPA attached?"*

If the audience is past the core set, switch to **When it never recovers**
(`4`, marked advanced):

> "Watch the replacement pod — it's Running, it's just never Ready.
> disruptionsAllowed does not know the difference between 'recovering' and
> 'never going to recover.' It stays at zero forever, and every retry after
> this one is refused for the same reason. The fix isn't in the PDB at all."

---

### 5. Voluntary vs involuntary disruption (4 min)

Open: `#disruption-types/voluntary/0`

This picks up the "how fast can they be taken away" half of the question
multi-replica ended on — the two placement animations just answered "where,"
and the budget animation just covered how the arithmetic works. This is where
it gets used, and where its limits show up.

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

### 6. Rolling upgrade, four configurations (8 min)

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

### 7. Startup, readiness, and liveness probes (5 min)

Open: `#probes/readiness/0`

Everything so far has been about how many replicas survive. This is the pivot
to what a single pod's own state even means — the last piece before graceful
shutdown, which assumes it.

Play **Readiness gates traffic**. Land the removed-from-endpoints frame:

> "The pod never stops running. It just stops receiving traffic. That is
> readiness doing exactly its job, not a problem being reported."

Switch to **Liveness triggers a restart** (`2`):

> "Same three probes, same shape — but watch what happens this time. The
> container gets killed and replaced. Liveness is the only one of the three
> that can do that."

**Ask:** *"Does your livenessProbe check anything a downstream dependency
could make fail — and is that actually what you want restarting?"*

Switch to **A slow starter without startupProbe** (`3`):

> "This app needs ninety seconds. The liveness probe gives it thirty before
> killing it — and the countdown resets every time. This is CrashLoopBackOff
> with a perfectly healthy application inside it."

Then **startupProbe buys it time** (`4`) and land the fix:

> "One block of YAML. Readiness and liveness simply do not run until startup
> succeeds once. Same app, same livenessProbe, zero crash loops."

---

### 8. Graceful shutdown (4 min)

Open: `#graceful-shutdown/no-prestop/0`

This closes the core set. Everything so far has been about how many replicas
survive, where they land, and what state one of them is in; this is the one
that is about a single request.

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

### 9. Requests and limits (5 min)

Open: `#requests-limits/qos-classes/0`

This opens **Going deeper**. Worth running for any team that has copied a
`resources` block from another manifest and never revisited it, which is most
of them.

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

### 10. PriorityClass and preemption (5 min)

Open: `#priority-preemption/stuck/0`

The direct sequel to the animation you just ran: that one ends with a pod
going Pending and PriorityClass named as the fix nobody showed. Here it is.

Play **Pending, regardless of priority**. Land the closing frame:

> "critical-job and everything already running are, to the scheduler,
> completely indistinguishable. Priority is not urgency — it's a number, and
> by default every pod has the same one."

Switch to **A higher priority preempts to make room** (`2`):

> "Same node, one line added: priorityClassName. The scheduler picks the
> smallest set of lower-priority pods it can remove — not just the lowest
> priority on the cluster — and deletes one to make room."

**Ask:** *"If two teams' workloads both claimed 'business critical' priority,
whose actually wins?"*

If the audience already sat through pod disruption budgets, switch to
**Preemption bypasses the eviction API** (`3`, marked advanced):

> "batch-job carries the exact deadlock-shaped budget from four animations
> ago — minAvailable equal to its own replica count. It does not matter here.
> Preemption deletes the pod directly. It never calls the eviction API, so
> the PDB is never even consulted."

---

### 11. HPA, VPA, and ClusterResourceOverride (6 min)

Open: `#autoscaling/hpa/0`

Two controllers that automate exactly the numbers requests-limits told the
room to set deliberately, plus an admission webhook that can override both.

Play **HPA: how many**. Land the closing frame:

> "Replica count changed. Every pod kept the exact same request and limit
> throughout. HPA has no opinion at all about what one pod is allowed to use."

Switch to **VPA: how much** (`2`):

> "The mirror image — and watch the middle frame. VPA cannot change a live
> pod's resources, so Auto mode evicts it and recreates it with the new
> numbers. That eviction goes through the normal API, so a PDB can delay it
> here, unlike the preemption you just saw."

**Ask:** *"Have you run VPA in recommend-only mode on your biggest workload,
just to see how wrong the current requests actually are?"*

Switch to **Both, on the same metric** (`3`):

> "Kubernetes' own docs say never to do this, and it still happens. VPA's
> resize lowers the percentage HPA is reading — not because load dropped, but
> because the denominator just got bigger — so HPA scales in at exactly the
> wrong moment."

If the audience is past the core set, switch to
**ClusterResourceOverride rewrites it** (`4`, marked advanced):

> "Declared: limits 1Gi. Applied: limits 2Gi. Nobody touched the Deployment —
> an admission webhook doubled it before the pod was ever scheduled, and the
> QoS class changed from Guaranteed to Burstable along with it."

**Ask:** *"Is ClusterResourceOverride enabled anywhere in your fleet — and
does anyone know which teams' QoS classes it has quietly changed?"*

---

### 12. MachineConfigPools (5 min)

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

### 13. Rolling update strategy (4 min)

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

### 14. StatefulSets (6 min)

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

**The core eight (38 min)** — run animations 1 to 8 and stop. They are grouped
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
