/**
 * Animation registry.
 *
 * The order here is the order in the sidebar and the order J/K cycles through,
 * so it is also the running order when presenting. Adding an animation means
 * adding a file under js/animations/ and two lines here - nothing else.
 */
import upgradeResiliency from './animations/upgrade-resiliency.js';
import disruptionTypes from './animations/disruption-types.js';
import gracefulShutdown from './animations/graceful-shutdown.js';

export const animations = [
  upgradeResiliency,
  disruptionTypes,
  gracefulShutdown,
];
