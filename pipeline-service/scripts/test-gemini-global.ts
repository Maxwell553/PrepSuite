#!/usr/bin/env npx tsx
/**
 * Quick test that Vertex AI Gemini works.
 * Run from pipeline-service/: npx tsx scripts/test-gemini-global.ts
 *
 * Requires: gcloud auth application-default login
 *           VERTEX_PROJECT_ID in .env.local (or env)
 */
import { config } from 'dotenv';
config();
config({ path: '.env.local' });

import { getAccessToken, getVertexUrl } from '../src/lib/vertexAuth.js';

async function main() {
  const model = 'gemini-2.5-flash';
  const url = getVertexUrl(model);

  console.log('Testing Gemini 2.5 Flash:');
  console.log('  URL:', url);
  console.log('');

  const token = await getAccessToken();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Hello! Reply with exactly: OK' }] }],
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    console.error('❌ Failed:', res.status, body);
    process.exit(1);
  }

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text)';
  console.log('✅ Success! Response:', text.trim());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
