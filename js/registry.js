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
 * required-rule-with-nowhere-to-go gotcha; disruption-types answers "how fast
 * can they be taken away"; upgrade-resiliency puts placement and drain rate
 * together; machine-config-pools zooms out to the cluster-level control that
 * sets the shape of the whole upgrade; rollout-strategy covers the separate
 * case of a Deployment replacing its own pods; graceful-shutdown is the coda
 * about in-flight requests, which is orthogonal to all of it.
 */
import multiReplica from './animations/multi-replica.js';
import podAffinity from './animations/pod-affinity.js';
import disruptionTypes from './animations/disruption-types.js';
import upgradeResiliency from './animations/upgrade-resiliency.js';
import machineConfigPools from './animations/machine-config-pools.js';
import rolloutStrategy from './animations/rollout-strategy.js';
import statefulSets from './animations/statefulsets.js';
import requestsLimits from './animations/requests-limits.js';
import gracefulShutdown from './animations/graceful-shutdown.js';

export const animations = [
  // Core - the path a beginner should take, in order.
  multiReplica,
  podAffinity,
  disruptionTypes,
  upgradeResiliency,
  gracefulShutdown,
  // Going deeper - marked advanced, grouped separately in the sidebar.
  requestsLimits,
  machineConfigPools,
  rolloutStrategy,
  statefulSets,
];
