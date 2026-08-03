/**
 * Vercel Serverless Function — API handler
 * All /api/* requests are routed here and delegated to Express
 *
 * IMPORTANT: this must be a STATIC top-level import, not a dynamic import().
 * Vercel's Node builder (esbuild) only bundles/transpiles files it can trace
 * via static import analysis.
 *
 * IMPORTANT #2: do NOT write the `.ts` extension in this import path.
 * esbuild does not rewrite an explicitly-written `.ts` extension, so the
 * compiled output would still literally contain the string '../server.ts'.
 * At runtime Node tries to resolve that exact path and fails with
 * ERR_MODULE_NOT_FOUND, because Node has no compiler attached at runtime
 * to understand a .ts file. Importing without an extension lets the
 * bundler resolve + inline the compiled module correctly.
 */
import getExpressApp from '../server';

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
