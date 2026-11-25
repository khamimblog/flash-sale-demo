#!/usr/bin/env sh
# Runs Docker Compose v2 (`docker compose`) when available, else v1 (`docker-compose`),
# so the pnpm stack:* and infra:* scripts work with either.
if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
else
  exec docker-compose "$@"
fi
