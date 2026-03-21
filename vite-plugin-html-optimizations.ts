import type { Plugin } from 'vite';

/**
 * Production: make main CSS non-blocking; move the entry module to end of body.
 * Module scripts are deferred by default; body placement reduces parser blocking.
 */
export function htmlOptimizationsPlugin(): Plugin {
  return {
    name: 'prepsuite-html-optimizations',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let out = html.replace(
          /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
          '<link rel="preload" as="style" href="$1" crossorigin onload="this.onload=null;this.rel=\'stylesheet\'">' +
            '<noscript><link rel="stylesheet" crossorigin href="$1"></noscript>'
        );

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
