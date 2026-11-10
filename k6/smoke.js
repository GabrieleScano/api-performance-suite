import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, byTarget } from './lib/target.js';

/**
 * Smoke test: minimal load to confirm the system works under a
 * single user before running heavier scenarios.
 */
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    // Container in CI: provisional, recalibrate from the trend history.
    http_req_duration: [byTarget({ local: 'p(95)<100', remote: 'p(95)<800' })],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/booking`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response is JSON array': (r) => Array.isArray(r.json()),
  });
  sleep(1);
}
