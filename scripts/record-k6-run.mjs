#!/usr/bin/env node
/**
 * Turn K6 `--summary-export` files into one history record and append it.
 *
 *   node scripts/record-k6-run.mjs --results results --history data/k6 [--keep 200]
 *
 * Reads   <results>/<test>.json   (one per K6 script: smoke.json, load.json, ...)
 * Writes  <history>/history.json  { schema, updated, runs: [...] }  (oldest → newest, capped)
 *         <history>/latest.json   flat values for shields.io dynamic badges
 *
 * Run metadata comes from the GitHub Actions environment when present.
 * Exits 0 without writing if there are no summaries (e.g. the perf job never ran).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const resultsDir = args.results ?? 'results';
const historyDir = args.history ?? 'data/k6';
const keep = Number(args.keep ?? 200);

const round = (n, d = 2) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(d)) : null);

/**
 * In --summary-export, each threshold maps to `true` when it was CROSSED
 * (i.e. failed) and `false` when it held.
 */
function summarise(summary) {
  const m = summary.metrics ?? {};
  const thresholds = [];
  for (const [metric, values] of Object.entries(m)) {
    for (const [expr, crossed] of Object.entries(values.thresholds ?? {})) {
      thresholds.push({ metric, expr, ok: crossed === false });
    }
  }
  return {
    p95: round(m.http_req_duration?.['p(95)']),
    avg: round(m.http_req_duration?.avg),
    errorRate: round(m.http_req_failed?.value, 5),
    rps: round(m.http_reqs?.rate, 3),
    requests: m.http_reqs?.count ?? null,
    thresholdsOk: thresholds.every((t) => t.ok),
    thresholds,
  };
}

const files = existsSync(resultsDir) ? readdirSync(resultsDir).filter((f) => f.endsWith('.json')) : [];
if (files.length === 0) {
  console.log(`No K6 summaries in "${resultsDir}" — nothing to record.`);
  process.exit(0);
}

const tests = {};
for (const f of files.sort()) {
  tests[basename(f, '.json')] = summarise(JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));
}

const env = process.env;
const record = {
  runId: env.GITHUB_RUN_ID ? Number(env.GITHUB_RUN_ID) : null,
  runNumber: env.GITHUB_RUN_NUMBER ? Number(env.GITHUB_RUN_NUMBER) : null,
  runUrl: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null,
  sha: env.GITHUB_SHA?.slice(0, 7) ?? null,
  event: env.GITHUB_EVENT_NAME ?? 'local',
  date: new Date().toISOString(),
  target: env.BASE_URL ?? null,
  tests,
};

mkdirSync(historyDir, { recursive: true });
const historyFile = join(historyDir, 'history.json');
const history = existsSync(historyFile)
  ? JSON.parse(readFileSync(historyFile, 'utf8'))
  : { schema: 1, runs: [] };

// Re-runs of the same workflow run replace their earlier record.
history.runs = history.runs.filter((r) => record.runId === null || r.runId !== record.runId);
history.runs.push(record);
history.runs = history.runs.slice(-keep);
history.updated = record.date;
writeFileSync(historyFile, `${JSON.stringify(history, null, 2)}\n`);

const latest = { date: record.date, sha: record.sha };
for (const [name, t] of Object.entries(tests)) {
  latest[name] = {
    p95: t.p95 === null ? 'n/a' : `${Math.round(t.p95)} ms`,
    errorRate: t.errorRate === null ? 'n/a' : `${(t.errorRate * 100).toFixed(2)}%`,
    rps: t.rps === null ? 'n/a' : `${t.rps.toFixed(1)}/s`,
    status: t.thresholdsOk ? 'passing' : 'failing',
  };
}
writeFileSync(join(historyDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);

console.log(`Recorded run ${record.runId ?? '(local)'} with ${files.length} test(s); history has ${history.runs.length} run(s).`);
for (const [name, t] of Object.entries(tests)) {
  console.log(`  ${name}: p95=${t.p95}ms errors=${t.errorRate} rps=${t.rps} thresholds=${t.thresholdsOk ? 'ok' : 'FAILED'}`);
}
