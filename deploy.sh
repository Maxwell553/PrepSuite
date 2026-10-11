#!/usr/bin/env bash
set -euo pipefail

# Deploy PrepSuite to Cloud Run (us-central1, 4 vCPU / 4 GiB)
# Serves both the Vite frontend and the Node.js pipeline API.
#
# Prerequisites:
#   - gcloud auth login
#   - Secrets created: supabase-jwt-secret, supabase-url
#   - Vertex AI API enabled on the project
#
# Required env vars (or pass via --substitutions):
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#
# Load from .env.local if present (exported vars take precedence)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env.local" ]]; then
  set -a
  source "${SCRIPT_DIR}/.env.local"
  set +a
fi

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY is required}"

if [[ "${JOBS_ENABLED:-false}" == "true" && "${MIN_INSTANCES:-0}" -lt 1 ]]; then
  echo "Background jobs require MIN_INSTANCES >= 1 and applied database migrations." >&2
  exit 1
fi
npm run check
npm run build

gcloud builds submit "${SCRIPT_DIR}" \
  --config=cloudbuild.yaml \
  --project="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}" \
  --substitutions="_SERVICE_NAME=${CLOUD_RUN_SERVICE:-prepsuite},_JOBS_ENABLED=${JOBS_ENABLED:-false},_MIN_INSTANCES=${MIN_INSTANCES:-0},_VITE_SUPABASE_URL=${VITE_SUPABASE_URL},_VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}"
