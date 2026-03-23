#!/usr/bin/env bash
# Trigger the nightly-digest Edge Function once (same as pg_cron).
# Usage from repo root:
#   export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
#   export NIGHTLY_DIGEST_CRON_SECRET="your-secret"
#   ./supabase/scripts/run-nightly-digest.sh
#
# Or: source .env.local if those variables are defined there.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

BASE_URL="${SUPABASE_URL:-${VITE_SUPABASE_URL:-}}"
if [[ -z "${BASE_URL}" ]]; then
  echo "Error: Set SUPABASE_URL or VITE_SUPABASE_URL to your project URL." >&2
  exit 1
fi

if [[ -z "${NIGHTLY_DIGEST_CRON_SECRET:-}" ]]; then
  echo "Error: Set NIGHTLY_DIGEST_CRON_SECRET (Edge Function secret, same as cron uses)." >&2
  exit 1
fi

URL="${BASE_URL%/}/functions/v1/nightly-digest"
echo "POST ${URL}"
TMP="$(mktemp)"
CODE="$(curl -sS -o "$TMP" -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer ${NIGHTLY_DIGEST_CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}')"
BODY="$(cat "$TMP")"
rm -f "$TMP"
echo "$BODY"
if [[ "$CODE" != "200" ]]; then
  echo "HTTP $CODE" >&2
  exit 1
fi
