import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProduction = mode === 'production';

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
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/lichess-export': {
          target: 'https://lichess.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lichess-export/, ''),
        },
        '/chesscom-pgn': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        }
      }
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    build: {
      minify: 'esbuild',
      // Remove console.log statements in production builds
      esbuildOptions: {
        drop: isProduction ? ['console', 'debugger'] : [],
      },
    },
    define: {
      // API keys are now server-side only (via Supabase Edge Functions)
      // No client-side API key exposure - all Gemini calls go through edge functions
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      }
    }
  };
});
