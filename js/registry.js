/**
 * Animation registry.
 *
 * The order here is the order in the sidebar and the order J/K cycles through,
 * so it is also the running order when presenting. Adding an animation means
 * adding a file under js/animations/ and two lines here - nothing else.
 *
 * Running order: multi-replica establishes the reconciliation loop and ends on
 * the two questions a replica count cannot answer; pod-affinity answers the
 * "where" half directly - the podAntiAffinity that would have fixed
 * multi-replica's own ending, run in reverse as podAffinity, plus the
 * required-rule-with-nowhere-to-go gotcha; topology-spread is the same
 * hard-vs-soft question asked again one mechanism over - a looser, more
 * scalable spread than anti-affinity, with the identical DoNotSchedule vs
 * ScheduleAnyway tradeoff; pod-disruption-budget covers the budget mechanism
 * in isolation - an absolute floor vs a percentage ceiling, and a replacement
 * that never becomes Ready - so disruption-types can assume it and spend its
 * whole runtime on voluntary vs involuntary instead of re-deriving what a PDB
 * is; disruption-types answers "how fast can they be taken away";
 * upgrade-resiliency puts placement and drain rate together; probes then
 * shifts from "how many replicas survive" to "what does this one pod's own
 * state even mean" - readiness gating traffic, liveness triggering a
 * restart, and startupProbe separating a slow boot from a crash loop -
 * which graceful-shutdown assumes when it narrows to the one probe that
 * matters during termination; machine-config-pools zooms out to the
 * cluster-level control that sets the shape of the whole upgrade;
 * rollout-strategy covers the separate case of a Deployment replacing its
 * own pods; graceful-shutdown is the coda about in-flight requests, which is
 * orthogonal to all of it.
 */
import multiReplica from './animations/multi-replica.js';
import podAffinity from './animations/pod-affinity.js';
import topologySpread from './animations/topology-spread.js';
import podDisruptionBudget from './animations/pod-disruption-budget.js';
import disruptionTypes from './animations/disruption-types.js';
import upgradeResiliency from './animations/upgrade-resiliency.js';
import probes from './animations/probes.js';
import machineConfigPools from './animations/machine-config-pools.js';
import rolloutStrategy from './animations/rollout-strategy.js';
import statefulSets from './animations/statefulsets.js';
import requestsLimits from './animations/requests-limits.js';
import gracefulShutdown from './animations/graceful-shutdown.js';

export const animations = [
  // Core - the path a beginner should take, in order.
  multiReplica,
  podAffinity,
  topologySpread,
  podDisruptionBudget,
  disruptionTypes,
  upgradeResiliency,
  probes,
  gracefulShutdown,
  // Going deeper - marked advanced, grouped separately in the sidebar.
  requestsLimits,
  machineConfigPools,
  rolloutStrategy,
  statefulSets,
];
