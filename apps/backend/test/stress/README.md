# Stress tests

`run.sh` seeds a fresh sale, fires a k6 burst of purchase attempts at the API, then
`verify.ts` waits for the queues to drain and checks the guarantees in Postgres:
no oversell, one item per user, every accepted request processed, nothing dead-lettered.

```bash
pnpm build
pnpm --filter @flash-sale-demo/backend start:api      # separate terminals
pnpm --filter @flash-sale-demo/backend start:worker
pnpm stress                                  # 1000 attempts/s for 30s, 1000 units
RATE=2500 DURATION=30s STOCK=1000 pnpm stress
RATE=500 DURATION=15s STOCK=50000 RETRY_RATIO=0 pnpm stress   # every request reaches the worker
```

k6 runs from the `grafana/k6` Docker image, so it does not need to be installed.
Each run is saved under `results/<timestamp>/` (git-ignored).

## Baseline: 1 API instance + 1 worker (2026-11-24)

Laptop, WSL2, 16 cores / 8 GB, everything (k6 included) on one machine.
API and worker run from `dist` with `NODE_ENV=production LOG_LEVEL=warn`.

| Scenario | Achieved | Purchase latency (p50 / p95 / p99) | Accepted → decided (p50 / p95) | Guarantees |
|---|---|---|---|---|
| 1,000 units, 1,000 attempts/s × 30s | 924 req/s | 3 / 97 / 803 ms | 2.7 / 6.3 s | ✓ all |
| 1,000 units, 2,500 attempts/s × 30s | 943 req/s (saturated, 3% errors) | 181 / 323 ms / 23 s | 3.6 / 7.6 s | ✓ all |
| 50,000 units, 500 attempts/s × 15s (all accepted) | 435 req/s | 119 / 334 / 2,690 ms | 33 / 61 s | ✓ all |

Findings:

- **Correctness held in every run**, including overload: exactly `stock` orders, one per
  buyer, every 202 processed once, no dead letters, Redis counter back at 0.
- **API ceiling ≈ 1,000–1,300 req/s per Node process.** CPU-bound on one core; the profile
  is spread across Fastify, Nest, validation, ioredis and socket writes (no single hotspot).
  Scaling means more instances.
- **Worker ≈ 105 purchases/s, limited by the hot stock row.** 15–17 of 18 active Postgres
  sessions wait on the `flash_sales` row lock; the holder is idle in `ClientRead`, i.e.
  waiting for the worker's next statement (`UPDATE purchase_requests`, then `COMMIT`).
  Lock time per purchase is network round trips, not database work.
- **202 path ≈ 435 req/s**: each accepted request sends one SQS message; ElasticMQ runs at
  ~130% CPU. With the Redis stock counter only ~`stock` requests take this path.

## After shortening the stock-row lock (2026-11-24)

The worker now takes the stock row last and commits right after, so the lock
is held for one `UPDATE` plus the `COMMIT` instead of three round trips.

| Scenario | Achieved | Purchase latency (p50 / p95 / p99) | Accepted → decided (p50 / p95) | Guarantees |
|---|---|---|---|---|
| 1,000 units, 1,000 attempts/s × 30s (2 runs) | 928 req/s, 0 dropped | 2 / 20–25 / 148–170 ms | 1.2 / 3.2–3.4 s | ✓ all |
| 50,000 units, 500 attempts/s × 15s (all accepted) | 418 req/s | 270 / 895 ms / 14 s | 19 / 34 s | ✓ all |

- **Worker: ≈ 105 → ≈ 162 purchases/s (1.55×).** A 1,000-unit sale is fully decided ~3.4 s
  after the last accept instead of ~6.7 s. The lock holder now mostly waits on `COMMIT`
  (`IO:WalSync`), which is the floor for one-row-at-a-time stock without buckets.
- The 202 path stays bound by ElasticMQ (~130% CPU); this run's API latency on that path was
  worse because the faster worker also loads ElasticMQ harder with results.

## Full stack: nginx + 2 API instances + 2 workers (2026-11-24)

`pnpm stack:up`, then `BASE_URL=http://localhost:8080 pnpm stress`. Everything runs in Docker
on the same laptop (nginx ≈ 1 core and k6 ≈ 1.5 cores of it). Workers: 2 pollers each.

| Scenario | Achieved | Purchase latency (p50 / p95 / p99) | Accepted → decided (p50 / p95) | Guarantees |
|---|---|---|---|---|
| 1,000 units, 2,000 attempts/s × 30s | 1,855 req/s, 0 errors | 3 / 154 / 256 ms | 1.8 / 3.9 s | ✓ all |
| 50,000 units, 500 attempts/s × 15s (all accepted) | 436 req/s (= offered) | 36 / 72 / 119 ms | 13 / 25 s | ✓ all |
| 1,000 units, 2,500 attempts/s × 30s | overloaded: ~50% 502 | — | — | ✓ all |

- **API scales with instances: ~1,000 req/s (1 instance) → ~1,900 req/s (2 instances)**, with
  nginx splitting traffic evenly (checked via `$upstream_addr` in the access log).
- **Worker: ≈ 162 → ≈ 194 purchases/s with 2 workers.** More workers help a little but the
  single stock row is the limit, as expected; stock buckets are the next step.
- **Above capacity the API cascades.** At 2,500/s, a saturated instance is slow to accept
  connections, nginx marks it down, the other takes double load and goes down too. Even then
  no guarantee broke (exactly 1,000 sold, one per buyer). Fixed by load shedding, below.
- **Failover:** with `api-1` stopped, 20/20 requests succeeded; only the first paid a 1s
  connect timeout before nginx routed around it.

## Load shedding (2026-11-25)

nginx now enforces one global budget for the API (`limit_req`, 1,500 req/s with a burst of
500) and answers the excess with an immediate `429` and `Retry-After`. Both values are
settings (`API_RATE_LIMIT`, `API_RATE_BURST` on the `web` service), because capacity
depends on the deployment; `API_RATE_LIMIT=100000 pnpm stack:up` turns shedding off to
measure raw capacity. Upstream instances are
never marked down for being slow (`max_fails=0`). Same scenario that cascaded above:
1,000 units, 2,500 attempts/s × 30s.

| | Without shedding | With shedding (2 runs) |
|---|---|---|
| Errors (`502` / `504`) | ~40,000 (58–62%) | **0** |
| Shed as `429` | — | ~29,000, answered in milliseconds |
| Throughput | ~1,900–2,100 req/s | ~2,250–2,280 req/s |
| Latency p50 / p95 / p99 | 56 ms / 1–3.4 s / 4–6 s | 3 ms / 160–320 ms / 0.5–2.1 s |
| Guarantees | ✓ all | ✓ all |

How we got there, because the first attempt was not enough:

1. **Budget = measured capacity (2,000 req/s): still ~58% `502`.** At 2,500/s the k6 load
   generator uses more of the shared CPU, so the real capacity was lower; a shedding limit
   needs headroom, not the breaking point. → 1,500 req/s.
2. **Budget 1,500 req/s: still 20% `502`.** The nginx error log showed the chain: a few
   connects to busy instances took > 2s, nginx disabled both instances, and every request
   then failed with `no live upstreams`. With shedding protecting the instances, marking
   them dead only amplifies overload. → `max_fails=0`.
3. **Failover re-checked:** with `api-1` stopped, 16/16 requests succeeded; two paid the 2s
   connect timeout before the retry on `api-2`, and after ~4s DNS re-resolve had dropped
   the stopped instance.
