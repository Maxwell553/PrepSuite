/**
 * Vertex AI authentication helper.
 * Uses Google Application Default Credentials (ADC) to generate
 * short-lived OAuth2 access tokens for Vertex AI REST calls.
 *
 * Local dev:  `gcloud auth application-default login`
 * Production: attach a service account with Vertex AI User role.
 *
 * Environment variables:
 *   VERTEX_PROJECT_ID  – GCP project ID (required)
 *   VERTEX_LOCATION    – GCP region (default: us-central1). Gemini 3 models, including
 *                        gemini-3.8-flash, auto-use the global endpoint.
 */

import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.js';

const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Invalidate the cached token. Call this when Vertex AI returns 401 so the next
 * request fetches a fresh token. Fixes intermittent 401s from stale/revoked tokens.
 */
export function invalidateAccessTokenCache(): void {
  cachedToken = null;
  logger.info('[VertexAuth] Token cache invalidated (will refresh on next request)');
}

/**
 * Get a valid OAuth2 access token, caching to avoid repeated auth calls.
 * Tokens are refreshed 60s before expiry.
 */
export async function getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    if (!token) {
        throw new Error('Failed to obtain Vertex AI access token. Check your GCP credentials.');
    }

    // Cache for 55 minutes (tokens last 60 minutes)
    cachedToken = {
        token,
        expiresAt: Date.now() + 55 * 60 * 1000,
    };

    logger.info('[VertexAuth] Access token obtained');
    return token;
}

/**
 * Build the Vertex AI generateContent URL for a given model.
 *
 * Gemini 3 models (gemini-3.8-flash, gemini-3.1-pro-preview, and other gemini-3*)
 * are only available on the global endpoint. Older models use the regional endpoint.
 */
export function getVertexUrl(model: string): string {
    const projectId = process.env.VERTEX_PROJECT_ID;
    const configuredLocation = process.env.VERTEX_LOCATION || 'us-central1';

    if (!projectId) {
        throw new Error('VERTEX_PROJECT_ID environment variable is required');
    }

    // Gemini 3 models are published on global (and us/eu), not us-central1.
    const useGlobal = configuredLocation === 'global' || /^gemini-3(\.\d+)?-/.test(model);
    const location = useGlobal ? 'global' : configuredLocation;
    const host =
        location === 'global'
            ? 'aiplatform.googleapis.com'
            : `${location}-aiplatform.googleapis.com`;

    return `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}
