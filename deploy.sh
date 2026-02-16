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

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}"
: "${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY is required}"

gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=prepsuite-ai \
  --substitutions="_VITE_SUPABASE_URL=${VITE_SUPABASE_URL},_VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}"
