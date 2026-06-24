# API & Performance Test Suite

Functional **API tests** (Playwright request fixture) and **load tests** (K6) against [restful-booker](https://restful-booker.herokuapp.com/apidoc/index.html), a public REST API built for test practice.

[![API & Performance](https://github.com/GabrieleScano/api-performance-suite/actions/workflows/api-perf.yml/badge.svg)](https://github.com/GabrieleScano/api-performance-suite/actions/workflows/api-perf.yml)

## Why this project

It covers two QA disciplines that complement UI automation:

- **API testing** — validating contracts, status codes and behaviour directly at the service layer, where tests are faster and more stable than through the UI.
- **Performance testing** — observing how response times and error rates hold up under sustained and peak load.

## What's covered

**API (Playwright)**
- Full CRUD lifecycle: create → read → update → delete a booking.
- Token-based authentication for write operations.
- Contract checks (health, listing shape).
- Negative cases: 404 for missing resources, 403 without a valid token.

**Performance (K6)**
- `smoke.js` — single-user sanity check with latency and error thresholds.
- `load.js` — staged ramp-up → steady state → peak → ramp-down, with custom metrics and pass/fail thresholds.

## Running the API tests

```bash
npm ci
npx playwright install   # no browsers needed for API, but keeps tooling consistent
npm run test:api
npm run report           # open the HTML report
```

## Running the performance tests

Requires [K6](https://grafana.com/docs/k6/latest/set-up/install-k6/):

```bash
npm run perf:smoke   # quick check
npm run perf:load    # staged load test
```

Thresholds (the test fails if breached):

| Metric | Smoke | Load |
|--------|-------|------|
| Error rate | < 1% | < 5% |
| p95 latency | < 800 ms | < 1500 ms |

## Project structure

```
tests/api/   # Playwright API specs + typed helpers
k6/          # smoke and load scripts
.github/     # CI: API tests + K6 smoke on every push
```

## Notes

`restful-booker` is a shared public sandbox; under heavy concurrency some latency is expected, which makes it a realistic target for demonstrating threshold-based performance gates.

## License

MIT
