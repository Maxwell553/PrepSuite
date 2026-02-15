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
 *   VERTEX_LOCATION    – GCP region (default: us-central1)
 */

import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.js';

const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

let cachedToken: { token: string; expiresAt: number } | null = null;

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
 */
export function getVertexUrl(model: string): string {
    const projectId = process.env.VERTEX_PROJECT_ID;
    const location = process.env.VERTEX_LOCATION || 'us-central1';

    if (!projectId) {
        throw new Error('VERTEX_PROJECT_ID environment variable is required');
    }

    return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;
}
