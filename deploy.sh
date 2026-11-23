#!/usr/bin/env bash
set -euo pipefail

# Run on the VPS from a clean, committed checkout. This script never resets Git.
# Initial booking cutover: ./deploy.sh --migrate-booking
# Run cutover only after backing up/reviewing legacy records and stopping any
# writers outside this Compose service. Unresolved records abort activation.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_dir"
migrate_booking=false
case "${1:-}" in
  '') ;;
  --migrate-booking) migrate_booking=true ;;
  *) echo 'Usage: ./deploy.sh [--migrate-booking]' >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo 'Usage: ./deploy.sh [--migrate-booking]' >&2
  exit 2
fi

docker compose version >/dev/null
[[ -f backend/.env ]] || { echo 'Missing backend/.env on the server.' >&2; exit 1; }
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Deploy requires a clean checkout. Commit or preserve local changes first.' >&2
  exit 1
fi
branch="${DEPLOY_BRANCH:-main}"
if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "Check out $branch before deploying (or explicitly set DEPLOY_BRANCH)." >&2
  exit 1
fi
git pull --ff-only origin "$branch"
compose=(docker compose --env-file backend/.env -f docker-compose.yml)
# Quiet validation avoids printing resolved secrets.
"${compose[@]}" config --quiet
docker network inspect medconnect-shared >/dev/null 2>&1 || docker network create medconnect-shared >/dev/null
"${compose[@]}" build --pull medconnect-api
"${compose[@]}" run --rm --no-deps -T medconnect-api node -e \
  "require('./dist/components/booking/booking.config.js').validateWaitlistFlags(); if (process.env.NODE_ENV !== 'production') process.exit(1);"

if [[ "$migrate_booking" == true ]]; then
  "${compose[@]}" stop medconnect-api
  "${compose[@]}" run --rm --no-deps -T -e BOOKING_POLICY_V2_ENABLED=false medconnect-api \
    node dist/tools/booking-migration.js --dry-run
  "${compose[@]}" run --rm --no-deps -T -e BOOKING_POLICY_V2_ENABLED=false medconnect-api \
    node dist/tools/booking-migration.js --apply --writers-stopped
fi

# Read-only marker/ledger audit. Never bypass the migration gate or start an
# enabled API that would immediately fail its own startup checks.
if ! "${compose[@]}" run --rm --no-deps -T medconnect-api node dist/tools/booking-status.js; then
  echo 'Booking readiness failed. Review migration status before activation.' >&2
  echo 'For the initial cutover, back up/review records and use ./deploy.sh --migrate-booking.' >&2
  exit 1
fi
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 120 medconnect-api
echo 'Production API is healthy; booking readiness audit passed.'
