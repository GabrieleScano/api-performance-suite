import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Smoke test: minimal load to confirm the system works under a
 * single user before running heavier scenarios.
 */
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% errors
    http_req_duration: ['p(95)<800'], // 95% under 800ms
  },
};

const BASE_URL = 'https://restful-booker.herokuapp.com';

export default function () {
  const res = http.get(`${BASE_URL}/booking`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response is JSON array': (r) => Array.isArray(r.json()),
  });
  sleep(1);
}
