import { config } from 'dotenv';
config(); // load .env
config({ path: '.env.local' }); // override with .env.local if present
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { authMiddleware } from './middleware/auth.js';
import { loggerMiddleware } from './middleware/logger.js';
import { healthRoute } from './routes/health.js';
import { analyzeRoute } from './routes/analyze.js';
import { chatRoute } from './routes/chat.js';
import { logger } from './lib/logger.js';
import fs from 'node:fs';
import path from 'node:path';

const app = new Hono();

// Global middleware
app.use('*', loggerMiddleware);
app.use('*', corsMiddleware);

// Public routes
app.route('/health', healthRoute);

// Protected routes
app.use('/api/*', authMiddleware);
app.route('/api', analyzeRoute);
app.route('/api', chatRoute);

// ── Static frontend serving ──────────────────────────────────────────
// Serve the Vite build output (../dist relative to pipeline-service/)
const frontendDir = path.resolve(import.meta.dirname, '../../dist');

if (fs.existsSync(frontendDir)) {
  logger.info({ frontendDir }, 'Serving frontend static files');

  // Serve static assets (JS, CSS, images, etc.)
  app.use('/*', serveStatic({ root: frontendDir }));

  // SPA fallback: any non-API, non-file request gets index.html
  app.get('*', async (c) => {
    const indexPath = path.join(frontendDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');
    return c.html(html);
  });
} else {
  logger.warn({ frontendDir }, 'Frontend dist/ not found — run "npm run build" in project root');
}

const port = parseInt(process.env.PORT || '8080', 10);

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'Pipeline service started');
});

export default app;
