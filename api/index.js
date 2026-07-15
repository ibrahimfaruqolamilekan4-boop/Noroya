/**
 * Vercel Serverless Function — API handler
 * All /api/* requests are routed here and delegated to Express
 */
let appPromise = null;

async function getHandler() {
  if (!appPromise) {
    // ts-node / Vercel handles TS compilation automatically
    const mod = await import('../server.ts');
    const getApp = mod.default;
    appPromise = getApp();
  }
  return appPromise;
}

module.exports = async (req, res) => {
  try {
    const app = await getHandler();
    // Patch the URL to include /api prefix context if needed
    app(req, res);
  } catch (err) {
    console.error('[API Handler Error]:', err);
    res.status(500).json({ error: 'Server initialization failed', details: err.message });
  }
};
