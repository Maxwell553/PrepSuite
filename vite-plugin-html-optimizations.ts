import type { Plugin } from 'vite';

/**
 * Legacy plugin, retained for external consumers. Keep stylesheets render-blocking
 * to prevent an unstyled first paint. Vite already defers module scripts.
 */
export function htmlOptimizationsPlugin(): Plugin {
  return {
    name: 'prepsuite-html-optimizations',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html;

        const scriptRe = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
        const m = out.match(scriptRe);
        if (m) {
          const src = m[1];
          out = out.replace(m[0], '');
          out = out.replace('</body>', `  <script type="module" crossorigin src="${src}"></script>\n</body>`);
        }
        return out;
      },
    },
  };
}
