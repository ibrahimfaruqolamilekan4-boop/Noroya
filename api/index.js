/**
 * Vercel Serverless Function — API handler
 * All /api/* requests are routed here and delegated to Express
 *
 * IMPORTANT: this must be a STATIC top-level import, not a dynamic import().
 *
 * IMPORTANT #2: the explicit `.ts` extension below IS required. Vercel's
 * current Node runtime does NOT bundle this function through esbuild — it
 * ships server.ts as raw source (see vercel.json's functions.includeFiles)
 * and executes it directly via Node's native TypeScript type-stripping.
 * Node's ESM resolver never guesses extensions, so an extensionless
 * '../server' import fails at runtime with ERR_MODULE_NOT_FOUND. Do not
 * remove this extension again — that exact regression has happened twice.
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
