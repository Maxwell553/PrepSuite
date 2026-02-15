#!/usr/bin/env bash
set -euo pipefail

gcloud run deploy prepsuite-pipeline \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "SUPABASE_JWT_SECRET=supabase-jwt-secret:latest,GEMINI_API_KEY=gemini-api-key:latest,SUPABASE_URL=supabase-url:latest" \
  --memory 4Gi \
  --cpu 4 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 5
