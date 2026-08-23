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

// Vercel does not expose req.rawBody by default.
// Flutterwave and Paystack both verify webhooks using an HMAC signature
// computed against the RAW request body bytes — if we let Express parse
// the body first, the raw bytes are lost and signature verification always
// fails, causing every webhook to be silently rejected.
// This helper reads the raw body BEFORE Express touches it and attaches it
// to req.rawBody so server.ts signature checks work correctly.
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const config = {
  api: {
    // Tell Vercel NOT to parse the body automatically.
    // We handle body parsing manually below so we can keep rawBody.
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    // Read raw bytes first
    const rawBody = await getRawBody(req);
    req.rawBody = rawBody;

    // Parse JSON body manually and attach to req.body
    // so Express middleware and route handlers still see req.body as normal
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      try {
        req.body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        req.body = {};
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody.toString('utf8'));
      req.body = Object.fromEntries(params.entries());
    } else {
      req.body = {};
    }

    // Express also registers express.json() inside server.ts. The request stream
    // has already been consumed above, so mark it as parsed or body-parser will
    // attempt a second read and throw: "InternalServerError: stream is not readable".
    req._body = true;

    const app = await getHandler();
    app(req, res);
  } catch (err) {
    console.error('[API Handler Error]:', err);
    res.status(500).json({ error: 'Server initialization failed', details: err.message });
  }
}
