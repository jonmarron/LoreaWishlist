#!/usr/bin/env bash
# Starts a throwaway Postgres, runs the row-level security tests against the
# real supabase/schema.sql, and tears the container down either way.
set -euo pipefail

NAME=wishlist-pgtest
IMAGE=postgres:16

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running — start Docker Desktop and try again." >&2
  exit 1
fi

docker run -d --name "$NAME" \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=wishlist_test \
  -p 55433:5432 \
  "$IMAGE" >/dev/null

printf 'waiting for postgres'
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then
    echo
    # Deliberately not `exec`: that would replace this shell and the EXIT trap
    # would never run, leaving the container behind.
    node test/policies.test.mjs
    exit $?
  fi
  printf '.'
  sleep 1
done

echo
echo "postgres did not become ready in time" >&2
exit 1
