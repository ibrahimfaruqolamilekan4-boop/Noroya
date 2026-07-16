/**
 * Vercel Serverless Function — API handler
 * All /api/* requests are routed here and delegated to Express
 *
 * IMPORTANT: this must be a STATIC top-level import, not a dynamic import().
 * Vercel's Node builder (esbuild) only bundles/transpiles files it can trace
 * via static import analysis. A dynamic import('../server.ts') at runtime is
 * NOT included in the deployed function output, so it 404s/fails to resolve
 * in production even though it works locally (ERR_MODULE_NOT_FOUND).
 */
import getExpressApp from '../server.ts';

let appPromise = null;

function getHandler() {
  if (!appPromise) {
    appPromise = getExpressApp();
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getHandler();
    app(req, res);
  } catch (err) {
    console.error('[API Handler Error]:', err);
    res.status(500).json({ error: 'Server initialization failed', details: err.message });
  }
}
