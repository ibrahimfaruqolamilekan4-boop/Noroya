import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Build-time runtime config + performance plugins.
 *
 * `runtimeSupabaseConfig` emits /config/supabase.js as a STATIC build asset.
 * Previously index.html loaded it from the Vercel serverless function on every
 * page view, which meant every visitor paid a function cold start (often
 * 500ms-2s) in a render-blocking <script> before the page could paint. The
 * static file is served from the CDN instantly; the runtime route remains as
 * a fallback via the vercel.json rewrite.
 */
function runtimeSupabaseConfig(): Plugin {
  let supabaseOrigin = '';
  return {
    name: 'norodata-runtime-supabase-config',
    apply: 'build',
    configResolved() {
      const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
      if (url) {
        try {
          supabaseOrigin = new URL(url).origin;
        } catch {
          /* malformed URL -- skip preconnect */
        }
      }
    },
    generateBundle(_options, bundle) {
      const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
      const key = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
      // Same shape the Express /config/supabase.js route produces at runtime.
      const source = [
        '// Generated at build time from SUPABASE_URL / SUPABASE_ANON_KEY.',
        '// Served as a static file -- no serverless invocation on page load.',
        'window.SUPABASE_CONFIG = {',
        `  supabaseUrl: ${JSON.stringify(url)},`,
        `  supabaseAnonKey: ${JSON.stringify(key)}`,
        '};',
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'config/supabase.js', source });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html: string) {
        if (!supabaseOrigin) return html;
        const tag = `<link rel="preconnect" href="${supabaseOrigin}" crossorigin>`;
        if (html.includes(tag)) return html;
        return html.replace('</head>', `    ${tag}\n  </head>`);
      },
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), runtimeSupabaseConfig()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
