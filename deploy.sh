#!/usr/bin/env bash
set -euo pipefail

# Deploy PrepSuite to Cloud Run (us-central1, 4 vCPU / 4 GiB)
# Serves both the Vite frontend and the Node.js pipeline API.
#
# Prerequisites:
#   - gcloud auth login
#   - Secrets created: supabase-jwt-secret, supabase-url
#   - Vertex AI API enabled on the project

gcloud run deploy prepsuite \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,VERTEX_PROJECT_ID=prepsuite-ai,VERTEX_LOCATION=us-central1" \
  --set-secrets "SUPABASE_JWT_SECRET=supabase-jwt-secret:latest,SUPABASE_URL=supabase-url:latest" \
  --memory 4Gi \
  --cpu 4 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 5 \
  --project prepsuite-ai
