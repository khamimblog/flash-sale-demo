#!/usr/bin/env bash
# Stress test: fresh sale → k6 burst → verify guarantees in Postgres.
#
# Start the API and worker first (pnpm build, then pnpm start:api / start:worker).
#   pnpm stress                                  # 1000 attempts/s for 30s, 1000 units
#   RATE=3000 DURATION=60s STOCK=5000 pnpm stress
set -euo pipefail

cd "$(dirname "$0")"
K6_IMAGE=grafana/k6:1.4.2
STOCK=${STOCK:-1000}
RESULTS_DIR=results/$(date +%Y%m%d-%H%M%S)
mkdir -p "$RESULTS_DIR"

echo "==> Seeding a fresh sale with $STOCK units"
pnpm --dir ../.. -s db:seed --reset --stock "$STOCK" --duration 15m
sleep 2 # let the API's 1s sale cache pick up the new sale

echo "==> Running k6 (rate=${RATE:-1000}/s, duration=${DURATION:-30s})"
k6_status=0
docker run --rm --network host --user "$(id -u):$(id -g)" \
  -v "$PWD:/stress" -w /stress \
  -e BASE_URL -e RATE -e DURATION -e RETRY_RATIO \
  "$K6_IMAGE" run --quiet --summary-export "$RESULTS_DIR/k6-summary.json" purchase-burst.js 2>&1 \
  | tee "$RESULTS_DIR/k6-output.txt" || k6_status=$?

echo "==> Verifying"
pnpm --dir ../.. -s stress:verify "test/stress/$RESULTS_DIR/k6-summary.json" \
  | tee "$RESULTS_DIR/verify.txt"

echo "Results saved in apps/backend/test/stress/$RESULTS_DIR"
exit "$k6_status"
