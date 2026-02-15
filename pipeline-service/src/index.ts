import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors.js';
import { authMiddleware } from './middleware/auth.js';
import { loggerMiddleware } from './middleware/logger.js';
import { healthRoute } from './routes/health.js';
import { analyzeRoute } from './routes/analyze.js';
import { chatRoute } from './routes/chat.js';
import { logger } from './lib/logger.js';

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

const port = parseInt(process.env.PORT || '8080', 10);

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'Pipeline service started');
});

export default app;
