/**
 * Shared target selection for the K6 scripts.
 *
 * CI points BASE_URL at the restful-booker Docker container (localhost:3001);
 * without it the scripts hit the public sandbox on Heroku.
 *
 * Latency differs by orders of magnitude between the two (≈2 ms vs ≈300 ms
 * p95), so latency thresholds are chosen per environment. A single set would
 * either never fire in CI or fail on every remote run.
 */
export const BASE_URL = __ENV.BASE_URL || 'https://restful-booker.herokuapp.com';

export const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);

/** Pick the threshold for the current environment. */
export const byTarget = ({ local, remote }) => (IS_LOCAL ? local : remote);
