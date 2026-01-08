import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/fide-proxy': {
          target: 'https://ratings.fide.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fide-proxy/, ''),
        },
        '/uscf-proxy': {
          target: 'https://www.uschess.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/uscf-proxy/, ''),
        },
        '/chess-api': {
          target: 'https://api.chess.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/chess-api/, ''),
        },
        '/lichess-api': {
          target: 'https://lichess.org/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lichess-api/, ''),
        }
      }
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
