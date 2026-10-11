import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { publicPagesPlugin } from './build/publicPages.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';
  const pipelineTarget = env.PIPELINE_PROXY_TARGET || 'http://localhost:8080';

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: {
        // Stabilize HMR to prevent constant page reloads
        overlay: true,
      },
      watch: {
        // Ignore terminal files and other non-source files
        ignored: ['**/terminals/**', '**/node_modules/**', '**/.git/**']
      },
      proxy: {
        '/api': {
          target: pipelineTarget,
          changeOrigin: true,
          proxyTimeout: 300000, // 5 min — avoid socket hang up on long pipeline requests (FIDE, analyze)
        },
        '/lichess-export': {
          target: 'https://lichess.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lichess-export/, ''),
        },
        '/chesscom-pgn': {
          target: pipelineTarget,
          changeOrigin: true,
        }
      }
    },
    plugins: [
      publicPagesPlugin(),
      {
        name: 'local-rating-history',
        // Exercise the current public rating route locally even when authenticated APIs
        // use the remote pipeline. Production serves the same handler from Hono.
        configureServer(server) {
          server.middlewares.use('/fide-rating-history', async (req, res, next) => {
            if (req.method !== 'GET') return next();
            try {
              const {fideRatingHistoryRoute} = await server.ssrLoadModule('/pipeline-service/src/routes/fideRatingHistory.ts');
              const response = await fideRatingHistoryRoute.fetch(new Request(`http://localhost/fide-rating-history${req.url}`));
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(await response.text());
            } catch { res.statusCode = 503; res.end(JSON.stringify({history: [], error: 'Rating history unavailable'})); }
          });
        },
      },
      react(),
      tailwindcss(),
    ],
    build: {
      minify: true,
      /** Helps Lighthouse "Best Practices" and error tracking; maps are separate .map files. */
      sourcemap: isProduction,
      rolldownOptions: {output: {minify: {compress: {dropConsole: isProduction, dropDebugger: isProduction}}}},
    },
    define: {
      // API keys are now server-side only (via Supabase Edge Functions)
      // No client-side API key exposure - all Gemini calls go through edge functions
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      }
    }
  };
});
