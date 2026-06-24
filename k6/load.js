import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

/**
 * Load test: ramps virtual users up and down to observe how response
 * times and error rates behave under sustained, realistic traffic.
 */
const createDuration = new Trend('create_booking_duration', true);

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // ramp-up
    { duration: '1m', target: 10 }, // steady state
    { duration: '30s', target: 25 }, // peak
    { duration: '30s', target: 0 }, // ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // <5% errors under load
    http_req_duration: ['p(95)<1500'],
    create_booking_duration: ['p(95)<2000'],
  },
};

const BASE_URL = 'https://restful-booker.herokuapp.com';

const payload = JSON.stringify({
  firstname: 'Load',
  lastname: 'Test',
  totalprice: 150,
  depositpaid: true,
  bookingdates: { checkin: '2026-07-28', checkout: '2026-08-04' },
  additionalneeds: 'Breakfast',
});

const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

export default function () {
  group('read bookings', () => {
    const res = http.get(`${BASE_URL}/booking`);
    check(res, { 'list status 200': (r) => r.status === 200 });
  });

  group('create booking', () => {
    const res = http.post(`${BASE_URL}/booking`, payload, { headers });
    createDuration.add(res.timings.duration);
    check(res, {
      'create status 200': (r) => r.status === 200,
      'returns booking id': (r) => r.json('bookingid') !== undefined,
    });
  });

  sleep(1);
}
