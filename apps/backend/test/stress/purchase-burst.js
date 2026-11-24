/**
 * Flash sale burst: many users click "Buy now" for the current sale at once.
 *
 * Each attempt is a new user, except RETRY_RATIO of them, which repeat an earlier
 * user's click (impatient double-clicks) to exercise the one-per-user dedupe.
 * 200 (existing request), 202 (queued) and 409 (sold out) are all expected answers, and so is
 * 429: nginx shedding load above the API's capacity.
 *
 * Env: BASE_URL, RATE (attempts/s at peak), DURATION (time at peak), RETRY_RATIO
 */
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const RATE = Number(__ENV.RATE || 1000);
const DURATION = __ENV.DURATION || '30s';
const RETRY_RATIO = Number(__ENV.RETRY_RATIO || 0.1);

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 3000,
      stages: [
        { target: RATE, duration: '5s' },
        { target: RATE, duration: DURATION },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'], // 5xx and timeouts
    'http_req_duration{name:purchase}': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

http.setResponseCallback(http.expectedStatuses(200, 202, 409, 429));

const accepted = new Counter('purchase_accepted'); // 202
const existing = new Counter('purchase_existing'); // 200
const soldOut = new Counter('purchase_sold_out'); // 409
const shed = new Counter('purchase_shed'); // 429
const unexpected = new Counter('purchase_unexpected'); // anything else

export function setup() {
  const res = http.get(`${BASE_URL}/api/flash-sales/current`);
  if (res.status !== 200) throw new Error(`No current sale (HTTP ${res.status}). Seed one first.`);
  return { saleId: res.json('id') };
}

function pickUserId() {
  const iteration = exec.scenario.iterationInTest;
  const isRetry = iteration > 0 && Math.random() < RETRY_RATIO;
  const user = isRetry ? Math.floor(Math.random() * iteration) : iteration;
  return `user-${user}`;
}

export default function ({ saleId }) {
  const res = http.post(
    `${BASE_URL}/api/flash-sales/${saleId}/purchase-requests`,
    JSON.stringify({ userId: pickUserId() }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'purchase' } },
  );

  if (res.status === 202) accepted.add(1);
  else if (res.status === 200) existing.add(1);
  else if (res.status === 409) soldOut.add(1);
  else if (res.status === 429) shed.add(1);
  else unexpected.add(1);

  check(res, { 'expected status': (r) => [200, 202, 409, 429].includes(r.status) });
}
