import { config } from 'dotenv';
import dns from 'node:dns';

// Prefer IPv4 for outbound fetches (avoids "fetch failed" in dev when IPv6 is flaky)
dns.setDefaultResultOrder('ipv4first');

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
import { supportChatRoute } from './routes/supportChat.js';
import { practiceMoveRoute } from './routes/practiceMove.js';
import { fideRatingHistoryRoute } from './routes/fideRatingHistory.js';
import { logger } from './lib/logger.js';
import fs from 'node:fs';
import path from 'node:path';

const app = new Hono();

// Global middleware
app.use('*', loggerMiddleware);
app.use('*', corsMiddleware);

// Public routes
app.route('/health', healthRoute);
app.route('/', fideRatingHistoryRoute); // /fide-rating-history/:fideId — public (FIDE data from ChessTools)

// Protected routes
app.use('/api/*', authMiddleware);
app.route('/api', analyzeRoute);
app.route('/api', chatRoute);
app.route('/api', supportChatRoute);
app.route('/api', practiceMoveRoute);
app.route('/api', fideRatingHistoryRoute);

// ── Lichess PGN export proxy (requires auth to prevent abuse) ──
// Production has no Vite proxy; frontend fetches /lichess-export/game/export/{id}
app.use('/lichess-export/*', authMiddleware);
app.all('/lichess-export/*', async (c) => {
  const lichessPath = c.req.path.replace(/^\/lichess-export/, '');
  const url = `https://lichess.org${lichessPath}`;
  try {
    const res = await fetch(url, {
      method: c.req.method,
      headers: { Accept: 'application/x-chess-pgn' },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/x-chess-pgn' },
    });
  } catch (err) {
    logger.warn({ err, url }, '[Lichess] Proxy fetch failed');
    return c.text('PGN fetch failed', 502);
  }
});

// ── Chess.com PGN refetch (requires auth to prevent abuse) ──
// Fetches from player archive by game uuid and playedAt month
app.use('/chesscom-pgn/*', authMiddleware);
app.get('/chesscom-pgn/export/:username/:gameId', async (c) => {
  const username = c.req.param('username');
  const gameId = c.req.param('gameId');
  const playedAt = c.req.query('playedAt');
  if (!username || !gameId) {
    return c.json({ error: 'username and gameId required' }, 400);
  }
  try {
    const date = playedAt ? new Date(playedAt) : new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const archiveUrl = `https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/${yyyy}/${mm}`;
    const res = await fetch(archiveUrl, {
      headers: { 'User-Agent': 'PrepSuite-Pipeline/1.0' },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, archiveUrl }, '[ChessCom] Archive fetch failed');
      return c.text('PGN not found', 404);
    }
    const data = (await res.json()) as { games?: { uuid?: string; pgn?: string }[] };
    const games = data.games || [];
    const match = games.find((g) => g.uuid === gameId);
    if (!match?.pgn) {
      return c.text('PGN not found', 404);
    }
    return c.text(match.pgn, 200, {
      'Content-Type': 'application/x-chess-pgn',
    });
  } catch (err) {
    logger.warn({ err, username, gameId }, '[ChessCom] PGN refetch failed');
    return c.text('PGN fetch failed', 502);
  }
});

// ── Static frontend serving ──────────────────────────────────────────
// Serve the Vite build output (../dist relative to pipeline-service/)
const frontendDir = path.resolve(import.meta.dirname, '../../dist');

if (fs.existsSync(frontendDir)) {
  logger.info({ frontendDir }, 'Serving frontend static files');

  // Serve static assets (JS, CSS, images, etc.)
  app.use(
    '/*',
    serveStatic({
      root: frontendDir,
      onFound: (_filePath, c) => {
        const p = c.req.path;
        if (p.startsWith('/assets/')) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }
        if (/\.(png|jpe?g|gif|webp|ico|svg|woff2?)$/i.test(p)) {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // SPA fallback: any non-API, non-file request gets index.html
  app.get('*', async (c) => {
    const indexPath = path.join(frontendDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf-8');
    return c.html(html, 200, { 'Cache-Control': 'no-cache' });
  });
} else {
  logger.warn({ frontendDir }, 'Frontend dist/ not found — run "npm run build" in project root');
}

const port = parseInt(process.env.PORT || '8080', 10);

// Pre-warm Vertex AI access token so the first analyze request doesn't incur ~10s token fetch.
// The identity phase uses Gemini for username discovery; without pre-warm, that call blocks on token acquisition.
void (async () => {
  try {
    const { getAccessToken } = await import('./lib/vertexAuth.js');
    const start = Date.now();
    await getAccessToken();
    logger.info({ durationMs: Date.now() - start }, '[Startup] Vertex AI token pre-warmed');
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[Startup] Vertex token pre-warm failed (will retry on first request)');
  }
})();

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port }, 'Pipeline service started');
});

export default app;
