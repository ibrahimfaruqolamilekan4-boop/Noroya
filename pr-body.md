## Problem

Payments confirmed by Flutterwave were not crediting customer wallets immediately, and Flutterwave support reported they could not reliably reach the site's webhook URL. Root causes found in the webhook/verify path:

1. **Env-var alias mismatch (primary silent failure).** The startup config audit advertised `FLUTTERWAVE_SECRET_HASH`, but the webhook handler only read `FLW_SECRET_HASH`. With the secret configured under the other name, `secretHash` was empty and **every webhook was answered `200 "Webhook Received"` with no credit and no error** — Flutterwave sees a successful delivery, the wallet is never credited, and nothing looks wrong in the dashboard.
2. **Fail-open responses masked misconfiguration.** Missing secret hash, invalid signature, and "cannot independently verify" all responded `200` — turning every configuration error into a silent no-op. This is why "the webhook looks fine but the balance never moved".
3. **Signature verification could fail on exact-bytes mismatch.** `req.rawBody` was only set by the Vercel serverless wrapper; in any other runtime the HMAC fell back to re-serialized JSON whose key order/whitespace differs from what Flutterwave signed, failing verification.
4. **Reachability: only two webhook paths were served** (`/api/webhook/flutterwave`, `/api/webhooks/flutterwave`, both under `/api`). Any other URL saved in the Flutterwave dashboard (e.g. root-level `/webhook/flutterwave`, `/api/flutterwave/webhook`) 404s, which reads as "cannot reach your endpoint" from Flutterwave's side.
5. **Electricity page funding was left on the old unsafe client path** — it fired the verification request without awaiting it and immediately showed "Topped up!", so users saw success while the wallet was never credited (the exact "money confirmed but balance not added" complaint).

## Fixes

- `server.ts`
  - Webhook secret now resolves from **either** `FLW_SECRET_HASH` or `FLUTTERWAVE_SECRET_HASH` (and API secret from `FLUTTERWAVE_SECRET_KEY` or `FLW_SECRET_KEY`).
  - **Fail loud instead of silent 200**: missing secret → `503`; invalid signature → `401`; unable to independently verify a valid webhook (missing API key) → `503`. Flutterwave retries non-2xx and shows failed deliveries in its dashboard/logs, so problems surface immediately instead of silently swallowing money.
  - `express.json()` now captures the **raw body** via a `verify` hook, so HMAC-SHA256 always runs over the exact bytes Flutterwave signed (matches Flutterwave's documented `flutterwave-signature` scheme) in every runtime, not just the serverless wrapper.
  - Serves all common webhook path variants; added `GET /api/payments/flutterwave-webhook-health` self-check (reports config presence only, never values).
- `vercel.json` — root-level `/webhook/flutterwave` and `/webhooks/flutterwave` now route to the API function instead of falling through to the SPA.
- `src/components/ElectricitySection.tsx` — funding flow now awaits the server-side verification (matching the hardened Dashboard flow) and tells the user the truth when the credit is pending.
- `.env.example` — documents both secret-hash variable names.

## Verification

- Rebuilt the generated serverless bundle (`npm run build:function`) — it contains all fixes.
- `npm run build` (vite + function bundle) passes.
- `tsc --noEmit` shows only the 4 pre-existing errors already present on `main` (`downloadQR`, props type) — no new type errors from this change.
- Local smoke tests of the webhook endpoint: valid HMAC signature passes auth; bad/missing signature → 401; missing secret → 503; valid webhook with unverifiable key → 503/500 (retryable).

## REQUIRED follow-up (cannot be done from code — dashboard/Vercel settings)

1. **Flutterwave Dashboard → Settings → Webhooks**: URL must be exactly `https://<your-production-domain>/api/webhook/flutterwave` (any of the aliases in this PR now also work), Secret hash must be saved there.
2. **Vercel → Project → Settings → Environment Variables**: set `FLW_SECRET_HASH` = the same Secret hash (Production environment), set the rotated `FLUTTERWAVE_SECRET_KEY` / `FLUTTERWAVE_PUBLIC_KEY`, then **redeploy**.
3. Open `https://<your-domain>/api/payments/flutterwave-webhook-health` in a browser — all three booleans must be `true`.
4. Vercel → Settings → Deployment Protection / Firewall: ensure protection/trusted-IP rules are not blocking Flutterwave's POST requests (this is the most common cause of "we cannot reach your URL" while the site loads fine in a browser).
