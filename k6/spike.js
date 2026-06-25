import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Spike test: a sudden surge of virtual users to see how the API copes
 * with an abrupt traffic burst (and recovers afterwards), as opposed to
 * the gradual ramp in load.js.
 */
export const options = {
  stages: [
    { duration: '10s', target: 5 }, // warm-up
    { duration: '20s', target: 60 }, // sudden spike
    { duration: '10s', target: 5 }, // recovery
    { duration: '10s', target: 0 }, // ramp-down
  ],
  thresholds: {
    // Under a spike we tolerate more errors/latency, but still bound them.
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<2500'],
  },
};

const BASE_URL = 'https://restful-booker.herokuapp.com';

export default function () {
  const res = http.get(`${BASE_URL}/booking`);
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
