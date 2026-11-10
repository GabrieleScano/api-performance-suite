# API & Performance Test Suite

Functional **API tests** and **contract tests** (Playwright + OpenAPI + ajv) and **load tests** (K6) against [restful-booker](https://github.com/mwinteringham/restful-booker), an open-source REST API built for test practice. Every CI run is recorded, and the K6 trend is published to GitHub Pages.

[![API & Performance](https://github.com/GabrieleScano/api-performance-suite/actions/workflows/api-perf.yml/badge.svg)](https://github.com/GabrieleScano/api-performance-suite/actions/workflows/api-perf.yml)
[![Contract: OpenAPI 3.1](https://img.shields.io/badge/contract-OpenAPI%203.1-6BA539?logo=openapiinitiative&logoColor=white)](openapi.yaml)
[![Load p95](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgabrielescano.github.io%2Fapi-performance-suite%2Ftrends%2Flatest.json&query=%24.load.p95&label=load%20p95&color=2a78d6)](https://gabrielescano.github.io/api-performance-suite/trends/)
[![Load error rate](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgabrielescano.github.io%2Fapi-performance-suite%2Ftrends%2Flatest.json&query=%24.load.errorRate&label=load%20errors&color=2a78d6)](https://gabrielescano.github.io/api-performance-suite/trends/)
[![K6 trends](https://img.shields.io/badge/K6-trends-7D64FF?logo=k6&logoColor=white)](https://gabrielescano.github.io/api-performance-suite/trends/)
[![Test report](https://img.shields.io/badge/Playwright-report-2EAD33?logo=playwright&logoColor=white)](https://gabrielescano.github.io/api-performance-suite/)

**Live pages:** [Playwright report](https://gabrielescano.github.io/api-performance-suite/) · [K6 performance trends](https://gabrielescano.github.io/api-performance-suite/trends/)

## Why this project

It covers three QA disciplines that complement UI automation:

- **API testing**: checks status codes and behaviour directly at the service layer, where tests are faster and more stable than through the UI.
- **Contract testing**: every response is validated against an OpenAPI document, and a dedicated suite proves the contract catches breaking changes.
- **Performance testing**: watches response times, error rates and throughput under load, with thresholds as CI gates and a history to spot regressions.

## Test target: restful-booker in Docker

CI does **not** hit the public Heroku sandbox. Each job starts the project's official image, [`mwinteringham/restfulbooker`](https://hub.docker.com/r/mwinteringham/restfulbooker), as a **service container** on `localhost:3001`:

- **Pinned by digest**, so every run tests the same build.
- **Health-checked before the run**, first by Docker (`--health-cmd`) and then by `scripts/wait-for-api.sh`, which polls `GET /ping`.
- **Clean, seeded in-memory data on every run.** The public sandbox is shared, gets reset periodically and keeps growing (over 1,300 bookings at last check), which made results drift and K6 numbers impossible to compare between runs.

All tests read `BASE_URL`. Locally it defaults to the public sandbox, so nothing needs installing:

```bash
npm run test                                     # against https://restful-booker.herokuapp.com
npm run api:up                                   # or: start the same pinned container (needs Docker)
BASE_URL=http://localhost:3001 npm run test
npm run api:down
```

## Contract: `openapi.yaml`

> **restful-booker does not publish an official OpenAPI document.** [`openapi.yaml`](openapi.yaml) is an **unofficial contract written for this suite**. It is derived from the [official apidoc](https://restful-booker.herokuapp.com/apidoc/index.html) and then corrected against the service's observed behaviour.

Where the apidoc and the service disagree, the contract follows the service and flags the difference with `x-apidoc-discrepancy`:

| Item | apidoc | Service (and contract) |
|---|---|---|
| `GET /ping`, `DELETE /booking/{id}` | 200 OK | **201 Created** |
| `totalprice` | Number | **integer** (decimals are truncated) |
| `additionalneeds` | always returned | **optional** |
| Invalid `POST /booking` body | n/a | **500** (no 400) |

How it is enforced:

- **`tests/contract.ts`** loads the YAML and validates with **ajv** (JSON Schema 2020-12, strict mode, `ajv-formats` for `date`). `expectContract(response, operationId)` checks three things: the status code is documented for that operation, the content type is documented, and the body matches the schema. This replaces the earlier hand-written validators in `helpers.ts`.
- **`tests/api/booking.spec.ts`** calls `expectContract` on every live response, including 403/404 responses.
- **`tests/contract/breaking-changes.spec.ts`** proves the contract has teeth. It runs offline (no network) with mutated payloads: a field removed or renamed, a type changed, a date reformatted, an object flattened, the id wrapper dropped, a UUID id, bare-id lists, an empty token, a changed status code, a changed content type. Each one must be rejected. Additive fields are tolerated (tolerant reader). A coverage check fails if an operation in the contract has no live test.
- **`npm run lint:contract`** validates the document itself with Redocly (config in `redocly.yaml`).

## What's covered

**API (Playwright, `tests/api`)**
- Full CRUD lifecycle: create → read → update → delete, then a 404 check after the delete.
- Partial update (PATCH) that verifies untouched fields are preserved.
- Token auth: a token for valid credentials, `Bad credentials` for invalid ones.
- Filtering bookings by name; the booking just created must be in the results.
- Negative cases: 404 for missing resources, 403 for writes without a valid token.

**Contract (`tests/contract`)**: see above.

**Performance (K6, `k6/`)**
- `smoke.js`: single-user sanity check.
- `load.js`: ramp-up → steady state → peak → ramp-down, with a custom `create_booking_duration` trend.
- `spike.js`: an abrupt traffic burst and the recovery (run manually, not in CI).

Thresholds (the run fails if one is breached; **they gate CI**):

| Metric | Smoke | Load | Spike |
|--------|-------|------|-------|
| Error rate | < 1% | < 5% | < 10% |
| p95 latency | < 800 ms | < 1500 ms | < 2500 ms |

## K6 history and trend page

Each CI run exports a K6 summary JSON per script (`--summary-export`). On `main` (push, the daily schedule or a manual run), the `publish` job does the following:

1. `scripts/record-k6-run.mjs` condenses the summaries into one record (p95, error rate, throughput, threshold results, run/commit links). It appends the record to `k6/history.json` on the **`data` branch**, which keeps the last 200 runs. Failed runs are recorded too.
2. It publishes GitHub Pages: the Playwright report at the root and the trend page at **[`/trends/`](https://gabrielescano.github.io/api-performance-suite/trends/)**. The trend page shows p95, error rate and throughput over the last N runs (10 / 30 / 100, or `?n=` in the URL), with threshold lines, failed runs marked, and a data table.

`latest.json` sits next to the history and powers the dynamic badges above. The trend page is informational only: **the K6 thresholds remain the CI gate.**

The numbers measure restful-booker in a container on a GitHub-hosted runner. They are meant to catch regressions between runs, not to describe production capacity.

To run and record locally:

```bash
npm run perf:smoke && npm run perf:load   # needs K6; writes results/*.json
npm run perf:record                       # appends to results/history/history.json
```

## Project structure

```
openapi.yaml            # unofficial restful-booker contract (see above)
redocly.yaml            # contract lint rules
tests/contract.ts       # ajv-based validator: expectContract / validateResponse
tests/api/              # live API specs + payload types
tests/contract/         # offline breaking-change suite
k6/                     # smoke, load and spike scripts
scripts/                # health check, K6 history recorder
site/trends/            # static trend page (published to Pages)
.github/workflows/      # CI: tests + K6 against the container, history, Pages
```

## About the target API

[restful-booker](https://github.com/mwinteringham/restful-booker) is a third-party open-source project; this repository only tests it, and the OpenAPI document here is unofficial.

## License

MIT
