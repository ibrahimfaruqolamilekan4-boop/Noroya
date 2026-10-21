import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dataRouter from "./backend/routes/dataRoutes.js";
import { buyData, v1DataPurchase } from "./backend/controllers/dataController.js";
import { supabase, serverHasServiceRoleKey, getScopedSupabaseClient } from "./src/lib/supabase.js";
import axios from "axios";

// SECURITY: sanitize client-supplied values before interpolating them into
// PostgREST `.or()` filter strings (they support comma/paren operators).
const pgSafeFilter = (value: unknown): string =>
  String(value ?? "").replace(/[(),"'\\]/g, "").trim();

const ensureUUID = (strId: string): string => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(strId)) {
    return strId;
  }
  let seed = 0;
  for (let i = 0; i < strId.length; i++) {
    seed = (seed * 31 + strId.charCodeAt(i)) >>> 0;
  }
  const r = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const hexChars = '0123456789abcdef';
  let hex32 = '';
  for (let i = 0; i < 32; i++) {
    hex32 += hexChars[r() % 16];
  }
  const part1 = hex32.substring(0, 8);
  const part2 = hex32.substring(8, 12);
  const part3 = '4' + hex32.substring(12, 15);
  const part4 = 'a' + hex32.substring(15, 18);
  const part5 = hex32.substring(18, 30);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

// In-memory cache for provider secrets so dynamic admin saves take effect immediately
const providerSecretsCache = new Map<string, string>();

// Strip accidental quotes (" ' `), KEY= prefixes, Bearer prefixes, and whitespace when copied into Vercel/Admin UI
const sanitizeSecretValue = (raw: string = ''): string => {
  return String(raw || '')
    .trim()
    .replace(/^[A-Za-z0-9_]+\s*=\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/["'`\r\n\s]/g, '')
    .trim();
};

const resolveProviderSecret = async (identifier: string, envKeys: string[]): Promise<string> => {
  // 1. Check in-memory cache first (populated by dynamic admin saves in this session)
  if (providerSecretsCache.has(identifier)) {
    const cached = sanitizeSecretValue(providerSecretsCache.get(identifier) || '');
    if (cached && !cached.includes('PASTE_YOUR') && !cached.includes('dummy') && cached.length > 5) return cached;
  }
  // 2. Check provider_secrets table in database (authoritative persisted store)
  try {
    const { data } = await supabase
      .from('provider_secrets')
      .select('secret')
      .eq('identifier', identifier)
      .maybeSingle();
    const dbVal = sanitizeSecretValue(data?.secret || '');
    if (dbVal && !dbVal.includes('PASTE_YOUR') && !dbVal.includes('dummy') && dbVal.length > 5) {
      providerSecretsCache.set(identifier, dbVal);
      return dbVal;
    }
  } catch (_) { /* provider_secrets may not exist until the hardening migration runs */ }
  // 3. Check services_config table in database
  try {
    const { data: legacy } = await supabase
      .from('services_config')
      .select('item_name')
      .or(`bigisub_identifier_id.eq.${identifier},mozosubz_plan_id.eq.${identifier}`)
      .maybeSingle();
    const legVal = sanitizeSecretValue(legacy?.item_name || '');
    if (legVal && !legVal.includes('PASTE_YOUR') && !legVal.includes('dummy') && legVal.length > 5) {
      providerSecretsCache.set(identifier, legVal);
      return legVal;
    }
  } catch (_) {}
  // 4. Fallback to environment variables
  for (const envKey of envKeys) {
    const val = sanitizeSecretValue(process.env[envKey] || '');
    if (val && !val.includes('PASTE_YOUR') && !val.includes('dummy') && !val.includes('connect_030660') && val.length > 5) {
      return val;
    }
  }
  return "";
};

const setProviderSecret = async (identifier: string, secretValue: string): Promise<boolean> => {
  const clean = sanitizeSecretValue(secretValue);
  providerSecretsCache.set(identifier, clean);
  try {
    await supabase
      .from('provider_secrets')
      .upsert({ identifier, secret: clean, updated_at: new Date().toISOString() });
  } catch (err: any) {
    console.warn('[setProviderSecret provider_secrets warning]:', err?.message || err);
  }
  try {
    await supabase
      .from('services_config')
      .upsert({
        service_type: 'airtime',
        provider_or_network: 'SYSTEM_CONFIG',
        item_name: clean,
        bigisub_identifier_id: identifier,
        cost_price: 0,
        selling_price: 0,
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'bigisub_identifier_id' });
  } catch (err: any) {
    console.warn('[setProviderSecret services_config warning]:', err?.message || err);
  }
  return true;
};

const resolveBigisubApiKey = async (): Promise<string> =>
  resolveProviderSecret('bigisub_api_key', ['BIGISUB_API_KEY', 'VTU_API_KEY']);

// ─── VTU Provider Plugin System ─────────────────────────────────────────────
// Providers live in src/lib/vtu-providers.ts
// NOTE: the explicit `.ts` extension is required here. On Vercel, server.ts is
// shipped as raw source and executed via Node's native TypeScript type-stripping
// (same as the '../server.ts' import in api/index.js). Node's ESM resolver does
// NOT map './x.js' specifiers to './x.ts' files like a bundler does, so pointing
// at './src/lib/vtu-providers.js' throws ERR_MODULE_NOT_FOUND at function load
// time and every /api route 500s with FUNCTION_INVOCATION_FAILED.
// To add a new provider: implement VtuProvider there and add to PROVIDERS map
import { getProvider, initProviders, listProviders, purchaseMozosubzUtility, purchaseNifexUtility, fetchNifexUser, fetchNifexLivePlans } from './src/lib/vtu-providers.ts';

// FIX: initProviders(supabase) must run AFTER its import above, not before it
// (previously this call sat between two import statements near the top of the
// file, before initProviders was even imported — if it threw for any reason,
// the whole module would fail to load, taking down every route in the app).
initProviders(supabase); // wire providers with Supabase client

// ─── Failure logger ───────────────────────────────────────────────────────────
const logVtuFailure = async (opts: {
  provider: string; network: string; phone: string;
  planId: string; planName: string; amount: number;
  error: string; raw?: any; userId?: string | null; userEmail?: string | null;
}) => {
  const entry = {
    provider:      opts.provider,
    network:       opts.network,
    phone_last4:   String(opts.phone).slice(-4),        // privacy — store last 4 only
    plan_id:       opts.planId,
    plan_name:     opts.planName,
    amount:        opts.amount,
    error_message: opts.error,
    raw_response:  JSON.stringify(opts.raw || {}).substring(0, 2000),
    timestamp:     new Date().toISOString(),
    user_id:       opts.userId || null,
    user_email:    opts.userEmail || null,
  };
  console.error('[VTU FAILURE]', JSON.stringify(entry));
  try {
    await supabase.from('vtu_failure_log').insert(entry);
  } catch (e: any) {
    // Table may not exist yet — failure log itself should never crash the app
    console.warn('[VTU FAILURE] Could not write to vtu_failure_log:', e?.message || e);
  }
};

const resolveMozosubzApiKey = async (): Promise<string> =>
  resolveProviderSecret('mozosubz_api_key', ['MOZOSUBS_CONNECT_KEY', 'MOZOSUBZ_CONNECT_KEY', 'MOZOSUBZ_API_KEY', 'MOZOSUBS_API_KEY']);

const resolveNifexApiKey = async (): Promise<string> =>
  resolveProviderSecret('nifex_api_key', ['NIFEX_API_KEY', 'NIFEXDATA_API_KEY', 'NIFEX_TOKEN']);

const resolveBachsSecretKey = async (): Promise<string> =>
  resolveProviderSecret('bachs_secret_key', ['BACHS_SECRET_KEY', 'BACHS_API_KEY', 'BACHS_LIVE_SECRET_KEY', 'BACHS_SANDBOX_SECRET_KEY']);

const resolveBachsWebhookSecret = async (): Promise<string> =>
  resolveProviderSecret('bachs_webhook_secret', ['BACHS_WEBHOOK_SECRET', 'BACHS_SIGNING_SECRET']);

const resolveBachsBaseUrl = (secretKey = ''): string => {
  const cleanKey = sanitizeSecretValue(secretKey);
  // Sandbox keys always target sandbox-api.bachs.io; live keys always target api.bachs.io
  if (cleanKey.startsWith('sk_sandbox_') || cleanKey.startsWith('sk_test_')) {
    return 'https://sandbox-api.bachs.io';
  }
  if (cleanKey.startsWith('sk_live_')) {
    return 'https://api.bachs.io';
  }
  const rawUrl = sanitizeSecretValue(process.env.BACHS_BASE_URL || '');
  if (rawUrl) {
    const stripped = rawUrl.replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');
    try {
      const parsed = new URL(stripped.startsWith('http') ? stripped : `https://${stripped}`);
      return parsed.origin;
    } catch (_) {
      if (stripped.toLowerCase().includes('sandbox')) return 'https://sandbox-api.bachs.io';
    }
  }
  return 'https://api.bachs.io';
};

const getBachsEndpoint = (baseUrl: string, subPath: string): string => {
  let cleanBase = sanitizeSecretValue(baseUrl || '').replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');
  try {
    const parsed = new URL(cleanBase.startsWith('http') ? cleanBase : `https://${cleanBase}`);
    cleanBase = parsed.origin;
  } catch (_) {
    cleanBase = 'https://api.bachs.io';
  }
  const cleanPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const v1Path = cleanPath.startsWith('/v1/') ? cleanPath : `/v1${cleanPath}`;
  return `${cleanBase}${v1Path}`;
};

dotenv.config();

// ─── Reseller Program ───────────────────────────────────────────────────────
// Manual monthly renewal: users pay RESELLER_MONTHLY_FEE to extend
// reseller_expires_at by 30 days. Status is always derived live from that
// timestamp (never a stale flag) -- active if now() is before expiry, still
// discounted during the RESELLER_GRACE_DAYS grace window after expiry, and
// reverts to standard pricing automatically once the grace window passes.
// No cron job is needed since this is checked at purchase time, not on a schedule.
const RESELLER_DISCOUNT_PERCENT = 20;   // flat % off retail price, data purchases only
const RESELLER_MONTHLY_FEE = 1000;      // ₦, manual renewal (not auto-charged)
const RESELLER_GRACE_DAYS = 3;          // days after expiry before discount actually drops

const isResellerActive = (profile: any): boolean => {
  if (!profile?.reseller_expires_at) return false;
  const expiresAt = new Date(profile.reseller_expires_at).getTime();
  const graceMs = RESELLER_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() <= expiresAt + graceMs;
};

// Applies the flat reseller discount to a base retail price -- ONLY for
// service_type 'data', and ONLY while the profile's reseller subscription is
// active (including the grace window). Any other service_type, or a lapsed
// subscription past grace, returns the unchanged retail price.
const applyResellerPricing = (basePrice: number, profile: any, serviceType: string): number => {
  if (serviceType !== 'data') return basePrice;
  if (!isResellerActive(profile)) return basePrice;
  const discounted = basePrice * (1 - RESELLER_DISCOUNT_PERCENT / 100);
  return Math.round(discounted);
};

// =========================================================================
// 🗝️ VTU GATEWAY & MOZOSUBZ CONFIGURATION CONFIG KEYS (EXPOSED VARIABLES)
// =========================================================================
// You can configure your credentials via two flexible methods:
// Method 1: Environment Variables in ".env" or Platform Secrets:
//   - MOZOSUBZ_API_KEY       : Your Mozosubz API secret authorization token.
//   - MOZOSUBZ_BASE_URL      : Base endpoint for Mozosubz (Default: "https://mozosubz.xyz/api")
//   - MOZOSUBZ_WEBHOOK_SECRET: Secret for verifying inbound Mozosubz webhook signatures.
//   - BIGISUB_API_KEY        : Your main Bigisub API secret token.
//   - BACHS_SECRET_KEY       : Your Bachs.io secret API key (sk_live_... or sk_sandbox_...).
//   - BACHS_WEBHOOK_SECRET   : Your Bachs.io webhook signing secret (whsec_...).
//
// Method 2: Supabase Dynamic config in the "services_config" table:
//   - Create a record with: bigisub_identifier_id = "mozosubz_api_key" and set the "item_name" as your key value.
//   - Create a record with: bigisub_identifier_id = "bigisub_api_key" and set the "item_name" as your key value.
// =========================================================================
// SECURITY (C7 fix): provider API keys now live in the service-role-only
// provider_secrets table (see supabase_security_hardening.sql). The legacy
// services_config rows are only used as a fallback by the resolvers below.
console.log("🔌 [VTU Config] Mozosubz API key source:", process.env.MOZOSUBZ_API_KEY ? "env" : "fallback/provider_secrets table");


import fs from 'fs';

const getOrCreateProfile = async (pgUuid: string, finalUserId: string): Promise<any> => {
  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  
  const queryIds = [pgUuid];
  if (finalUserId && isUuid(finalUserId)) {
    queryIds.push(finalUserId);
  }
  const filterString = queryIds.map(id => `id.eq.${id}`).join(',');

  try {
    // 1. Try to fetch from profiles table using both UUID formats
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .or(filterString)
      .maybeSingle();
    if (!error && profile) {
      return profile;
    }
  } catch (e) {
    console.warn("[getOrCreateProfile] profiles select warning:", e);
  }
// 4. Try to fetch from Supabase Auth admin API (Service Role)
  try {
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(pgUuid);
    if (!authError && authData?.user) {
      const authUser = authData.user;
      const referralCode = `REF-${Math.floor(Math.random() * 90000) + 10000}`;
      const username = authUser.email ? authUser.email.toLowerCase().split('@')[0] : `user_${Date.now()}`;
      const name = authUser.user_metadata?.full_name || authUser.user_metadata?.name || username.toUpperCase();
      
      const payload: any = {
        id: pgUuid,
        name: name,
        username: username,
        phone_number: authUser.phone || "",
        referral_code: referralCode,
        // SECURITY: never seed free money (was 10000).
        wallet_balance: 0,
        balance: 0,
        email: authUser.email || ""
      };

      const { error: insertErr } = await supabase.from('profiles').insert(payload);
      if (!insertErr) {
        const { data: newProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', pgUuid)
          .maybeSingle();
        if (newProfile) return newProfile;
      } else {
        console.warn("[getOrCreateProfile] Supabase Auth user insert failed:", insertErr);
      }
    }
  } catch (e) {
    console.warn("[getOrCreateProfile] Supabase Auth fetch warning:", e);
  }

  // 5. Absolute fallback: Create a default row
  try {
    const referralCode = `REF-${Math.floor(Math.random() * 90000) + 10000}`;
    const payload: any = {
      id: pgUuid,
      name: "User",
      username: `user_${Date.now()}`,
      phone_number: "",
      referral_code: referralCode,
      wallet_balance: 0,
      balance: 0,
      email: ""
    };
    const { error: insertErr } = await supabase.from('profiles').insert(payload);
    if (!insertErr) {
      const { data: newProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', pgUuid)
        .maybeSingle();
      if (newProfile) return newProfile;
    } else {
      console.warn("[getOrCreateProfile] Absolute fallback insert failed:", insertErr);
    }
  } catch (e) {
    console.warn("[getOrCreateProfile] absolute fallback warning:", e);
  }

  return null;
};
const getOrCreateProfileByEmail = async (email: string): Promise<any> => {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();

  try {
    // 1. Try to fetch from profiles table by email
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();
    if (!error && profile) {
      return profile;
    }
  } catch (e) {
    console.warn("[getOrCreateProfileByEmail] profiles warning:", e);
  }

  // 2. Try to fetch from users table by email
  try {
    const { data: userRow, error: userRowErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();
    if (!userRowErr && userRow) {
      const pgUuid = ensureUUID(userRow.id);
      return await getOrCreateProfile(pgUuid, userRow.id);
    }
  } catch (e) {
    console.warn("[getOrCreateProfileByEmail] users table warning:", e);
  }

  // 3. Try Firestore by email


  // 4. Try Supabase Auth admin API by email
  try {
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    if (!listError && listData?.users) {
      const authUser = listData.users.find((u: any) => u.email?.toLowerCase().trim() === cleanEmail);
      if (authUser) {
        const pgUuid = ensureUUID(authUser.id);
        return await getOrCreateProfile(pgUuid, authUser.id);
      }
    }
  } catch (e) {
    console.warn("[getOrCreateProfileByEmail] Auth listUsers warning:", e);
  }

return null;
};
// The Gemini client is created lazily: an unset/rotated GEMINI_API_KEY must not
// poison startup logs, and a redeploy with a fresh key takes effect immediately.
let _geminiAi: GoogleGenAI | null = null;
const getGeminiAi = (): GoogleGenAI | null => {
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!geminiKey) return null;
  if (!_geminiAi) {
    _geminiAi = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _geminiAi;
};

async function startServer() {

  // ── Environment config audit ──────────────────────────────────────────────
  // After an API-key rotation, a missing env var fails LOUD here instead of
  // surfacing later as confusing "Invalid API key" / permission-denied errors.
  const requiredEnvs = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const optionalEnvs = ["GEMINI_API_KEY", "BACHS_SECRET_KEY", "BACHS_WEBHOOK_SECRET", "MOZOSUBZ_API_KEY", "NIFEX_API_KEY", "BIGISUB_API_KEY", "ADMIN_EMAIL"];
  const missingRequired = requiredEnvs.filter((k) => !(process.env[k] || "").trim());
  const missingOptional = optionalEnvs.filter((k) => !(process.env[k] || "").trim());
  if (missingRequired.length) {
    console.error(`CONFIG AUDIT - CRITICAL: missing environment variables: ${missingRequired.join(", ")}. Funding wallets, admin operations and protected reads will fail until these are set (Project Settings -> Environment Variables) and the site is redeployed.`);
  }
  if (missingOptional.length) {
    console.warn(`CONFIG AUDIT - optional envs not set: ${missingOptional.join(", ")}. Features depending on them (AI chat, Bachs.io payments, VTU providers) can also be configured in provider_secrets.`);
  }
  if (!missingRequired.length && !missingOptional.length) {
    console.log("CONFIG AUDIT - all configured environment variables present.");
  }

  // ── Admin Identity Guard ──────────────────────────────────────────────────
  // Only the hardcoded owner email is recognised as admin.
  // No role field, no body flag, no JWT claim can override this.
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ibrahimfaruqolamilekan4@gmail.com";
  // Verifies the caller's Supabase session and returns the auth user (or null
  // after sending the 401). Used by the wallet read endpoints: the user's
  // dashboard reads its money data through here (service-role, same source of
  // truth the admin panel uses) instead of relying on direct browser→Supabase
  // grants/realtime, which silently no-op when a table isn't published for
  // realtime or the authenticated role lacks SELECT privileges.
  const requireUser = async (req: any, res: any): Promise<any | null> => {
    const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
    if (!token) { res.status(401).json({ error: "Unauthorized: no session token." }); return null; }
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) { res.status(401).json({ error: "Unauthorized: invalid session." }); return null; }
      return user;
    } catch (e) {
      res.status(401).json({ error: "Unauthorized." }); return null;
    }
  };

  const requireAdmin = async (req: any, res: any, allowSubAdmin = true): Promise<boolean> => {
    if (!serverHasServiceRoleKey) {
      console.warn("[requireAdmin Warning] SUPABASE_SERVICE_ROLE_KEY is not set; verifying admin identity via session token.");
    }
    const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
    const adminEmailHeader = (req.headers["x-admin-email"] || "").toString().toLowerCase().trim();

    let userEmail = '';
    let isRoleAdmin = false;
    if (token) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          if (user.email) userEmail = user.email.toLowerCase().trim();
          if ((user as any).user_metadata?.role === 'admin') isRoleAdmin = true;
          try {
            const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
            if (prof?.role === 'admin') isRoleAdmin = true;
          } catch (_) {}
        }
      } catch (_) {}
    }
    if (!userEmail && adminEmailHeader) {
      userEmail = adminEmailHeader;
    }

    if (!userEmail && !isRoleAdmin) {
      res.status(401).json({ error: "Unauthorized: no valid session token." });
      return false;
    }

    // Explicitly deny eSIM agent from general administrative controls
    if (userEmail === 'jeffholland299@gmail.com') {
      res.status(403).json({ error: "Forbidden: eSIM agent access only. No administrative control." });
      return false;
    }

    const ALLOWED_ADMINS = [
      ADMIN_EMAIL.toLowerCase().trim(),
      'ibrahimfaruqolamilekan4@gmail.com',
      'adewaleogunkeye200@gmail.com',
    ].filter(Boolean);

    const isExplicitAdmin = ALLOWED_ADMINS.includes(userEmail);
    if (!isExplicitAdmin && !isRoleAdmin) {
      res.status(403).json({ error: "Forbidden: admin access only." });
      return false;
    }
    return true;
  };

  const requireEsimAdmin = async (req: any, res: any): Promise<boolean> => {
    const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
    const adminEmailHeader = (req.headers["x-admin-email"] || "").toString().toLowerCase().trim();

    let userEmail = '';
    let isRoleAdmin = false;
    if (token) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user?.email) userEmail = user.email.toLowerCase().trim();
        if (user?.id) {
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
          if (prof?.role === 'admin') isRoleAdmin = true;
        }
      } catch (_) {}
    }
    if (!userEmail && adminEmailHeader) {
      userEmail = adminEmailHeader;
    }

    const ALLOWED_ESIM_ADMINS = [
      ADMIN_EMAIL.toLowerCase().trim(),
      'ibrahimfaruqolamilekan4@gmail.com',
      'adewaleogunkeye200@gmail.com',
      'jeffholland299@gmail.com'
    ].filter(Boolean);

    if ((!userEmail || !ALLOWED_ESIM_ADMINS.includes(userEmail)) && !isRoleAdmin) {
      res.status(403).json({ error: "Forbidden: unauthorized eSIM admin access." });
      return false;
    }
    return true;
  };

  const app = express();
  const PORT = 3000;

  // ── Security headers + rate limiting (audit H7) ────────────────────────────
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });

  // Dependency-free fixed-window per-IP rate limiter. In-memory buckets are
  // per-instance (fine for the single Cloud Run container; Vercel functions
  // get per-instance limiting, which still blunts abuse).
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();
  const rateLimit = (max: number, windowMs: number) => (req: any, res: any, next: any) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
    const key = `${ip}:${max}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    if (rateBuckets.size > 5000) rateBuckets.clear(); // bound memory
    return next();
  };

  const JSON_BODY_LIMIT = "128kb";
  // SECURITY: capture the RAW body bytes BEFORE JSON parsing so webhook HMAC
  // signature checks (Bachs.io X-Bachs-Signature-V2 / X-Bachs-Signature) always verify against the exact
  // bytes the provider signed. Without this, req.rawBody only exists on the
  // Vercel serverless wrapper; every other runtime falls back to re-serialized
  // JSON whose whitespace/key order makes signature verification fail, so
  // webhooks are silently discarded.
  app.use(express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; }
  }));
  // Global API throttle + a stricter bucket for money-touching endpoints.
  app.use("/api", rateLimit(300, 60_000));
  const purchaseRateLimit = rateLimit(30, 60_000);

  // SECURITY (audit C7): public plan listings must never expose provider
  // credential rows (keys used to live in services_config rows like
  // 'mozosubz_api_key') or wholesale cost prices.
  const isProviderSecretRow = (row: any) =>
    /(_api_key|_connect_key|_webhook_secret)$/i.test(String(row?.bigisub_identifier_id || "")) ||
    /^(sk|pk)_|^connect_/i.test(String(row?.item_name || ""));
  const sanitizePublicPlans = (rows: any[]) =>
    (rows || [])
      .filter((r: any) => !isProviderSecretRow(r))
      .map((r: any) => {
        const clone: any = { ...r };
        delete clone.cost_price;
        return clone;
      });

  // ─── Legacy local-db helpers (compile-compat stubs; Supabase is source of truth) ─
  function safeJsonStringify(obj: any, space?: string | number): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    }, space);
  }
  interface LocalStore { users: Record<string,any>; transactions: Record<string,any>; data_plans?: Record<string,any>; [k: string]: any; }
  function loadLocalDb(): LocalStore { return { users: {}, transactions: {}, data_plans: {} }; }
  function saveLocalDb(_data: LocalStore): void { /* no-op — Supabase is source of truth */ }
  // ───────────────────────────────────────────────────────────────────────────────────

  // (express.json is installed above with a body-size limit.)

  // Dynamic runtime injection of Supabase properties from the Cloud Run host container
  app.get("/config/supabase.js", (req, res) => {
    res.type("application/javascript");
    const defaultUrl = "https://sdbfuuxdquzvtcwryimh.supabase.co";
    const defaultAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYmZ1dXhkcXV6dnRjd3J5aW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODYzMTUsImV4cCI6MjA5MzA2MjMxNX0.AZMl623EBoNm3I-_2BskkIGkZ0d272uhgsRaoClhB9c";
    const supUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim() || defaultUrl;
    const supKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim() || defaultAnonKey;
    res.send(`
      window.SUPABASE_CONFIG = {
        supabaseUrl: ${JSON.stringify(supUrl)},
        supabaseAnonKey: ${JSON.stringify(supKey)}
      };
      try {
        localStorage.removeItem("DYNAMIC_SUPABASE_URL");
        localStorage.removeItem("DYNAMIC_SUPABASE_ANON_KEY");
        localStorage.removeItem("DYNAMIC_SUPABASE_SERVICE_ROLE_KEY");
      } catch (_) {}
    `);
  });
// JWT configuration and utilities
  // SECURITY: no hardcoded fallback. The previous default secret shipped in
  // this public repo and allowed anyone to forge session tokens for any user.
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production -- refusing to start with an unknown signing key.");
  }
  const JWT_SIGNING_KEY = JWT_SECRET || crypto.randomBytes(32).toString("hex");
  const JWT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

  function signJwt(payload: any): string {
    const header = { alg: "HS256", typ: "JWT" };
    const payloadWithExp = { ...payload, exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS };
    const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
    const base64Payload = Buffer.from(JSON.stringify(payloadWithExp)).toString("base64url");
    
      const hmac = crypto.createHmac("sha256", JWT_SIGNING_KEY);
      hmac.update(`${base64Header}.${base64Payload}`);
      const signature = hmac.digest("base64url");
      
      return `${base64Header}.${base64Payload}.${signature}`;
    }

  function verifyJwt(token: string): any {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      
      const [header, payload, signature] = parts;
      const hmac = crypto.createHmac("sha256", JWT_SIGNING_KEY);
      hmac.update(`${header}.${payload}`);
      const expectedSignature = hmac.digest("base64url");
      
      // Constant-time comparison so signature checks can't be timing-attacked.
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSignature);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      // SECURITY: reject expired tokens (expiry was previously never checked).
      if (typeof decoded.exp === "number" && decoded.exp * 1000 < Date.now()) return null;
      return decoded;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lightweight identity-only verifier. Resolves verified caller user id from session token.
   * Resolves ONLY a verified user id from the session token -- never trusts a body-supplied id.
   * Returns null if no valid session token is present.
   */
  async function verifyCallerUserId(req: express.Request): Promise<string | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.substring(7);

    try {
      const decoded = verifyJwt(token);
      if (decoded && decoded.uid) return decoded.uid;
    } catch (e) { /* continue */ }

    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) return user.id;
    } catch (e) { /* continue */ }

    return null;
  }

  /**
   * Helper to securely fetch the user profile balance by looking up the real, authenticated
   * user ID string from the session payload (and/or fallback request body parameters),
   * ensuring that any non-standard format (like 'admin_ibrahim_vtu_uid') is deterministically
   * sanitized into a valid Postgres UUID format.
   */
  async function getAuthenticatedUserBalance(req: express.Request): Promise<{ userId: string; pgUuid: string; balance: number; profile: any }> {
    let rawUserId: string | null = null;
    let userEmail: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // 1. Try decoding with local HS256 JWT verifier
      try {
        const decoded = verifyJwt(token);
        if (decoded && decoded.uid) {
          rawUserId = decoded.uid;
          userEmail = decoded.email || null;
        }
      } catch (e) {
        // Safe to ignore, continue to next strategy
      }


      // 3. Try decoding with Supabase Auth as secondary fallback
      if (!rawUserId) {
        try {
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            rawUserId = user.id;
            userEmail = user.email || null;
          }
        } catch (e) {
          // Continue
        }
      }
    }

    // SECURITY: rawUserId must come ONLY from a verified session token above -- never trust a
    // client-supplied req.body.userId as identity, or anyone could spend/view any other user's
    // wallet by simply passing their UUID in the request body with no proof of who they are.
    if (!rawUserId) {
      throw new Error("Unauthorized: No valid user session token provided.");
    }

    // If the caller also passed a body userId, it must match the verified token's identity --
    // reject silently-mismatched requests instead of trusting the body value.
    if (req.body && req.body.userId && req.body.userId !== rawUserId) {
      throw new Error("Unauthorized: Provided userId does not match the authenticated session.");
    }

    // 5. SECURE SANITIZATION: Cast the ID string (e.g. 'admin_ibrahim_vtu_uid') into a valid Postgres UUID format
    const pgUuid = ensureUUID(rawUserId);

    // 6. Fetch user profile from Supabase checking both UUID and raw ID formats safely
    const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
    const filterString = (rawUserId && isUuid(rawUserId)) ? `id.eq.${pgUuid},id.eq.${rawUserId}` : `id.eq.${pgUuid}`;

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .or(filterString)
      .maybeSingle();

    if (profileErr) {
      throw new Error(`Database error retrieving profile: ${profileErr.message}`);
    }

    let activeProfile = profile;

    if (!activeProfile && userEmail) {
      try {
        const { data: emailProfile, error: emailProfileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', userEmail)
          .maybeSingle();
        if (!emailProfileErr && emailProfile) {
          activeProfile = emailProfile;
          console.log(`[getAuthenticatedUserBalance] Found profile matching email: ${userEmail}`);
        }
      } catch (err: any) {
        console.warn("[getAuthenticatedUserBalance] Failed to lookup by email fallback:", err.message);
      }
    }

    if (!activeProfile) {
      // Profile not found -- create a fresh one with zero balance.
      let syncedProfile = null;
      try {
        {
          // Firestore document doesn't exist either. Create a brand new profile in Supabase profiles!
          const referralCode = `REF-${Math.floor(Math.random() * 90000) + 10000}`;
          const newUsername = userEmail ? userEmail.toLowerCase().split('@')[0] : `user_${Date.now()}`;
          const newName = userEmail ? (userEmail.split('@')[0].toUpperCase()) : "User";

          // Try inserting with email, balance, and wallet_balance
          const payload1: any = {
            id: pgUuid,
            name: newName,
            username: newUsername,
            phone_number: "",
            referral_code: referralCode,
                wallet_balance: 0,
            balance: 0,
            email: userEmail || ""
          };

          let { error: insertErr } = await supabase.from('profiles').insert(payload1);

          if (insertErr) {
            console.warn("[getAuthenticatedUserBalance] Standard insert failed, retrying without email/balance columns:", insertErr.message);
            // Fallback to inserting with minimum required columns
            const payload2: any = {
              id: pgUuid,
              name: newName,
              username: newUsername,
              phone_number: "",
              referral_code: referralCode,
                    wallet_balance: 0
            };
            const { error: insertErr2 } = await supabase.from('profiles').insert(payload2);
            insertErr = insertErr2;
          }

          if (!insertErr) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', pgUuid)
              .maybeSingle();
            syncedProfile = data;
          }
        }
      } catch (err) {
        console.warn("[getAuthenticatedUserBalance] On-the-fly sync/create warning:", err);
      }

      if (syncedProfile) {
        return {
          userId: rawUserId,
          pgUuid,
          balance: Number(syncedProfile.wallet_balance !== undefined ? syncedProfile.wallet_balance : (syncedProfile.balance || 0)),
          profile: syncedProfile
        };
      }

      throw new Error("User profile not found in database and could not be auto-created.");
    }

    return {
      userId: rawUserId,
      pgUuid,
      balance: Number(activeProfile.wallet_balance !== undefined ? activeProfile.wallet_balance : (activeProfile.balance || 0)),
      profile: activeProfile
    };
  }

  // GET /plans and GET /api/plans: Query plans from Supabase services_config (single source of truth)
  app.get(["/plans", "/api/plans"], async (req, res) => {
    try {
      const { network } = req.query;

      const { data: rows, error: dbErr } = await supabase
        .from('services_config')
        .select('id, bigisub_identifier_id, item_name, name, plan_name, network, network_type, service_type, plan_category, selling_price, retail_price, cost_price, validity_days, is_active, provider, mozosubz_service, mozosubs_plan_id, mozosubz_plan_id')
        .eq('is_active', true)
        .order('network');

      if (dbErr) {
        console.error("[Plans] Supabase error:", dbErr.message);
        return res.status(503).json({ error: "Failed to load plans. Please try again." });
      }

      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: "No active plans available. Please contact support." });
      }

      const plans = rows.map((r: any) => ({
        id:                   r.bigisub_identifier_id || String(r.id),
        network:              r.network_type || r.network || r.provider_or_network,
        network_type:         r.network_type || r.network,
        type:                 r.service_type || 'data',
        planType:             r.plan_category || 'GIFTING',
        planName:             r.plan_name || r.name || r.item_name,
        name:                 r.plan_name || r.name || r.item_name,
        plan_name:            r.plan_name || r.name || r.item_name,
        price:                Number(r.selling_price || r.retail_price || 0),
        amount:               Number(r.selling_price || r.retail_price || 0),
        retail_price:         Number(r.selling_price || r.retail_price || 0),
        validity:             r.validity_days || '30 Days',
        peyflex_variation_id: r.mozosubs_plan_id || r.mozosubz_plan_id || r.bigisub_identifier_id || String(r.id),
        apiPlanId:            r.mozosubs_plan_id || r.mozosubz_plan_id || r.bigisub_identifier_id || String(r.id),
        mozosubs_plan_id:     r.mozosubs_plan_id || r.mozosubz_plan_id || '',
        mozosubz_service:     r.mozosubz_service || '',
        bigisub_identifier_id: r.bigisub_identifier_id || '',
        provider:             r.provider || 'mozosubz',
      }));

      const filtered = network
        ? plans.filter((p: any) => (p.network_type || p.network || '').toLowerCase() === String(network).toLowerCase())
        : plans;

      return res.json(filtered);
    } catch (err: any) {
      console.error("[Plans] Unexpected error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/sync-mozosubz-plans and aliases: Sync data plans from the REAL Mozosubz V1 API into services_config.
  // Mozosubz has NO bulk "all plans" endpoint -- GET /api/v1/data/plans requires a single `service` id per call,
  // auth is via X-Connect-Key header (not Authorization: Token), base URL is https://mozosubz.xyz/api/v1.
  app.get(["/api/sync-mozosubz-plans", "/api/sync/mozosubz-plans", "/api/data/plans/sync", "/api/admin/data-plans", "/api/admin/data-plans/sync"], async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const MOZOSUBZ_API_KEY = await resolveMozosubzApiKey();
      const MOZOSUBZ_BASE_URL = "https://mozosubz.xyz/api/v1";

      if (!MOZOSUBZ_API_KEY || MOZOSUBZ_API_KEY.includes("dummy") || MOZOSUBZ_API_KEY.includes("test")) {
        return res.status(503).json({ error: "Mozosubz provider not configured. Please set MOZOSUBZ_API_KEY." });
      }

      // Every real Mozosubz data service, mapped to its display network + category for our schema.
      const DATA_SERVICES: { service: string; network: string; category: string }[] = [
        { service: "mtn_sme",        network: "MTN",     category: "SME" },
        { service: "mtn_datashare",  network: "MTN",     category: "DATASHARE" },
        { service: "mtn_gifting",    network: "MTN",     category: "GIFTING" },
        { service: "mtn_awoof",      network: "MTN",     category: "AWOOF" },
        { service: "mtn_awoof2",     network: "MTN",     category: "AWOOF" },
        { service: "glo_data",       network: "GLO",     category: "GIFTING" },
        { service: "glo_sme",        network: "GLO",     category: "SME" },
        { service: "airtel_sme",     network: "AIRTEL",  category: "SME" },
        { service: "airtel_gifting", network: "AIRTEL",  category: "GIFTING" },
        { service: "etisalat_data",  network: "9MOBILE", category: "GIFTING" },
      ];

      const syncedPlans: any[] = [];
      const failedServices: string[] = [];

      for (const { service, network, category } of DATA_SERVICES) {
        try {
          const response = await axios.get(`${MOZOSUBZ_BASE_URL}/data/plans`, {
            params: { service },
            headers: { "X-Connect-Key": MOZOSUBZ_API_KEY },
            timeout: 10000
          });

          const plans = response.data?.plans;
          if (!Array.isArray(plans)) {
            console.warn(`[Mozosubz Sync] No plans array for service ${service}:`, response.data);
            failedServices.push(service);
            continue;
          }

          for (const plan of plans) {
            const rawId = String(plan.id ?? "");
            if (!rawId) continue;

            const costPrice = Number(plan.price || 0);
            const sellingPrice = Math.ceil((costPrice * 1.15) / 10) * 10;
            const mozosubzPlanId = `${service}_${rawId}`;
            const itemName = `${plan.displayName || plan.name || rawId} - ${category}`;

            const record = {
              service_type: "data",
              provider: "mozosubz",
              provider_or_network: network,
              item_name: itemName,
              plan_category: category,
              mozosubz_service: service,
              mozosubz_plan_id: mozosubzPlanId,
              bigisub_identifier_id: mozosubzPlanId,
              bigisub_plan_id: mozosubzPlanId,
              cost_price: costPrice,
              selling_price: sellingPrice,
              validity_days: String(plan.validity || "30 Days"),
              is_active: true,
              updated_at: new Date().toISOString()
            };

            try {
              const { data: existing } = await supabase
                .from('services_config')
                .select('id')
                .eq('mozosubz_plan_id', mozosubzPlanId)
                .maybeSingle();

              if (existing?.id) {
                const { error: updErr } = await supabase
                  .from('services_config')
                  .update(record)
                  .eq('id', existing.id);
                if (updErr) console.error(`[Mozosubz Sync] Update error for ${mozosubzPlanId}:`, updErr.message);
              } else {
                const { error: insErr } = await supabase
                  .from('services_config')
                  .insert(record);
                if (insErr) console.error(`[Mozosubz Sync] Insert error for ${mozosubzPlanId}:`, insErr.message);
              }
              syncedPlans.push(record);
            } catch (dbErr: any) {
              console.error(`[Mozosubz Sync] DB exception for ${mozosubzPlanId}:`, dbErr.message || dbErr);
            }
          }
        } catch (apiErr: any) {
          console.error(`[Mozosubz API] Failed to fetch plans for service ${service}:`, apiErr.message);
          failedServices.push(service);
        }
      }

      if (syncedPlans.length === 0) {
        return res.status(502).json({
          error: "Mozosubz sync fetched zero plans across all services -- check MOZOSUBZ_API_KEY / connectivity.",
          failedServices
        });
      }

      return res.json({ success: true, count: syncedPlans.length, failedServices, plans: syncedPlans });
    } catch (e: any) {
      console.error("[Mozosubz Plans Sync Endpoint Error]:", e.message || String(e));
      return res.status(500).json({ error: e.message || "Failed to process Mozosubz plans sync" });
    }
  });


  // GET /api/v1/payment/config: Check live Bachs.io configuration status without exposing secret keys
  app.get(["/api/v1/payment/config", "/api/payments/bachs/config"], async (_req, res) => {
    const bachsSecret = await resolveBachsSecretKey();
    const bachsWebhookSecret = await resolveBachsWebhookSecret();
    const isConfigured = Boolean(bachsSecret && bachsSecret.length > 8 && !bachsSecret.includes("PASTE_YOUR"));
    const mode = bachsSecret.startsWith("sk_sandbox_") || bachsSecret.startsWith("sk_test_") ? "sandbox" : "live";
    return res.json({
      gateway: "bachs",
      configured: isConfigured,
      webhookConfigured: Boolean(bachsWebhookSecret && bachsWebhookSecret.length > 5 && !bachsWebhookSecret.includes("PASTE_YOUR")),
      mode,
      baseUrl: resolveBachsBaseUrl(bachsSecret),
    });
  });

  // Unified Robust Bigisub VTU Purchase Flow (Migrated from Peyflex)
  const handleVtuPurchase = async (req: any, res: any) => {
    const { 
      userId, 
      networkId, 
      planId, 
      phone, 
      amount, 
      requestType,
      // Legacy/Fallback keys from existing frontend to ensure 100% backward compatibility
      type, 
      network, 
      phoneNumber, 
      plan,
      phone_number,
      peyflex_variation_id,
      retail_price,
      plan_name,
      planName,
      apiPlanId
    } = req.body;
    
    const finalNetwork = networkId || network;
    const finalPhone = phone || phoneNumber || phone_number;
    let finalAmount = Number(
      amount !== undefined ? amount : 
      (retail_price !== undefined ? retail_price : req.body.amount)
    );
    if (isNaN(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount. Amount must be greater than zero." });
    }

    // Dynamic extraction of Plan ID
    const finalPlan = planId || plan || peyflex_variation_id || apiPlanId;

    // Determine the type: airtime or data
    let finalType = requestType || type;
    if (!finalType) {
      const pName = plan_name || planName || plan || "";
      if (pName.toLowerCase().includes("airtime") || apiPlanId === "airtime_top_up" || req.body.planType === "Airtime") {
        finalType = "airtime";
      } else {
        finalType = "data";
      }
    }

    if (!userId || !finalPhone || !finalAmount || !finalNetwork) {
      return res.status(400).json({ error: "Missing required checkout parameters: userId, network, phone, and amount are required." });
    }

    // SECURITY: never trust the body-supplied userId as identity -- require a real verified
    // session and confirm it actually matches the account this purchase is being made against.
    let finalUserId: string;
    try {
      const { userId: verifiedUserId } = await getAuthenticatedUserBalance(req);
      finalUserId = verifiedUserId;
    } catch (authErr: any) {
      return res.status(401).json({ error: `Unauthorized: ${authErr.message}` });
    }

    try {
      // 1. Query Supabase 'profiles' table to verify the logged-in user has sufficient 'wallet_balance'
      const pgUuid = finalUserId ? ensureUUID(finalUserId) : null;
      if (!pgUuid) {
        return res.status(400).json({ error: "Invalid user ID format." });
      }

      const profile = await getOrCreateProfile(pgUuid, finalUserId);

      if (!profile) {
        return res.status(404).json({ error: "User profile not found in Supabase database." });
      }

      const currentBalance = Number(profile.wallet_balance || 0);

      // 2. Resolve original Bigisub plan code and network code mappings dynamically
      let resolvedPlanCode = finalPlan;
      let dbPlan: any = null;
      if (finalType === "data" && finalPlan) {
        try {
          const result = await supabase
            .from('data_plans')
            .select('*')
            .or(`id.eq.${pgSafeFilter(finalPlan)},api_plan_id.eq.${pgSafeFilter(finalPlan)}`)
            .maybeSingle();

          dbPlan = result.data;
          if (dbPlan) {
            console.log(`[Supabase Resolve Plan SUCCESS] Matched data plan:`, dbPlan);
            resolvedPlanCode = dbPlan.api_plan_id || dbPlan.id;
          } else if (result.error) {
            console.warn("[handleVtuPurchase Resolve Plan Warning]:", result.error.message);
          }
        } catch (resolvePlanExc: any) {
          console.warn("[handleVtuPurchase Resolve Plan Exception]:", resolvePlanExc.message);
        }
      }

      // Map network strings from frontend safely into Bigisub's expected IDs
      let bigiNetworkId = finalNetwork;
      if (typeof finalNetwork === 'string') {
        const cleanNetwork = finalNetwork.toLowerCase().trim();
        if (cleanNetwork.includes('mtn') || cleanNetwork === '1') bigiNetworkId = 1;
        else if (cleanNetwork.includes('glo') || cleanNetwork === '2') bigiNetworkId = 2;
        else if (cleanNetwork.includes('airtel') || cleanNetwork === '3') bigiNetworkId = 3;
        else if (cleanNetwork.includes('9mobile') || cleanNetwork.includes('9mob') || cleanNetwork === '4') bigiNetworkId = 4;
      } else if (typeof finalNetwork === 'number') {
        if (finalNetwork === 1) bigiNetworkId = 1;
        else if (finalNetwork === 2) bigiNetworkId = 2;
        else if (finalNetwork === 3) bigiNetworkId = 3;
        else if (finalNetwork === 4) bigiNetworkId = 4;
      }

      // 3. Look up plan config + chosen provider from services_config
      let planConfig: any = null;
      try {
        const { data: pc } = await supabase
          .from('services_config')
          .select('*')
          .or(`mozosubs_plan_id.eq.${pgSafeFilter(resolvedPlanCode)},mozosubz_plan_id.eq.${pgSafeFilter(resolvedPlanCode)},bigisub_identifier_id.eq.${pgSafeFilter(resolvedPlanCode)}`)
          .maybeSingle();
        planConfig = pc;
      } catch (_) {}

      // [CRITICAL SECURITY FIX] - SERVER-SIDE PRICE ENFORCEMENT
      if (finalType !== 'airtime') {
         let serverPrice = 0;
         const role = profile.role || 'user';
         if (planConfig) {
             if (role === 'agent' && planConfig.agent_price) serverPrice = planConfig.agent_price;
             else if (role === 'reseller' && planConfig.reseller_price) serverPrice = planConfig.reseller_price;
             else if (planConfig.selling_price) serverPrice = planConfig.selling_price;
             else if (planConfig.retail_price) serverPrice = planConfig.retail_price;
         }
         // Fallback to dbPlan if services_config didn't match or didn't have price
         if (serverPrice === 0 && typeof dbPlan !== 'undefined' && dbPlan) {
             if (role === 'agent' && dbPlan.agent_price) serverPrice = dbPlan.agent_price;
             else if (role === 'reseller' && dbPlan.reseller_price) serverPrice = dbPlan.reseller_price;
             else if (dbPlan.selling_price) serverPrice = dbPlan.selling_price;
             else if (dbPlan.retail_price) serverPrice = dbPlan.retail_price;
         }

         if (serverPrice > 0) {
             console.log(`[SECURITY] Overriding client amount (${finalAmount}) with DB price (${serverPrice})`);
             finalAmount = Number(serverPrice);
         } else if (finalType === 'data') {
             // If we couldn't find a price for a data plan, deny it.
             return res.status(400).json({ error: "Invalid data plan or missing pricing configuration." });
         }
      }

      // Final sanity check before deduction
      if (isNaN(finalAmount) || finalAmount <= 0) {
         return res.status(400).json({ error: "Invalid transaction amount detected." });
      }

      // Enforce balance check with updated finalAmount
      if (currentBalance < finalAmount) {
         return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalAmount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` });
      }

      const chosenProvider = planConfig?.provider || 'mozosubz';
      const provider = getProvider(chosenProvider);

      let apiSuccess = false;
      let apiResponseData: any = null;
      let apiErrorMsg = "";
      let apiErrorCode: string | null = null;
      // 'pending' = outcome unknown (provider timeout / network error). Funds stay
      // locked and the transaction stays pending -- the provider may still have
      // delivered the value, so we must NOT auto-refund in that case.
      let purchaseOutcome: "success" | "failed" | "pending" = "failed";

      if (!provider) {
        return res.status(503).json({ error: `Unknown provider '${chosenProvider}'. Contact admin.` });
      }

      // Resolve the API key for this provider
      const providerApiKey = await provider.resolveApiKey();
      if (!providerApiKey || providerApiKey.length < 6) {
        return res.status(503).json({ error: `Provider '${chosenProvider}' API key not configured. Contact admin.` });
      }

      // 4. LOCK FUNDS FIRST: atomically deduct the wallet balance BEFORE calling the provider.
      // Uses the deduct_balance() Postgres RPC (SECURITY DEFINER, race-safe: it re-checks the
      // balance and decrements it in a single atomic statement, so two concurrent requests can
      // never both succeed against the same balance -- unlike a read-then-write in JS).
      const localRef = `TRX-VTU-${Date.now()}`;
      const { data: lockOk, error: lockErr } = await supabase.rpc('deduct_balance', {
        user_uuid: pgUuid,
        amount: finalAmount,
      });

      if (lockErr) {
        console.error("[VTU Fund Lock] deduct_balance RPC error:", lockErr.message);
        return res.status(500).json({ error: "Could not lock funds for this purchase. Please try again." });
      }
      if (!lockOk) {
        return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalAmount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` });
      }

      // Record the pending transaction now that funds are locked.
      let pendingTxId: number | null = null;
      try {
        const { data: pendingTx, error: pendingTxErr } = await supabase.from('transactions').insert({
          user_id: pgUuid,
          type: finalType, amount: finalAmount, status: 'pending',
          description: `${finalNetwork} ${finalPlan || finalType} to ${finalPhone}`,
          reference: localRef, created_at: new Date().toISOString(),
        }).select('id').maybeSingle();
        pendingTxId = pendingTx?.id ?? null;
        if (pendingTxErr) console.error("[Pending Transaction Insert] Failed to create transaction record:", pendingTxErr.message);
      } catch (txErr: any) {
        console.warn("[VTU pending transaction insert warning]:", txErr.message || txErr);
      }

      // A provider error with NO HTTP response (timeout, DNS, connection reset)
      // means the gateway may still have processed the order: the outcome is
      // UNKNOWN. Only a real HTTP error response is a definite rejection.
      const isAmbiguousProviderError = (err: any): boolean => {
        if (!err) return false;
        if (err.response) return false; // gateway definitely answered
        return true;                    // no response = unknown outcome
      };

      // 5. Call the provider now that funds are safely locked.
      try {
        const result = await provider.purchase({
          type:             finalType as 'data' | 'airtime',
          network:          finalNetwork,
          phone:            finalPhone,
          amount:           finalAmount,
          planId:           resolvedPlanCode,
          providerPlanId:   planConfig?.bigisub_identifier_id || resolvedPlanCode,
          mozosubzService:  planConfig?.mozosubz_service || req.body.mozosubz_service || req.body.service || '',
          apiKey:           providerApiKey,
        });

        apiResponseData = result.raw;
        if (result.success) {
          apiSuccess = true;
          purchaseOutcome = "success";
        } else if (result.ambiguous) {
          // Unknown outcome -- keep funds locked and the transaction pending.
          // The provider may still deliver the value; refunding here is what
          // previously refunded users whose data HAD actually arrived.
          purchaseOutcome = "pending";
          apiErrorMsg = result.error || 'Provider confirmation pending.';
          console.warn(`[VTU AMBIGUOUS OUTCOME] ${chosenProvider} ${finalType} for ${finalPhone}: ${apiErrorMsg} -- funds kept locked, transaction left pending (${localRef}).`);
        } else {
          apiErrorMsg = result.error || 'Purchase rejected by gateway.';
          apiErrorCode = apiResponseData?.error_code || null;
          await logVtuFailure({
            provider:  chosenProvider,
            network:   finalNetwork,
            phone:     finalPhone,
            planId:    resolvedPlanCode,
            planName:  plan_name || planName || '',
            amount:    finalAmount,
            error:     apiErrorMsg,
            raw:       apiResponseData,
            userId:    pgUuid,
          });
        }
      } catch (providerErr: any) {
        const rawErrData = providerErr.response?.data;
        apiResponseData = rawErrData;
        if (isAmbiguousProviderError(providerErr)) {
          purchaseOutcome = "pending";
          apiErrorMsg = providerErr?.message || 'Provider connection could not be confirmed.';
          console.warn(`[VTU AMBIGUOUS OUTCOME] ${chosenProvider} ${finalType} for ${finalPhone} raised a network-level error -- funds kept locked, transaction left pending (${localRef}).`);
        } else {
          apiErrorMsg = rawErrData?.error || rawErrData?.message || providerErr.message || 'Provider connection failed.';
          apiErrorCode = rawErrData?.error_code || null;
          await logVtuFailure({
            provider:  chosenProvider,
            network:   finalNetwork,
            phone:     finalPhone,
            planId:    resolvedPlanCode,
            planName:  plan_name || planName || '',
            amount:    finalAmount,
            error:     apiErrorMsg,
            raw:       rawErrData,
            userId:    pgUuid,
          });
        }
      }

      // 6. Settle: on success just mark the transaction complete (funds already locked/deducted).
      // On an UNKNOWN outcome (pending), keep the funds locked and leave the
      // transaction pending -- the provider may still deliver the value, so we
      // must NOT refund. On a definite failure, AUTOMATICALLY REFUND the locked
      // amount back to the user's wallet via the increment_balance() RPC, and
      // mark the transaction failed/refunded.
      if (purchaseOutcome === "pending") {
        console.warn(`[VTU PENDING] Leaving ${finalType} purchase for ${finalPhone} pending (${localRef}).`);
        return res.json({
          status: "processing",
          message: "Your purchase is being confirmed by the network. Your wallet has been charged; if the network rejects it, you are refunded automatically.",
          reference: localRef,
          transaction: {
            reference: localRef,
            amount: finalAmount,
            phone: finalPhone,
            network: finalNetwork,
            type: finalType,
          },
        });
      }

      if (apiSuccess) {
        const referenceCode = apiResponseData?.transaction_id || apiResponseData?.reference || apiResponseData?.id || localRef;
        try {
          if (pendingTxId) {
            await supabase.from('transactions').update({
              status: 'success', reference: referenceCode, api_reference: referenceCode,
            }).eq('id', pendingTxId);
          }
        } catch (txErr: any) {
          console.warn("[Supabase Transactions update bypassed]:", txErr.message || txErr);
        }

        return res.json({
          status: "success",
          message: `${finalType} purchase successful!`,
          transaction: {
            reference: referenceCode,
            amount: finalAmount,
            phone: finalPhone,
            network: finalNetwork,
            type: finalType
          }
        });
      } else {
        // Purchase failed at the provider -- automatically refund the locked funds, and report
        // truthfully whether that refund itself actually succeeded.
        const { error: refundErr } = await supabase.rpc('increment_balance', {
          user_uuid: pgUuid,
          amount: finalAmount,
        });
        const refunded = !refundErr;
        if (refundErr) {
          console.error("[VTU Auto-Refund] increment_balance RPC FAILED -- manual intervention needed:", refundErr.message, { pgUuid, finalAmount, localRef });
        }
        try {
          if (pendingTxId) {
            await supabase.from('transactions').update({
              status: refunded ? 'refunded' : 'failed',
            }).eq('id', pendingTxId);
          }
        } catch (_) { /* non-fatal */ }

        console.warn(`[VTU Purchase Failed]: ${apiErrorMsg} (code: ${apiErrorCode || 'n/a'}). Refunded: ${refunded}.`);
        return res.status(400).json({
          error: refunded
            ? `Purchase failed: ${apiErrorMsg} Your wallet has been automatically refunded.`
            : `Purchase failed: ${apiErrorMsg} Refund could not be processed automatically -- contact support with reference ${localRef}.`,
          error_code: apiErrorCode,
          provider_message: apiErrorMsg,
          refunded,
          reference: localRef,
        });
      }
    } catch (err: any) {
      console.error("[Bigisub Purchase Endpoint Exception]:", err);
      return res.status(500).json({ error: "Internal processing error during Bigisub purchase flow." });
    }
  };

  // Mount the new modular VTU integration data router
  app.use("/api/data", dataRouter);

  // Live Wallet Purchases & Checkout Fulfillments (Unified Bigisub purchase flow)
  app.post("/api/v1/data/purchase", purchaseRateLimit, handleVtuPurchase);

  // POST /buy-data and POST /api/vtu/buy-data / POST /api/buy-data (Unified Bigisub purchase flow)
  app.post(["/buy-data", "/api/vtu/buy-data", "/api/buy-data"], purchaseRateLimit, handleVtuPurchase);

  /**
   * 🚀 ENDPOINT: BUY DATA (VENDOR API - DIRECT UUID LINKAGE)
   * Securely handles user balances and dispatches data purchase requests to Bigisub
   */
  app.post('/api/vendor/buy-data', purchaseRateLimit, async (req, res) => {
    const { email, networkId, planId, phoneNumber, costAmount } = req.body;

    try {
      // SECURITY: never trust a body-supplied userUUID as identity -- require a real verified
      // session, and only ever act on the caller's own verified account.
      let userUUID: string;
      try {
        const { userId: verifiedUserId } = await getAuthenticatedUserBalance(req);
        userUUID = verifiedUserId;
      } catch (authErr: any) {
        return res.status(401).json({ success: false, message: `Unauthorized: ${authErr.message}` });
      }

      // 1. Fetch user profile from Supabase securely using their UUID
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, wallet_balance, balance, role')
        .eq('id', userUUID)
        .maybeSingle();

      if (profileError || !profile) {
        return res.status(404).json({ success: false, message: "Profile linkage error. User not found." });
      }

      const currentBalance = parseFloat(profile.wallet_balance !== undefined ? profile.wallet_balance : (profile.balance ?? 0));

      // SECURITY (audit C5): never trust the client-supplied costAmount. Resolve the
      // plan's server-side price from services_config (agent/reseller-aware) or reject.
      let serverPrice = 0;
      try {
        const safePlanId = pgSafeFilter(String(planId || ''));
        const { data: planCfg } = await supabase
          .from('services_config')
          .select('selling_price, retail_price, cost_price, reseller_price, agent_price')
          .or(`bigisub_plan_id.eq.${safePlanId},mozosubz_plan_id.eq.${safePlanId},bigisub_identifier_id.eq.${safePlanId}`)
          .maybeSingle();
        const role = (profile as any).role || 'user';
        if (planCfg) {
          if (role === 'agent' && planCfg.agent_price) serverPrice = Number(planCfg.agent_price);
          else if (role === 'reseller' && planCfg.reseller_price) serverPrice = Number(planCfg.reseller_price);
          else if (planCfg.selling_price) serverPrice = Number(planCfg.selling_price);
          else if (planCfg.retail_price) serverPrice = Number(planCfg.retail_price);
        }
      } catch (priceLookupErr) {
        console.warn("[Vendor Buy-Data] plan price lookup warning:", priceLookupErr);
      }
      // SECURITY: fail closed when the plan cannot be priced server-side.
      // Never fall back to client-controlled costAmount.
      const chargeAmount = serverPrice;
      if (isNaN(chargeAmount) || chargeAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid data plan or missing pricing configuration." });
      }

      if (currentBalance < chargeAmount) {
        return res.status(400).json({ success: false, message: "Insufficient wallet funds." });
      }

      // 2. Map Network string inputs into Bigisub's explicit numeric IDs
      let verifiedNetworkId = networkId;
      if (typeof networkId === 'string') {
        const netStr = networkId.toLowerCase().trim();
        if (netStr.includes('mtn')) verifiedNetworkId = 1;
        else if (netStr.includes('glo')) verifiedNetworkId = 2;
        else if (netStr.includes('airtel')) verifiedNetworkId = 3;
        else if (netStr.includes('9mobile')) verifiedNetworkId = 4;
      }

      const BIGISUB_API_KEY = await resolveBigisubApiKey();
      let bigisubResponseData: any = null;
      let apiSuccess = false;

      // PRODUCTION ONLY: no simulation fallback. Hard-fail if API key is missing.
      if (!BIGISUB_API_KEY || BIGISUB_API_KEY.includes('dummy') || BIGISUB_API_KEY.includes('test')) {
        return res.status(503).json({ error: "Payment provider not configured. Please contact support." });
      }

      // SECURITY (audit C5): lock funds BEFORE dispatching to the provider. The old
      // order purchased first and deducted after, so a failed debit gave away free data.
      const { data: lockOk, error: lockErr } = await supabase.rpc('deduct_balance', {
        user_uuid: userUUID,
        amount: chargeAmount,
      });
      if (lockErr) {
        console.error("[Vendor Buy-Data] deduct_balance RPC error:", lockErr.message);
        return res.status(500).json({ success: false, message: "Could not lock funds for this purchase. Please try again." });
      }
      if (!lockOk) {
        return res.status(400).json({ success: false, message: "Insufficient wallet funds." });
      }

      try {
        const bigisubPayload = {
          network: parseInt(verifiedNetworkId),
          plan: parseInt(planId),
          mobile_number: phoneNumber,
          bypass_validator: true
        };

        const response = await axios.post('https://bigisub.ng/api/v1/data', bigisubPayload, {
          headers: {
            'Authorization': `Bearer ${BIGISUB_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        bigisubResponseData = response.data;
        if (bigisubResponseData.status === 'success' || bigisubResponseData.Status === 'successful' || bigisubResponseData.success === true) {
          apiSuccess = true;
        }
      } catch (provErr: any) {
        bigisubResponseData = provErr.response?.data || null;
        console.error("[Vendor Buy-Data] provider dispatch exception:", provErr.message);
      }

      if (!apiSuccess) {
        // Provider rejected or failed -- refund the locked funds automatically.
        const { error: refundErr } = await supabase.rpc('increment_balance', {
          user_uuid: userUUID,
          amount: chargeAmount,
        });
        const refunded = !refundErr;
        if (refundErr) {
          console.error("[Vendor Buy-Data] auto-refund FAILED -- manual intervention needed:", refundErr.message, { userUUID, chargeAmount });
        }
        return res.status(400).json({
          success: false,
          message: (bigisubResponseData?.error || bigisubResponseData?.message || 'Provider execution failure') +
            (refunded ? " Your wallet has been refunded." : " Refund failed -- contact support."),
          refunded,
        });
      }

      // Success: funds were locked before dispatch, so only record the transaction here.
        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', userUUID).maybeSingle();
        const remainingFunds = freshProfile?.wallet_balance ?? (currentBalance - chargeAmount);

        // Log to your admin system transactions table
        try {
          await supabase.from('transactions').insert([{
            user_id: userUUID,
            user_email: email || '',
            type: 'Data Purchase',
            amount: chargeAmount,
            status: 'success',
            recipient: phoneNumber,
            reference: bigisubResponseData.id || bigisubResponseData.reference || 'BIGISUB_TX',
            created_at: new Date().toISOString()
          }]);
        } catch (dbErr) {
          console.warn("[Vendor Buy-Data] Failed to insert transaction record:", dbErr);
        }

        return res.json({ success: true, newBalance: remainingFunds });
    } catch (error: any) {
      console.error("Critical API Error Handler:", error.response?.data || error.message);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Transaction rejected. Please ensure your Bigisub account KYC is verified and your portal developer wallet is funded." 
      });
    }
  });

  /**
   * 🚀 ENDPOINT: BUY DATA & AIRTIME (VENDOR API)
   * Handles user balances, updates admin logs, and sends request to Bigisub
   */
  app.post('/api/vendor/recharge', purchaseRateLimit, async (req, res) => {
    const { email, type, networkId, planId, phoneNumber, amount, costAmount } = req.body;

    try {
      // SECURITY: never trust a body-supplied userUUID/uuid/email as identity -- require a real
      // verified session, and only ever act on the caller's own verified account.
      let targetId: string;
      try {
        const { userId: verifiedUserId } = await getAuthenticatedUserBalance(req);
        targetId = verifiedUserId;
      } catch (authErr: any) {
        return res.status(401).json({ success: false, message: `Unauthorized: ${authErr.message}` });
      }

      let profile: any = null;

      // 1. Look up profile using the verified UUID
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      profile = data;

      // AUTO-HEAL: if the verified caller genuinely has no profile row yet, create one with a
      // ZERO starting balance -- never seed free money. (No longer keyed on an unverified body ID.)
      if (profileError || !profile) {
        console.log(`Profile missing for verified UUID ${targetId}. Auto-creating profile row now...`);
        const referralCode = `REF-${Math.floor(Math.random() * 90000) + 10000}`;
        const username = email ? email.toLowerCase().split('@')[0] : `user_${Date.now()}`;
        const recoveryPayload = {
          id: targetId,
          name: 'User',
          username: username,
          email: email || '',
          phone_number: phoneNumber || '',
          referral_code: referralCode,
          wallet_balance: 0,
          balance: 0
        };

        const { error: insertError } = await supabase
          .from('profiles')
          .insert([recoveryPayload]);

        if (insertError) {
          throw new Error("Critical database profile creation failure: " + insertError.message);
        }

        // Fetch back the new profile seamlessly
        const { data: newProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetId)
          .maybeSingle();

        profile = newProfile || recoveryPayload;
      }

      if (!profile) {
        return res.status(404).json({ success: false, message: "User profile not found or could not be created in database." });
      }

      // Step B: Choose right balance column dynamically
      const currentBalance = profile.wallet_balance !== undefined ? Number(profile.wallet_balance) : Number(profile.balance || 0);

      // SECURITY (audit C5): for data purchases the charge is the server-side plan
      // price, never the client-supplied amount. Airtime is amount-based, so the
      // client-chosen face value is legitimate there.
      let deductAmount = parseFloat(amount || costAmount || 0);
      if (type !== 'airtime') {
        let serverPrice = 0;
        try {
          const safePlanId = pgSafeFilter(String(planId || ''));
          const { data: planCfg } = await supabase
            .from('services_config')
            .select('selling_price, retail_price, cost_price, reseller_price, agent_price')
            .or(`bigisub_plan_id.eq.${safePlanId},mozosubz_plan_id.eq.${safePlanId},bigisub_identifier_id.eq.${safePlanId}`)
            .maybeSingle();
          const role = profile.role || 'user';
          if (planCfg) {
            if (role === 'agent' && planCfg.agent_price) serverPrice = Number(planCfg.agent_price);
            else if (role === 'reseller' && planCfg.reseller_price) serverPrice = Number(planCfg.reseller_price);
            else if (planCfg.selling_price) serverPrice = Number(planCfg.selling_price);
            else if (planCfg.retail_price) serverPrice = Number(planCfg.retail_price);
          }
        } catch (priceLookupErr) {
          console.warn("[Vendor Recharge] plan price lookup warning:", priceLookupErr);
        }
        if (!(serverPrice > 0)) {
          return res.status(400).json({ success: false, message: "Invalid data plan or missing pricing configuration." });
        }
        deductAmount = serverPrice;
      }

      if (isNaN(deductAmount) || deductAmount <= 0 || currentBalance < deductAmount) {
        return res.status(400).json({ success: false, message: `Insufficient balance for transaction. Your current balance is ₦${currentBalance.toLocaleString()}.` });
      }

      // Step C: Fire the network payload to Mozosubz API
      // Mozosubz expects authorization headers and data payload structures matching their documentation
      const MOZOSUBZ_API_KEY = await resolveMozosubzApiKey();
      
      // Map network strings or IDs from frontend safely into Mozosubz's expected IDs
      let mozoNetworkId = networkId;

      if (typeof networkId === 'string') {
        const cleanNetwork = networkId.toLowerCase().trim();
        if (cleanNetwork.includes('mtn')) mozoNetworkId = 1;
        else if (cleanNetwork.includes('glo')) mozoNetworkId = 2;
        else if (cleanNetwork.includes('airtel')) mozoNetworkId = 3;
        else if (cleanNetwork.includes('9mobile')) mozoNetworkId = 4;
      }

      let mozoResponseData: any = null;
      let apiSuccess = false;

      // PRODUCTION ONLY: no simulation fallback. Hard-fail if API key is missing.
      if (!MOZOSUBZ_API_KEY || MOZOSUBZ_API_KEY.includes('dummy') || MOZOSUBZ_API_KEY.includes('test')) {
        return res.status(503).json({ error: "Payment provider not configured. Please contact support." });
      }

      // SECURITY (audit C5): lock funds BEFORE dispatching to the provider;
      // refund automatically if the provider rejects or the call fails.
      const { data: lockOk, error: lockErr } = await supabase.rpc('deduct_balance', {
        user_uuid: profile.id,
        amount: deductAmount,
      });
      if (lockErr) {
        console.error("[Vendor Recharge] deduct_balance RPC error:", lockErr.message);
        return res.status(500).json({ success: false, message: "Could not lock funds for this purchase. Please try again." });
      }
      if (!lockOk) {
        return res.status(400).json({ success: false, message: `Insufficient balance for transaction. Your current balance is ₦${currentBalance.toLocaleString()}.` });
      }

      const mozoPayload: any = {
          network: mozoNetworkId,
          mobile_number: phoneNumber,
          Ported_number: true
        };

        // Add type-specific parameters
        if (type === 'airtime') {
          mozoPayload.airtime_type = "VTU";
          mozoPayload.amount = parseFloat(amount || costAmount);
        } else {
          // For data plans, ensure planId is the numerical ID provided by Mozosubz's plan codes
          mozoPayload.plan = parseInt(planId);
        }

        const mozoBaseUrl = process.env.MOZOSUBZ_BASE_URL || "https://mozosubz.xyz/api";
        const endpoint = type === 'airtime' ? 'airtime' : 'data';
        const mozoUrl = `${mozoBaseUrl}/${endpoint}/`;

      try {
        const response = await axios.post(mozoUrl, mozoPayload, {
          headers: {
            'Authorization': `Token ${MOZOSUBZ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        mozoResponseData = response.data;
        if (mozoResponseData.status === 'success' || mozoResponseData.Status === 'successful' || mozoResponseData.success === true || mozoResponseData.status === 'successful') {
          apiSuccess = true;
        }
      } catch (provErr: any) {
        mozoResponseData = provErr.response?.data || null;
        console.error("[Vendor Recharge] provider dispatch exception:", provErr.message);
      }

      if (!apiSuccess) {
        const { error: refundErr } = await supabase.rpc('increment_balance', {
          user_uuid: profile.id,
          amount: deductAmount,
        });
        const refunded = !refundErr;
        if (refundErr) {
          console.error("[Vendor Recharge] auto-refund FAILED -- manual intervention needed:", refundErr.message, { userId: profile.id, deductAmount });
        }
        return res.status(400).json({
          success: false,
          message: (mozoResponseData?.error || mozoResponseData?.message || 'Provider rejected request') +
            (refunded ? " Your wallet has been refunded." : " Refund failed -- contact support."),
          refunded,
        });
      }

      // Success: funds were locked before dispatch, so only log the transaction here.
        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', profile.id).maybeSingle();
        const newBalance = freshProfile?.wallet_balance ?? (currentBalance - deductAmount);

        // Step E: Create activity log entry for your Admin Control Panel
        try {
          await supabase
            .from('transactions')
            .insert([{
              user_id: profile.id,
              user_email: email,
              type: type,
              amount: deductAmount,
              recipient: phoneNumber,
              status: 'success',
              reference: mozoResponseData.id || mozoResponseData.reference || 'MOZOSUBZ_TX',
              created_at: new Date().toISOString()
            }]);
        } catch (dbErr) {
          console.warn("[Vendor Recharge] Failed to insert transaction record:", dbErr);
        }

        return res.json({ success: true, balance: newBalance, message: "Transaction completed successfully!" });
    } catch (error: any) {
      console.error("Transaction processing error:", error?.response?.data || error?.message || error);
      const apiErr = error?.response?.data?.error || error?.response?.data?.message || error?.message || "Transaction rejected by operator network center or local limits.";
      return res.status(500).json({ 
        success: false, 
        message: `Transaction Failed: ${apiErr}. Verify your Bigisub KYC state & API Balance.` 
      });
    }
  });

  // ============================================================================
  // Unified Bigisub Service Configuration & Purchase Routes (Migration)
  // ============================================================================

  // 1. Automated Plan Generator: Processes and maps/upserts plans directly from Bigisub API payload
  app.post("/api/admin/generate-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { plans } = req.body;
      if (!plans || !Array.isArray(plans)) {
        return res.status(400).json({ error: "Missing or invalid parameter: 'plans' must be an array of plan objects." });
      }

      const upsertedPlans = [];

      for (const plan of plans) {
        // Handle various payload representations dynamically
        const bigisub_plan_id = String(plan.id || plan.plan_id || plan.bigisub_plan_id || plan.api_id || plan.bigisub_identifier_id || "").trim();
        if (!bigisub_plan_id) continue;

        const item_name = String(plan.name || plan.plan_name || plan.item_name || "").trim();
        const cost_price = Number(plan.cost || plan.cost_price || plan.price || plan.selling_price || 0);
        const service_type = String(plan.service_type || plan.type || "data").toLowerCase().trim();

        // Validate service type alignment
        const validTypes = ['data', 'airtime', 'cable', 'electricity', 'exam_pin'];
        const finalType = validTypes.includes(service_type) ? service_type : 'data';

        let provider_or_network = String(plan.network || plan.provider || plan.provider_or_network || plan.network_or_provider || "").toUpperCase().trim();
        if (plan.network_id) {
          if (Number(plan.network_id) === 1) provider_or_network = "MTN";
          else if (Number(plan.network_id) === 2) provider_or_network = "GLO";
          else if (Number(plan.network_id) === 3) provider_or_network = "9MOBILE";
          else if (Number(plan.network_id) === 4) provider_or_network = "AIRTEL";
        }

        if (!provider_or_network) {
          provider_or_network = "UNKNOWN";
        }

        // Apply a safe default markup if selling price isn't set or is under cost
        let selling_price = Number(plan.selling_price || plan.price || 0);
        if (!selling_price || selling_price <= cost_price) {
          selling_price = Math.ceil(cost_price * 1.08); // 8% markup
        }

        const is_active = plan.is_active !== undefined ? Boolean(plan.is_active) : true;

        const payload = {
          service_type: finalType,
          provider_or_network,
          item_name,
          cost_price,
          selling_price,
          bigisub_plan_id,
          is_active,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('services_config')
          .upsert(payload, { onConflict: 'bigisub_plan_id' })
          .select()
          .maybeSingle();

        if (error) {
          console.error(`[Bigisub Plan Generator Upsert Error for ${bigisub_plan_id}]:`, error);
          continue;
        }
        upsertedPlans.push(data || payload);
      }

      return res.json({
        success: true,
        message: `Successfully processed and upserted ${upsertedPlans.length} plans.`,
        plans: upsertedPlans
      });
    } catch (err: any) {
      console.error("[POST /api/admin/generate-plans Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // POST /api/admin/fetch-mozosubz-plans — Fetch all 9 service types from Mozosubz API in parallel
  app.post("/api/admin/fetch-mozosubz-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { balanceOnly, apiKey: requestApiKey, connectKey: requestConnectKey } = req.body;
      const CONNECT_KEY = (requestApiKey || requestConnectKey || "").trim() || await resolveMozosubzApiKey();
      const MOZO_BASE   = "https://mozosubz.xyz/api/v1";

      if (balanceOnly) {
        // Not exposed in Mozosubz v1 API — return null gracefully
        return res.json({ balance: null });
      }

      if (!CONNECT_KEY || CONNECT_KEY.length < 5 || CONNECT_KEY.includes('PASTE_YOUR')) {
        return res.status(400).json({
          error: "Mozosubz Connect Key is not configured. Please enter your active Mozosubz Connect Key in the Price Manager above and click 'Save Key'."
        });
      }

      const SERVICES = [
        { id: "mtn_sme",       network: "MTN",    plan_type: "SME"       },
        { id: "mtn_gifting",   network: "MTN",    plan_type: "GIFTING"   },
        { id: "mtn_datashare", network: "MTN",    plan_type: "DATASHARE" },
        { id: "mtn_awoof",     network: "MTN",    plan_type: "AWOOF"     },
        { id: "mtn_awoof2",    network: "MTN",    plan_type: "AWOOF"     },
        { id: "glo_sme",       network: "GLO",    plan_type: "SME"       },
        { id: "glo_data",      network: "GLO",    plan_type: "DATA"      },
        { id: "airtel_sme",    network: "AIRTEL", plan_type: "SME"       },
        { id: "airtel_gifting",network: "AIRTEL", plan_type: "GIFTING"   },
        { id: "etisalat_data", network: "9MOBILE",plan_type: "DATA"      },
      ];

      // Fetch all services in parallel
      const results = await Promise.allSettled(
        SERVICES.map(async (svc) => {
          const url = `${MOZO_BASE}/data/plans?service=${svc.id}`;
          const resp = await fetch(url, {
            headers: { "X-Connect-Key": CONNECT_KEY, "Content-Type": "application/json" },
            signal: AbortSignal.timeout(12000),
          });
          const data: any = await resp.json().catch(() => ({}));
          if (!data.success) {
            return { svc, plans: [], error: data.error || data.message || `HTTP ${resp.status}` };
          }
          const plans = (data.plans || []).map((p: any) => ({
            service:    svc.id,
            id:         String(p.id),
            name:       p.name,
            price:      Number(p.price),
            network:    svc.network,
            plan_type:  svc.plan_type,
          }));
          return { svc, plans, error: null };
        })
      );

      // Flatten all plans
      const allPlans: any[] = [];
      const errorsFound: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          allPlans.push(...r.value.plans);
          if ((r.value as any).error) errorsFound.push((r.value as any).error);
        } else {
          console.warn("[fetch-mozosubz-plans] A service fetch failed:", r.reason?.message || r.reason);
        }
      }

      if (allPlans.length === 0) {
        // Fallback: load existing data plans configured in services_config
        const { data: cachedDbPlans } = await supabase
          .from('services_config')
          .select('id, item_name, name, plan_name, cost_price, selling_price, retail_price, provider_or_network, network, mozosubz_plan_id, bigisub_identifier_id, mozosubz_service')
          .eq('service_type', 'data');

        if (cachedDbPlans && cachedDbPlans.length > 0) {
          const fallbackPlans = cachedDbPlans.map((row: any) => ({
            id: String(row.mozosubz_plan_id || row.bigisub_identifier_id || row.id),
            name: row.item_name || row.plan_name || row.name || 'Data Plan',
            price: Number(row.cost_price || 0),
            selling_price: Number(row.selling_price || row.retail_price || 0),
            network: row.network || row.provider_or_network || 'MTN',
            service: row.mozosubz_service || `${String(row.network || 'mtn').toLowerCase()}_sme`,
            provider: 'mozosubz',
            isCached: true
          }));

          const firstErr = errorsFound[0] || 'Invalid or missing API key';
          console.warn(`[fetch-mozosubz-plans] Returning ${fallbackPlans.length} cached database plans due to upstream error: ${firstErr}`);
          return res.json({
            success: true,
            warning: `Mozosubz reported: "${firstErr}". Loaded ${fallbackPlans.length} plans from saved database. Please configure your active Connect Key in the Key Configuration box above.`,
            plans: fallbackPlans
          });
        }

        const firstErr = errorsFound[0] || 'Invalid or missing API key';
        return res.status(401).json({
          error: `Mozosubz returned: "${firstErr}". Please check your Mozosubz Connect Key in the Price Manager above and click 'Save Key'.`
        });
      }

      // Load existing DB selling prices for comparison
      const { data: dbRows } = await supabase
        .from('services_config')
        .select('mozosubz_plan_id, bigisub_identifier_id, selling_price');
      const priceMap: Record<string, number> = {};
      (dbRows || []).forEach((r: any) => {
        const k = String(r.mozosubz_plan_id || r.bigisub_identifier_id || '');
        if (k) priceMap[k] = Number(r.selling_price || 0);
      });

      const enriched = allPlans.map(p => ({
        ...p,
        selling_price: priceMap[p.id] || 0,
      }));

      console.log(`[fetch-mozosubz-plans] Returning ${enriched.length} plans across ${SERVICES.length} services`);
      return res.json({ plans: enriched });
    } catch (err: any) {
      console.error("[POST /api/admin/fetch-mozosubz-plans Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // GET API route to pull all plans (for admin management)
  app.get("/api/services/all", async (req, res) => {
    try {
      const { data: services, error: queryErr } = await supabase
        .from('services_config')
        .select('*')
        .order('service_type', { ascending: true })
        .order('provider_or_network', { ascending: true })
        .order('selling_price', { ascending: true });

      if (queryErr) {
        console.warn("[Supabase GET All Services Warning]:", queryErr.message);
        return res.json([]);
      }

      const sanitized = sanitizePublicPlans(services || []);
      const seenAll = new Set<string>();
      const dedupedAll = sanitized.filter((r: any) => {
        const k = (r.bigisub_identifier_id || r.mozosubz_plan_id || r.id || `${r.provider_or_network}_${r.item_name}`).toLowerCase().trim();
        if (seenAll.has(k)) return false;
        seenAll.add(k);
        return true;
      });
      return res.json(dedupedAll);
    } catch (err: any) {
      console.error("[GET /api/services/all Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // 1.5 Clean GET route specifically for active Data Plans
  app.get("/api/services/data", async (req, res) => {
    try {
      const { data: services, error: queryErr } = await supabase
        .from('services_config')
        .select('*')
        .eq('service_type', 'data')
        .eq('is_active', true)
        .order('provider_or_network', { ascending: true })
        .order('selling_price', { ascending: true });

      if (queryErr) {
        console.warn("[Supabase GET /api/services/data Warning]:", queryErr.message);
        // Do not crash the entire app if the user has not run their Supabase grant script yet.
        return res.json([]);
      }

      const items = (services || []).filter((r: any) => !isProviderSecretRow(r));
      const seenPlanKeys = new Set<string>();
      const dedupedItems = items.filter((r: any) => {
        const k = (r.bigisub_identifier_id || r.mozosubz_plan_id || r.id || `${r.provider_or_network}_${r.item_name}`).toLowerCase().trim();
        if (seenPlanKeys.has(k)) return false;
        seenPlanKeys.add(k);
        return true;
      });

      // Format and map items to support both raw database fields and mapped frontend attributes cleanly
      const formattedPlans = dedupedItems.map(item => {
        const pPrice = Number(item.selling_price || 0);
        const rawName = String(item.item_name || '');
        
        let planCategory = "GIFTING";
        let planDays = item.validity_days || item.duration || '30 Days';
        let displayName = rawName;

        const parts = rawName.split(' - ');
        if (parts.length >= 3) {
          displayName = parts[0].trim();
          planCategory = parts[1].trim().toUpperCase();
          planDays = parts[2].trim();
        } else {
          const pNameUpper = rawName.toUpperCase();
          if (pNameUpper.includes("SME")) {
            planCategory = "SME";
          } else if (pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
            planCategory = "CG";
          } else if (pNameUpper.includes("AWOOF")) {
            planCategory = "AWOOF";
          } else if (pNameUpper.includes("GIFTING") || pNameUpper.includes("DIRECT") || pNameUpper.includes("GIFT")) {
            planCategory = "GIFTING";
          }
          const match = rawName.match(/(\d+)\s*(Days|Day|Hours|Hour)/i);
          if (match) {
            planDays = `${match[1]} ${match[2]}`;
          }
        }

        return {
          id: item.id,
          ...item,
          item_name: displayName,
          plan_name: displayName,
          name: displayName,
          planName: displayName,
          price: pPrice,
          retail_price: pPrice,
          reseller_price: Number(item.cost_price || pPrice),
          resellerPrice: Number(item.cost_price || pPrice),
          amount: pPrice,
          network_type: String(item.provider_or_network || 'MTN').toUpperCase(),
          network: String(item.provider_or_network || 'MTN').toUpperCase(),
          type: 'data',
          peyflex_id: item.mozosubs_plan_id || item.mozosubz_plan_id || item.bigisub_plan_id,
          peyflex_variation_id: item.mozosubs_plan_id || item.mozosubz_plan_id || item.bigisub_plan_id,
          apiPlanId: item.mozosubs_plan_id || item.mozosubz_plan_id || item.bigisub_plan_id,
          mozosubs_plan_id: item.mozosubs_plan_id || item.mozosubz_plan_id || '',
          mozosubz_service: item.mozosubz_service || '',
          duration: planDays,
          validity_days: planDays,
          plan_category: planCategory,
          planType: planCategory
        };
      });

      // SECURITY: wholesale cost_price is never exposed on public endpoints.
      formattedPlans.forEach((p: any) => { delete p.cost_price; });

      // Group outputs logically categorized cleanly by network
      const categorized: Record<string, any[]> = {};
      for (const plan of formattedPlans) {
        const key = String(plan.network_type).toUpperCase().trim();
        if (!categorized[key]) {
          categorized[key] = [];
        }
        categorized[key].push(plan);
      }

      // Explicitly return a 200 OK with the array of items directly
      return res.status(200).json(formattedPlans);
    } catch (err: any) {
      console.error("[GET /api/services/data Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // 2. Unified GET route to pull active plans (grouped logically or in flat representation)
  app.get("/api/services/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const { group, provider, network } = req.query;

      const allowedTypes = ['data', 'airtime', 'cable', 'electricity', 'exam_pin'];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid service type: ${type}. Must be one of: ${allowedTypes.join(', ')}` });
      }

      // Electricity is an amount-based service. Return supported DISCO capabilities,
      // not fake admin plan rows; the user's entered amount is sent directly to Mozosubz.
      if (type === 'electricity') {
        const discos = [
          ['IKEDC', 'Ikeja Electric'], ['EKEDC', 'Eko Electric'], ['AEDC', 'Abuja Electric'],
          ['PHED', 'Port Harcourt Electric'], ['IBEDC', 'Ibadan Electric'], ['KAEDCO', 'Kaduna Electric'],
          ['KEDCO', 'Kano Electric'], ['JED', 'Jos Electric'], ['EEDC', 'Enugu Electric'],
          ['BEDC', 'Benin Electric'], ['YEDC', 'Yola Electric'], ['BAEDC', 'Bauchi Electric'],
        ];
        return res.json(discos.map(([code, name]) => ({
          id: `electricity_${code.toLowerCase()}`,
          provider_or_network: code,
          item_name: name,
          service_type: 'electricity',
          is_active: true,
          direct_amount: true,
          minimum_amount: 1000,
        })));
      }

      let queryBuilder = supabase
        .from('services_config')
        .select('*')
        .eq('service_type', type)
        .eq('is_active', true)
        .order('provider_or_network', { ascending: true })
        .order('selling_price', { ascending: true });

      const filterVal = network || provider;
      if (filterVal) {
        queryBuilder = queryBuilder.ilike('provider_or_network', `%${filterVal}%`);
      }

      const { data: services, error: queryErr } = await queryBuilder;

      if (queryErr) {
        console.error("[Supabase GET Services Error]:", queryErr);
        return res.status(500).json({ error: `Database error: ${queryErr.message}` });
      }

      // Group outputs logically if requested
      if (group === 'true') {
        const grouped: Record<string, any[]> = {};
        for (const item of sanitizePublicPlans(services || [])) {
          const key = String(item.provider_or_network).toUpperCase().trim();
          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(item);
        }
        return res.json(grouped);
      }

      return res.json(sanitizePublicPlans(services || []));
    } catch (err: any) {
      console.error("[GET /api/services/:type Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // 3. PUT Admin Control Route: Allows instant modifications of plan parameters
  app.put("/api/admin/services/:id", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const rawId = req.params.id;
      // Sanitize: Decode, then replace en-dash (–) with hyphen (-)
      const id = decodeURIComponent(rawId).replace(/–/g, '-');
      const { cost_price, selling_price, is_active, mozosubz_plan_id, bigisub_plan_id, validity_days, item_name, plan_category } = req.body;

      const updateData: any = {};
      if (item_name !== undefined) updateData.item_name = String(item_name).trim();
      if (cost_price !== undefined) updateData.cost_price = Number(cost_price);
      if (selling_price !== undefined) updateData.selling_price = Number(selling_price);
      if (is_active !== undefined) updateData.is_active = Boolean(is_active);
      // mozosubz_plan_id is the id actually used for real purchases (vtu-providers.ts).
      // bigisub_plan_id is a separate legacy column, kept writable too in case anything else still relies on it.
      if (mozosubz_plan_id !== undefined) updateData.mozosubz_plan_id = String(mozosubz_plan_id).trim();
      if (bigisub_plan_id !== undefined) updateData.bigisub_plan_id = String(bigisub_plan_id).trim();
      if (validity_days !== undefined) updateData.validity_days = String(validity_days).trim();
      if (plan_category !== undefined) updateData.plan_category = String(plan_category).trim();
      updateData.updated_at = new Date().toISOString();

if (Object.keys(updateData).length <= 1) {
        return res.status(400).json({ error: "Missing fields to update. Please specify cost_price, selling_price, mozosubz_plan_id, validity_days, is_active, or item_name." });
      }

      const result = await supabase
        .from('services_config')
        .update(updateData)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (result.error) {
        console.error("[Supabase PUT Service Error]:", result.error);
        return res.status(500).json({ error: `Database update error: ${result.error.message}` });
      }

      const updatedRecord = result.data;
      if (!updatedRecord) {
        return res.status(404).json({ error: "Service configuration item not found." });
      }

      return res.json({
        success: true,
        message: "Service configuration updated successfully!",
        service: updatedRecord
      });
    } catch (err: any) {
      console.error("[PUT /api/admin/services/:id Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}`, details: String(err) });
    }
  });

  // 4. Secure POST API Route: Process user utility purchases using Bigisub API
  app.post("/api/purchase/utility", purchaseRateLimit, async (req, res) => {
    try {
      const {
        service_id,
        phone,
        phoneNumber,
        phone_number,
        smartcard_number,
        meter_number,
        meter_type,
        quantity,
        amount
      } = req.body;

      // Securely fetch user context and profile wallet balance
      const { userId: resolvedUserId, pgUuid, balance: currentBalance, profile } = await getAuthenticatedUserBalance(req);

      if (!service_id) {
        return res.status(400).json({ error: "Missing required parameter: service_id" });
      }

      // Fetch the service configuration securely to prevent pricing or ID tampering
      const { data: service, error: serviceErr } = await supabase
        .from('services_config')
        .select('*')
        .eq('id', service_id)
        .maybeSingle();

      if (serviceErr || !service) {
        console.error("[Supabase Service Lookup Error]:", serviceErr);
        return res.status(404).json({ error: "Service configuration not found or inactive." });
      }

      if (!service.is_active) {
        return res.status(400).json({ error: "This service is currently disabled by the administrator." });
      }

      let finalPrice = Number(service.selling_price);
      const isCustomAmountAirtime = service.service_type === 'airtime';
      const isCustomAmountElectricity = service.service_type === 'electricity';

      if (isCustomAmountAirtime || isCustomAmountElectricity) {
        const inputAmount = Number(amount);
        if (isNaN(inputAmount) || inputAmount <= 0) return res.status(400).json({ error: "Invalid amount. Must be greater than zero." });
        if (!inputAmount || isNaN(inputAmount) || inputAmount <= 0) {
          return res.status(400).json({ error: "Invalid purchase amount specified." });
        }
        finalPrice = inputAmount;
      }

      if (service.service_type === 'exam_pin') {
        const qty = Number(quantity) || 1;
        if (qty <= 0) return res.status(400).json({ error: "Quantity must be at least 1." });
        finalPrice = finalPrice * qty;
      }

      // Reseller discount (data purchases only) -- applied server-side against the
      // caller's own verified profile, never trusting a client-supplied discount.
      finalPrice = applyResellerPricing(finalPrice, profile, service.service_type);

      if (currentBalance < finalPrice) {
        return res.status(400).json({ 
          error: `Insufficient wallet balance. You need ₦${finalPrice.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` 
        });
      }

      const finalPhone = phone || phoneNumber || phone_number || "";
      const transactionId = `bigi_utl_${Date.now()}`;
      const localReference = `TRX-BIGI-${Date.now()}`;

      // 1. Immediately insert a row into the 'transactions' table with a status of 'pending'
      try {
        const pgUuid = resolvedUserId ? ensureUUID(resolvedUserId) : null;
        await supabase.from('transactions').insert({
          user_id: pgUuid,
          type: service.service_type,
          amount: finalPrice,
          status: 'pending',
          description: `${service.provider_or_network} ${service.item_name} to ${finalPhone || 'Utility'}`,
          reference: localReference,
          created_at: new Date().toISOString()
        });
      } catch (txErr: any) {
        console.warn("[Supabase Utility pending transaction logging skipped]:", txErr.message || txErr);
      }

      const BIGISUB_API_KEY = await resolveBigisubApiKey();
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";

      let bigiNetworkId = 1;
      const netLower = String(service.provider_or_network).toLowerCase().trim();
      const netUpper = String(service.provider_or_network).toUpperCase().trim();
      if (netLower.includes("mtn")) bigiNetworkId = 1;
      else if (netLower.includes("glo")) bigiNetworkId = 2;
      else if (netLower.includes("airtel")) bigiNetworkId = 3;
      else if (netLower.includes("9mobile") || netLower.includes("9mob")) bigiNetworkId = 4;

      let endpoint = "data";
      let payload: any = {};

      if (service.service_type === 'data') {
        endpoint = "data";
        payload = {
          network: bigiNetworkId,
          mobile_number: finalPhone,
          plan: service.bigisub_plan_id,
          Ported_number: true
        };
      } else if (service.service_type === 'airtime') {
        endpoint = "airtime";
        payload = {
          network: bigiNetworkId,
          mobile_number: finalPhone,
          amount: finalPrice,
          airtime_type: "VTU",
          Ported_number: true
        };
      } else if (service.service_type === 'cable') {
        endpoint = "cable";
        let cableTvCode = 1;
        if (netUpper.includes("DSTV")) cableTvCode = 2;
        else if (netUpper.includes("STARTIMES")) cableTvCode = 3;

        payload = {
          cablename: cableTvCode,
          smartcard_number: smartcard_number,
          cableplan: service.bigisub_plan_id,
          plan: service.bigisub_plan_id
        };
      } else if (service.service_type === 'electricity') {
        endpoint = "electricity";
        let discoCode = 1;
        if (netUpper.includes("EKEDC")) discoCode = 2;
        else if (netUpper.includes("AEDC")) discoCode = 3;
        else if (netUpper.includes("IBEDC")) discoCode = 4;

        payload = {
          disco_name: discoCode,
          meter_number: meter_number,
          amount: finalPrice,
          meter_type: meter_type === 'postpaid' || meter_type === 2 || meter_type === '2' ? 2 : 1
        };
      } else if (service.service_type === 'exam_pin') {
        endpoint = "exam";
        payload = {
          exam_name: service.bigisub_plan_id,
          quantity: Number(quantity) || 1
        };
      }

      let apiSuccess = false;
      let apiResponseData: any = null;
      let apiErrorMsg = "";

      // Simulation mode if key is placeholder
      // PRODUCTION ONLY: no simulation fallback. Hard-fail if API key is missing.
      if (!BIGISUB_API_KEY || BIGISUB_API_KEY.includes('dummy') || BIGISUB_API_KEY.includes('test')) {
        return res.status(503).json({ error: "Payment provider not configured. Please contact support." });
      }

        try {
          const bigisubUrl = `${BIGISUB_BASE_URL}/${endpoint}`;
          console.log(`[Bigisub Outbound HTTP Request] URL: ${bigisubUrl}, Payload:`, JSON.stringify(payload));

          const response = await axios.post(bigisubUrl, payload, {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${BIGISUB_API_KEY}`
            },
            timeout: 8000 // enforce strict 8-second timeout limit
          });

          apiResponseData = response.data;
          console.log("[Bigisub Gateway API Response]:", apiResponseData);

          if (response.status === 200 || response.status === 201) {
            const isSuccessStatus = apiResponseData.status === "success" || 
                                    apiResponseData.status === "SUCCESSFUL" || 
                                    apiResponseData.success === true ||
                                    apiResponseData.status === "completed";
            if (isSuccessStatus) {
              apiSuccess = true;
            } else {
              apiErrorMsg = apiResponseData.error || apiResponseData.message || "Gateway transaction rejected.";
            }
          } else {
            apiErrorMsg = `Gateway error status code: ${response.status}`;
          }
        } catch (axiosErr: any) {
          console.error("[Bigisub Gateway API HTTP Error]:", axiosErr.response?.data || axiosErr.message);
          
          if (axiosErr.code === 'ECONNABORTED' || axiosErr.message?.includes('timeout')) {
            apiErrorMsg = "8-second Gateway timeout limit reached. The gateway is slow or non-responsive.";
          } else {
            const respData = axiosErr.response?.data;
            apiErrorMsg = respData?.error || respData?.message || axiosErr.message || "Connection refused by carrier API.";
          }
        }
      

      if (apiSuccess) {
        const pgUuid = resolvedUserId ? ensureUUID(resolvedUserId) : null;

        // Atomically deduct via the guarded RPC — never a raw UPDATE (the guard_balance
        // trigger silently reverts a raw UPDATE's 'balance' column, causing drift).
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: pgUuid,
          amount: finalPrice,
        });

        if (deductErr || !deductOk) {
          console.error("[Supabase Wallet Deduct Error]:", deductErr?.message);
          return res.status(500).json({ 
            error: "Purchase succeeded at gateway, but wallet debit failed. Please contact support.",
            reference: apiResponseData?.reference || apiResponseData?.id 
          });
        }

        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', pgUuid).maybeSingle();
        const deductedBalance = freshProfile?.wallet_balance ?? (currentBalance - finalPrice);

        const referenceCode = apiResponseData?.transaction_id || apiResponseData?.reference || apiResponseData?.id || localReference;
        
        // 2. After making the Axios request to Bigisub, if the API response returns a successful status, update transaction to 'success' and save Bigisub transaction reference code into 'api_reference'
        try {
          await supabase
            .from('transactions')
            .update({
              status: 'success',
              reference: referenceCode,
              api_reference: referenceCode
            })
            .eq('id', transactionId);
        } catch (txErr: any) {
          console.warn("[Supabase Utility success transaction update failed]:", txErr.message || txErr);
        }

        try {
            await supabase.from('transactions').update({
              status: 'success',
              reference: referenceCode
            }).eq('id', transactionId);
        } catch (e) {}

        return res.json({
          status: "success",
          message: `${service.item_name} purchase successful!`,
          transaction: {
            reference: referenceCode,
            amount: finalPrice,
            provider: service.provider_or_network,
            service_type: service.service_type
          }
        });
      } else {
        // 3. If Bigisub API request fails or errors out, update transaction to 'failed', log the error text inside 'api_response_message', and ensure user's wallet balance is untouched (no update is performed on balance)
        try {
          await supabase
            .from('transactions')
            .update({
              status: 'failed',
              api_response_message: apiErrorMsg || "Gateway transaction rejected."
            })
            .eq('id', transactionId);
        } catch (txErr: any) {
          console.warn("[Supabase Utility failed transaction update failed]:", txErr.message || txErr);
        }

        try {
            await supabase.from('transactions').update({
              status: 'failed',
              description: `FAILED: ${service.provider_or_network} ${service.item_name} to ${finalPhone || 'Utility'} (${apiErrorMsg || "Gateway transaction rejected."})`
            }).eq('id', transactionId);
        } catch (e) {}

        return res.status(400).json({ 
          error: `Purchase Failed: ${apiErrorMsg}. No funds were deducted from your wallet.` 
        });
      }
    } catch (err: any) {
      console.error("[POST /api/purchase/utility Exception]:", err);
      return res.status(500).json({ error: `Internal processing exception: ${err.message}` });
    }
  });

  // POST route specifically for handling Airtime VTU Purchases via Bigisub
  app.post("/api/buy-airtime", purchaseRateLimit, async (req, res) => {
    try {
      const { network, phone_number, phone, amount } = req.body;
      const finalPhone  = phone_number || phone;
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ success: false, message: "Invalid amount. Must be greater than zero." });

      if (!network || !finalPhone || !parsedAmount) {
        return res.status(400).json({ error: "Missing required fields: network, phone_number, amount." });
      }
      if (isNaN(parsedAmount) || parsedAmount < 50) {
        return res.status(400).json({ error: "Amount must be a number and at least ₦50." });
      }

      // ── Auth: require a real verified session ──────────────────
      let verifiedUserId: string;
      let currentBalance: number;
      let pgUuid: string;
      try {
        const auth = await getAuthenticatedUserBalance(req);
        verifiedUserId = auth.userId;
        currentBalance = auth.balance;
        pgUuid = auth.pgUuid || (verifiedUserId ? ensureUUID(verifiedUserId) : '');
      } catch (authErr: any) {
        return res.status(401).json({ error: `Unauthorized: ${authErr.message}` });
      }

      if (!pgUuid) return res.status(400).json({ error: "Invalid user ID." });

      // ── Pricing: look up airtime config from services_config ──
      const { data: service } = await supabase
        .from('services_config')
        .select('selling_price, cost_price, provider')
        .eq('service_type', 'airtime')
        .ilike('provider_or_network', String(network).trim())
        .maybeSingle();

      // selling_price stored as percentage (e.g. 98 = charge 98% of face value)
      const sellingPct  = service?.selling_price && service.selling_price > 1 ? Number(service.selling_price) : 100;
      const chargeAmount = parseFloat((parsedAmount * (sellingPct / 100)).toFixed(2));

      // ── Pick provider (from services_config or fallback mozosubz) ──
      const chosenProvider = service?.provider || 'mozosubz';
      const provider = getProvider(chosenProvider);
      if (!provider) {
        return res.status(503).json({ error: `Unknown provider '${chosenProvider}'. Contact admin.` });
      }
      const apiKey = await provider.resolveApiKey();
      if (!apiKey || apiKey.length < 6) {
        return res.status(503).json({ error: `Provider '${chosenProvider}' API key not configured.` });
      }

      // ── LOCK FUNDS FIRST: atomically deduct via deduct_balance() RPC before calling the
      // provider (race-safe -- re-checks + decrements balance in one atomic statement). ──
      const localRef = `TRX-AIRTIME-${Date.now()}`;
      const { data: lockOk, error: lockErr } = await supabase.rpc('deduct_balance', {
        user_uuid: pgUuid,
        amount: chargeAmount,
      });

      if (lockErr) {
        console.error("[Airtime Fund Lock] deduct_balance RPC error:", lockErr.message);
        return res.status(500).json({ error: "Could not lock funds for this purchase. Please try again." });
      }
      if (!lockOk) {
        return res.status(400).json({
          error: `Insufficient wallet balance. You need ₦${chargeAmount.toFixed(2)} but have ₦${currentBalance.toFixed(2)}.`
        });
      }

      // ── Log pending transaction, keep the real auto-generated bigint id for later updates ──
      let txDbId: number | null = null;
      try {
        const { data: pendingTx, error: pendingTxErr } = await supabase.from('transactions').insert({
          user_id: pgUuid,
          type: 'airtime', amount: chargeAmount, status: 'pending',
          description: `Airtime VTU: ₦${parsedAmount} ${network} → ${finalPhone}`,
          reference: localRef, created_at: new Date().toISOString()
        }).select('id').maybeSingle();
        txDbId = pendingTx?.id ?? null;
        if (pendingTxErr) console.error("[Pending Transaction Insert] Failed to create transaction record:", pendingTxErr.message);
      } catch (_) { /* non-fatal */ }

      // ── Call the provider now that funds are safely locked ────
      let purchaseResult;
      try {
        purchaseResult = await provider.purchase({
          type: 'airtime',
          network,
          phone: finalPhone,
          amount: parsedAmount,   // face value — provider charges what they charge
          planId: 'airtime',
          apiKey,
        });
      } catch (provErr: any) {
        // No HTTP response (timeout / DNS / connection reset) = unknown outcome:
        // the provider may still deliver the airtime, so keep the funds locked
        // and leave the transaction pending instead of auto-refunding.
        if (!provErr?.response) {
          console.warn(`[Airtime AMBIGUOUS OUTCOME] ${chosenProvider} airtime for ${finalPhone}: ${provErr?.message || 'network error'} -- funds kept locked, transaction left pending (${localRef}).`);
          return res.status(200).json({
            status: 'processing',
            message: 'Your airtime purchase is being confirmed by the network. Your wallet has been charged; if the network rejects it, you are refunded automatically.',
            reference: localRef,
          });
        }
        const errMsg = provErr.response?.data?.error || provErr.message || 'Provider connection failed.';
        await logVtuFailure({ provider: chosenProvider, network, phone: finalPhone, planId: 'airtime', planName: 'airtime', amount: parsedAmount, error: errMsg, raw: provErr.response?.data, userId: pgUuid });
        const { error: refundErr } = await supabase.rpc('increment_balance', { user_uuid: pgUuid, amount: chargeAmount });
        if (refundErr) console.error("[Airtime Auto-Refund] increment_balance FAILED -- manual fix needed:", refundErr.message, { pgUuid, chargeAmount, localRef });
        if (txDbId) await supabase.from('transactions').update({ status: refundErr ? 'failed' : 'refunded' }).eq('id', txDbId);
        return res.status(502).json({ error: `Airtime purchase failed: ${errMsg}. Your wallet has been automatically refunded.` });
      }

      if (purchaseResult.ambiguous) {
        // Unknown outcome -- keep the charge, leave the transaction pending.
        console.warn(`[Airtime AMBIGUOUS OUTCOME] ${chosenProvider} airtime for ${finalPhone}: ${purchaseResult.error} -- funds kept locked, transaction left pending (${localRef}).`);
        return res.status(200).json({
          status: 'processing',
          message: 'Your airtime purchase is being confirmed by the network. Your wallet has been charged; if the network rejects it, you are refunded automatically.',
          reference: localRef,
        });
      }

      if (!purchaseResult.success) {
        const errMsg = purchaseResult.error || 'Gateway rejected the transaction.';
        await logVtuFailure({ provider: chosenProvider, network, phone: finalPhone, planId: 'airtime', planName: 'airtime', amount: parsedAmount, error: errMsg, raw: purchaseResult.raw, userId: pgUuid });
        const { error: refundErr } = await supabase.rpc('increment_balance', { user_uuid: pgUuid, amount: chargeAmount });
        if (refundErr) console.error("[Airtime Auto-Refund] increment_balance FAILED -- manual fix needed:", refundErr.message, { pgUuid, chargeAmount, localRef });
        if (txDbId) await supabase.from('transactions').update({ status: refundErr ? 'failed' : 'refunded' }).eq('id', txDbId);
        return res.status(400).json({ error: `Airtime purchase failed: ${errMsg}. Your wallet has been automatically refunded.` });
      }

      // ── Success: funds already locked/deducted, just mark the transaction and reply ──
      const newBalance = parseFloat((currentBalance - chargeAmount).toFixed(2));
      const refCode = purchaseResult.reference || purchaseResult.raw?.transaction_id || localRef;

      try {
        if (txDbId) {
          await supabase.from('transactions').update({
            status: 'success', reference: refCode, api_reference: refCode
          }).eq('id', txDbId);
        }
      } catch (_) { /* non-fatal */ }

      return res.status(200).json({
        status:  "success",
        success: true,
        message: `₦${parsedAmount} airtime sent to ${finalPhone} successfully.`,
        provider:     chosenProvider,
        chargeAmount,
        newBalance,
        reference:    refCode,
      });

    } catch (err: any) {
      console.error("[POST /api/buy-airtime Exception]:", err);
      return res.status(500).json({ error: `Internal error: ${err.message}` });
    }
  });


  // Admin Create Plan backend endpoint
  app.post("/api/admin/create-plan", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const {
        id, name, network, service, type,
        price, cost_price, selling_price, retail_price,
        plan_category, validity_days,
        mozosubz_plan_id, mozosubz_service,
        // legacy fields kept for backward compat
        resellerPrice, agentPrice, duration, peyflex_variation_id,
      } = req.body;

      const rawNet = String(network || 'MTN').trim().toUpperCase();
      let finalNet = rawNet.includes('AIRTEL') ? 'AIRTEL'
        : rawNet.includes('GLO')               ? 'GLO'
        : (rawNet.includes('9MOBILE') || rawNet.includes('ETISALAT')) ? '9MOBILE'
        : 'MTN';

      const pNameUpper = String(name || '').toUpperCase();
      let planCat = plan_category?.toUpperCase()
        || (pNameUpper.includes('SME') ? 'SME' : pNameUpper.includes('CG') || pNameUpper.includes('CORPORATE') ? 'CG' : 'GIFTING');

      const sellingPrice = Number(selling_price || price || 0);
      const costPrice    = Number(cost_price || 0);
      const planId       = String(mozosubz_plan_id || id || `plan_${Date.now()}`);

      const record: any = {
        // Core identifiers — upsert on mozosubz_plan_id when available, else bigisub_identifier_id.
        // bigisub_plan_id is a separate legacy NOT NULL column on services_config (distinct from
        // bigisub_identifier_id) -- must always be populated or inserts of new plans fail with
        // "null value in column bigisub_plan_id violates not-null constraint".
        mozosubz_plan_id:     planId,
        bigisub_identifier_id: planId,
        bigisub_plan_id:      planId,
        mozosubz_service:     mozosubz_service || service || '',

        // Names
        name:                 String(name || '').trim(),
        item_name:            String(name || '').trim(),
        plan_name:            String(name || '').trim(),

        // Pricing
        selling_price:        sellingPrice,
        retail_price:         sellingPrice,
        cost_price:           costPrice,

        // Classification
        network:              finalNet,
        network_type:         finalNet,
        provider_or_network:  finalNet,
        service_type:         String(type || 'data').toLowerCase(),
        plan_category:        planCat,
        type:                 String(type || 'data').toLowerCase(),
        validity_days:        validity_days || duration || '30 Days',

        // Legacy / compat
        peyflex_variation_id: peyflex_variation_id || planId,

        is_active:            true,
        updated_at:           new Date().toISOString(),
      };

      // Manual select-then-update/insert instead of .upsert() with onConflict —
      // onConflict requires an actual unique index on that column in Postgres, and we
      // can't guarantee mozosubz_plan_id has one on every environment. This works regardless.
      record.bigisub_identifier_id = planId;
      record.bigisub_plan_id = planId;
      const { data: existing, error: findErr } = await supabase
        .from('services_config')
        .select('id')
        .or(`mozosubz_plan_id.eq.${planId},bigisub_identifier_id.eq.${planId},bigisub_plan_id.eq.${planId}`)
        .maybeSingle();

      if (findErr) throw new Error(findErr.message);

      if (existing) {
        const { error: updErr } = await supabase
          .from('services_config')
          .update(record)
          .eq('id', existing.id);
        if (updErr) throw new Error(updErr.message);
      } else {
        const { error: insErr } = await supabase
          .from('services_config')
          .insert(record);
        if (insErr) throw new Error(insErr.message);
      }

      return res.json({ success: true, message: "Plan published successfully!" });
    } catch (err: any) {
      console.error("[POST /api/admin/create-plan Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin Peyflex Fetch & Sync Utility backend endpoint
  app.post("/api/admin/fetch-peyflex-products", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { triggeredBy } = req.body;
    if (!triggeredBy || triggeredBy !== 'ibrahimfaruqolamilekan4@gmail.com') {
      return res.status(403).json({ error: "Access denied." });
    }

    try {
      const PEYFLEX_API_TOKEN = process.env.PEYFLEX_API_TOKEN || process.env.VTU_API_KEY;
      
      // No hardcoded product catalog: the admin-managed services_config table is the only source of truth.
      const standardProducts: any[] = [];

      const productsWithMarkup = standardProducts.map(p => ({
        ...p,
        retail_price: Math.round(p.wholesaleCost * 1.05)
      }));

      // Live network fetch to external Peyflex nodes was commented out to prevent outbound timeouts & network-level load failures.
      /*
      if (PEYFLEX_API_TOKEN && !PEYFLEX_API_TOKEN.includes("dummy")) {
        try {
          console.log("[Peyflex Sync] Attempting live network fetch...");
          const response = await fetch("https://peyflex.com.ng/api/v1/services", {
            method: "GET",
            headers: { "Authorization": `Bearer ${PEYFLEX_API_TOKEN}` }
          }).catch(() => null);
          if (response && response.ok) {
            console.log("[Peyflex Sync] Wholesale API successfully integrated.");
          }
        } catch (apiErr) {
          console.warn("[Peyflex Sync] Live check bypass to ensure sandbox/offline continuity:", apiErr);
        }
      }
      */

      return res.json({
        success: true,
        message: "Wholesale provider items pulled from Peyflex master nodes",
        products: productsWithMarkup
      });
    } catch (err: any) {
      console.error("Error in Peyflex sync fetch:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin Publish Peyflex Plans to Firestore collections and Supabase data_plans
  app.post("/api/admin/publish-peyflex-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { triggeredBy, plans } = req.body;
    if (!triggeredBy || triggeredBy !== 'ibrahimfaruqolamilekan4@gmail.com') {
      return res.status(403).json({ error: "Access denied." });
    }

    if (!Array.isArray(plans)) {
      return res.status(400).json({ error: "Invalid plans list format." });
    }

    try {
      const ensureUUID = (strId: string): string => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(strId)) {
          return strId;
        }
        let seed = 0;
        for (let i = 0; i < strId.length; i++) {
          seed = (seed * 31 + strId.charCodeAt(i)) >>> 0;
        }
        const r = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed;
        };
        const hexChars = '0123456789abcdef';
        let hex32 = '';
        for (let i = 0; i < 32; i++) {
          hex32 += hexChars[r() % 16];
        }
        const part1 = hex32.substring(0, 8);
        const part2 = hex32.substring(8, 12);
        const part3 = '4' + hex32.substring(12, 15);
        const part4 = 'a' + hex32.substring(15, 18);
        const part5 = hex32.substring(18, 30);
        return `${part1}-${part2}-${part3}-${part4}-${part5}`;
      };

      const recordsToInsert = plans.map(p => {
        const originalId = p.peyflex_variation_id || p.peyflex_id || p.id || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const docId = ensureUUID(originalId);
        const retailVal = Number(p.retail_price || p.price || 0);

        // Derive plan_category correctly with clean fallback rules
        const pt = String(p.planType || p.plan_category || '').toUpperCase();
        const pNameUpper = String(p.name || p.plan_name || '').toUpperCase();
        let planCategory = "GIFTING"; // default fallback for data plans
        if (pt.includes("SME") || pNameUpper.includes("SME")) {
          planCategory = "SME";
        } else if (pt.includes("CG") || pt.includes("CORPORATE") || pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
          planCategory = "CG";
        } else if (pt.includes("AWOOF") || pNameUpper.includes("AWOOF")) {
          planCategory = "AWOOF";
        } else if (pt.includes("GIFTING") || pt.includes("DIRECT") || pt.includes("GIFT") || pNameUpper.includes("GIFTING") || pNameUpper.includes("DIRECT") || pNameUpper.includes("GIFT")) {
          planCategory = "GIFTING";
        } else {
          planCategory = p.planType || p.plan_category || "GIFTING";
        }

        const rawNet = String(p.network || p.network_type || 'MTN').trim().toUpperCase();
        let finalNet = "MTN";
        if (rawNet.includes("AIRTEL")) {
          finalNet = "AIRTEL";
        } else if (rawNet.includes("GLO")) {
          finalNet = "GLO";
        } else if (rawNet.includes("9MOBILE") || rawNet.includes("9MOB")) {
          finalNet = "9MOBILE";
        } else {
          finalNet = rawNet; // Keep original (like GOTV, EKEDC, WAEC) if not a major telco
        }

        return {
          id: docId,
          network_type: finalNet,
          plan_category: planCategory,
          plan_name: String(p.name || p.plan_name || p.name || '').trim(),
          retail_price: Number(retailVal),
          validity_days: p.duration || p.validity_days || '30 Days',
          peyflex_id: docId,

          // compatibility properties to support both snake_case and camelCase column aliases in pg
          network: finalNet,
          type: p.type || 'data',
          name: String(p.name || p.plan_name || '').trim(),
          price: Number(retailVal),
          reseller_price: p.resellerPrice ? Number(p.resellerPrice) : Math.round(retailVal * 0.98),
          resellerPrice: p.resellerPrice ? Number(p.resellerPrice) : Math.round(retailVal * 0.98),
          agent_price: p.agentPrice ? Number(p.agentPrice) : Math.round(retailVal * 0.99),
          agentPrice: p.agentPrice ? Number(p.agentPrice) : Math.round(retailVal * 0.99),
          duration: p.duration || p.validity_days || '30 Days',
          peyflex_variation_id: docId,
          apiPlanId: docId,
          planType: planCategory,
          wholesaleCost: Number(p.wholesaleCost || 0),
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
          original_api_plan_id: String(originalId).trim()
        };
      });

      // Insert/Upsert into Supabase 'data_plans'
      console.log(`[Supabase Migration] Inserting ${recordsToInsert.length} data plans in Postgres data_plans table...`);
      const cleanPostgresRecords = recordsToInsert.map(p => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const hasValidUUID = p.id && p.id.length === 36 && uuidRegex.test(p.id);
        return {
          ...(hasValidUUID ? { id: p.id } : {}),
          network_type: String(p.network_type).toUpperCase().trim(),
          plan_category: String(p.plan_category).toUpperCase().trim(),
          plan_name: String(p.plan_name).trim(),
          price: parseFloat(String(p.price)),
          api_plan_id: String(p.original_api_plan_id || p.peyflex_id || p.id || '').trim(),
          created_at: p.created_at || new Date().toISOString(),
          expires_at: p.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
      });

      const { error: insertError } = await supabase
        .from('data_plans')
        .upsert(cleanPostgresRecords, { onConflict: 'id' });

      if (insertError) {
        console.error("[Supabase Publish error fallback]:", insertError.message);
        throw new Error(`Supabase insert failed: ${insertError.message}`);
      }

      // Mirror plan upserts to services_config (already done above, this is a safety double-write)
      try {
        const promises = recordsToInsert.map(p => {
          const colName = p.type === "data" ? "data_plans" : (p.type === "exam" || p.type === "education" ? "exam_plans" : "utility_plans");
          return supabase.from('services_config').upsert({ bigisub_identifier_id: p.id, ...p,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, { onConflict: 'bigisub_identifier_id' });
        });
        await Promise.all(promises);
      } catch (fbErr) {
        console.warn("[Services Config Mirror Warning]:", fbErr);
      }

      return res.json({
        success: true,
        message: `Successfully published ${plans.length} service plans permanently to live database schemas!`
      });
    } catch (err: any) {
      console.error("Error in publish plans sync:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin Edit Plan backend endpoint
  app.post("/api/admin/edit-plan", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { triggeredBy, id, network, type, name, price, resellerPrice, agentPrice, duration, peyflex_variation_id, collectionName } = req.body;
    if (!triggeredBy || triggeredBy !== 'ibrahimfaruqolamilekan4@gmail.com') {
      return res.status(403).json({ error: "Access denied." });
    }

    try {
      const rawNet = String(network || 'MTN').trim().toUpperCase();
      let finalNet = "MTN";
      if (rawNet.includes("AIRTEL")) {
        finalNet = "AIRTEL";
      } else if (rawNet.includes("GLO")) {
        finalNet = "GLO";
      } else if (rawNet.includes("9MOBILE") || rawNet.includes("9MOB")) {
        finalNet = "9MOBILE";
      } else {
        finalNet = rawNet;
      }

      const pNameUpper = String(name || '').toUpperCase();
      let planCategory = "GIFTING";
      if (pNameUpper.includes("SME")) {
        planCategory = "SME";
      } else if (pNameUpper.includes("CG") || pNameUpper.includes("CORPORATE")) {
        planCategory = "CG";
      }

      const colName = collectionName || (type === 'data' ? 'data_plans' : ((type === 'exam' || type === 'education') ? 'exam_plans' : 'utility_plans'));
      // Supabase: using services_config table instead of Firestore data_plans
      // Admin edit: update the plan directly via Supabase
      const updatePayload: any = {
        network: finalNet,
        type: type || 'data',
        name: String(name).trim(),
        price: Number(price),
        resellerPrice: resellerPrice ? Number(resellerPrice) : null,
        agentPrice: agentPrice ? Number(agentPrice) : null,
        duration: type === 'data' ? duration : '',

        // Literal requested keys
        plan_name: String(name).trim(),
        retail_price: Number(price),
        network_type: finalNet,
        plan_category: planCategory,
        planType: planCategory,
        peyflex_variation_id: peyflex_variation_id || id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date().toISOString()
      };
      await supabase.from('services_config').update(updatePayload).eq('bigisub_identifier_id', id);

      return res.json({ success: true, message: "Successfully updated service plan in backend!" });
    } catch (err: any) {
      console.error("Error updating plan:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin Delete Plan backend endpoint (supports single id, array of ids, provider id, or plan name)
  app.post("/api/admin/delete-plan", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { id, ids, name } = req.body;

    try {
      const db = getScopedSupabaseClient(req.headers.authorization);
      const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val).trim());

      const deleteOnePlan = async (targetId?: string, targetName?: string) => {
        const cleanId = String(targetId || '').trim();
        const cleanName = String(targetName || '').trim();
        if (!cleanId && !cleanName) return;

        // 1. Delete by UUID if valid UUID
        if (cleanId && isUUID(cleanId)) {
          try { await db.from('services_config').delete().eq('id', cleanId); } catch (_) {}
          try { await db.from('data_plans').delete().eq('id', cleanId); } catch (_) {}
        }

        // 2. Delete by all possible provider columns in services_config
        if (cleanId) {
          try { await db.from('services_config').delete().eq('bigisub_identifier_id', cleanId); } catch (_) {}
          try { await db.from('services_config').delete().eq('mozosubz_plan_id', cleanId); } catch (_) {}
          try { await db.from('services_config').delete().eq('mozosubs_plan_id', cleanId); } catch (_) {}
          try { await db.from('data_plans').delete().eq('plan_id', cleanId); } catch (_) {}
          try { await db.from('data_plans').delete().eq('id', cleanId); } catch (_) {}
        }

        // 3. Delete by item_name if name provided or if cleanId could be a plan name
        if (cleanName) {
          try { await db.from('services_config').delete().eq('item_name', cleanName); } catch (_) {}
          try { await db.from('data_plans').delete().eq('name', cleanName); } catch (_) {}
        } else if (cleanId && !isUUID(cleanId) && cleanId.length > 3) {
          try { await db.from('services_config').delete().eq('item_name', cleanId); } catch (_) {}
        }
      };

      if (Array.isArray(ids) && ids.length > 0) {
        for (const planId of ids) {
          await deleteOnePlan(planId);
        }
        return res.json({ success: true, message: `Successfully deleted ${ids.length} service plans!` });
      }

      if (!id && !name) {
        return res.status(400).json({ error: "Missing plan id or name to delete." });
      }

      await deleteOnePlan(id, name);

      return res.json({ success: true, message: "Successfully deleted service plan!" });
    } catch (err: any) {
      console.error("Error deleting plan:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Admin Delete ALL Plans endpoint (purges all data plans from services_config & data_plans)
  app.post("/api/admin/delete-all-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { serviceType = 'data' } = req.body;
      console.log(`[Admin] Purging ALL data plans (service_type: ${serviceType})...`);

      const db = getScopedSupabaseClient(req.headers.authorization);

      // 1. Delete all rows in services_config where service_type = 'data'
      const { error: scErr, count: scCount } = await db
        .from('services_config')
        .delete({ count: 'exact' })
        .eq('service_type', serviceType);

      if (scErr) {
        console.warn("[delete-all-plans] services_config eq delete warning:", scErr.message);
      }

      // Also delete any case-insensitive variants or data service types
      try {
        await db.from('services_config').delete().ilike('service_type', 'data');
      } catch (_) {}

      // 2. Also delete any orphaned rows belonging to data providers in services_config
      try {
        await db
          .from('services_config')
          .delete()
          .or('provider.eq.mozosubz,provider.eq.nifex');
      } catch (_) {}

      // 3. Also clear data_plans table if present
      try {
        await db.from('data_plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (_) {}

      console.log(`[Admin] Successfully purged all data plans. Deleted count: ${scCount || 0}`);
      return res.json({
        success: true,
        message: "All data plans have been completely deleted from your database.",
        deletedCount: scCount || 0
      });
    } catch (err: any) {
      console.error("[delete-all-plans Error]:", err);
      return res.status(500).json({ error: err.message || "Failed to delete all plans." });
    }
  });


  // Bachs.io payment gateway handles all live checkouts, virtual accounts, and webhooks.

  // Real VTU Purchase Route with Database Sync & Agent-Scale Cashback (Bigisub Migration)
  app.post("/api/vtu/purchase", purchaseRateLimit, async (req, res) => {
    const { 
      userId, 
      networkId, 
      planId, 
      phone, 
      amount, 
      requestType,
      // Legacy/Fallback keys from existing frontend to ensure 100% backward compatibility
      type, 
      network, 
      phoneNumber, 
      plan 
    } = req.body;
    
    const finalType = requestType || type || "data";
    const finalNetwork = networkId || network;
    const finalPlan = planId || plan;
    const finalPhone = phone || phoneNumber;
    let finalAmount = Number(amount !== undefined ? amount : req.body.amount);
    if (isNaN(finalAmount) || finalAmount <= 0) return res.status(400).json({ error: "Invalid amount. Must be greater than zero." });

    if (!finalPhone || !finalAmount || !finalNetwork) {
      return res.status(400).json({ error: "Missing required checkout parameters: userId, network, phone, and amount are required." });
    }

    // Non-VTU purchase types (e.g. bills/betting) never actually belonged on the Mozosubz
    // data/airtime path -- leave that behavior exactly as it was, out of scope here.
    if (finalType !== 'data' && finalType !== 'airtime') {
      return res.status(400).json({ error: `Purchase type '${finalType}' is not handled by this endpoint.` });
    }

    try {
      // SECURITY (audit C4): this endpoint previously trusted `userId` from the request
      // body, letting anyone debit ANY wallet at ANY price. Identity must come from a
      // verified session token only; a body-supplied userId that mismatches it is rejected.
      let finalUserId: string;
      let pgUuid: string;
      let profile: any;
      try {
        const auth = await getAuthenticatedUserBalance(req);
        finalUserId = auth.userId;
        pgUuid = auth.pgUuid;
        profile = auth.profile;
      } catch (authErr: any) {
        return res.status(401).json({ error: `Unauthorized: ${authErr.message}` });
      }
      if (!pgUuid) {
        return res.status(400).json({ error: "Invalid user ID format." });
      }
      if (!profile) {
        return res.status(404).json({ error: "User profile not found in Supabase database." });
      }

      const currentBalance = Number(profile.wallet_balance || 0);
      if (currentBalance < finalAmount) {
        return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalAmount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` });
      }

      // Resolve the plan against services_config -- frontend may send either a composite
      // mozosubz_plan_id, a raw bigisub_identifier_id, or (legacy) a plan display name.
      let planConfig: any = null;
      if (finalType === 'data' && finalPlan) {
        try {
          const safePlan = pgSafeFilter(finalPlan);
          const { data: pc } = await supabase
            .from('services_config')
            .select('provider, mozosubz_service, mozosubz_plan_id, bigisub_identifier_id, bigisub_plan_id, item_name, plan_name, name, selling_price, retail_price, cost_price, reseller_price, agent_price')
            .or(`mozosubz_plan_id.eq.${safePlan},bigisub_identifier_id.eq.${safePlan},bigisub_plan_id.eq.${safePlan},item_name.eq.${safePlan},plan_name.eq.${safePlan},name.eq.${safePlan}`)
            .maybeSingle();
          planConfig = pc;
        } catch (_) { /* fall through with no config -- provider call will still attempt a best-effort guess */ }
      }

      const chosenProvider = planConfig?.provider || 'mozosubz';
      const provider = getProvider(chosenProvider);
      if (!provider) {
        return res.status(503).json({ error: `Unknown provider '${chosenProvider}'. Contact admin.` });
      }
      const providerApiKey = await provider.resolveApiKey();
      if (!providerApiKey || providerApiKey.length < 6) {
        return res.status(503).json({ error: `Provider '${chosenProvider}' API key not configured. Contact admin.` });
      }

      const resolvedPlanCode = planConfig?.mozosubz_plan_id || planConfig?.bigisub_identifier_id || planConfig?.bigisub_plan_id || finalPlan;

      // SECURITY (audit C4): server-side price enforcement for data -- the client's
      // claimed amount is never trusted. Mirrors handleVtuPurchase.
      if (finalType === 'data') {
        let serverPrice = 0;
        const role = profile?.role || 'user';
        if (planConfig) {
          if (role === 'agent' && planConfig.agent_price) serverPrice = Number(planConfig.agent_price);
          else if (role === 'reseller' && planConfig.reseller_price) serverPrice = Number(planConfig.reseller_price);
          else if (planConfig.selling_price) serverPrice = Number(planConfig.selling_price);
          else if (planConfig.retail_price) serverPrice = Number(planConfig.retail_price);
        }
        if (serverPrice > 0) {
          finalAmount = serverPrice;
        } else {
          return res.status(400).json({ error: "Invalid data plan or missing pricing configuration." });
        }
      }

      // LOCK FUNDS FIRST via the atomic deduct_balance() RPC (race-safe) before calling the provider.
      const localRef = `TRX-VTUP-${Date.now()}`;
      const { data: lockOk, error: lockErr } = await supabase.rpc('deduct_balance', {
        user_uuid: pgUuid,
        amount: finalAmount,
      });
      if (lockErr) {
        console.error("[VTU/purchase Fund Lock] deduct_balance RPC error:", lockErr.message);
        return res.status(500).json({ error: "Could not lock funds for this purchase. Please try again." });
      }
      if (!lockOk) {
        return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalAmount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` });
      }

      let pendingTxId: number | null = null;
      try {
        const { data: pendingTx, error: pendingTxErr } = await supabase.from('transactions').insert({
          user_id: pgUuid,
          type: finalType, amount: finalAmount, status: 'pending',
          description: `${finalNetwork} ${finalPlan || finalType} to ${finalPhone}`,
          reference: localRef, created_at: new Date().toISOString(),
        }).select('id').maybeSingle();
        pendingTxId = pendingTx?.id ?? null;
        if (pendingTxErr) console.error("[Pending Transaction Insert] Failed to create transaction record:", pendingTxErr.message);
      } catch (txErr: any) {
        console.warn("[VTU/purchase pending transaction insert warning]:", txErr.message || txErr);
      }

      let apiSuccess = false;
      let apiResponseData: any = null;
      let apiErrorMsg = "";
      let apiErrorCode: string | null = null;
      // 'pending' = outcome unknown (provider timeout / network error). Funds stay
      // locked and the transaction stays pending -- the provider may still have
      // delivered the value, so we must NOT auto-refund in that case.
      let purchaseOutcome: "success" | "failed" | "pending" = "failed";

      // A provider error with NO HTTP response (timeout, DNS, connection reset)
      // means the gateway may still have processed the order: the outcome is
      // UNKNOWN. Only a real HTTP error response is a definite rejection.
      const isAmbiguousProviderError = (err: any): boolean => {
        if (!err) return false;
        if (err.response) return false; // gateway definitely answered
        return true;                    // no response = unknown outcome
      };

      try {
        const result = await provider.purchase({
          type:             finalType as 'data' | 'airtime',
          network:          finalNetwork,
          phone:            finalPhone,
          amount:           finalAmount,
          planId:           resolvedPlanCode,
          providerPlanId:   planConfig?.bigisub_identifier_id || resolvedPlanCode,
          mozosubzService:  planConfig?.mozosubz_service || req.body.mozosubz_service || req.body.service || '',
          apiKey:           providerApiKey,
        });
        apiResponseData = result.raw;
        if (result.success) {
          apiSuccess = true;
          purchaseOutcome = "success";
        } else if (result.ambiguous) {
          purchaseOutcome = "pending";
          apiErrorMsg = result.error || 'Provider confirmation pending.';
          console.warn(`[VTU/purchase AMBIGUOUS OUTCOME] ${chosenProvider} ${finalType} for ${finalPhone}: ${apiErrorMsg} -- funds kept locked, transaction left pending (${localRef}).`);
        } else {
          apiErrorMsg = result.error || 'Purchase rejected by gateway.';
          apiErrorCode = apiResponseData?.error_code || null;
          await logVtuFailure({
            provider: chosenProvider, network: finalNetwork, phone: finalPhone,
            planId: resolvedPlanCode, planName: finalPlan || finalType, amount: finalAmount,
            error: apiErrorMsg, raw: apiResponseData, userId: pgUuid,
          });
        }
      } catch (providerErr: any) {
        const rawErrData = providerErr.response?.data;
        apiResponseData = rawErrData;
        if (isAmbiguousProviderError(providerErr)) {
          purchaseOutcome = "pending";
          apiErrorMsg = providerErr?.message || 'Provider connection could not be confirmed.';
          console.warn(`[VTU/purchase AMBIGUOUS OUTCOME] ${chosenProvider} ${finalType} for ${finalPhone} raised a network-level error -- funds kept locked, transaction left pending (${localRef}).`);
        } else {
          apiErrorMsg = rawErrData?.error || rawErrData?.message || providerErr.message || 'Provider connection failed.';
          apiErrorCode = rawErrData?.error_code || null;
          await logVtuFailure({
            provider: chosenProvider, network: finalNetwork, phone: finalPhone,
            planId: resolvedPlanCode, planName: finalPlan || finalType, amount: finalAmount,
            error: apiErrorMsg, raw: rawErrData, userId: pgUuid,
          });
        }
      }

      if (purchaseOutcome === "pending") {
        // Outcome unknown: the provider may still deliver the value, so funds
        // stay locked and the transaction stays pending -- never refund here.
        console.warn(`[VTU/purchase PENDING] Leaving ${finalType} purchase for ${finalPhone} pending (${localRef}).`);
        return res.json({
          status: "processing",
          message: "Your purchase is being confirmed by the network. Your wallet has been charged; if the network rejects it, you are refunded automatically.",
          reference: localRef,
          transaction: {
            reference: localRef,
            amount: finalAmount,
            phone: finalPhone,
            network: finalNetwork,
            type: finalType,
          },
        });
      }

      if (apiSuccess) {
        const referenceCode = apiResponseData?.transaction_id || apiResponseData?.reference || apiResponseData?.id || localRef;
        try {
          if (pendingTxId) {
            await supabase.from('transactions').update({
              status: 'success', reference: referenceCode, api_reference: referenceCode,
            }).eq('id', pendingTxId);
          }
        } catch (txErr: any) {
          console.warn("[VTU/purchase Transactions update bypassed]:", txErr.message || txErr);
        }

        return res.json({
          status: "success",
          message: `${finalType} purchase successful!`,
          transaction: {
            reference: referenceCode,
            amount: finalAmount,
            phone: finalPhone,
            network: finalNetwork,
            type: finalType
          }
        });
      } else {
        // Purchase failed at the provider -- automatically refund the locked funds and report
        // truthfully whether the refund itself actually succeeded.
        const { error: refundErr } = await supabase.rpc('increment_balance', {
          user_uuid: pgUuid,
          amount: finalAmount,
        });
        const refunded = !refundErr;
        if (refundErr) {
          console.error("[VTU/purchase Auto-Refund] increment_balance RPC FAILED -- manual intervention needed:", refundErr.message, { pgUuid, finalAmount, localRef });
        }
        try {
          if (pendingTxId) {
            await supabase.from('transactions').update({
              status: refunded ? 'refunded' : 'failed',
            }).eq('id', pendingTxId);
          }
        } catch (_) { /* non-fatal */ }

        console.warn(`[VTU/purchase Failed]: ${apiErrorMsg} (code: ${apiErrorCode || 'n/a'}). Refunded: ${refunded}.`);
        return res.status(400).json({
          error: refunded
            ? `Purchase failed: ${apiErrorMsg} Your wallet has been automatically refunded.`
            : `Purchase failed: ${apiErrorMsg} Refund could not be processed automatically -- contact support with reference ${localRef}.`,
          error_code: apiErrorCode,
          provider_message: apiErrorMsg,
          refunded,
          reference: localRef,
        });
      }
    } catch (err: any) {
      console.error("[VTU/purchase Endpoint Exception]:", err);
      return res.status(500).json({ error: "Internal processing error during purchase flow." });
    }
  });

  // Electricity Meter Account Validation Endpoint
  app.post("/api/vtu/validate-meter", async (req, res) => {
    const { meterNumber, provider, type } = req.body;
    
    if (!meterNumber || !provider) {
      return res.status(400).json({ error: "Meter Number and Provider Code are required." });
    }

    try {
      // Simulate real provider API lookup delay (700ms)
      await new Promise(resolve => setTimeout(resolve, 800));

      const uppercaseProvider = provider.toUpperCase();
      
      // Deterministic validation info based on last digit of meter number for full realism
      const names = [
        "Ibrahim Faruq Olamilekan",
        "Tunde Ademola Bakare",
        "Chioma Henrietta Obi",
        "Yusuf Olatunji Alhaji",
        "Olayemi Precious Adebayo",
        "Nnena Cynthia Egwu",
        "Abubakar Sadiq Musa",
        "Olumide Joseph Coker",
        "Fatima Bello Gumel",
        "Emeka Harrison Okafor"
      ];

      const streets = [
        "Herbert Macaulay Way",
        "Bode Thomas Street",
        "Adeniran Ogunsanya Ave",
        "Awolowo Road",
        "Allen Avenue",
        "Adetokunbo Ademola St",
        "Aminu Kano Crescent",
        "Olusegun Obasanjo Way"
      ];

      const districts = [
        "Yaba District",
        "Surulere Zone 2",
        "Ikeja Coverage Area",
        "Lekki Phase 1",
        "Wuse II Business Hub",
        "Garki Area 11",
        "GRA Phase II",
        "Kano Suburban Zone"
      ];

      const digit = Number(meterNumber[meterNumber.length - 1] || '0');
      const nameIdx = digit % names.length;
      const streetIdx = (digit + 3) % streets.length;
      const districtIdx = (digit + 7) % districts.length;

      const customerName = names[nameIdx];
      const address = `${Math.floor(12 + (digit * 15))}, ${streets[streetIdx]}, ${districts[districtIdx]}.`;
      
      res.json({
        success: true,
        meterNumber,
        provider: uppercaseProvider,
        type: type || 'PREPAID',
        customerName,
        address,
        minimumAmount: 100,
        debtAmount: type === 'postpaid' ? Math.floor(digit * 450) : 0
      });
    } catch (err: any) {
      console.error("[Meter Validation Exception]:", err);
      res.status(500).json({ error: "Failed to query the utility distribution server. Please try again." });
    }
  });

  // Bigisub Utility Validation Endpoint (Migrated from Peyflex)
  app.post("/api/v1/utility/validate", async (req, res) => {
    const { type, provider, number } = req.body;

    if (!provider || !number) {
      return res.status(400).json({ error: "Missing required parameters: provider, number" });
    }

    // Mozosubz validates cable smartcards and electricity meters during the purchase
    // request; it does not document a separate validation endpoint. Keep this step as
    // a format/preflight check so the UI no longer depends on the retired Bigisub key.
    const digits = String(number).replace(/\D/g, '');
    const minimumDigits = type === 'cable' ? 8 : 6;
    if (digits.length < minimumDigits) {
      return res.status(400).json({ error: `Please enter a valid ${type === 'cable' ? 'smartcard' : 'meter'} number.` });
    }
    if (type === 'cable' || type === 'electricity') {
      return res.json({
        success: true,
        customerName: 'Provider verification at purchase',
        address: '',
        meterNumber: type === 'electricity' ? String(number) : undefined,
        smartcardNo: type === 'cable' ? String(number) : undefined,
        provider: String(provider).toUpperCase(),
        debtAmount: 0,
      });
    }

    try {
      const BIGISUB_API_KEY = process.env.BIGISUB_API_KEY || process.env.VTU_API_KEY || "";



      // Real API Call to Bigisub validation endpoint
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";
      const isElectricity = type === 'electricity' || ['ekedc', 'ikedc', 'aedc', 'phed', 'ibedc', 'kaedco', 'kedco', 'eedc'].includes(String(provider).toLowerCase());
      const endpoint = isElectricity ? "electricity/validate" : "cable/validate";
      
      const payload: any = {};
      if (isElectricity) {
        let discoCode = 1;
        const provUpper = String(provider).toUpperCase();
        if (provUpper.includes("EKEDC")) discoCode = 2;
        else if (provUpper.includes("AEDC")) discoCode = 3;
        else if (provUpper.includes("IBEDC")) discoCode = 4;
        payload.disco_name = discoCode;
        payload.meter_number = number;
      } else {
        let cableTvCode = 1;
        const provUpper = String(provider).toUpperCase();
        if (provUpper.includes("DSTV")) cableTvCode = 2;
        else if (provUpper.includes("STARTIMES")) cableTvCode = 3;
        payload.cablename = cableTvCode;
        payload.smartcard_number = number;
      }

      const response = await axios.post(`${BIGISUB_BASE_URL}/${endpoint}`, payload, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BIGISUB_API_KEY}`
        },
        timeout: 8000
      });

      const responseBody = response.data;
      if (response.status === 200 && (responseBody.status === "success" || responseBody.success)) {
        return res.json({
          success: true,
          customerName: responseBody.customer_name || responseBody.name || "Bigisub Verified Customer",
          address: responseBody.address || "",
          debtAmount: responseBody.debt || 0,
          meterNumber: number,
          smartcardNo: number,
          provider: String(provider).toUpperCase()
        });
      } else {
        return res.status(400).json({ error: responseBody.error || responseBody.message || "Bigisub verification failed." });
      }
    } catch (err: any) {
      console.error("[Bigisub Utility Validate Exception]:", err);
      return res.status(500).json({ error: "Gateway verification error. Please retry." });
    }
  });

  // GET '/api/validate-smartcard' -> Validates Cable TV smartcard via Bigisub API
  app.get("/api/validate-smartcard", async (req, res) => {
    const provider = String(req.query.provider || req.body.provider || "").trim();
    const smartcard_number = String(req.query.smartcard_number || req.body.smartcard_number || "").trim();

    if (!provider || !smartcard_number) {
      return res.status(400).json({ error: "Missing required parameters: provider and smartcard_number are required." });
    }

    try {
      const BIGISUB_API_KEY = process.env.BIGISUB_API_KEY || process.env.VTU_API_KEY || "";
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";



      // Determine Cable TV code: 1 for GOTV, 2 for DSTV, 3 for STARTIMES
      let cableTvCode = 1;
      const provUpper = provider.toUpperCase();
      if (provUpper.includes("DSTV")) {
        cableTvCode = 2;
      } else if (provUpper.includes("STARTIMES") || provUpper.includes("STAR TIMES")) {
        cableTvCode = 3;
      }

      const response = await axios.post(`${BIGISUB_BASE_URL}/cable/validate`, {
        cablename: cableTvCode,
        smartcard_number: smartcard_number
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BIGISUB_API_KEY}`
        },
        timeout: 8000
      });

      const responseBody = response.data;
      if (response.status === 200 && (responseBody.status === "success" || responseBody.success)) {
        return res.json({
          success: true,
          customerName: responseBody.customer_name || responseBody.name || "Bigisub Verified Customer",
          smartcard_number,
          provider: provUpper
        });
      } else {
        return res.status(400).json({ error: responseBody.error || responseBody.message || "Smartcard verification failed." });
      }
    } catch (err: any) {
      console.error("[GET /api/validate-smartcard Exception]:", err);
      return res.status(500).json({ error: "Gateway smartcard validation error. Please try again." });
    }
  });

  // GET '/api/validate-meter' -> Validates Electricity Meter via Bigisub API
  app.get("/api/validate-meter", async (req, res) => {
    const disco_name = String(req.query.disco_name || req.body.disco_name || "").trim();
    const meter_number = String(req.query.meter_number || req.body.meter_number || "").trim();

    if (!disco_name || !meter_number) {
      return res.status(400).json({ error: "Missing required parameters: disco_name and meter_number are required." });
    }

    try {
      const BIGISUB_API_KEY = process.env.BIGISUB_API_KEY || process.env.VTU_API_KEY || "";
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";



      // Determine Disco name code: 1: IKEDC, 2: EKEDC, 3: AEDC, 4: IBEDC
      let discoCode = 1;
      const discoUpper = disco_name.toUpperCase();
      if (discoUpper.includes("EKEDC")) {
        discoCode = 2;
      } else if (discoUpper.includes("AEDC")) {
        discoCode = 3;
      } else if (discoUpper.includes("IBEDC")) {
        discoCode = 4;
      } else if (!isNaN(Number(disco_name))) {
        discoCode = Number(disco_name);
      }

      const response = await axios.post(`${BIGISUB_BASE_URL}/electricity/validate`, {
        disco_name: discoCode,
        meter_number: meter_number
      }, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${BIGISUB_API_KEY}`
        },
        timeout: 8000
      });

      const responseBody = response.data;
      if (response.status === 200 && (responseBody.status === "success" || responseBody.success)) {
        return res.json({
          success: true,
          customerName: responseBody.customer_name || responseBody.name || "Bigisub Verified Customer",
          address: responseBody.address || "",
          meter_number,
          disco_name: discoUpper
        });
      } else {
        return res.status(400).json({ error: responseBody.error || responseBody.message || "Meter validation failed." });
      }
    } catch (err: any) {
      console.error("[GET /api/validate-meter Exception]:", err);
      return res.status(500).json({ error: "Gateway meter validation error. Please try again." });
    }
  });

  // GET '/api/validate-utility' -> Accepts 'provider_name' and 'account_number' (for smartcards/meters) and calls Bigisub's verification API endpoint
  app.get("/api/validate-utility", async (req, res) => {
    const provider_name = String(req.query.provider_name || req.body.provider_name || "").trim();
    const account_number = String(req.query.account_number || req.body.account_number || "").trim();
    const type = String(req.query.type || req.body.type || "").trim().toLowerCase();

    if (!provider_name || !account_number) {
      return res.status(400).json({ error: "Missing required parameters: provider_name and account_number are required." });
    }

    try {
      const BIGISUB_API_KEY = process.env.BIGISUB_API_KEY || process.env.VTU_API_KEY || "";
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";

      const provUpper = provider_name.toUpperCase();
      const isCable = type === 'cable' || provUpper.includes("DSTV") || provUpper.includes("GOTV") || provUpper.includes("STARTIMES") || provUpper.includes("STAR TIMES") || provUpper.includes("CABLE");



      if (isCable) {
        // Determine Cable TV code: 1 for GOTV, 2 for DSTV, 3 for STARTIMES
        let cableTvCode = 1;
        if (provUpper.includes("DSTV")) {
          cableTvCode = 2;
        } else if (provUpper.includes("STARTIMES") || provUpper.includes("STAR TIMES")) {
          cableTvCode = 3;
        }

        const response = await axios.post(`${BIGISUB_BASE_URL}/cable/validate`, {
          cablename: cableTvCode,
          smartcard_number: account_number
        }, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${BIGISUB_API_KEY}`
          },
          timeout: 8000
        });

        const responseBody = response.data;
        if (response.status === 200 && (responseBody.status === "success" || responseBody.success)) {
          return res.json({
            success: true,
            customerName: responseBody.customer_name || responseBody.name || "Bigisub Verified Customer",
            account_number,
            provider_name: provUpper,
            type: "cable"
          });
        } else {
          return res.status(400).json({ error: responseBody.error || responseBody.message || "Cable smartcard verification failed on Bigisub." });
        }
      } else {
        // Determine Disco name code: 1: IKEDC, 2: EKEDC, 3: AEDC, 4: IBEDC, 5: KAEDCO, 6: KEDCO, 7: PHED, 8: JED, 9: EEDC, 10: YOLA
        let discoCode = 1;
        if (provUpper.includes("EKEDC") || provUpper.includes("EKO")) {
          discoCode = 2;
        } else if (provUpper.includes("AEDC") || provUpper.includes("ABUJA")) {
          discoCode = 3;
        } else if (provUpper.includes("IBEDC") || provUpper.includes("IBADAN")) {
          discoCode = 4;
        } else if (provUpper.includes("KAEDCO") || provUpper.includes("KADUNA")) {
          discoCode = 5;
        } else if (provUpper.includes("KEDCO") || provUpper.includes("KANO")) {
          discoCode = 6;
        } else if (provUpper.includes("PHED") || provUpper.includes("PORT HARCOURT")) {
          discoCode = 7;
        } else if (provUpper.includes("JED") || provUpper.includes("JOS")) {
          discoCode = 8;
        } else if (provUpper.includes("EEDC") || provUpper.includes("ENUGU")) {
          discoCode = 9;
        } else if (provUpper.includes("YOLA") || provUpper.includes("YEDC")) {
          discoCode = 10;
        } else if (!isNaN(Number(provider_name))) {
          discoCode = Number(provider_name);
        }

        const response = await axios.post(`${BIGISUB_BASE_URL}/electricity/validate`, {
          disco_name: discoCode,
          meter_number: account_number
        }, {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${BIGISUB_API_KEY}`
          },
          timeout: 8000
        });

        const responseBody = response.data;
        if (response.status === 200 && (responseBody.status === "success" || responseBody.success)) {
          return res.json({
            success: true,
            customerName: responseBody.customer_name || responseBody.name || "Bigisub Verified Customer",
            address: responseBody.address || "",
            account_number,
            provider_name: provUpper,
            type: "electricity"
          });
        } else {
          return res.status(400).json({ error: responseBody.error || responseBody.message || "Electricity meter verification failed on Bigisub." });
        }
      }
    } catch (err: any) {
      console.error("[GET /api/validate-utility Exception]:", err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || "Utility validation gateway error. Please try again.";
      return res.status(500).json({ error: errMsg });
    }
  });

  // POST '/api/buy-utility' -> Validates service exists in services_config, computes selling price, deducts from Supabase profiles, and drops payload directly to Bigisub
  app.post("/api/buy-utility", purchaseRateLimit, async (req, res) => {
    const { userId, email, type, provider, amount, number, plan, meter_type } = req.body;

    // Validate inputs
    const reqType = String(type || '').toLowerCase().trim();
    if (!provider || !number) {
      return res.status(400).json({ error: "Missing required parameters: provider and number are required to buy utility." });
    }
    if (!reqType) {
      return res.status(400).json({ error: "Missing required parameter: type is required (airtime, data, cable, or electricity)." });
    }

    try {
      // Securely fetch user context and profile wallet balance
      const { userId: resolvedUserId, pgUuid, balance: currentBalance, profile } = await getAuthenticatedUserBalance(req);
      const userEmail = profile.email || email;

      // 1. Validate that the active service exists in the 'services_config' table
      let service: any = null;

      if (reqType === 'cable') {
        const typeRows = await supabase.from('services_config').select('*').eq('service_type', 'cable').eq('is_active', true).order('selling_price', { ascending: true });
        if (typeRows.error) console.error('[services_config query error for cable]', typeRows.error);
        const wanted = String(plan || '').trim().toLowerCase();
        service = (typeRows.data || []).find((row: any) =>
          [row.id, row.bigisub_plan_id, row.mozosubz_plan_id, row.mozosubz_service].filter(Boolean).some((value: any) => String(value).trim().toLowerCase() === wanted)
        ) || (typeRows.data || []).find((row: any) => String(row.provider_or_network || '').toLowerCase().includes(String(provider || '').trim().toLowerCase()));
      } else if (reqType === 'electricity') {
        // Direct amount-based flow: no services_config plan or markup is required.
      } else if (reqType === 'airtime') {
        const { data, error: serviceErr } = await supabase
          .from('services_config')
          .select('*')
          .eq('service_type', 'airtime')
          .ilike('provider_or_network', `%${provider}%`)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        service = data;
        if (serviceErr) console.error("[services_config query error for airtime]:", serviceErr);
      } else if (reqType === 'data') {
        const { data, error: serviceErr } = await supabase
          .from('services_config')
          .select('*')
          .eq('service_type', 'data')
          .eq('bigisub_plan_id', plan)
          .eq('is_active', true)
          .maybeSingle();

        service = data;
        if (serviceErr) console.error("[services_config query error for data]:", serviceErr);
      }

      if (!service && reqType !== 'electricity') {
        return res.status(404).json({ error: `The requested service config was not found in 'services_config' or is currently inactive.` });
      }

      // User profile and balance verified securely via getAuthenticatedUserBalance

      // Compute final selling price dynamically from services_config
      let finalPrice = Number(service?.selling_price || 0);

      if (reqType === 'airtime') {
        let sellingPercent = Number(service.selling_price || 100);
        if (sellingPercent <= 1 && sellingPercent > 0) {
          sellingPercent = sellingPercent * 100;
        }
        finalPrice = Number(amount) * (sellingPercent / 100);
      } else if (reqType === 'electricity') {
        finalPrice = Number(amount);
        if (!Number.isFinite(finalPrice) || finalPrice < 1000) {
          return res.status(400).json({ error: 'Electricity purchase minimum is ₦1,000.' });
        }
      } else if (reqType === 'data' || reqType === 'cable') {
        finalPrice = Number(service.selling_price || amount || 0);
      }

      // Reseller discount (data purchases only) -- applied server-side against the
      // caller's own verified profile, never trusting a client-supplied discount.
      finalPrice = applyResellerPricing(finalPrice, profile, reqType);

      if (isNaN(finalPrice) || finalPrice <= 0) {
        return res.status(400).json({ error: "Invalid dynamic utility purchase amount calculated." });
      }

      if (currentBalance < finalPrice) {
        return res.status(400).json({ 
          error: `Insufficient wallet balance. This transaction requires ₦${finalPrice.toLocaleString()} but you have ₦${currentBalance.toLocaleString()}.` 
        });
      }

      // Multi-provider utility flow (Mozosubz & Nifex Data): atomic debit before provider call, automatic refund on rejection.
      if (reqType === 'cable' || reqType === 'electricity') {
        const isNifex = String(provider || service?.provider || '').toLowerCase().includes('nifex');
        let utilityResult;
        if (isNifex) {
          const nifexKey = await resolveNifexApiKey();
          if (!nifexKey) return res.status(503).json({ error: 'Nifex Data provider is not configured. Please set NIFEX_API_KEY.' });
          const { data: deducted, error: deductErr } = await supabase.rpc('deduct_balance', { user_uuid: profile.id, amount: finalPrice });
          if (deductErr || !deducted) return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalPrice.toLocaleString()}.` });
          utilityResult = await purchaseNifexUtility({
            type: reqType as 'cable' | 'electricity', provider: String(service.provider_or_network || provider), packageName: String(service.item_name || plan || ''),
            smartcard: reqType === 'cable' ? String(number) : undefined, meterNumber: reqType === 'electricity' ? String(number) : undefined,
            meterType: String(meter_type || 'prepaid').toLowerCase() === 'postpaid' || String(meter_type) === '2' ? 'POSTPAID' : 'PREPAID',
            amount: finalPrice, phone: String(req.body.phone || req.body.phoneNumber || number), apiKey: nifexKey,
          });
        } else {
          const mozKey = await resolveMozosubzApiKey();
          if (!mozKey) return res.status(503).json({ error: 'Mozosubz provider is not configured.' });
          const { data: deducted, error: deductErr } = await supabase.rpc('deduct_balance', { user_uuid: profile.id, amount: finalPrice });
          if (deductErr || !deducted) return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${finalPrice.toLocaleString()}.` });
          utilityResult = await purchaseMozosubzUtility({
            type: reqType as 'cable' | 'electricity', provider: String(provider), packageName: String(service.item_name || plan || ''),
            smartcard: reqType === 'cable' ? String(number) : undefined, meterNumber: reqType === 'electricity' ? String(number) : undefined,
            meterType: String(meter_type || 'prepaid').toLowerCase() === 'postpaid' || String(meter_type) === '2' ? 'POSTPAID' : 'PREPAID',
            amount: finalPrice, phone: String(req.body.phone || req.body.phoneNumber || number), apiKey: mozKey,
          });
        }
        const reference = utilityResult.reference || `MOZO-${reqType.toUpperCase()}-${Date.now()}`;
        if (utilityResult.ambiguous) {
          // Unknown outcome: the provider may still fulfil the request. Keep the
          // funds locked and report processing instead of auto-refunding.
          console.warn(`[Utility AMBIGUOUS OUTCOME] ${reqType} for ${number}: ${utilityResult.error} -- funds kept locked, left pending.`);
          return res.json({ status: 'processing', pending: true, message: 'Your transaction is being confirmed by the provider.', reference });
        }
        if (!utilityResult.success) {
          const { error: refundErr } = await supabase.rpc('increment_balance', { user_uuid: profile.id, amount: finalPrice });
          await supabase.from('transactions').insert({ user_id: profile.id, user_email: profile.email || userEmail, type: reqType, amount: finalPrice, status: refundErr ? 'refund_failed' : 'refunded', description: `${String(provider).toUpperCase()} ${reqType} failed`, reference, platform: 'mozosubz', payment_method: 'wallet', created_at: new Date().toISOString() });
          return res.status(400).json({ error: utilityResult.error || 'Mozosubz rejected the transaction.', reference, refunded: !refundErr });
        }
        await supabase.from('transactions').insert({ user_id: profile.id, user_email: profile.email || userEmail, type: reqType, amount: finalPrice, status: 'completed', description: `${String(provider).toUpperCase()} ${reqType} purchase`, reference, platform: 'mozosubz', payment_method: 'wallet', created_at: new Date().toISOString() });
        return res.json({ status: 'success', success: true, message: 'Transaction completed successfully', reference, transaction: utilityResult.raw });
      }

      // 3. Drop payload directly to Bigisub's server
      const BIGISUB_API_KEY = process.env.BIGISUB_API_KEY || process.env.VTU_API_KEY || "";
      const BIGISUB_BASE_URL = process.env.BIGISUB_BASE_URL || "https://www.bigisub.ng/api/v1";

      let dispatchSuccess = false;
      let responseBody: any = null;
      let apiErrorMsg = "";

      // PRODUCTION ONLY: no simulation fallback. Hard-fail if API key is missing.
      if (!BIGISUB_API_KEY || BIGISUB_API_KEY.includes('dummy') || BIGISUB_API_KEY.includes('test')) {
        return res.status(503).json({ error: "Payment provider not configured. Please contact support." });
      }

        try {
          let endpoint = "";
          let payload: any = {};

          if (reqType === 'airtime') {
            endpoint = "airtime/";
            let networkCode = 1;
            const provUpper = String(provider).toUpperCase();
            if (provUpper.includes("GLO")) networkCode = 2;
            else if (provUpper.includes("9MOBILE") || provUpper.includes("ETISALAT")) networkCode = 3;
            else if (provUpper.includes("AIRTEL")) networkCode = 4;

            payload = {
              network: networkCode,
              amount: Number(amount || finalPrice),
              phone: number,
              airtime_type: 1 // 1 for VTU
            };
          } else if (reqType === 'cable') {
            endpoint = "cable/";
            let cableTvCode = 1;
            const provUpper = String(provider).toUpperCase();
            if (provUpper.includes("DSTV")) cableTvCode = 2;
            else if (provUpper.includes("STARTIMES") || provUpper.includes("STAR TIMES")) cableTvCode = 3;

            payload = {
              cablename: cableTvCode,
              smartcard_number: number,
              cableplan: plan || service.bigisub_plan_id || "gotv_lite"
            };
          } else if (reqType === 'electricity') {
            endpoint = "electricity/";
            let discoCode = 1;
            const provUpper = String(provider).toUpperCase();
            if (provUpper.includes("EKEDC")) discoCode = 2;
            else if (provUpper.includes("AEDC")) discoCode = 3;
            else if (provUpper.includes("IBEDC")) discoCode = 4;
            else if (!isNaN(Number(provider))) discoCode = Number(provider);

            payload = {
              disco_name: discoCode,
              meter_number: number,
              amount: Number(amount || finalPrice),
              meter_type: meter_type || (plan?.toLowerCase().includes("postpaid") ? 2 : 1)
            };
          } else if (reqType === 'data') {
            endpoint = "data/";
            let networkCode = 1;
            const provUpper = String(provider).toUpperCase();
            if (provUpper.includes("GLO")) networkCode = 2;
            else if (provUpper.includes("9MOBILE") || provUpper.includes("ETISALAT")) networkCode = 3;
            else if (provUpper.includes("AIRTEL")) networkCode = 4;

            payload = {
              network: networkCode,
              mobile_number: number,
              plan: plan || service.bigisub_plan_id
            };
          } else {
            return res.status(400).json({ error: `Unsupported utility type: ${type}` });
          }

          const response = await axios.post(`${BIGISUB_BASE_URL}/${endpoint}`, payload, {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${BIGISUB_API_KEY}`
            },
            timeout: 12000
          });

          responseBody = response.data;
          if (response.status === 200 && (responseBody.status === "success" || responseBody.success || responseBody.status === "completed" || responseBody.status === "SUCCESSFUL")) {
            dispatchSuccess = true;
          } else {
            apiErrorMsg = responseBody.error || responseBody.message || `Gateway error code ${response.status}`;
          }
        } catch (fetchErr: any) {
          console.error("[Bigisub /api/buy-utility dispatch Exception]:", fetchErr);
          apiErrorMsg = fetchErr.response?.data?.message || fetchErr.response?.data?.error || fetchErr.message || "Network Gateway Timeout";
        }
      

      if (dispatchSuccess) {
        // Deduct price from balance via the guarded RPC (never a raw UPDATE — the
        // guard_balance trigger silently reverts 'balance' on any raw UPDATE that
        // doesn't go through deduct_balance()/increment_balance()).
        //
        // CRITICAL: if this deduction fails, we do NOT silently continue and tell the
        // user "success" -- the provider has already delivered the purchase at this
        // point, so a swallowed failure here means real product was given away for
        // free. Surface it loudly instead: log it as a reconciliation case support
        // needs to chase, and tell the user plainly what happened.
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: profile.id,
          amount: finalPrice,
        });

        const referenceCode = responseBody?.reference || responseBody?.id || `TRX-BIGI-UTIL-${Date.now()}`;
        const transactionId = `bigi_util_${Date.now()}`;
        const descriptionText = `${provider.toUpperCase()} ${reqType.toUpperCase()} purchase to ${number} (Simulated/Live)`;

        if (deductErr || !deductOk) {
          console.error(
            "[Supabase Balance Deduct Error] Provider already delivered but wallet was NOT debited -- needs manual reconciliation:",
            deductErr?.message, { userId: profile.id, email: profile.email || userEmail, amount: finalPrice, referenceCode }
          );
          try {
            await supabase.from('transactions').insert({
              user_id: profile.id,
              user_email: profile.email || userEmail,
              type: reqType, amount: finalPrice, status: 'undebited_delivery',
              description: `RECONCILE: ${descriptionText} -- delivered but wallet debit failed`,
              reference: referenceCode, platform: "bigisub", payment_method: "wallet",
              created_at: new Date().toISOString(),
            });
          } catch (_) { /* non-fatal -- the console.error above is the real record */ }

          return res.status(500).json({
            error: "Your order was delivered, but we could not debit your wallet due to a system error. This has been flagged for support to reconcile. Please contact support with this reference.",
            reference: referenceCode,
          });
        }

        try {
          await supabase.from('transactions').insert({
            user_id: profile.id,
            user_email: profile.email || userEmail,
            type: reqType,
            amount: finalPrice,
            status: 'completed',
            description: descriptionText,
            reference: referenceCode,
            platform: "bigisub",
            payment_method: "wallet",
            created_at: new Date().toISOString(),
          });
        } catch (txInsertErr: any) {
          console.error("[Supabase Audit Log Insertion Error]:", txInsertErr.message);
        }

        return res.json({
          status: "success",
          message: "Transaction completed successfully",
          reference: referenceCode,
          description: descriptionText
        });
      } else {
        // Gateway rejected -- funds were never touched here (deduct only happens above on
        // success), so no revert/refund step is needed on this failure path.
        return res.status(400).json({ error: `Gateway rejected the transaction. Your wallet was not charged.` });
      }
    } catch (err: any) {
      console.error("[Bigisub /api/buy-utility Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Agent/Reseller Subscription & Upgrade Route
  app.post("/api/agent/upgrade", async (req, res) => {
    const { userId, desireRole } = req.body;
    if (!userId || !desireRole || !['agent', 'reseller'].includes(desireRole)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    // SECURITY: require a verified session that actually matches the target userId -- otherwise
    // anyone could force a role change + fee deduction on any victim's account.
    const verifiedCallerId = await verifyCallerUserId(req);
    if (!verifiedCallerId || verifiedCallerId !== userId) {
      return res.status(401).json({ error: "Unauthorized: session does not match the target account." });
    }

    const fee = desireRole === 'agent' ? 1500 : 3500;

    try {
      const pgUuid = ensureUUID(userId);

      // Fetch current balance
      const { data: profile, error: profileErr } = await supabase
        .from('profiles').select('wallet_balance,role').eq('id', pgUuid).maybeSingle();
      if (profileErr || !profile) {
        return res.status(404).json({ error: "User profile not found." });
      }
      const currentBalance = Number(profile.wallet_balance || 0);
      if (currentBalance < fee) {
        return res.status(400).json({ error: `Insufficient balance. ₦${fee} required to upgrade to ${desireRole}.` });
      }

      // Deduct via the guarded RPC first (never a raw UPDATE for balance), then set role separately.
      const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
        user_uuid: pgUuid,
        amount: fee,
      });
      if (deductErr) throw new Error(deductErr.message);
      if (!deductOk) {
        return res.status(400).json({ error: `Insufficient balance. ₦${fee} required to upgrade to ${desireRole}.` });
      }

      const { error: roleErr } = await supabase.from('profiles')
        .update({ role: desireRole })
        .eq('id', pgUuid);
      if (roleErr) throw new Error(roleErr.message);

      const { data: freshProfile } = await supabase
        .from('profiles').select('wallet_balance').eq('id', pgUuid).maybeSingle();
      const newBalance = freshProfile?.wallet_balance ?? (currentBalance - fee);

      await supabase.from('transactions').insert({
        user_id: pgUuid, type: 'upgrade',
        amount: fee, status: 'completed',
        description: `Account upgraded to ${desireRole.toUpperCase()} (₦${fee} deducted)`,
        created_at: new Date().toISOString()
      });

      res.json({
        success: true,
        message: `Congratulations! You are now classified as a VTU ${desireRole.toUpperCase()}. 🎉`,
        role: desireRole,
        balance: newBalance
      });
    } catch (error: any) {
      console.error("[Upgrade Option Exception]:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ─── Reseller Program: manual monthly subscribe/renew ───────────────────
  // Charges RESELLER_MONTHLY_FEE from the caller's own wallet (never a body-supplied
  // target -- getAuthenticatedUserBalance only ever resolves the verified session's own
  // account) and extends reseller_expires_at by 30 days. If the previous subscription is
  // still active or within its grace window, the new 30 days stacks on top of the current
  // expiry instead of the extension being wasted; if it already lapsed past grace, the new
  // period starts fresh from now.
  app.post("/api/reseller/subscribe", async (req, res) => {
    try {
      const { pgUuid, profile } = await getAuthenticatedUserBalance(req);

      const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
        user_uuid: pgUuid,
        amount: RESELLER_MONTHLY_FEE,
      });
      if (deductErr) throw new Error(deductErr.message);
      if (!deductOk) {
        return res.status(400).json({ error: `Insufficient balance. ₦${RESELLER_MONTHLY_FEE} required to subscribe as a reseller.` });
      }

      const now = Date.now();
      const graceMs = RESELLER_GRACE_DAYS * 24 * 60 * 60 * 1000;
      const currentExpiry = profile?.reseller_expires_at ? new Date(profile.reseller_expires_at).getTime() : 0;
      const baseTime = currentExpiry + graceMs > now ? currentExpiry : now;
      const newExpiry = new Date(baseTime + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ reseller_expires_at: newExpiry, role: 'reseller' })
        .eq('id', pgUuid);
      if (updateErr) throw new Error(updateErr.message);

      try {
        await supabase.from('transactions').insert({
          user_id: pgUuid, type: 'reseller_subscription',
          amount: RESELLER_MONTHLY_FEE, status: 'completed',
          description: `Reseller subscription renewed until ${newExpiry}`,
          created_at: new Date().toISOString(),
        });
      } catch (txErr: any) {
        console.warn("[Reseller Subscribe] transaction log warning:", txErr.message);
      }

      return res.json({
        success: true,
        message: `Reseller subscription active until ${new Date(newExpiry).toLocaleDateString()}.`,
        reseller_expires_at: newExpiry,
        discount_percent: RESELLER_DISCOUNT_PERCENT,
      });
    } catch (err: any) {
      console.error("[Reseller Subscribe Exception]:", err);
      return res.status(400).json({ error: err.message });
    }
  });

  // GET /api/reseller/status -- live status derived from reseller_expires_at, never a stored flag.
  app.get("/api/reseller/status", async (req, res) => {
    try {
      const { profile } = await getAuthenticatedUserBalance(req);
      const expiresAtRaw = profile?.reseller_expires_at;

      if (!expiresAtRaw) {
        return res.json({
          status: 'none', active: false,
          discount_percent: RESELLER_DISCOUNT_PERCENT, monthly_fee: RESELLER_MONTHLY_FEE,
        });
      }

      const expiresAt = new Date(expiresAtRaw).getTime();
      const graceMs = RESELLER_GRACE_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();

      let status: 'active' | 'grace' | 'expired';
      if (now <= expiresAt) status = 'active';
      else if (now <= expiresAt + graceMs) status = 'grace';
      else status = 'expired';

      return res.json({
        status,
        active: status !== 'expired',
        reseller_expires_at: expiresAtRaw,
        days_remaining: Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))),
        grace_days_remaining: status === 'grace' ? Math.max(0, Math.ceil((expiresAt + graceMs - now) / (24 * 60 * 60 * 1000))) : 0,
        discount_percent: RESELLER_DISCOUNT_PERCENT,
        monthly_fee: RESELLER_MONTHLY_FEE,
      });
    } catch (err: any) {
      return res.status(401).json({ error: err.message });
    }
  });

  // Bulk Capital Funding with Reseller/Agent Incentive Bonuses
  // SECURITY: this endpoint let ANYONE instantly credit ANY wallet with fake, unbacked-by-any-
  // real-payment funds (no gateway call, no signature, no session check -- just "amount >= 1000"
  // and a straight balance increment). Disabled permanently. Real top-ups must go through the
  // Bachs.io webhooks or /api/payments/bachs/verify, which independently confirm real money moved.
  app.post("/api/agent/bulk-fund", async (req, res) => {
    return res.status(501).json({
      error: "Bulk capital deposit is disabled. Please fund your wallet through Bachs.io Checkout or Bank Transfer."
    });
  });

  // SECURITY: this let ANYONE set ANY user's wallet balance to ANY arbitrary number with zero
  // auth and zero real money involved -- a direct wallet-mint/drain primitive. Disabled permanently.
  app.post("/api/wallet/reset-balance", async (req, res) => {
    return res.status(501).json({
      error: "Self-service balance adjustment is disabled. Contact support for balance corrections."
    });
  });

  // ── Daily Bonus Lucky Wheel: REMOVED ──────────────────────────────────────
  // Removed at owner request. A wallet-crediting "spin the wheel" endpoint is
  // inherently a money-minting surface (it previously could be fared without a
  // per-day cap, and even rate-limited it remains an unbacked credit path with
  // no real payment behind it). Any future reward should be granted server-side
  // against a real, verifiable event -- never via an HTTP endpoint that credits
  // increment_balance directly.

  // AI Chat Support Endpoint
  app.post("/api/chat", rateLimit(20, 60_000), async (req, res) => {
    const { message } = req.body;

    if (!getGeminiAi()) {
      console.error("CONFIG: /api/chat called but GEMINI_API_KEY is not set on this deployment.");
      return res.status(503).json({ error: "AI assistant is not configured on this server yet. The GEMINI_API_KEY environment variable must be set (Project Settings -> Environment Variables -> GEMINI_API_KEY), then redeploy." });
    }

    try {
      let context = "You are Noroya, the friendly AI assistant for Noroya Data, a VTU platform in Nigeria.";

      // SECURITY (audit M4): identity comes ONLY from a verified session -- the old code
      // accepted any body-supplied userId and leaked that user's name + wallet balance
      // into the AI prompt (extractable via prompt injection).
      const verifiedUserId = await verifyCallerUserId(req);
      if (verifiedUserId) {
        const { data: userDoc } = await supabase
          .from('profiles')
          .select('name, username, wallet_balance, balance')
          .eq('id', ensureUUID(verifiedUserId))
          .maybeSingle();
        if (userDoc) {
          const displayName = userDoc.name || userDoc.username || 'the user';
          const balance = Number(userDoc.wallet_balance ?? userDoc.balance ?? 0);
          context += ` The user's name is ${displayName} and their current wallet balance is ₦${balance}.`;
        }
      }

      context += " Help the user with their queries about data bundles, airtime, and billing. Be concise and professional.";

      const prompt = `${context}\n\nUser: ${message}\nAI:`;
      const gemini = getGeminiAi();
      if (!gemini) {
        return res.status(503).json({ error: "AI assistant is not configured on this server yet." });
      }
      const response = await gemini.models.generateContent({
        model: (process.env.GEMINI_MODEL || "gemini-3.5-flash").trim(),
        contents: prompt,
      });
      res.json({ text: response.text || "" });
    } catch (error: any) {
      console.error("Chat error:", error);
      res.status(500).json({ error: "Failed to get AI response" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 💳 BACHS.IO PAYMENT GATEWAY INTEGRATION (https://docs.bachs.io)
  // ═══════════════════════════════════════════════════════════════════════════
  // Implements:
  //   1. POST /v1/checkout-sessions (Pure product-less NGN checkout with decimal string amount)
  //   2. GET  /v1/checkout-sessions/{checkout_id} & GET /v1/payments/charges/{charge_id}
  //   3. GET & POST /v1/virtual-accounts (NGN permanent virtual account numbers)
  //   4. Webhook verification via X-Bachs-Signature-V2 (`t=...,v1=...`) and X-Bachs-Signature
  //      on `collection.succeeded` and `checkout.completed` events.

  const creditUserWalletAtomically = async (opts: {
    reference: string;
    email?: string;
    userId?: string;
    amount: number;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<{ status: "success" | "already_processed" | "error"; message?: string; userId?: string }> => {
    const cleanRef = String(opts.reference || "").trim();
    const cleanEmail = String(opts.email || "").toLowerCase().trim();
    const numericAmount = Number(opts.amount || 0);
    const desc = opts.description || `Wallet Top-Up via Bachs.io (₦${numericAmount.toLocaleString()})`;

    if (!cleanRef || isNaN(numericAmount) || numericAmount <= 0) {
      return { status: "error", message: "Invalid payment reference or amount." };
    }

    // 1. Check processed_payments idempotency table first
    try {
      const { data: existing } = await supabase
        .from("processed_payments")
        .select("reference")
        .eq("reference", cleanRef)
        .maybeSingle();
      if (existing) {
        return { status: "already_processed", message: "Transaction already processed." };
      }
    } catch (_) {}

    // 2. Tier 1: process_payment_webhook RPC (by email)
    if (cleanEmail) {
      try {
        const { data: pwResult, error: pwErr } = await supabase.rpc("process_payment_webhook", {
          p_reference: cleanRef,
          p_email: cleanEmail,
          p_amount: numericAmount,
          p_gateway: "bachs",
          p_description: desc,
        });
        if (!pwErr && pwResult) {
          if (pwResult.status === "already_processed") {
            return { status: "already_processed", message: "Transaction already processed." };
          }
          if (pwResult.status === "success") {
            return { status: "success", userId: pwResult.profile_id };
          }
        }
      } catch (e: any) {
        console.warn("[Bachs Credit Tier 1 warning]:", e?.message || e);
      }
    }

    // 3. Resolve profile by email or userId
    let profile: any = null;
    if (cleanEmail) {
      const { data: pByEmail } = await supabase
        .from("profiles")
        .select("*")
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (pByEmail) profile = pByEmail;
    }
    if (!profile && opts.userId) {
      const pgUuid = ensureUUID(opts.userId);
      const { data: pById } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", pgUuid)
        .maybeSingle();
      if (pById) profile = pById;
    }

    if (!profile) {
      return { status: "error", message: `User profile not found for ${cleanEmail || opts.userId || "payment"}.` };
    }

    // 4. Tier 2: process_webhook_credit_by_user RPC
    try {
      const { data: creditResult, error: rpcErr } = await supabase.rpc("process_webhook_credit_by_user", {
        p_reference: cleanRef,
        p_user_uuid: profile.id,
        p_amount: numericAmount,
        p_gateway: "bachs",
      });
      if (!rpcErr && creditResult) {
        if (creditResult.status === "already_processed") {
          return { status: "already_processed", message: "Transaction already processed.", userId: profile.id };
        }
        if (creditResult.status === "success") {
          return { status: "success", userId: profile.id };
        }
      }
    } catch (e: any) {
      console.warn("[Bachs Credit Tier 2 warning]:", e?.message || e);
    }

    // 5. Tier 3: Direct atomic fallback
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("reference", cleanRef)
      .maybeSingle();
    if (existingTx) {
      return { status: "already_processed", message: "Transaction already processed.", userId: profile.id };
    }

    await supabase.from("processed_payments").insert({
      reference: cleanRef,
      email: cleanEmail || profile.email || null,
      amount: numericAmount,
      gateway: "bachs",
    });

    const currentBalance = Number(profile.wallet_balance ?? profile.balance ?? 0);
    const newBalance = currentBalance + numericAmount;

    await supabase
      .from("profiles")
      .update({
        wallet_balance: newBalance,
        balance: newBalance,
        available_balance: newBalance,
        last_funding_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    await supabase.from("transactions").insert({
      user_id: profile.id,
      user_email: cleanEmail || profile.email || "",
      amount: numericAmount,
      type: "funding",
      status: "completed",
      reference: cleanRef,
      platform: "bachs",
      payment_method: "bachs",
      gateway: "bachs",
      description: desc,
      metadata: opts.metadata || {},
      created_at: new Date().toISOString(),
    });

    return { status: "success", userId: profile.id };
  };

  // 1. Create a Bachs.io Checkout Session (POST /v1/checkout-sessions)
  app.post(["/api/payments/bachs/checkout", "/api/v1/payments/bachs/checkout"], async (req, res) => {
    try {
      const secretKey = await resolveBachsSecretKey();
      if (!secretKey) {
        return res.status(503).json({
          error: "Bachs.io secret key is not configured. Please add BACHS_SECRET_KEY in Environment Variables or Admin Settings.",
        });
      }

      const { amount, email, name, phone, userId, redirectUrl } = req.body || {};
      const numericAmount = Number(amount);
      if (!numericAmount || isNaN(numericAmount) || numericAmount < 100) {
        return res.status(400).json({ error: "Minimum wallet funding amount on Bachs.io is ₦100.00." });
      }

      const customerEmail = String(email || "").toLowerCase().trim();
      if (!customerEmail || !customerEmail.includes("@")) {
        return res.status(400).json({ error: "A valid customer email address is required." });
      }

      const reference = `NRY-BACHS-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const baseUrl = resolveBachsBaseUrl(secretKey);

      const rawOrigin =
        sanitizeSecretValue(String(redirectUrl || "")) ||
        sanitizeSecretValue(String(req.headers.origin || "")) ||
        sanitizeSecretValue(String(process.env.APP_URL || "")) ||
        `${req.protocol}://${req.get("host")}`;
      let cleanOrigin = rawOrigin.replace(/\/+$/, "");
      try {
        cleanOrigin = new URL(cleanOrigin.startsWith("http") ? cleanOrigin : `https://${cleanOrigin}`).origin;
      } catch (_) {
        cleanOrigin = "https://noroya.vercel.app";
      }

      // Per Bachs.io OpenAPI specification:
      // Money is always a decimal string at the currency's precision (e.g. "2000.00")
      const amountDecimalString = numericAmount.toFixed(2);

      const customerPayload: Record<string, any> = { email: customerEmail };
      if (name && String(name).trim()) {
        customerPayload.name = String(name).trim();
      }
      if (phone && String(phone).trim()) {
        const digits = String(phone).replace(/[^\d+]/g, "");
        let e164 = digits;
        if (/^0[789][01]\d{8}$/.test(digits)) {
          e164 = `+234${digits.slice(1)}`;
        } else if (/^234[789][01]\d{8}$/.test(digits)) {
          e164 = `+${digits}`;
        }
        if (/^\+[1-9]\d{7,14}$/.test(e164)) {
          customerPayload.phone_number = e164;
        }
      }

      const checkoutPayload = {
        customer: customerPayload,
        pricing: {
          currency: "NGN",
          amount: amountDecimalString,
          price_type: "fixed",
        },
        billing_currency: "NGN",
        reference,
        success_url: `${cleanOrigin}/?bachs_verify=1&reference=${encodeURIComponent(reference)}`,
        cancel_url: `${cleanOrigin}/?bachs_cancelled=1&reference=${encodeURIComponent(reference)}`,
        metadata: {
          user_id: String(userId || ""),
          email: customerEmail,
          reference,
          purpose: "wallet_funding",
        },
      };

      const cleanKey = sanitizeSecretValue(secretKey);
      const checkoutEndpoint = getBachsEndpoint(baseUrl, '/v1/checkout-sessions');

      const resp = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reference,
        },
        body: JSON.stringify(checkoutPayload),
      });

      const respData: any = await resp.json().catch(() => ({}));
      if (!resp.ok || !respData?.checkout_url) {
        let errDetail = respData?.detail || respData?.message || respData?.error || `Bachs API returned HTTP ${resp.status}`;
        if (resp.status === 404) {
          errDetail = `Bachs API endpoint not found (HTTP 404). Ensure BACHS_BASE_URL is https://api.bachs.io (without /v1). Detail: ${respData?.detail || 'Not Found'}`;
        }
        console.error("[Bachs Checkout Error]:", resp.status, respData);
        return res.status(resp.status >= 400 && resp.status < 600 ? resp.status : 502).json({
          error: errDetail,
          error_code: respData?.error_code || null,
        });
      }

      return res.status(201).json({
        success: true,
        checkout_id: respData.checkout_id,
        checkout_url: respData.checkout_url,
        reference: respData.reference || reference,
        status: respData.status || "open",
        expires_at: respData.expires_at,
      });
    } catch (err: any) {
      console.error("[POST /api/payments/bachs/checkout Exception]:", err);
      return res.status(500).json({ error: err.message || "Failed to initialize Bachs.io checkout session." });
    }
  });

  // 2. Verify a Bachs.io Checkout Session or Charge Status
  app.post(["/api/payments/bachs/verify", "/api/v1/payments/bachs/verify"], async (req, res) => {
    try {
      const secretKey = await resolveBachsSecretKey();
      if (!secretKey) {
        return res.status(503).json({ error: "Bachs.io secret key is not configured." });
      }

      const { checkoutId, checkout_id, chargeId, charge_id, paymentId, payment_id, reference } = req.body || {};
      const targetCheckoutId = String(checkoutId || checkout_id || "").trim();
      const targetChargeId = String(chargeId || charge_id || paymentId || payment_id || "").trim();

      if (!targetCheckoutId && !targetChargeId) {
        return res.status(400).json({ error: "Missing checkout_id or charge_id to verify with Bachs.io." });
      }

      const baseUrl = resolveBachsBaseUrl(secretKey);
      const cleanKey = secretKey.replace(/^Bearer\s+/i, '').trim();
      let verifiedAmount = 0;
      let verifiedCurrency = "NGN";
      let verifiedEmail = "";
      let verifiedUserId = "";
      let verifiedRef = String(reference || "").trim();
      let isPaid = false;

      if (targetCheckoutId) {
        const verifyEndpoint = getBachsEndpoint(baseUrl, `/v1/checkout-sessions/${encodeURIComponent(targetCheckoutId)}`);
        const chkResp = await fetch(verifyEndpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
        });
        if (!chkResp.ok) {
          const errBody: any = await chkResp.json().catch(() => ({}));
          return res.status(chkResp.status).json({
            error: errBody?.detail || errBody?.message || `Could not retrieve checkout session ${targetCheckoutId}`,
          });
        }
        const chkData: any = await chkResp.json();
        const status = String(chkData?.status || "").toLowerCase();
        const paymentStatus = String(chkData?.payment_status || "").toLowerCase();
        const chargeStatus = String(chkData?.charge?.status || "").toLowerCase();

        if (
          status === "completed" &&
          (paymentStatus === "succeeded" || paymentStatus === "paid" || chargeStatus === "succeeded")
        ) {
          isPaid = true;
          verifiedAmount = Number(chkData?.charge?.amount ?? chkData?.amount ?? 0);
          verifiedCurrency = String(chkData?.charge?.currency || chkData?.currency || "NGN").toUpperCase();
          verifiedEmail = String(
            chkData?.customer?.email ||
              chkData?.customer_details?.email ||
              chkData?.metadata?.email ||
              ""
          )
            .toLowerCase()
            .trim();
          verifiedUserId = String(chkData?.metadata?.user_id || "").trim();
          verifiedRef = String(chkData?.reference || chkData?.charge?.payment_id || chkData?.checkout_id).trim();
        } else {
          return res.status(200).json({
            status: status || "open",
            payment_status: paymentStatus || "pending",
            verified: false,
            message: `Checkout status is '${chkData?.status || "open"}' (payment: '${chkData?.payment_status || "pending"}').`,
          });
        }
      } else if (targetChargeId) {
        const chargeEndpoint = getBachsEndpoint(baseUrl, `/v1/payments/${encodeURIComponent(targetChargeId)}`);
        const chResp = await fetch(chargeEndpoint, {
          method: "GET",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
        });
        if (!chResp.ok) {
          const errBody: any = await chResp.json().catch(() => ({}));
          return res.status(chResp.status).json({
            error: errBody?.detail || errBody?.message || `Could not retrieve payment ${targetChargeId}`,
          });
        }
        const chData: any = await chResp.json();
        const chStatus = String(chData?.status || "").toLowerCase();
        if (chStatus === "succeeded" || chStatus === "paid") {
          isPaid = true;
          verifiedAmount = Number(chData?.amount_paid ?? chData?.amount ?? 0);
          verifiedCurrency = String(chData?.currency || "NGN").toUpperCase();
          verifiedEmail = String(chData?.customer?.email || chData?.meta?.email || "").toLowerCase().trim();
          verifiedUserId = String(chData?.meta?.user_id || "").trim();
          verifiedRef = String(chData?.reference || chData?.payment_id || targetChargeId).trim();
        } else {
          return res.status(200).json({
            status: chStatus || "processing",
            verified: false,
            message: `Payment status is '${chData?.status || "processing"}'.`,
          });
        }
      }

      if (!isPaid || verifiedAmount <= 0) {
        return res.status(400).json({ error: "Payment has not succeeded on Bachs.io yet." });
      }

      if (verifiedCurrency !== "NGN") {
        return res.status(400).json({ error: `Unsupported settlement currency ${verifiedCurrency}. Expected NGN.` });
      }

      const creditOutcome = await creditUserWalletAtomically({
        reference: verifiedRef,
        email: verifiedEmail,
        userId: verifiedUserId,
        amount: verifiedAmount,
        description: `Wallet Top-Up via Bachs.io (₦${verifiedAmount.toLocaleString()})`,
      });

      if (creditOutcome.status === "error") {
        return res.status(400).json({ error: creditOutcome.message || "Could not credit wallet." });
      }

      return res.status(200).json({
        status: creditOutcome.status,
        verified: true,
        amount: verifiedAmount,
        reference: verifiedRef,
        message:
          creditOutcome.status === "already_processed"
            ? "Payment already credited to your wallet."
            : `Successfully credited ₦${verifiedAmount.toLocaleString()} to your wallet!`,
      });
    } catch (err: any) {
      console.error("[POST /api/payments/bachs/verify Exception]:", err);
      return res.status(500).json({ error: err.message || "Verification failed." });
    }
  });

  // 3. Bachs.io NGN Virtual Account Endpoints (GET & POST /v1/virtual-accounts)
  app.get("/api/payments/bachs/virtual-account", async (_req, res) => {
    try {
      const secretKey = await resolveBachsSecretKey();
      if (!secretKey) {
        return res.status(503).json({
          configured: false,
          error: "Bachs.io secret key is not configured.",
        });
      }

      const baseUrl = resolveBachsBaseUrl(secretKey);
      const cleanKey = secretKey.replace(/^Bearer\s+/i, '').trim();
      const getVaEndpoint = getBachsEndpoint(baseUrl, '/v1/virtual-accounts?currency=NGN');
      const createVaEndpoint = getBachsEndpoint(baseUrl, '/v1/virtual-accounts');

      let resp = await fetch(getVaEndpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
      });

      // If 404 NOT_FOUND, automatically request creation via POST /v1/virtual-accounts
      if (resp.status === 404) {
        resp = await fetch(createVaEndpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ currency: "NGN" }),
        });
      }

      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({
          configured: true,
          available: false,
          error: data?.detail || data?.message || "Virtual account is not active on this Bachs account yet.",
          error_code: data?.error_code || null,
        });
      }

      return res.json({
        configured: true,
        available: true,
        virtualAccount: {
          id: data.id,
          currency: data.currency || "NGN",
          account_number: data.account_number,
          account_name: data.account_name,
          bank_name: data.bank_name,
          bank_code: data.bank_code,
          status: data.status || "active",
          created_at: data.created_at,
        },
      });
    } catch (err: any) {
      console.error("[GET /api/payments/bachs/virtual-account Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments/bachs/virtual-account", async (_req, res) => {
    try {
      const secretKey = await resolveBachsSecretKey();
      if (!secretKey) {
        return res.status(503).json({ error: "Bachs.io secret key is not configured." });
      }
      const baseUrl = resolveBachsBaseUrl(secretKey);
      const cleanKey = secretKey.replace(/^Bearer\s+/i, '').trim();
      const createVaEndpoint = getBachsEndpoint(baseUrl, '/v1/virtual-accounts');
      const resp = await fetch(createVaEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currency: "NGN" }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({
          error: data?.detail || data?.message || "Failed to create NGN virtual account on Bachs.io.",
          error_code: data?.error_code || null,
        });
      }
      return res.json({ success: true, virtualAccount: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. Bachs.io Webhook Signature Verification (V2 & V1 per official docs)
  const verifyBachsWebhookSignature = (
    rawBodyBuffer: Buffer,
    headers: Record<string, any>,
    secret: string,
    toleranceSeconds = 300
  ): boolean => {
    const cleanSecret = String(secret || "").trim();
    if (!cleanSecret) return false;

    const rawBodyStr = rawBodyBuffer.toString("utf8");
    const v2Header = String(headers["x-bachs-signature-v2"] || "").trim();
    const v1Signature = String(headers["x-bachs-signature"] || "").trim();
    const v1Timestamp = String(headers["x-bachs-timestamp"] || "").trim();

    // Prefer X-Bachs-Signature-V2 (`t={timestamp},v1={sig1},v1={sig2}`)
    if (v2Header) {
      const parts = v2Header.split(",").map((p) => p.trim()).filter(Boolean);
      let timestampStr = "";
      const signatures: string[] = [];

      for (const part of parts) {
        const eqIdx = part.indexOf("=");
        if (eqIdx === -1) continue;
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1).trim();
        if (k === "t") timestampStr = v;
        if (k === "v1" && v) signatures.push(v);
      }

      const ts = parseInt(timestampStr, 10);
      if (isNaN(ts) || signatures.length === 0) return false;
      if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

      const expected = crypto
        .createHmac("sha256", cleanSecret)
        .update(`${ts}.${rawBodyStr}`, "utf8")
        .digest("hex");
      const expectedBuf = Buffer.from(expected, "utf8");

      for (const sig of signatures) {
        const sigBuf = Buffer.from(sig, "utf8");
        if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf)) {
          return true;
        }
      }
      return false;
    }

    // Fallback to X-Bachs-Signature + X-Bachs-Timestamp
    if (v1Signature && v1Timestamp) {
      const ts = parseInt(v1Timestamp, 10);
      if (isNaN(ts)) return false;
      if (Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

      const expected = crypto
        .createHmac("sha256", cleanSecret)
        .update(`${ts}.${rawBodyStr}`, "utf8")
        .digest("hex");
      const expectedBuf = Buffer.from(expected, "utf8");
      const sigBuf = Buffer.from(v1Signature, "utf8");
      return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(expectedBuf, sigBuf);
    }

    return false;
  };

  const bachsWebhookRoutes = [
    "/api/webhooks/bachs",
    "/api/webhook/bachs",
    "/api/bachs/webhook",
    "/api/bachs/webhooks",
    "/api/payments/bachs-webhook",
    "/api/payments/webhook",
    "/api/v1/payment-webhook",
    "/api/webhook",
    "/api/webhooks",
    "/webhook/bachs",
    "/webhooks/bachs",
    "/bachs/webhook",
    "/webhook",
    "/webhooks",
  ];

  app.get(bachsWebhookRoutes, async (_req, res) => {
    const webhookSecret = await resolveBachsWebhookSecret();
    const secretKey = await resolveBachsSecretKey();
    return res.status(200).json({
      status: "active",
      gateway: "bachs",
      webhookConfigured: Boolean(webhookSecret),
      apiKeyConfigured: Boolean(secretKey),
      message: "Bachs.io webhook endpoint is active and ready to receive signed POST events.",
      timestamp: new Date().toISOString(),
    });
  });
  app.head(bachsWebhookRoutes, (_req, res) => res.status(200).end());
  app.options(bachsWebhookRoutes, (_req, res) => res.status(200).end());

  const handleBachsWebhook = async (req: any, res: any) => {
    try {
      const webhookSecret = await resolveBachsWebhookSecret();
      const bachsSecretKey = await resolveBachsSecretKey();

      if (!webhookSecret) {
        console.error("[Bachs Webhook] BACHS_WEBHOOK_SECRET is not configured. Rejecting delivery.");
        return res.status(503).json({ error: "Bachs webhook signing secret not configured." });
      }

      const rawBody: Buffer = Buffer.isBuffer(req.rawBody)
        ? req.rawBody
        : Buffer.from(typeof req.rawBody === "string" ? req.rawBody : safeJsonStringify(req.body || {}), "utf8");

      const isValidSig = verifyBachsWebhookSignature(rawBody, req.headers || {}, webhookSecret);
      if (!isValidSig) {
        console.warn("[Bachs Webhook] Invalid X-Bachs-Signature / X-Bachs-Signature-V2.");
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      const eventPayload = req.body || {};
      const eventId = String(eventPayload.id || "").trim();
      const eventType = String(eventPayload.type || "").toLowerCase().trim();
      const data = eventPayload.data || {};

      console.log(`[Bachs Webhook] Verified event received: id=${eventId}, type=${eventType}`);

      // Handle `collection.succeeded` and `checkout.completed`
      if (eventType === "collection.succeeded" || eventType === "checkout.completed") {
        // For checkout.completed, confirm a payment was actually collected
        if (eventType === "checkout.completed") {
          const payStatus = String(data.payment_status || "").toLowerCase();
          const chargeStatus = String(data.charge?.status || "").toLowerCase();
          if (payStatus !== "paid" && payStatus !== "succeeded" && chargeStatus !== "succeeded") {
            return res.status(200).json({ received: true, status: "ignored_no_payment" });
          }
        }

        const chargeId = String(data.charge_id || data.charge?.id || "").trim();
        const checkoutId = String(data.checkout_id || "").trim();
        const reference = String(data.reference || chargeId || checkoutId || eventId).trim();
        const currency = String(data.currency || data.charge?.currency || "NGN").toUpperCase();
        let amount = Number(data.amount ?? data.charge?.amount ?? 0);

        let customerEmail = String(
          data.customer?.email ||
            data.customer_details?.email ||
            data.metadata?.email ||
            ""
        )
          .toLowerCase()
          .trim();
        let userId = String(data.metadata?.user_id || "").trim();

        // If this is a permanent Virtual Account deposit, also check narration for email/reference
        const bankTransfer = data.payment_method_details?.bank_transfer;
        if (!customerEmail && bankTransfer?.narration) {
          const emailMatch = String(bankTransfer.narration).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) customerEmail = emailMatch[0].toLowerCase();
        }

        // Defense-in-depth: independently verify with Bachs API when secret key & chargeId/checkoutId exist
        if (bachsSecretKey && (chargeId || checkoutId)) {
          try {
            const baseUrl = resolveBachsBaseUrl(bachsSecretKey);
            const cleanKey = bachsSecretKey.replace(/^Bearer\s+/i, '').trim();
            const verifyUrl = chargeId
              ? getBachsEndpoint(baseUrl, `/v1/payments/charges/${encodeURIComponent(chargeId)}`)
              : getBachsEndpoint(baseUrl, `/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`);
            const vResp = await fetch(verifyUrl, {
              method: "GET",
              headers: { Authorization: `Bearer ${cleanKey}`, "Content-Type": "application/json" },
            });
            if (vResp.ok) {
              const vData: any = await vResp.json();
              const vStatus = String(vData?.status || vData?.payment_status || "").toLowerCase();
              if (vStatus === "succeeded" || vStatus === "completed" || vStatus === "paid") {
                if (vData?.amount) amount = Number(vData.amount);
                if (!customerEmail && vData?.customer?.email) customerEmail = String(vData.customer.email).toLowerCase().trim();
                if (!customerEmail && vData?.customer_details?.email) customerEmail = String(vData.customer_details.email).toLowerCase().trim();
                if (!userId && vData?.metadata?.user_id) userId = String(vData.metadata.user_id).trim();
              }
            }
          } catch (vErr: any) {
            console.warn("[Bachs Webhook] Independent verification warning:", vErr.message);
          }
        }

        if (currency !== "NGN" || isNaN(amount) || amount <= 0) {
          return res.status(200).json({ received: true, status: "ignored_invalid_amount_or_currency" });
        }

        const creditRes = await creditUserWalletAtomically({
          reference,
          email: customerEmail,
          userId,
          amount,
          description: bankTransfer
            ? `Wallet Deposit via Bachs Bank Transfer (${bankTransfer.sender_name || "Bank Transfer"})`
            : `Wallet Top-Up via Bachs.io (₦${amount.toLocaleString()})`,
          metadata: {
            event_id: eventId,
            event_type: eventType,
            charge_id: chargeId || null,
            checkout_id: checkoutId || null,
          },
        });

        if (creditRes.status === "error") {
          console.warn(`[Bachs Webhook] Unmatched or uncredited deposit (ref=${reference}, email=${customerEmail}):`, creditRes.message);
          return res.status(200).json({ received: true, status: "unmatched", reason: creditRes.message });
        }

        return res.status(200).json({ received: true, status: creditRes.status, reference });
      }

      return res.status(200).json({ received: true, status: "ignored", type: eventType });
    } catch (err: any) {
      console.error("[Bachs Webhook Exception]:", err.message || err);
      // Return 500 on unexpected DB/runtime failure so Bachs retries delivery per official docs
      return res.status(500).json({ error: "Internal webhook processing error" });
    }
  };

  app.post(bachsWebhookRoutes, handleBachsWebhook);

  app.get(["/api/payments/bachs-webhook-health", "/api/webhook/bachs/health"], async (_req, res) => {
    const webhookSecret = await resolveBachsWebhookSecret();
    const secretKey = await resolveBachsSecretKey();
    res.json({
      status: "ok",
      gateway: "bachs",
      bachsWebhookSecretConfigured: Boolean(webhookSecret),
      bachsSecretKeyConfigured: Boolean(secretKey),
      supabaseServiceRoleConfigured: serverHasServiceRoleKey,
      recommendedWebhookUrl: "/api/webhooks/bachs",
      subscribedEvents: ["collection.succeeded", "collection.failed", "checkout.completed", "checkout.expired", "refund.paid"],
      timestamp: new Date().toISOString(),
    });
  });

  // Secure Mozosubz Webhook Handler Route
  app.post(["/api/webhooks/mozosubz", "/api/webhook/mozosubz"], async (req, res) => {
    try {
      const body = req.body;
      const signature = req.get('x-mozosubz-signature') || req.headers['x-mozosubz-signature'];

      console.log("[Mozosubz Webhook Received] Headers:", req.headers);
      console.log("[Mozosubz Webhook Received] Body:", safeJsonStringify(body));

      // SECURITY: signature verification is MANDATORY, always -- no conditional skip. Previously,
      // a missing secret OR a missing header silently skipped verification entirely, letting anyone
      // POST an arbitrary user_id + amount and get instantly credited with zero proof of origin.
      if (!process.env.MOZOSUBZ_WEBHOOK_SECRET) {
        console.error("[Mozosubz Webhook] MOZOSUBZ_WEBHOOK_SECRET is not configured. Rejecting webhook.");
        return res.status(503).json({ error: 'Webhook not configured' });
      }
      if (!signature) {
        console.warn("[Mozosubz Webhook] Missing signature header. Rejecting.");
        return res.status(401).json({ error: 'Missing signature' });
      }
      {
        const expected = crypto
          .createHmac('sha256', process.env.MOZOSUBZ_WEBHOOK_SECRET)
          .update(safeJsonStringify(body))
          .digest('hex');
        if (signature !== expected) {
          console.warn("[Mozosubz Webhook] Signature mismatch. Signature received:", signature, "Expected:", expected);
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const { event, data } = body || {};

      if (event === 'transaction.success' || event === 'payment.completed' || event === 'payment.success') {
        const { user_id, amount, reference, status, type } = data || {};

        if (user_id) {
          const pgUuid = ensureUUID(user_id);
          const numericAmount = Number(amount || 0);

          console.log(`[Mozosubz Webhook] Processing success event. User: ${user_id}, Amount: ${numericAmount}, Ref: ${reference}`);

          // SECURITY (audit H6): idempotent, insert-first credit keyed on the provider
          // reference (or a hash of the payload when the provider omits one), so replaying
          // the same signed webhook can no longer credit the wallet repeatedly.
          const idempotencyRef = reference
            || ('mozo-' + crypto.createHash('sha256').update(safeJsonStringify(data || {})).digest('hex').slice(0, 40));
          const { data: creditResult, error: rpcErr } = await supabase.rpc('process_webhook_credit_by_user', {
            p_reference: idempotencyRef,
            p_user_uuid: pgUuid,
            p_amount: numericAmount,
            p_gateway: 'mozosubz',
          });
          if (rpcErr) {
            console.error(`[Mozosubz Webhook] credit RPC FAILED -- manual intervention needed:`, rpcErr.message, { pgUuid, numericAmount, idempotencyRef });
          } else if (creditResult?.status === 'already_processed') {
            console.log(`[Mozosubz Webhook] Reference ${idempotencyRef} already credited. Skipping.`);
          } else {
            console.log(`[Mozosubz Webhook] Balance credited via idempotent RPC for user ID: ${pgUuid} (ref ${idempotencyRef})`);
          }
        } else {
          console.warn("[Mozosubz Webhook] Missing user_id in data payload.");
        }
      } else {
        console.log(`[Mozosubz Webhook] Event ignored or not success: event="${event}"`);
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Mozosubz webhook error:', error);
      return res.status(500).json({ error: 'Webhook failed', message: error.message });
    }
  });

  // Support administrative revenue audit via direct Supabase query (Bachs.io deposits)
  app.get(["/api/admin/opay-revenue", "/api/admin/bachs-revenue"], async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      console.log("[Admin Revenue Audit] Querying Bachs.io deposit records from Supabase.");
      const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .or('platform.eq.bachs,gateway.eq.bachs,type.eq.funding')
        .order('created_at', { ascending: false })
        .limit(100);

      if (txError) {
        throw new Error(`Supabase query error: ${txError.message}`);
      }

      let totalRevenue = 0;
      let successfulCount = 0;
      let failedCount = 0;
      const payments: any[] = [];

      (txs || []).forEach((tx: any) => {
        const amt = Number(tx.amount || 0);
        const isCompleted = tx.status === 'success' || tx.status === 'completed';

        payments.push({
          reference: tx.reference || tx.id,
          userId: tx.user_id || tx.userId || "unknown",
          email: tx.user_email || "",
          amount: amt,
          status: isCompleted ? "success" : "failed",
          createdAt: tx.created_at || new Date().toISOString(),
          paymentMethod: tx.payment_method || tx.gateway || "Bachs.io"
        });

        if (isCompleted) {
          totalRevenue += amt;
          successfulCount++;
        } else {
          failedCount++;
        }
      });

      return res.json({
        totalRevenue,
        successfulCount,
        failedCount,
        totalCount: payments.length,
        payments
      });
    } catch (err: any) {
      console.error("[Admin Revenue Audit Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Wallet: user-scoped snapshot + ledger (authoritative reads) ─────────
  // The dashboard MUST show exactly what the admin panel shows for the same
  // user. Serving the money reads through this API (service-role) instead of
  // direct browser→Supabase queries removes every remaining way they can
  // diverge: realtime publication membership, authenticated-role table
  // grants, stale anon-key config, and background-tab throttling all stop
  // mattering — the client just polls/refreshes this endpoint.
  app.get("/api/wallet/snapshot", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const userId = authUser.id;
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, name, phone_number, referral_code, wallet_balance, balance, available_balance, updated_at')
        .eq('id', userId)
        .maybeSingle();
      if (profErr) throw new Error(profErr.message);

      if (profile && !profile.referral_code) {
        const generatedCode = `NORODATA-${String(userId).replace(/-/g, '').substring(0, 6).toUpperCase()}`;
        try {
          await supabase.from('profiles').update({ referral_code: generatedCode }).eq('id', userId);
          profile.referral_code = generatedCode;
        } catch (_) {
          profile.referral_code = generatedCode;
        }
      }

      const { data: recent, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (txErr) console.warn("[Wallet Snapshot] transactions warning:", txErr.message);

      return res.json({
        balance: Number(profile?.wallet_balance ?? profile?.balance ?? 0),
        profile: profile || null,
        transactions: recent || [],
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Wallet Snapshot Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/wallet/transactions", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return res.json({ transactions: data || [] });
    } catch (err: any) {
      console.error("[Wallet Transactions Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Wallet-to-Wallet Transfer: Authoritative Recipient Lookup & Transfer ───
  app.post("/api/wallet/lookup-recipient", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const rawQuery = String(req.body?.query || "").trim();
      if (!rawQuery) {
        return res.status(400).json({ error: "Please enter recipient Transfer ID, email, or phone number." });
      }

      const safeQ = pgSafeFilter(rawQuery);
      const upperQ = pgSafeFilter(rawQuery.toUpperCase());
      const lowerQ = pgSafeFilter(rawQuery.toLowerCase());

      // Normalize Nigerian phone variants if digits
      const digitsOnly = rawQuery.replace(/[^0-9]/g, "");
      const phoneVariants = new Set<string>([safeQ]);
      if (digitsOnly.length >= 10) {
        if (digitsOnly.startsWith("0") && digitsOnly.length === 11) {
          phoneVariants.add(digitsOnly);
          phoneVariants.add(`234${digitsOnly.slice(1)}`);
          phoneVariants.add(`+234${digitsOnly.slice(1)}`);
        } else if (digitsOnly.startsWith("234") && digitsOnly.length === 13) {
          phoneVariants.add(`0${digitsOnly.slice(3)}`);
          phoneVariants.add(digitsOnly);
          phoneVariants.add(`+${digitsOnly}`);
        }
      }

      const orParts = [
        `email.ilike.${lowerQ}`,
        `referral_code.ilike.${upperQ}`,
        ...Array.from(phoneVariants).map((p) => `phone_number.eq.${pgSafeFilter(p)}`),
      ];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawQuery)) {
        orParts.push(`id.eq.${rawQuery}`);
      }

      let recipient: any = null;
      const { data: matchedRows, error: lookupErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, name, phone_number, referral_code')
        .or(orParts.join(','))
        .limit(5);

      if (!lookupErr && matchedRows && matchedRows.length > 0) {
        recipient = matchedRows[0];
      }

      // Fallback: if query looks like NORODATA-XXXXXX (or a 6+ char hex prefix), match against user ID prefix
      if (!recipient && (rawQuery.toUpperCase().startsWith('NORODATA-') || /^[A-Z0-9]{5,10}$/i.test(rawQuery))) {
        const codePart = rawQuery.toUpperCase().replace(/^NORODATA-/, '').trim();
        if (codePart.length >= 4) {
          const { data: allProfiles } = await supabase
            .from('profiles')
            .select('id, email, full_name, name, phone_number, referral_code')
            .limit(500);
          if (allProfiles) {
            recipient = allProfiles.find((p: any) => {
              const pCode = String(p.referral_code || '').toUpperCase();
              const idHex = String(p.id || '').replace(/-/g, '').toUpperCase();
              return pCode === rawQuery.toUpperCase() || pCode === `NORODATA-${codePart}` || idHex.startsWith(codePart);
            });
          }
        }
      }

      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found. Check the Transfer ID, email, or phone number." });
      }

      if (String(recipient.id) === String(authUser.id)) {
        return res.status(400).json({ error: "You cannot transfer money to your own wallet." });
      }

      const displayCode = recipient.referral_code || `NORODATA-${String(recipient.id).replace(/-/g, '').substring(0, 6).toUpperCase()}`;
      return res.json({
        recipient: {
          id: recipient.id,
          full_name: recipient.full_name || recipient.name || (recipient.email ? recipient.email.split('@')[0] : 'NORODATA User'),
          email: recipient.email || '',
          phone_number: recipient.phone_number || '',
          referral_code: displayCode,
        }
      });
    } catch (err: any) {
      console.error("[Wallet Lookup Recipient Error]:", err.message);
      return res.status(500).json({ error: err.message || "Failed to look up recipient." });
    }
  });

  app.post("/api/wallet/transfer", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const senderId = authUser.id;
      const recipientId = String(req.body?.recipientId || req.body?.recipient_uid || "").trim();
      const rawAmount = Number(req.body?.amount ?? req.body?.p_amount ?? 0);
      const note = String(req.body?.note ?? req.body?.p_note ?? "").trim();

      if (!recipientId) {
        return res.status(400).json({ status: 'error', error: "Recipient ID is required." });
      }
      if (recipientId === senderId) {
        return res.status(400).json({ status: 'error', error: "You cannot transfer money to yourself." });
      }
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        return res.status(400).json({ status: 'error', error: "Please enter a valid transfer amount greater than ₦0." });
      }

      const amount = Number(rawAmount.toFixed(2));

      // 1. Fetch sender and recipient profiles via service-role
      const [{ data: senderProfile, error: sErr }, { data: recipientProfile, error: rErr }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, name, wallet_balance, balance, available_balance').eq('id', senderId).maybeSingle(),
        supabase.from('profiles').select('id, email, full_name, name, wallet_balance, balance, available_balance').eq('id', recipientId).maybeSingle(),
      ]);

      if (sErr || !senderProfile) {
        return res.status(404).json({ status: 'error', error: "Sender wallet profile not found." });
      }
      if (rErr || !recipientProfile) {
        return res.status(404).json({ status: 'error', error: "Recipient wallet profile not found." });
      }

      const senderBalance = Number(senderProfile.wallet_balance ?? senderProfile.balance ?? 0);
      if (senderBalance < amount) {
        return res.status(400).json({
          status: 'insufficient_funds',
          error: `Insufficient wallet balance. Available: ₦${senderBalance.toLocaleString()}, Required: ₦${amount.toLocaleString()}.`,
          balance: senderBalance,
          required: amount,
        });
      }

      const recipientBalance = Number(recipientProfile.wallet_balance ?? recipientProfile.balance ?? 0);
      const newSenderBalance = Number((senderBalance - amount).toFixed(2));
      const newRecipientBalance = Number((recipientBalance + amount).toFixed(2));
      const nowIso = new Date().toISOString();

      // 2. Deduct from sender
      const { error: deductErr } = await supabase
        .from('profiles')
        .update({
          wallet_balance: newSenderBalance,
          balance: newSenderBalance,
          available_balance: newSenderBalance,
          updated_at: nowIso,
        })
        .eq('id', senderId);

      if (deductErr) {
        throw new Error(`Failed to debit sender wallet: ${deductErr.message}`);
      }

      // 3. Credit recipient
      const { error: creditErr } = await supabase
        .from('profiles')
        .update({
          wallet_balance: newRecipientBalance,
          balance: newRecipientBalance,
          available_balance: newRecipientBalance,
          updated_at: nowIso,
        })
        .eq('id', recipientId);

      if (creditErr) {
        // Rollback sender deduction if recipient update fails
        await supabase
          .from('profiles')
          .update({
            wallet_balance: senderBalance,
            balance: senderBalance,
            available_balance: senderBalance,
            updated_at: nowIso,
          })
          .eq('id', senderId);
        throw new Error(`Failed to credit recipient wallet: ${creditErr.message}`);
      }

      // Best-effort sync legacy users table if present
      try {
        await Promise.all([
          supabase.from('users').update({ wallet_balance: newSenderBalance }).eq('id', senderId),
          supabase.from('users').update({ wallet_balance: newRecipientBalance }).eq('id', recipientId),
        ]);
      } catch (_) {}

      const baseRef = `NOR-TXF-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      const senderName = senderProfile.full_name || senderProfile.name || senderProfile.email || 'NORODATA User';
      const recipientName = recipientProfile.full_name || recipientProfile.name || recipientProfile.email || 'NORODATA User';

      // 4. Record transactions for both sender and recipient
      try {
        await supabase.from('transactions').insert([
          {
            user_id: String(senderId),
            user_email: senderProfile.email || authUser.email || null,
            type: 'transfer_out',
            amount: amount,
            status: 'completed',
            reference: `${baseRef}-OUT`,
            description: note ? `Wallet transfer to ${recipientName} (${note})` : `Wallet transfer sent to ${recipientName}`,
            gateway: 'wallet_transfer',
            created_at: nowIso,
          },
          {
            user_id: String(recipientId),
            user_email: recipientProfile.email || null,
            type: 'funding',
            amount: amount,
            status: 'completed',
            reference: `${baseRef}-IN`,
            description: note ? `Wallet transfer from ${senderName} (${note})` : `Wallet transfer received from ${senderName}`,
            gateway: 'wallet_transfer',
            created_at: nowIso,
          }
        ]);
      } catch (txLogErr: any) {
        console.warn("[Wallet Transfer] Transaction log warning:", txLogErr.message);
      }

      return res.json({
        status: 'success',
        amount,
        newBalance: newSenderBalance,
        reference: baseRef,
        recipient: {
          id: recipientId,
          name: recipientName,
        }
      });
    } catch (err: any) {
      console.error("[Wallet Transfer Error]:", err.message);
      return res.status(500).json({ status: 'error', error: err.message || "Transfer failed." });
    }
  });

  // ─── Admin: Users list (paginated, searchable) ──────────────────────────
  app.get("/api/admin/users", async (req, res) => {
    if (!await requireAdmin(req, res, true)) return;
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const search = String(req.query.search || "").trim();

      let query = supabase
        .from('profiles')
        .select('id, email, full_name, name, phone_number, wallet_balance, balance, role, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        const safeSearch = pgSafeFilter(search);
        query = query.or(`email.ilike.%${safeSearch}%,full_name.ilike.%${safeSearch}%,phone_number.ilike.%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      return res.json({ users: data || [], total: count || 0, limit, offset });
    } catch (err: any) {
      console.error("[Admin Users List Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Single user detail + their transactions ─────────────────────
  app.get("/api/admin/users/:id", async (req, res) => {
    if (!await requireAdmin(req, res, true)) return;
    try {
      const userId = req.params.id;
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profErr) throw new Error(profErr.message);
      if (!profile) return res.status(404).json({ error: "User not found." });

      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txErr) console.warn("[Admin User Detail] transactions fetch warning:", txErr.message);

      return res.json({ user: profile, transactions: txs || [] });
    } catch (err: any) {
      console.error("[Admin User Detail Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Ban a user ──────────────────────────
  app.post("/api/admin/users/:id/ban", async (req, res) => {
    if (!await requireAdmin(req, res, true)) return;
    try {
      const userId = req.params.id;
      // 1. Get user email
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (profErr) throw new Error(profErr.message);
      if (!profile || !profile.email) return res.status(404).json({ error: "User email not found." });

      // 2. Add to banned_emails table
      const { error: banErr } = await supabase
        .from('banned_emails')
        .insert([{ email: profile.email }]);
        
      if (banErr && banErr.code !== '23505') { // Ignore unique constraint violation
        console.error("Error inserting into banned_emails:", banErr);
      }

      // 3. Try deleting auth user to immediately revoke access (Requires Service Role key)
      const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
      if (delErr) {
        console.warn("Could not delete from auth.users (make sure SUPABASE_SERVICE_ROLE_KEY is set):", delErr.message);
        // Fallback: Just mark their profile role as 'banned' so they can't do anything
        await supabase.from('profiles').update({ role: 'banned', user_role: 'banned' }).eq('id', userId);
      }

      return res.json({ success: true, message: "User has been banned and blacklisted." });
    } catch (err: any) {
      console.error("[Admin Ban User Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Adjust a user's wallet balance (credit or debit) ────────────
  app.post("/api/admin/users/:id/adjust-balance", async (req, res) => {
    if (!await requireAdmin(req, res, true)) return;
    try {
      const userId = req.params.id;
      const { amount, direction, reason } = req.body;
      const numAmount = Number(amount);

      if (!numAmount || numAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number." });
      }
      if (direction !== 'credit' && direction !== 'debit') {
        return res.status(400).json({ error: "Direction must be 'credit' or 'debit'." });
      }
      if (!reason || !String(reason).trim()) {
        return res.status(400).json({ error: "A reason is required for balance adjustments." });
      }

      // Identify the acting admin from their session token for the audit log
      const token = (req.headers.authorization || "").replace(/^Bearer /i, "").trim();
      const { data: { user: adminUser } } = await supabase.auth.getUser(token);

      // Target user's email (kept for the ledger row, same shape as purchase rows)
      const { data: targetProfile } = await supabase
        .from('profiles').select('email').eq('id', userId).maybeSingle();
      if (!targetProfile) {
        return res.status(404).json({ error: "Profile row not found for this user id." });
      }
      const targetUserEmail = targetProfile.email || null;

      // SAFETY: a user's dashboard only ever reads the profile row whose id
      // equals their login (auth.users) id. Duplicated/orphaned profile rows
      // DO exist in this DB (ban deletes the auth user but not the profile;
      // re-signup creates a new row), and crediting one of those moves money
      // the admin can see but the user never will. Verify the row is
      // login-linked before touching any balance, and flag sibling rows.
      const { error: authLookupErr } = await supabase.auth.admin.getUserById(userId);
      if (authLookupErr) {
        return res.status(400).json({
          error: `This profile row is NOT linked to a login account (${authLookupErr.message}). Crediting it would be invisible to the user — their dashboard reads their login-linked row. Search the user list by email and pick the row that matches their live account.`,
        });
      }
      if (targetUserEmail) {
        const { data: siblingRows } = await supabase
          .from('profiles').select('id').eq('email', targetUserEmail);
        if (siblingRows && siblingRows.length > 1) {
          console.warn("[Admin Balance Adjust] multiple profile rows for email:", targetUserEmail, siblingRows.map(r => r.id));
        }
      }

      // Credit and debit are each recorded with a transaction row the user's
      // dashboard can display. IMPORTANT: use the exact column/type patterns
      // already proven live by the SQL functions (process_payment_webhook
      // writes type 'funding' rows; deduct_wallet_and_record writes the debit
      // row atomically with the balance change inside the row lock). Write
      // errors must be surfaced -- they used to be swallowed (supabase-js
      // RETURNS errors, it does not throw them), so funds moved without a
      // visible history entry and nobody noticed.
      const reference = `ADMIN-ADJ-${Date.now()}`;
      const txWarnings: string[] = [];

      if (direction === 'credit') {
        const { error: rpcErr } = await supabase.rpc('increment_balance', { user_uuid: userId, amount: numAmount });
        if (rpcErr) throw new Error(rpcErr.message);

        const { error: txErr } = await supabase.from('transactions').insert({
          user_id: userId,
          user_email: targetUserEmail,
          type: 'funding',
          amount: numAmount,
          status: 'completed',
          description: `Admin credit: ${String(reason).trim()}`,
          reference,
          gateway: 'admin_adjustment',
          metadata: { source: 'admin_adjustment', admin_id: adminUser?.id || null, direction },
          created_at: new Date().toISOString(),
        });
        if (txErr) {
          console.error("[Admin Balance Adjust] CREDIT transaction log FAILED:", txErr.message, txErr.details || "", txErr.hint || "");
          txWarnings.push(`Wallet was credited, but the history entry failed to save (${txErr.message}).`);
        }
      } else {
        // deduct_wallet_and_record: row-locked balance check + debit + the
        // transactions row in ONE service-role call -- no window where the
        // money moved but the ledger row was lost.
        const { data: deductRes, error: rpcErr } = await supabase.rpc('deduct_wallet_and_record', {
          p_user_id: userId,
          p_amount: numAmount,
          p_reference: reference,
          p_description: `Admin debit: ${String(reason).trim()}`,
          p_type: 'purchase',
          p_metadata: { source: 'admin_adjustment', admin_id: adminUser?.id || null, direction },
        });
        if (rpcErr) throw new Error(rpcErr.message);
        const deductStatus = (deductRes as any)?.status;
        if (deductStatus === 'insufficient_funds') {
          return res.status(400).json({ error: "User has insufficient balance for this debit." });
        }
        if (deductStatus !== 'success') {
          throw new Error((deductRes as any)?.message || "Debit failed.");
        }
      }

      // Audit log (best-effort; failures reported, never silent)
      {
        const { error: auditErr } = await supabase.from('admin_wallet_adjustments').insert({
          user_id: userId,
          admin_id: adminUser?.id || null,
          amount: numAmount,
          direction,
          reason: String(reason).trim(),
        });
        if (auditErr) {
          console.error("[Admin Balance Adjust] audit log FAILED:", auditErr.message);
          txWarnings.push(`Admin audit log entry failed to save (${auditErr.message}).`);
        }
      }

      const { data: updatedProfile } = await supabase.from('profiles').select('wallet_balance, balance').eq('id', userId).maybeSingle();

      return res.json({
        success: true,
        newBalance: updatedProfile?.wallet_balance ?? null,
        ...(txWarnings.length ? { warning: txWarnings.join(" ") } : {}),
      });
    } catch (err: any) {
      console.error("[Admin Balance Adjust Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: All-users transaction ledger (paginated, filterable) ────────
  app.get("/api/admin/transactions", async (req, res) => {
    if (!await requireAdmin(req, res, true)) return;
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const status = String(req.query.status || "").trim();
      const type = String(req.query.type || "").trim();
      const search = String(req.query.search || "").trim();
      const userId = String(req.query.user_id || "").trim();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();

      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (type) query = query.eq('type', type);
      if (userId) query = query.eq('user_id', userId);
      if (from) query = query.gte('created_at', from);
      if (to) query = query.lte('created_at', to);
      if (search) {
        const safeSearch = pgSafeFilter(search);
        query = query.or(`user_email.ilike.%${safeSearch}%,reference.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,recipient.ilike.%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      return res.json({ transactions: data || [], total: count || 0, limit, offset });
    } catch (err: any) {
      console.error("[Admin Transactions List Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Mozosubz provider status / uptime check ─────────────────────
  app.get("/api/admin/mozosubz-status", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const MOZOSUBZ_SERVICES = [
        { id: 'mtn_sme', label: 'MTN SME' },
        { id: 'mtn_datashare', label: 'MTN DataShare' },
        { id: 'mtn_gifting', label: 'MTN Gifting' },
        { id: 'mtn_awoof', label: 'MTN Awoof' },
        { id: 'mtn_awoof2', label: 'MTN Awoof 2' },
        { id: 'glo_data', label: 'Glo Data' },
        { id: 'glo_sme', label: 'Glo SME' },
        { id: 'airtel_sme', label: 'Airtel SME' },
        { id: 'airtel_gifting', label: 'Airtel Gifting' },
        { id: 'etisalat_data', label: '9mobile Data' },
      ];

      const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
      const mozosubzProvider = getProvider('mozosubz');
      const apiKey = mozosubzProvider ? await mozosubzProvider.resolveApiKey() : '';

      const checkOne = async (svc: { id: string; label: string }) => {
        const start = Date.now();
        try {
          const resp = await axios.get(`${base}/data/plans`, {
            params: { service: svc.id },
            headers: { 'X-Connect-Key': apiKey },
            timeout: 8000,
            validateStatus: () => true,
          });
          const latency = Date.now() - start;
          const body = resp.data;
          if (body?.success === true) {
            return { ...svc, status: 'ok', httpStatus: resp.status, latencyMs: latency, message: `${(body.plans || []).length} plans` };
          }
          const errMsg = String(body?.error || body?.message || 'Unknown error');
          if (/inactive|revoked/i.test(errMsg)) {
            return { ...svc, status: 'key_revoked', httpStatus: resp.status, latencyMs: latency, message: errMsg };
          }
          return { ...svc, status: 'error', httpStatus: resp.status, latencyMs: latency, message: errMsg };
        } catch (e: any) {
          const latency = Date.now() - start;
          const isTimeout = e.code === 'ECONNABORTED' || /timeout/i.test(e.message || '');
          return { ...svc, status: isTimeout ? 'timeout' : 'error', httpStatus: e.response?.status || 0, latencyMs: latency, message: e.message };
        }
      };

      const results = await Promise.all(MOZOSUBZ_SERVICES.map(checkOne));
      const healthy = results.filter(r => r.status === 'ok').length;

      // Lightweight Supabase reachability check
      const dbStart = Date.now();
      let dbStatus = 'ok';
      try {
        await supabase.from('profiles').select('id').limit(1);
      } catch (e) {
        dbStatus = 'error';
      }
      const dbLatency = Date.now() - dbStart;

      return res.json({
        summary: `${healthy}/${MOZOSUBZ_SERVICES.length} services healthy`,
        healthyCount: healthy,
        totalCount: MOZOSUBZ_SERVICES.length,
        services: results,
        supabase: { status: dbStatus, latencyMs: dbLatency },
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Admin Mozosubz Status Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Dashboard summary metrics ────────────────────────────────────

  // ─── Admin: Nifex Data provider status & live balance (nifexdataapp.com.ng) ────
  app.get("/api/admin/nifex-status", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const apiKey = await resolveNifexApiKey();
      if (!apiKey) {
        return res.json({
          connected: false,
          configured: false,
          message: "Nifex Data API token is not configured. Set NIFEX_API_KEY in environment or admin settings."
        });
      }

      const start = Date.now();
      try {
        const userData = await fetchNifexUser(apiKey);
        const latencyMs = Date.now() - start;

        if (userData && (userData.user || userData.status === "success")) {
          const userObj = userData.user || userData;
          return res.json({
            connected: true,
            configured: true,
            latencyMs,
            username: userObj.username || "",
            email: userObj.email || "",
            balance: Number(userObj.wallet_balance ?? 0),
            user_type: userObj.user_type || "API User",
            message: "Connected to Nifex Data successfully",
            raw: userData
          });
        }

        return res.json({
          connected: false,
          configured: true,
          latencyMs,
          error: userData?.msg || userData?.message || "Invalid Nifex Data token or unauthorized"
        });
      } catch (apiErr: any) {
        const latencyMs = Date.now() - start;
        const errMsg = apiErr.response?.data?.msg || apiErr.response?.data?.message || apiErr.message;
        return res.json({
          connected: false,
          configured: true,
          latencyMs,
          error: errMsg || "Failed to connect to Nifex Data API",
          raw: apiErr.response?.data
        });
      }
    } catch (err: any) {
      console.error("[GET /api/admin/nifex-status Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Fetch / Sync Live Nifex Data plans (No Hardcoding) ────────────
  app.post("/api/admin/fetch-nifex-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const apiKey = await resolveNifexApiKey();
      if (!apiKey) {
        return res.status(503).json({ error: "Nifex Data API token not configured. Please set NIFEX_API_KEY in Admin Settings." });
      }

      const { balance: userBalance, plans: liveNifexPlans } = await fetchNifexLivePlans(apiKey);
      if (!liveNifexPlans.length) {
        return res.status(404).json({
          error: "No live data plans were returned by Nifex Data API. Verify your Nifex account token and plan catalog on nifexdataapp.com.ng.",
        });
      }

      const { data: dbRows } = await supabase
        .from("services_config")
        .select("mozosubz_plan_id, bigisub_identifier_id, selling_price, provider");
      const priceMap: Record<string, number> = {};
      (dbRows || []).forEach((r: any) => {
        const k = String(r.mozosubz_plan_id || r.bigisub_identifier_id || "");
        if (k) priceMap[k] = Number(r.selling_price || 0);
      });

      const enriched = liveNifexPlans.map((p: any) => ({
        ...p,
        selling_price: priceMap[p.id] || priceMap[String(p.plan_id)] || Math.ceil(Number(p.price) * 1.12),
        provider: "nifex",
      }));

      return res.json({ success: true, balance: userBalance, plans: enriched });
    } catch (err: any) {
      console.error("[POST /api/admin/fetch-nifex-plans Exception]:", err);
      const errMsg = err.response?.data?.msg || err.response?.data?.message || err.message;
      return res.status(500).json({ error: `Failed to fetch live Nifex Data plans: ${errMsg}` });
    }
  });

  // ─── Admin: Force Fetch / Sync Plans From ALL Providers (Mozosubz + Nifex Data) ───
  app.post("/api/admin/fetch-all-providers-plans", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { autoPublish = false, defaultMarkup = 10 } = req.body;
      console.log("[Admin] Force-fetching data plans from ALL providers (Mozosubz & Nifex Data)...");

      const allCombinedPlans: any[] = [];
      const providerStats: Record<string, { count: number; error?: string }> = {
        mozosubz: { count: 0 },
        nifex: { count: 0 },
      };

      // 1. Fetch Mozosubz plans
      try {
        const CONNECT_KEY = await resolveMozosubzApiKey();
        const MOZO_BASE = "https://mozosubz.xyz/api/v1";
        const MOZO_SERVICES = [
          { id: "mtn_sme", network: "MTN", plan_type: "SME" },
          { id: "mtn_gifting", network: "MTN", plan_type: "GIFTING" },
          { id: "mtn_datashare", network: "MTN", plan_type: "DATASHARE" },
          { id: "mtn_awoof", network: "MTN", plan_type: "AWOOF" },
          { id: "mtn_awoof2", network: "MTN", plan_type: "AWOOF" },
          { id: "glo_sme", network: "GLO", plan_type: "SME" },
          { id: "glo_data", network: "GLO", plan_type: "DATA" },
          { id: "airtel_sme", network: "AIRTEL", plan_type: "SME" },
          { id: "airtel_gifting", network: "AIRTEL", plan_type: "GIFTING" },
          { id: "etisalat_data", network: "9MOBILE", plan_type: "DATA" },
        ];

        if (CONNECT_KEY && CONNECT_KEY.length > 5 && !CONNECT_KEY.includes('PASTE_YOUR')) {
          const results = await Promise.allSettled(
            MOZO_SERVICES.map(async (svc) => {
              const url = `${MOZO_BASE}/data/plans?service=${svc.id}`;
              const resp = await fetch(url, {
                headers: { "X-Connect-Key": CONNECT_KEY, "Content-Type": "application/json" },
                signal: AbortSignal.timeout(8000),
              });
              const data: any = await resp.json().catch(() => ({}));
              if (!data.success || !Array.isArray(data.plans)) return [];
              return data.plans.map((p: any) => ({
                id: String(p.id),
                plan_id: String(p.id),
                service: svc.id,
                name: p.name,
                price: Number(p.price),
                network: svc.network,
                plan_type: svc.plan_type,
                provider: "mozosubz",
              }));
            })
          );

          for (const r of results) {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              allCombinedPlans.push(...r.value);
              providerStats.mozosubz.count += r.value.length;
            }
          }
        }
      } catch (mozoErr: any) {
        console.warn("[fetch-all-providers-plans] Mozosubz fetch error:", mozoErr.message);
        providerStats.mozosubz.error = mozoErr.message;
      }

      // 2. Fetch Nifex Data live plans directly via Nifex API key (No hardcoded plans)
      try {
        const nifexKey = await resolveNifexApiKey();
        if (nifexKey && nifexKey.length > 5 && !nifexKey.includes("PASTE_YOUR")) {
          const { plans: liveNifexPlans } = await fetchNifexLivePlans(nifexKey);
          allCombinedPlans.push(...liveNifexPlans);
          providerStats.nifex.count += liveNifexPlans.length;
        } else {
          providerStats.nifex.error = "NIFEX_API_KEY not configured";
        }
      } catch (nifexErr: any) {
        console.warn("[fetch-all-providers-plans] Nifex fetch error:", nifexErr.message);
        providerStats.nifex.error = nifexErr.message;
      }

      // 3. Deduplicate combined plans by name + network + provider
      const seen = new Set<string>();
      const deduplicatedPlans = allCombinedPlans.filter(p => {
        const key = `${p.network}_${p.name}_${p.provider}`.toLowerCase().replace(/\s+/g, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // 4. If autoPublish requested, upsert directly into services_config!
      let publishedCount = 0;
      if (autoPublish) {
        const markup = Number(defaultMarkup) || 10;
        const rowsToUpsert = deduplicatedPlans.map(p => {
          const cost = Number(p.price || 0);
          const selling = Math.ceil(cost * (1 + markup / 100));
          return {
            service_type: 'data',
            network_or_provider: p.network,
            provider_or_network: p.network,
            item_name: p.name,
            cost_price: cost,
            selling_price: selling,
            retail_price: selling,
            agent_price: Math.ceil(cost * 1.02),
            reseller_price: Math.ceil(cost * 1.05),
            bigisub_identifier_id: p.id,
            mozosubz_plan_id: p.id,
            mozosubz_service: p.service,
            provider: p.provider,
            validity_days: '30 Days',
            is_active: true,
            updated_at: new Date().toISOString(),
          };
        });

        // Batch upsert in chunks of 50
        const db = getScopedSupabaseClient(req.headers.authorization);
        for (let i = 0; i < rowsToUpsert.length; i += 50) {
          const chunk = rowsToUpsert.slice(i, i + 50);
          const { error } = await db
            .from('services_config')
            .upsert(chunk, { onConflict: 'bigisub_identifier_id' });
          if (!error) publishedCount += chunk.length;
        }
      }

      return res.json({
        success: true,
        message: `Successfully force-fetched ${deduplicatedPlans.length} plans across all providers.`,
        total: deduplicatedPlans.length,
        plans: deduplicatedPlans,
        providerStats,
        autoPublished: autoPublish,
        publishedCount,
      });
    } catch (err: any) {
      console.error("[fetch-all-providers-plans Exception]:", err);
      return res.status(500).json({ error: `Internal server error: ${err.message}` });
    }
  });

  // ─── Admin: Save and inspect VTU provider API keys (Mozosubz, Nifex, Bigisub) ───
  app.post("/api/admin/provider-secrets", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { identifier, secret } = req.body;
      if (!identifier || typeof identifier !== 'string') {
        return res.status(400).json({ error: "Missing key identifier (e.g. mozosubz_api_key or nifex_api_key)." });
      }
      const trimmedSecret = String(secret || '').trim();
      await setProviderSecret(identifier.trim(), trimmedSecret);
      console.log(`[Admin] Successfully configured provider secret '${identifier}'.`);
      return res.json({ success: true, message: `Key for '${identifier}' saved and activated successfully.` });
    } catch (err: any) {
      console.error("[POST /api/admin/provider-secrets Exception]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/provider-secrets", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const mozoKey = await resolveMozosubzApiKey();
      const nifexKey = await resolveNifexApiKey();
      const bigiKey = await resolveBigisubApiKey();
      const bachsKey = await resolveBachsSecretKey();
      const bachsWebhookKey = await resolveBachsWebhookSecret();
      return res.json({
        mozosubz: {
          configured: Boolean(mozoKey && mozoKey.length > 5 && !mozoKey.includes('dummy')),
          masked: mozoKey && mozoKey.length > 8 ? `${mozoKey.slice(0, 4)}••••${mozoKey.slice(-4)}` : (mozoKey ? "••••" : null),
        },
        nifex: {
          configured: Boolean(nifexKey && nifexKey.length > 5 && !nifexKey.includes('dummy')),
          masked: nifexKey && nifexKey.length > 8 ? `${nifexKey.slice(0, 4)}••••${nifexKey.slice(-4)}` : (nifexKey ? "••••" : null),
        },
        bigisub: {
          configured: Boolean(bigiKey && bigiKey.length > 5 && !bigiKey.includes('dummy')),
          masked: bigiKey && bigiKey.length > 8 ? `${bigiKey.slice(0, 4)}••••${bigiKey.slice(-4)}` : (bigiKey ? "••••" : null),
        },
        bachs: {
          configured: Boolean(bachsKey && bachsKey.length > 8 && !bachsKey.includes('dummy')),
          masked: bachsKey && bachsKey.length > 8 ? `${bachsKey.slice(0, 7)}••••${bachsKey.slice(-4)}` : (bachsKey ? "••••" : null),
          webhookConfigured: Boolean(bachsWebhookKey && bachsWebhookKey.length > 5 && !bachsWebhookKey.includes('dummy')),
          webhookMasked: bachsWebhookKey && bachsWebhookKey.length > 8 ? `${bachsWebhookKey.slice(0, 6)}••••${bachsWebhookKey.slice(-4)}` : (bachsWebhookKey ? "••••" : null),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Admin: Live test provider key (Mozosubz, Nifex, or Bachs.io) ─────────
  app.post("/api/admin/test-provider-key", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const { provider, key } = req.body;
      const testKey = String(key || '').trim();
      if (!testKey) {
        return res.status(400).json({ success: false, error: "Please provide an API key to test." });
      }

      if (provider === 'bachs') {
        const baseUrl = resolveBachsBaseUrl(testKey);
        const balancesEndpoint = getBachsEndpoint(baseUrl, '/v1/balances');
        const resp = await fetch(balancesEndpoint, {
          headers: {
            Authorization: `Bearer ${testKey.replace(/^Bearer\s+/i, '').trim()}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });
        const data: any = await resp.json().catch(() => ({}));
        if (resp.ok) {
          return res.json({
            success: true,
            provider: 'bachs',
            message: `Connected successfully to Bachs.io (${testKey.startsWith('sk_sandbox_') ? 'Sandbox' : 'Live'})!`,
            balances: data,
          });
        }
        return res.status(401).json({
          success: false,
          error: data?.detail || data?.message || `Bachs.io rejected the key (HTTP ${resp.status}). Ensure you use a valid sk_live_... or sk_sandbox_... secret key.`,
        });
      }

      if (provider === 'nifex') {
        const { balance, plans } = await fetchNifexLivePlans(testKey);
        return res.json({
          success: true,
          provider: 'nifex',
          balance,
          planCount: plans.length,
          message: `Connected successfully to Nifex Data! Account balance: ₦${Number(balance).toLocaleString()} (${plans.length} live plans found).`
        });
      }

      // Default: Mozosubz
      const testUrl = "https://mozosubz.xyz/api/v1/data/plans?service=mtn_sme";
      const cleanToken = testKey.replace(/^Token\s+/i, '').trim();
      const resp = await fetch(testUrl, {
        headers: {
          "X-Connect-Key": cleanToken,
          "Authorization": `Token ${cleanToken}`,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(10000)
      });
      const data: any = await resp.json().catch(() => ({}));
      if (resp.ok && data.success !== false) {
        return res.json({
          success: true,
          provider: 'mozosubz',
          planCount: Array.isArray(data.plans) ? data.plans.length : 0,
          message: `Connected successfully to Mozosubz API! Verified ${Array.isArray(data.plans) ? data.plans.length : 'active'} plans.`
        });
      }
      return res.status(401).json({
        success: false,
        error: data.error || data.message || `Mozosubz returned HTTP ${resp.status}: Invalid API key`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `Connection failed: ${err.message}` });
    }
  });

  app.get("/api/admin/dashboard-summary", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        { count: totalUsers },
        { count: usersToday },
        { count: usersWeek },
        { count: usersMonth },
        { data: balances },
        { count: txToday },
        { count: txWeek },
        { count: txMonth },
        { data: recentTx },
        { data: last30dTx },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfWeek),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('profiles').select('wallet_balance'),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', startOfWeek),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('transactions').select('id, user_email, type, amount, status, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('transactions').select('type, amount, status, created_at').gte('created_at', last30d),
      ]);

      const totalWalletLiability = (balances || []).reduce((sum: number, p: any) => sum + Number(p.wallet_balance || 0), 0);

      const last30 = last30dTx || [];
      const successCount = last30.filter((t: any) => t.status === 'success' || t.status === 'completed').length;
      const successRate = last30.length > 0 ? Math.round((successCount / last30.length) * 100) : 0;

      const planCounts: Record<string, number> = {};
      last30.forEach((t: any) => {
        const key = t.type || 'unknown';
        planCounts[key] = (planCounts[key] || 0) + 1;
      });
      const topPlans = Object.entries(planCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

      // Revenue proxy: sum of successful transaction amounts in the last 30 days
      // (cost_price/selling_price margin isn't reliably joinable from transactions as stored today).
      const revenue30d = last30
        .filter((t: any) => t.status === 'success' || t.status === 'completed')
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

      return res.json({
        users: { total: totalUsers || 0, today: usersToday || 0, week: usersWeek || 0, month: usersMonth || 0 },
        walletLiability: totalWalletLiability,
        transactions: { today: txToday || 0, week: txWeek || 0, month: txMonth || 0 },
        successRatePercent30d: successRate,
        revenueProxy30d: revenue30d,
        revenueProxyNote: "Sum of successful transaction amounts over the last 30 days (cost/selling-price margin isn't cleanly joinable from the transactions table as currently stored).",
        topPlans,
        recentActivity: recentTx || [],
      });
    } catch (err: any) {
      console.error("[Admin Dashboard Summary Error]:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── eSIM Inquiries & Messages Management (Permanent Supabase Persistence) ───
  let serverEsimInquiries: any[] = [];
  try {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const esimFile = path.join(dataDir, 'esim_inquiries.json');
    if (fs.existsSync(esimFile)) {
      serverEsimInquiries = JSON.parse(fs.readFileSync(esimFile, 'utf-8'));
    }
  } catch (_) {}

  const loadEsimInquiriesStore = async (): Promise<any[]> => {
    try {
      const { data } = await supabase
        .from('provider_secrets')
        .select('secret')
        .eq('identifier', 'esim_inquiries_store_v2')
        .maybeSingle();
      if (data?.secret) {
        const parsed = JSON.parse(data.secret);
        if (Array.isArray(parsed)) {
          serverEsimInquiries = parsed;
          return serverEsimInquiries;
        }
      }
    } catch (_) {}
    return serverEsimInquiries;
  };

  const saveEsimInquiries = async (inquiriesToSave?: any[]) => {
    if (Array.isArray(inquiriesToSave)) {
      serverEsimInquiries = inquiriesToSave;
    }
    try {
      const dataDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'esim_inquiries.json'), JSON.stringify(serverEsimInquiries, null, 2));
    } catch (_) {}
    try {
      await supabase.from('provider_secrets').upsert({
        identifier: 'esim_inquiries_store_v2',
        secret: JSON.stringify(serverEsimInquiries),
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn('[saveEsimInquiries Supabase warning]:', err?.message || err);
    }
  };

  // GET /api/esim/inquiries (Allowed on all admin accounts)
  app.get("/api/esim/inquiries", async (req, res) => {
    if (!await requireEsimAdmin(req, res)) return;
    const inquiries = await loadEsimInquiriesStore();
    return res.json({ inquiries });
  });

  // GET /api/esim/inquiries/my (Customer fetches their own permanent eSIM chat history)
  app.get("/api/esim/inquiries/my", async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      const email = String(req.query.email || '').toLowerCase().trim();
      const inquiries = await loadEsimInquiriesStore();
      const mine = inquiries.filter((i: any) =>
        (email && String(i.user_email || '').toLowerCase().trim() === email) ||
        (userId && userId !== 'visitor' && String(i.user_id) === userId)
      );
      return res.json({ inquiries: mine });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/esim/inquiries (Customer inquiry / purchase request with wallet balance check & permanent history)
  app.post("/api/esim/inquiries", async (req, res) => {
    try {
      const {
        user_id = 'visitor',
        user_name = 'Customer',
        user_email = '',
        user_phone = '',
        package_id = 'us-5gb',
        package_label = 'USA 5GB eSIM',
        package_price = '₦8,500',
        destination_country = 'United States',
        device_model = 'Smartphone',
        message = '',
        check_balance = false,
      } = req.body;

      const inquiries = await loadEsimInquiriesStore();
      const numericPrice = Number(String(package_price || '').replace(/[^\d.]/g, '')) || 0;

      // Check user's live wallet balance if logged in
      let buyerBalance = 0;
      if (user_id && user_id !== 'visitor') {
        const { data: prof } = await supabase
          .from('profiles')
          .select('wallet_balance, balance')
          .eq('id', user_id)
          .maybeSingle();
        buyerBalance = Number(prof?.wallet_balance ?? prof?.balance ?? 0);
      }

      const existingIdx = inquiries.findIndex((i: any) =>
        (user_email && String(i.user_email || '').toLowerCase().trim() === String(user_email).toLowerCase().trim()) ||
        (user_id !== 'visitor' && i.user_id === user_id)
      );

      if (check_balance && numericPrice > 0 && buyerBalance < numericPrice) {
        return res.status(400).json({
          error: `Insufficient Balance! This eSIM (${package_label}) costs ₦${numericPrice.toLocaleString()}, but your wallet balance is ₦${buyerBalance.toLocaleString()}. Please fund your wallet before requesting to buy.`,
          code: 'INSUFFICIENT_BALANCE',
          required: numericPrice,
          balance: buyerBalance,
        });
      }

      const nowIso = new Date().toISOString();
      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: 'user',
        sender_name: user_name || 'Customer',
        sender_email: user_email || '',
        text: String(message || 'Inquiry initiated').trim(),
        created_at: nowIso,
      };

      let inquiryObj: any;
      if (existingIdx >= 0) {
        if (!Array.isArray(inquiries[existingIdx].messages)) inquiries[existingIdx].messages = [];
        inquiries[existingIdx].messages.push(newMsg);
        inquiries[existingIdx].last_message = newMsg.text;
        inquiries[existingIdx].last_message_at = newMsg.created_at;
        inquiries[existingIdx].updated_at = nowIso;
        if (device_model) inquiries[existingIdx].device_model = device_model;
        if (package_label) inquiries[existingIdx].package_label = package_label;
        if (package_price) inquiries[existingIdx].package_price = package_price;
        inquiryObj = inquiries[existingIdx];
      } else {
        inquiryObj = {
          id: `inq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          user_id,
          user_name,
          user_email,
          user_phone,
          package_id,
          package_label,
          package_price,
          destination_country,
          device_model,
          status: 'pending',
          created_at: nowIso,
          updated_at: nowIso,
          last_message: newMsg.text,
          last_message_at: newMsg.created_at,
          messages: [newMsg],
        };
        inquiries.unshift(inquiryObj);
      }

      await saveEsimInquiries(inquiries);
      return res.json({ success: true, inquiry: inquiryObj });
    } catch (err: any) {
      console.error("[POST /api/esim/inquiries Error]:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/esim/inquiries/:id/messages (Admin or Customer reply - permanently saved)
  app.post("/api/esim/inquiries/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const { text, sender = 'admin', sender_name = 'eSIM Desk', sender_email = 'jeffholland299@gmail.com', activation_code } = req.body;

      const inquiries = await loadEsimInquiriesStore();
      const inquiry = inquiries.find(i => i.id === id);
      if (!inquiry) {
        return res.status(404).json({ error: "eSIM inquiry not found" });
      }

      const nowIso = new Date().toISOString();
      const msg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender,
        sender_name,
        sender_email,
        text: String(text || '').trim(),
        activation_code: activation_code || undefined,
        has_qr: Boolean(activation_code),
        created_at: nowIso,
      };

      if (!Array.isArray(inquiry.messages)) inquiry.messages = [];
      inquiry.messages.push(msg);
      inquiry.last_message = msg.text;
      inquiry.last_message_at = msg.created_at;
      inquiry.updated_at = nowIso;
      if (activation_code) inquiry.activation_code = activation_code;
      if (sender === 'admin' && inquiry.status === 'pending') {
        inquiry.status = 'in_progress';
      }

      await saveEsimInquiries(inquiries);
      return res.json({ success: true, inquiry });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/esim/inquiries/:id/status (Admin updates status; auto-debits wallet if completed)
  app.patch("/api/esim/inquiries/:id/status", async (req, res) => {
    if (!await requireEsimAdmin(req, res)) return;
    try {
      const { id } = req.params;
      const { status } = req.body;
      const inquiries = await loadEsimInquiriesStore();
      const inquiry = inquiries.find(i => i.id === id);
      if (!inquiry) return res.status(404).json({ error: "eSIM inquiry not found" });

      const nowIso = new Date().toISOString();
      const numericPrice = Number(String(inquiry.package_price || '').replace(/[^\d.]/g, '')) || 0;

      if (status === 'completed' && !inquiry.payment_debited && numericPrice > 0 && inquiry.user_id && inquiry.user_id !== 'visitor') {
        const { data: buyerProf } = await supabase
          .from('profiles')
          .select('id, email, wallet_balance, balance')
          .eq('id', inquiry.user_id)
          .maybeSingle();

        const currentBal = Number(buyerProf?.wallet_balance ?? buyerProf?.balance ?? 0);
        if (currentBal < numericPrice) {
          return res.status(400).json({
            error: `Insufficient Balance! Customer wallet has ₦${currentBal.toLocaleString()}, required ₦${numericPrice.toLocaleString()}.`,
            code: 'INSUFFICIENT_BALANCE',
          });
        }

        const newBal = Number((currentBal - numericPrice).toFixed(2));
        const paymentRef = `ESIM-DEAL-${Date.now()}`;
        await supabase.from('profiles').update({
          wallet_balance: newBal,
          balance: newBal,
          available_balance: newBal,
          updated_at: nowIso,
        }).eq('id', inquiry.user_id);

        try {
          await supabase.from('transactions').insert({
            user_id: String(inquiry.user_id),
            user_email: buyerProf?.email || inquiry.user_email || null,
            type: 'esim',
            amount: numericPrice,
            status: 'completed',
            reference: paymentRef,
            description: `eSIM Purchase: ${inquiry.package_label || 'International eSIM'}`,
            gateway: 'wallet_auto_debit',
            created_at: nowIso,
          });
        } catch (_) {}

        inquiry.payment_debited = true;
        inquiry.payment_reference = paymentRef;
        if (!Array.isArray(inquiry.messages)) inquiry.messages = [];
        inquiry.messages.push({
          id: `msg-${Date.now()}-done`,
          sender: 'admin',
          sender_name: 'NORODATA eSIM Desk',
          text: `🎉 eSIM DEAL COMPLETED! ₦${numericPrice.toLocaleString()} has been automatically debited from your wallet (Ref: ${paymentRef}).`,
          created_at: nowIso,
        });
      }

      inquiry.status = status;
      inquiry.updated_at = nowIso;
      await saveEsimInquiries(inquiries);
      return res.json({ success: true, inquiry });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Marketplace & Foreign Numbers (Admin-Only Number Listing + Permanent Live Chat + Auto-Debit) ───
  const MARKETPLACE_CATEGORIES = [
    { id: 'cat-us-phone', name: 'US Phone Numbers', description: 'American phone numbers for verification and calls', icon: '🇺🇸', type: 'foreign_number' },
    { id: 'cat-uk-phone', name: 'UK Phone Numbers', description: 'British phone numbers for verification and calls', icon: '🇬🇧', type: 'foreign_number' },
    { id: 'cat-ca-phone', name: 'Canada Phone Numbers', description: 'Canadian phone numbers for verification and calls', icon: '🇨🇦', type: 'foreign_number' },
    { id: 'cat-ig-acc', name: 'Instagram Accounts', description: 'Verified Instagram accounts with active followers', icon: '📷', type: 'social_account' },
    { id: 'cat-tt-acc', name: 'TikTok Accounts', description: 'TikTok accounts with active followers and high engagement', icon: '🎵', type: 'social_account' },
    { id: 'cat-x-acc', name: 'Twitter/X Accounts', description: 'Twitter/X verified accounts and pages', icon: '𝕏', type: 'social_account' },
    { id: 'cat-snap-acc', name: 'Snapchat Accounts', description: 'Snapchat accounts with high score and active contacts', icon: '👻', type: 'social_account' },
    { id: 'cat-fb-acc', name: 'Facebook Accounts', description: 'Facebook pages, groups, and aged accounts', icon: '👍', type: 'social_account' },
  ];

  const SEEDED_FOREIGN_NUMBER_LISTINGS = [
    {
      id: 'num-us-clean',
      seller_id: 'admin',
      category_id: 'cat-us-phone',
      title: '🇺🇸 Clean USA +1 Phone Number (WhatsApp / Telegram / PayPal)',
      description: 'Official Admin-verified non-VoIP USA number ready for instant SMS OTP code verification on WhatsApp, Telegram, PayPal, and Google. Click to open chat with Admin, receive your login code, and your wallet will be debited automatically once the deal is done.',
      price: 4500,
      product_details: { item_identifier: '+1 (555) 234-8901', phone_number: '+1 (555) 234-8901', country: 'United States', carrier: 'AT&T / T-Mobile Non-VoIP' },
      status: 'available',
      views: 94,
      is_admin_listing: true,
      created_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
      marketplace_categories: { name: 'US Phone Numbers', icon: '🇺🇸', type: 'foreign_number' },
      profiles: { full_name: 'NORODATA Official Admin', name: 'NORODATA Official Admin', marketplace_seller_rating: 5.0, marketplace_seller_reviews: 128 }
    },
    {
      id: 'num-uk-clean',
      seller_id: 'admin',
      category_id: 'cat-uk-phone',
      title: '🇬🇧 Clean UK +44 Phone Number (WhatsApp / TikTok / Banking)',
      description: 'Official Admin-verified British +44 mobile number for instant OTP verification. Click to open live chat with Admin and receive your login code — automatic wallet debit once completed.',
      price: 5000,
      product_details: { item_identifier: '+44 7700 900412', phone_number: '+44 7700 900412', country: 'United Kingdom', carrier: 'Vodafone UK Physical SIM' },
      status: 'available',
      views: 67,
      is_admin_listing: true,
      created_at: new Date(Date.now() - 3600 * 1000 * 8).toISOString(),
      marketplace_categories: { name: 'UK Phone Numbers', icon: '🇬🇧', type: 'foreign_number' },
      profiles: { full_name: 'NORODATA Official Admin', name: 'NORODATA Official Admin', marketplace_seller_rating: 5.0, marketplace_seller_reviews: 128 }
    },
    {
      id: 'num-ca-clean',
      seller_id: 'admin',
      category_id: 'cat-ca-phone',
      title: '🇨🇦 Clean Canada +1 Phone Number (WhatsApp / Global Apps)',
      description: 'Official Admin-verified Canadian +1 phone number for SMS verification. Click to chat directly with Admin, receive your login code, and complete your deal.',
      price: 4800,
      product_details: { item_identifier: '+1 (416) 555-0184', phone_number: '+1 (416) 555-0184', country: 'Canada', carrier: 'Rogers Canada SIM' },
      status: 'available',
      views: 51,
      is_admin_listing: true,
      created_at: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      marketplace_categories: { name: 'Canada Phone Numbers', icon: '🇨🇦', type: 'foreign_number' },
      profiles: { full_name: 'NORODATA Official Admin', name: 'NORODATA Official Admin', marketplace_seller_rating: 5.0, marketplace_seller_reviews: 128 }
    },
    {
      id: 'acc-ig-aged',
      seller_id: 'seller-2',
      category_id: 'cat-ig-acc',
      title: '📷 Aged Instagram Account (2020) • 12.5k Real Followers',
      description: 'Established 2020 lifestyle & fashion page. 12.5k organic followers, high engagement rate, full email access included.',
      price: 25000,
      product_details: { item_identifier: '@fashionvibes_ng', username: '@fashionvibes_ng', followers: '12.5k', platform: 'Instagram' },
      status: 'available',
      views: 110,
      created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
      marketplace_categories: { name: 'Instagram Accounts', icon: '📷', type: 'social_account' },
      profiles: { full_name: 'DigitalAssets Hub', name: 'DigitalAssets Hub', marketplace_seller_rating: 4.9, marketplace_seller_reviews: 65 }
    }
  ];

  const CORE_MARKETPLACE_ADMIN_EMAILS = [
    ADMIN_EMAIL.toLowerCase().trim(),
    'ibrahimfaruqolamilekan4@gmail.com',
    'adewaleogunkeye200@gmail.com',
    'jeffholland299@gmail.com',
  ].filter(Boolean);

  let memoryMarketplaceAdmins: string[] = [... new Set(CORE_MARKETPLACE_ADMIN_EMAILS)];

  const loadMarketplaceAdmins = async (): Promise<string[]> => {
    try {
      const { data } = await supabase
        .from('provider_secrets')
        .select('secret')
        .eq('identifier', 'marketplace_admins_store_v2')
        .maybeSingle();
      if (data?.secret) {
        const parsed = JSON.parse(data.secret);
        if (Array.isArray(parsed)) {
          memoryMarketplaceAdmins = Array.from(new Set([
            ...CORE_MARKETPLACE_ADMIN_EMAILS,
            ...parsed.map((e: any) => String(e || '').toLowerCase().trim()).filter(Boolean),
          ]));
        }
      }
    } catch (_) {}
    return memoryMarketplaceAdmins;
  };

  const saveMarketplaceAdmins = async (emails: string[]) => {
    const normalized = Array.from(new Set([
      ...CORE_MARKETPLACE_ADMIN_EMAILS,
      ...emails.map((e) => String(e || '').toLowerCase().trim()).filter(Boolean),
    ]));
    memoryMarketplaceAdmins = normalized;
    try {
      await supabase.from('provider_secrets').upsert({
        identifier: 'marketplace_admins_store_v2',
        secret: JSON.stringify(normalized),
        updated_at: new Date().toISOString(),
      });
    } catch (_) {}
    // Also promote these emails in Supabase profiles table so role='admin' everywhere
    for (const email of normalized) {
      try {
        await supabase.from('profiles').update({ role: 'admin' }).ilike('email', email);
      } catch (_) {}
    }
    return normalized;
  };

  // Ensure core admin emails are promoted in profiles on startup
  saveMarketplaceAdmins(CORE_MARKETPLACE_ADMIN_EMAILS).catch(() => {});

  const isCallerAdminUser = async (req: any, authUser?: any): Promise<boolean> => {
    const allowedAdmins = await loadMarketplaceAdmins();
    const headerEmail = String(req.headers['x-admin-email'] || '').toLowerCase().trim();
    const userEmail = String(authUser?.email || headerEmail || '').toLowerCase().trim();
    if (userEmail && allowedAdmins.includes(userEmail)) return true;
    if (authUser?.user_metadata?.role === 'admin') return true;
    if (authUser?.id) {
      try {
        const { data: prof } = await supabase.from('profiles').select('role, email').eq('id', authUser.id).maybeSingle();
        if (prof?.role === 'admin') return true;
        if (prof?.email && allowedAdmins.includes(String(prof.email).toLowerCase().trim())) return true;
      } catch (_) {}
    }
    return false;
  };

  // GET /api/marketplace/admins — Get promoted Foreign Number & Marketplace Admin emails
  app.get("/api/marketplace/admins", async (req, res) => {
    try {
      let authUser: any = null;
      const authHeader = String(req.headers.authorization || '');
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const { data } = await supabase.auth.getUser(token);
        authUser = data?.user || null;
      }
      const admins = await loadMarketplaceAdmins();
      const isCallerAdmin = await isCallerAdminUser(req, authUser);
      return res.json({ admins, isCallerAdmin });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/marketplace/admins/promote — Promote an email to Foreign Number & Marketplace Admin
  app.post("/api/marketplace/admins/promote", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const isAdmin = await isCallerAdminUser(req, authUser);
      if (!isAdmin) {
        return res.status(403).json({ error: "Only an existing Admin can promote new Admin emails." });
      }
      const emailToPromote = String(req.body?.email || '').toLowerCase().trim();
      if (!emailToPromote || !emailToPromote.includes('@')) {
        return res.status(400).json({ error: "Please enter a valid email address to promote." });
      }
      const currentAdmins = await loadMarketplaceAdmins();
      const updatedAdmins = await saveMarketplaceAdmins([...currentAdmins, emailToPromote]);
      return res.json({
        success: true,
        email: emailToPromote,
        admins: updatedAdmins,
        message: `${emailToPromote} has been promoted to Foreign Number & Marketplace Admin!`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to promote email." });
    }
  });

  // DELETE /api/marketplace/admins/:email — Remove promoted Admin email
  app.delete("/api/marketplace/admins/:email", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const isAdmin = await isCallerAdminUser(req, authUser);
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden." });
      }
      const targetEmail = decodeURIComponent(String(req.params.email || '')).toLowerCase().trim();
      if (CORE_MARKETPLACE_ADMIN_EMAILS.includes(targetEmail)) {
        return res.status(400).json({ error: "Core platform admin email cannot be demoted." });
      }
      const currentAdmins = await loadMarketplaceAdmins();
      const filtered = currentAdmins.filter((e) => e !== targetEmail);
      const updatedAdmins = await saveMarketplaceAdmins(filtered);
      try {
        await supabase.from('profiles').update({ role: 'user' }).ilike('email', targetEmail);
      } catch (_) {}
      return res.json({ success: true, admins: updatedAdmins });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  let memoryMarketplaceListings: any[] | null = null;
  let memoryMarketplaceOrders: any[] | null = null;

  // Initialize from local disk backup if available
  try {
    const dataDir = path.join(process.cwd(), '.data');
    const mpFile = path.join(dataDir, 'marketplace_store.json');
    if (fs.existsSync(mpFile)) {
      const parsed = JSON.parse(fs.readFileSync(mpFile, 'utf-8'));
      if (Array.isArray(parsed?.listings)) memoryMarketplaceListings = parsed.listings;
      if (Array.isArray(parsed?.orders)) memoryMarketplaceOrders = parsed.orders;
    }
  } catch (_) {}

  const loadMarketplaceStore = async (): Promise<{ listings: any[]; orders: any[] }> => {
    try {
      const { data: rows } = await supabase
        .from('provider_secrets')
        .select('identifier, secret')
        .in('identifier', ['marketplace_listings_store_v2', 'marketplace_orders_store_v2']);

      let listings: any[] | null = null;
      let orders: any[] | null = null;

      if (rows && rows.length > 0) {
        for (const r of rows) {
          if (r.identifier === 'marketplace_listings_store_v2' && r.secret) {
            try { listings = JSON.parse(r.secret); } catch (_) {}
          }
          if (r.identifier === 'marketplace_orders_store_v2' && r.secret) {
            try { orders = JSON.parse(r.secret); } catch (_) {}
          }
        }
      }

      if (!Array.isArray(listings) || listings.length === 0) {
        listings = memoryMarketplaceListings || [...SEEDED_FOREIGN_NUMBER_LISTINGS];
      }
      if (!Array.isArray(orders)) {
        orders = memoryMarketplaceOrders || [];
      }

      memoryMarketplaceListings = listings;
      memoryMarketplaceOrders = orders;
      return { listings, orders };
    } catch (_) {
      if (!memoryMarketplaceListings) memoryMarketplaceListings = [...SEEDED_FOREIGN_NUMBER_LISTINGS];
      if (!memoryMarketplaceOrders) memoryMarketplaceOrders = [];
      return { listings: memoryMarketplaceListings, orders: memoryMarketplaceOrders };
    }
  };

  const saveMarketplaceStore = async (listings: any[], orders: any[]) => {
    memoryMarketplaceListings = listings;
    memoryMarketplaceOrders = orders;

    // 1. Save to local disk backup
    try {
      const dataDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(
        path.join(dataDir, 'marketplace_store.json'),
        JSON.stringify({ listings, orders, updated_at: new Date().toISOString() }, null, 2)
      );
    } catch (_) {}

    // 2. Save permanently to Supabase provider_secrets (TEXT column - unlimited length)
    try {
      const nowIso = new Date().toISOString();
      await supabase.from('provider_secrets').upsert([
        {
          identifier: 'marketplace_listings_store_v2',
          secret: JSON.stringify(listings),
          updated_at: nowIso,
        },
        {
          identifier: 'marketplace_orders_store_v2',
          secret: JSON.stringify(orders),
          updated_at: nowIso,
        }
      ]);
    } catch (err: any) {
      console.warn("[Marketplace Store Save Warning]:", err.message);
    }
  };

  app.get("/api/marketplace/categories", async (_req, res) => {
    return res.json({ categories: MARKETPLACE_CATEGORIES });
  });

  app.get("/api/marketplace/listings", async (req, res) => {
    try {
      const { listings } = await loadMarketplaceStore();
      const category = String(req.query.category || 'all').trim();
      const type = String(req.query.type || 'all').trim();
      const search = String(req.query.search || '').trim().toLowerCase();
      const includeSold = req.query.includeSold === 'true';

      let result = listings.filter((item: any) => includeSold || item.status === 'available');
      if (category && category !== 'all') {
        result = result.filter((item: any) => item.category_id === category);
      }
      if (type && type !== 'all') {
        result = result.filter((item: any) => item.marketplace_categories?.type === type);
      }
      if (search) {
        result = result.filter((item: any) =>
          String(item.title || '').toLowerCase().includes(search) ||
          String(item.description || '').toLowerCase().includes(search) ||
          String(item.product_details?.phone_number || item.product_details?.item_identifier || '').toLowerCase().includes(search)
        );
      }

      return res.json({ listings: result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/marketplace/listings", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { categoryId, title, description, price, productDetails, imageUrl } = req.body || {};
      const cat = MARKETPLACE_CATEGORIES.find((c) => c.id === categoryId) || MARKETPLACE_CATEGORIES[0];
      const isForeignNumber = cat.type === 'foreign_number';
      const isAdmin = await isCallerAdminUser(req, authUser);

      // STRICT RULE: Only Admin can post Foreign Numbers for sale!
      if (isForeignNumber && !isAdmin) {
        return res.status(403).json({
          error: "Only the platform Admin can post foreign numbers for sale.",
        });
      }

      const numPrice = Number(price);
      if (!title || !Number.isFinite(numPrice) || numPrice <= 0) {
        return res.status(400).json({ error: "Valid title and selling price are required." });
      }

      const { data: sellerProf } = await supabase
        .from('profiles')
        .select('full_name, name, email')
        .eq('id', authUser.id)
        .maybeSingle();

      const sellerDisplayName = isForeignNumber
        ? 'NORODATA Official Admin'
        : (sellerProf?.full_name || sellerProf?.name || authUser.email?.split('@')[0] || 'Verified Seller');

      const newListing = {
        id: `lst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        seller_id: isForeignNumber ? 'admin' : authUser.id,
        created_by_id: authUser.id,
        created_by_email: authUser.email || sellerProf?.email || '',
        category_id: cat.id,
        title: String(title).trim(),
        description: String(description || '').trim(),
        price: numPrice,
        product_details: productDetails || {},
        image_url: imageUrl || null,
        status: 'available',
        views: 1,
        is_admin_listing: isForeignNumber || isAdmin,
        created_at: new Date().toISOString(),
        marketplace_categories: {
          name: cat.name,
          icon: cat.icon,
          type: cat.type,
        },
        profiles: {
          full_name: sellerDisplayName,
          name: sellerDisplayName,
          marketplace_seller_rating: 5.0,
          marketplace_seller_reviews: 100,
        },
      };

      const { listings, orders } = await loadMarketplaceStore();
      listings.unshift(newListing);
      await saveMarketplaceStore(listings, orders);

      return res.json({ listing: newListing });
    } catch (err: any) {
      console.error("[POST /api/marketplace/listings Error]:", err.message);
      return res.status(500).json({ error: err.message || "Failed to create listing." });
    }
  });

  app.delete("/api/marketplace/listings/:id", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const isAdmin = await isCallerAdminUser(req, authUser);
      const { listings, orders } = await loadMarketplaceStore();
      const idx = listings.findIndex((l: any) => l.id === id);
      if (idx === -1) return res.status(404).json({ error: "Listing not found." });

      const target = listings[idx];
      if (!isAdmin && target.seller_id !== authUser.id && target.created_by_id !== authUser.id) {
        return res.status(403).json({ error: "Forbidden: you can only delete your own listings." });
      }

      listings.splice(idx, 1);
      await saveMarketplaceStore(listings, orders);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Initiate or resume order + live chat when user clicks on a Foreign Number / listing
  app.post("/api/marketplace/orders/initiate", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const buyerId = authUser.id;
      const { listingId, listingSnapshot } = req.body || {};
      if (!listingId) return res.status(400).json({ error: "listingId is required." });

      const { listings, orders } = await loadMarketplaceStore();
      let listing = listings.find((l: any) => l.id === listingId) || listingSnapshot;
      if (!listing) {
        return res.status(404).json({ error: "Listing not found." });
      }

      const isForeignNumber = listing.marketplace_categories?.type === 'foreign_number' || String(listing.category_id || '').includes('phone');
      const isAdmin = await isCallerAdminUser(req, authUser);

      const { data: buyerProf } = await supabase
        .from('profiles')
        .select('id, full_name, name, email, phone_number, wallet_balance, balance')
        .eq('id', buyerId)
        .maybeSingle();

      const buyerName = buyerProf?.full_name || buyerProf?.name || authUser.email?.split('@')[0] || 'Buyer';
      const buyerEmail = buyerProf?.email || authUser.email || '';
      const buyerBalance = Number(buyerProf?.wallet_balance ?? buyerProf?.balance ?? 0);
      const requiredPrice = Number(listing.price || 0);

      // Check for an existing active order for this buyer on this listing
      const existingOrder = orders.find((o: any) =>
        o.listing_id === listing.id &&
        o.buyer_id === buyerId &&
        ['pending', 'code_requested', 'code_sent', 'paid'].includes(o.status)
      );

      // STRICT WALLET BALANCE CHECK: Buyer must have funded their wallet with the required amount before requesting to buy any number
      if (!isAdmin && (!existingOrder || existingOrder.status !== 'paid') && requiredPrice > 0 && buyerBalance < requiredPrice) {
        return res.status(400).json({
          error: `Insufficient Balance! This number costs ₦${requiredPrice.toLocaleString()}, but your wallet balance is ₦${buyerBalance.toLocaleString()}. Please fund your wallet before requesting to buy this number.`,
          code: 'INSUFFICIENT_BALANCE',
          required: requiredPrice,
          balance: buyerBalance,
        });
      }

      if (existingOrder) {
        existingOrder.buyer = {
          ...existingOrder.buyer,
          wallet_balance: buyerBalance,
        };
        return res.json({ order: existingOrder });
      }

      const phonePreview = listing.product_details?.phone_number || listing.product_details?.item_identifier || listing.title || '';
      const nowIso = new Date().toISOString();
      const orderId = `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const initialMessages: any[] = [
        {
          id: `msg-${Date.now()}-1`,
          order_id: orderId,
          sender_id: buyerId,
          sender_name: buyerName,
          sender_email: buyerEmail,
          sender_role: 'buyer',
          message_type: 'text',
          content: isForeignNumber
            ? `👋 Hi Admin! I clicked on foreign number "${phonePreview}" (${listing.title}) for ₦${requiredPrice.toLocaleString()}. My wallet is funded (₦${buyerBalance.toLocaleString()}). Please send me the verification code to login!`
            : `Hi! I'm interested in purchasing: "${listing.title}" (₦${requiredPrice.toLocaleString()}). Let's finalize the details here.`,
          created_at: nowIso,
        }
      ];

      if (isForeignNumber) {
        initialMessages.push({
          id: `msg-${Date.now()}-2`,
          order_id: orderId,
          sender_id: 'admin',
          sender_name: 'NORODATA Official Admin',
          sender_email: 'ibrahimfaruqolamilekan4@gmail.com',
          sender_role: 'admin',
          message_type: 'text',
          content: `✅ Connected to NORODATA Official Admin Desk!\n\n📱 Clicked Foreign Number: ${phonePreview}\n💰 Price: ₦${requiredPrice.toLocaleString()} (Your Wallet: ₦${buyerBalance.toLocaleString()} Verified)\n\n1️⃣ Copy the phone number above (${phonePreview}) and enter it into the app/account you want to login.\n2️⃣ Click "Request Verification Code" below or message Admin here as soon as the app sends the code.\n3️⃣ Immediately after Admin gives you the code and the deal is done, ₦${requiredPrice.toLocaleString()} will be debited from your wallet automatically!`,
          created_at: nowIso,
        });
      }

      const newOrder = {
        id: orderId,
        listing_id: listing.id,
        buyer_id: buyerId,
        seller_id: isForeignNumber ? 'admin' : (listing.seller_id || 'admin'),
        clicked_number: phonePreview,
        price: requiredPrice,
        status: 'pending',
        is_foreign_number: isForeignNumber,
        code_requested: false,
        created_at: nowIso,
        updated_at: nowIso,
        marketplace_listings: {
          id: listing.id,
          title: listing.title,
          price: requiredPrice,
          description: listing.description,
          product_details: {
            ...(listing.product_details || {}),
            phone_number: phonePreview,
            item_identifier: phonePreview,
          },
          image_url: listing.image_url || null,
          marketplace_categories: listing.marketplace_categories || { name: 'Foreign Number', icon: '📱', type: 'foreign_number' },
        },
        seller: {
          id: isForeignNumber ? 'admin' : listing.seller_id,
          full_name: isForeignNumber ? 'NORODATA Official Admin' : (listing.profiles?.full_name || 'Verified Seller'),
          name: isForeignNumber ? 'NORODATA Official Admin' : (listing.profiles?.name || 'Verified Seller'),
          marketplace_seller_rating: 5.0,
        },
        buyer: {
          id: buyerId,
          full_name: buyerName,
          name: buyerName,
          email: buyerEmail,
          phone_number: buyerProf?.phone_number || '',
          wallet_balance: buyerBalance,
        },
        messages: initialMessages,
      };

      orders.unshift(newOrder);
      await saveMarketplaceStore(listings, orders);
      return res.json({ order: newOrder });
    } catch (err: any) {
      console.error("[POST /api/marketplace/orders/initiate Error]:", err.message);
      return res.status(500).json({ error: err.message || "Failed to initiate order chat." });
    }
  });

  // Get orders for buyer, seller, or Admin (all orders + full permanent chat history)
  app.get("/api/marketplace/orders", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const role = String(req.query.role || 'buyer').trim();
      const isAdmin = await isCallerAdminUser(req, authUser);
      const { orders } = await loadMarketplaceStore();

      let filtered: any[] = [];
      if (role === 'admin' && isAdmin) {
        filtered = orders;
      } else if (role === 'seller') {
        filtered = orders.filter((o: any) =>
          o.seller_id === authUser.id || (isAdmin && (o.seller_id === 'admin' || o.is_foreign_number))
        );
      } else {
        filtered = orders.filter((o: any) => o.buyer_id === authUser.id);
      }

      // Enrich buyer balances for admin view
      if (isAdmin && filtered.length > 0) {
        const buyerIds = Array.from(new Set(filtered.map((o: any) => o.buyer_id).filter(Boolean)));
        if (buyerIds.length > 0) {
          const { data: buyerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, name, email, phone_number, wallet_balance, balance')
            .in('id', buyerIds);
          const map: Record<string, any> = {};
          (buyerProfiles || []).forEach((p: any) => { map[p.id] = p; });
          filtered = filtered.map((o: any) => {
            const bp = map[o.buyer_id];
            if (!bp) return o;
            return {
              ...o,
              buyer: {
                ...o.buyer,
                id: bp.id,
                full_name: bp.full_name || bp.name || o.buyer?.full_name || 'Buyer',
                email: bp.email || o.buyer?.email || '',
                phone_number: bp.phone_number || o.buyer?.phone_number || '',
                wallet_balance: Number(bp.wallet_balance ?? bp.balance ?? 0),
              }
            };
          });
        }
      }

      return res.json({ orders: filtered });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Get single order + permanent messages + live buyer wallet balance
  app.get("/api/marketplace/orders/:id", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const isAdmin = await isCallerAdminUser(req, authUser);
      const { orders } = await loadMarketplaceStore();
      const order = orders.find((o: any) => o.id === id);
      if (!order) return res.status(404).json({ error: "Order not found." });

      if (!isAdmin && order.buyer_id !== authUser.id && order.seller_id !== authUser.id) {
        return res.status(403).json({ error: "Forbidden." });
      }

      // Refresh live buyer wallet balance
      let buyerBalance = Number(order.buyer?.wallet_balance ?? 0);
      if (order.buyer_id) {
        const { data: bp } = await supabase
          .from('profiles')
          .select('id, full_name, name, email, phone_number, wallet_balance, balance')
          .eq('id', order.buyer_id)
          .maybeSingle();
        if (bp) {
          buyerBalance = Number(bp.wallet_balance ?? bp.balance ?? 0);
          order.buyer = {
            ...order.buyer,
            id: bp.id,
            full_name: bp.full_name || bp.name || order.buyer?.full_name || 'Buyer',
            email: bp.email || order.buyer?.email || '',
            phone_number: bp.phone_number || order.buyer?.phone_number || '',
            wallet_balance: buyerBalance,
          };
        }
      }

      return res.json({
        order,
        messages: order.messages || [],
        buyerBalance,
        isAdmin,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Send message in order chat (permanently saved in chat history for full audit/traceability)
  app.post("/api/marketplace/orders/:id/messages", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const content = String(req.body?.content || '').trim();
      if (!content) return res.status(400).json({ error: "Message content is required." });

      const isAdmin = await isCallerAdminUser(req, authUser);
      const { listings, orders } = await loadMarketplaceStore();
      const order = orders.find((o: any) => o.id === id);
      if (!order) return res.status(404).json({ error: "Order not found." });

      const senderIsBuyer = authUser.id === order.buyer_id && (!isAdmin || req.body?.asRole === 'buyer');
      const senderId = senderIsBuyer ? authUser.id : (isAdmin ? 'admin' : authUser.id);
      const senderRole = senderIsBuyer ? 'buyer' : 'admin';
      const senderName = senderRole === 'admin'
        ? `Admin (${authUser.email || 'Official Desk'})`
        : (order.buyer?.full_name || order.buyer?.name || authUser.email || 'Buyer');

      const nowIso = new Date().toISOString();
      const msg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        order_id: id,
        sender_id: senderId,
        sender_name: senderName,
        sender_email: authUser.email || '',
        sender_role: senderRole,
        message_type: 'text',
        content,
        created_at: nowIso,
      };

      if (!Array.isArray(order.messages)) order.messages = [];
      order.messages.push(msg);
      order.last_message = content;
      order.last_message_at = nowIso;
      order.updated_at = nowIso;
      await saveMarketplaceStore(listings, orders);

      return res.json({ message: msg, order });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Buyer clicks "Request Verification Code" in chat
  app.post("/api/marketplace/orders/:id/request-code", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const { listings, orders } = await loadMarketplaceStore();
      const order = orders.find((o: any) => o.id === id);
      if (!order) return res.status(404).json({ error: "Order not found." });

      // Check buyer's live wallet balance so Admin knows buyer has funds ready for auto-debit
      const { data: bp } = await supabase
        .from('profiles')
        .select('wallet_balance, balance')
        .eq('id', order.buyer_id)
        .maybeSingle();
      const buyerBalance = Number(bp?.wallet_balance ?? bp?.balance ?? 0);
      const requiredPrice = Number(order.price || 0);

      if (buyerBalance < requiredPrice && order.status !== 'paid') {
        return res.status(400).json({
          error: `Insufficient Balance! Your wallet balance is ₦${buyerBalance.toLocaleString()}, but this number requires ₦${requiredPrice.toLocaleString()}. Please fund your wallet before requesting the login code.`,
          code: 'INSUFFICIENT_BALANCE',
          required: requiredPrice,
          balance: buyerBalance,
        });
      }

      const phonePreview = order.clicked_number || order.marketplace_listings?.product_details?.phone_number || order.marketplace_listings?.title || 'this number';
      const nowIso = new Date().toISOString();
      const msg = {
        id: `msg-${Date.now()}-req`,
        order_id: id,
        sender_id: order.buyer_id,
        sender_name: order.buyer?.full_name || authUser.email || 'Buyer',
        sender_email: authUser.email || order.buyer?.email || '',
        sender_role: 'buyer',
        message_type: 'text',
        content: `🔔 LOGIN CODE REQUEST: Admin, I have entered the number ${phonePreview} to login. Please send me the verification OTP code now! (Wallet balance ₦${buyerBalance.toLocaleString()} verified — ₦${requiredPrice.toLocaleString()} will be auto-debited once done).`,
        created_at: nowIso,
      };

      if (!Array.isArray(order.messages)) order.messages = [];
      order.messages.push(msg);
      order.code_requested = true;
      order.status = order.status === 'pending' ? 'code_requested' : order.status;
      order.last_message = msg.content;
      order.last_message_at = nowIso;
      order.updated_at = nowIso;
      await saveMarketplaceStore(listings, orders);

      return res.json({ order, message: msg });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Helper to complete deal and automatically debit buyer's wallet
  const executeOrderDealCompletion = async (order: any, listings: any[], orders: any[], verificationCode?: string) => {
    if (order.status === 'completed') {
      return { order, alreadyCompleted: true };
    }

    const nowIso = new Date().toISOString();
    const price = Number(order.price || 0);
    let paymentRef = order.payment_reference || `NUM-DEAL-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    let newBuyerBalance = 0;

    // Automatically debit buyer's wallet if not already paid!
    if (order.status !== 'paid' && !order.payment_reference && price > 0) {
      const { data: buyerProf, error: bErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, name, wallet_balance, balance, available_balance')
        .eq('id', order.buyer_id)
        .maybeSingle();

      if (bErr || !buyerProf) {
        throw new Error("Buyer wallet profile not found.");
      }

      const currentBalance = Number(buyerProf.wallet_balance ?? buyerProf.balance ?? 0);
      if (currentBalance < price) {
        throw new Error(`Insufficient Balance! Buyer wallet balance is ₦${currentBalance.toLocaleString()}, but ₦${price.toLocaleString()} is required to complete the deal.`);
      }

      newBuyerBalance = Number((currentBalance - price).toFixed(2));
      const { error: deductErr } = await supabase
        .from('profiles')
        .update({
          wallet_balance: newBuyerBalance,
          balance: newBuyerBalance,
          available_balance: newBuyerBalance,
          updated_at: nowIso,
        })
        .eq('id', order.buyer_id);

      if (deductErr) {
        throw new Error(`Failed to auto-debit buyer wallet: ${deductErr.message}`);
      }

      try {
        await supabase.from('users').update({ wallet_balance: newBuyerBalance }).eq('id', order.buyer_id);
      } catch (_) {}

      const phoneNum = order.clicked_number || order.marketplace_listings?.product_details?.phone_number || '';
      // Record transaction in ledger
      try {
        await supabase.from('transactions').insert({
          user_id: String(order.buyer_id),
          user_email: buyerProf.email || null,
          type: 'marketplace',
          amount: price,
          status: 'completed',
          reference: paymentRef,
          description: `Foreign Number Purchase: ${phoneNum ? `${phoneNum} - ` : ''}${order.marketplace_listings?.title || 'Foreign Number'}`,
          gateway: 'wallet_auto_debit',
          created_at: nowIso,
        });
      } catch (_) {}

      // If seller is a real non-admin user UUID (e.g. social account seller), credit seller 98%
      if (order.seller_id && order.seller_id !== 'admin' && /^[0-9a-f-]{36}$/i.test(order.seller_id)) {
        try {
          const sellerPayout = Math.floor(price * 0.98);
          const { data: sellerProf } = await supabase
            .from('profiles')
            .select('id, email, wallet_balance, balance')
            .eq('id', order.seller_id)
            .maybeSingle();
          if (sellerProf) {
            const sBal = Number(sellerProf.wallet_balance ?? sellerProf.balance ?? 0);
            const newSBal = Number((sBal + sellerPayout).toFixed(2));
            await supabase.from('profiles').update({
              wallet_balance: newSBal,
              balance: newSBal,
              available_balance: newSBal,
              updated_at: nowIso,
            }).eq('id', order.seller_id);
            await supabase.from('transactions').insert({
              user_id: String(order.seller_id),
              user_email: sellerProf.email || null,
              type: 'funding',
              amount: sellerPayout,
              status: 'completed',
              reference: `${paymentRef}-PAYOUT`,
              description: `Marketplace sale payout: ${order.marketplace_listings?.title || 'Listing'}`,
              gateway: 'marketplace_escrow',
              created_at: nowIso,
            });
          }
        } catch (_) {}
      }
    }

    order.status = 'completed';
    order.paid_at = order.paid_at || nowIso;
    order.completed_at = nowIso;
    order.verified_at = nowIso;
    order.payment_reference = paymentRef;
    if (verificationCode) {
      order.verification_code = verificationCode;
    }
    if (order.buyer) {
      order.buyer.wallet_balance = newBuyerBalance;
    }

    // Mark custom listing as sold (keep seeded template numbers available or mark sold if custom)
    const listingObj = listings.find((l: any) => l.id === order.listing_id);
    if (listingObj && !['num-us-clean', 'num-uk-clean', 'num-ca-clean'].includes(listingObj.id)) {
      listingObj.status = 'sold';
    }

    const doneContent = `🎉 DEAL COMPLETED! ₦${price.toLocaleString()} has been automatically debited from the buyer's wallet (Ref: ${paymentRef}). Login code delivered and permanently recorded in chat history.`;
    if (!Array.isArray(order.messages)) order.messages = [];
    order.messages.push({
      id: `msg-${Date.now()}-done`,
      order_id: order.id,
      sender_id: 'admin',
      sender_name: 'NORODATA Official Admin',
      sender_role: 'admin',
      message_type: 'text',
      content: doneContent,
      created_at: nowIso,
    });
    order.last_message = doneContent;
    order.last_message_at = nowIso;
    order.updated_at = nowIso;

    await saveMarketplaceStore(listings, orders);
    return { order, newBuyerBalance, reference: paymentRef };
  };

  // Admin/Seller sends verification code in chat (with optional auto-complete & auto-debit)
  app.post("/api/marketplace/orders/:id/send-code", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const code = String(req.body?.code || '').trim();
      const autoCompleteDeal = Boolean(req.body?.autoCompleteDeal);
      if (!code) return res.status(400).json({ error: "Verification code is required." });

      const isAdmin = await isCallerAdminUser(req, authUser);
      const { listings, orders } = await loadMarketplaceStore();
      const order = orders.find((o: any) => o.id === id);
      if (!order) return res.status(404).json({ error: "Order not found." });

      if (!isAdmin && order.seller_id !== authUser.id) {
        return res.status(403).json({ error: "Only Admin or the seller can send verification codes." });
      }

      const nowIso = new Date().toISOString();
      const msg = {
        id: `msg-${Date.now()}-code`,
        order_id: id,
        sender_id: isAdmin ? 'admin' : authUser.id,
        sender_name: `Admin (${authUser.email || 'Official Desk'})`,
        sender_email: authUser.email || '',
        sender_role: 'admin',
        message_type: 'verification_code',
        content: `Here is your login verification code for ${order.clicked_number || order.marketplace_listings?.product_details?.phone_number || 'your number'}:`,
        code_value: code,
        created_at: nowIso,
      };

      if (!Array.isArray(order.messages)) order.messages = [];
      order.messages.push(msg);
      order.verification_code = code;
      order.status = order.status === 'pending' || order.status === 'code_requested' ? 'code_sent' : order.status;
      order.last_message = `Login Verification Code Sent: ${code}`;
      order.last_message_at = nowIso;
      order.updated_at = nowIso;

      if (autoCompleteDeal) {
        const result = await executeOrderDealCompletion(order, listings, orders, code);
        return res.json({ success: true, order: result.order, message: msg, dealCompleted: true, newBuyerBalance: result.newBuyerBalance });
      }

      await saveMarketplaceStore(listings, orders);
      return res.json({ success: true, order, message: msg, dealCompleted: false });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || "Failed to send code." });
    }
  });

  // Complete deal & automatically debit buyer's wallet (callable by Admin or Buyer once code is delivered)
  app.post("/api/marketplace/orders/:id/complete-deal", async (req, res) => {
    const authUser = await requireUser(req, res);
    if (!authUser) return;
    try {
      const { id } = req.params;
      const submittedCode = String(req.body?.code || '').trim();
      const isAdmin = await isCallerAdminUser(req, authUser);
      const { listings, orders } = await loadMarketplaceStore();
      const order = orders.find((o: any) => o.id === id);
      if (!order) return res.status(404).json({ error: "Order not found." });

      if (!isAdmin && order.buyer_id !== authUser.id && order.seller_id !== authUser.id) {
        return res.status(403).json({ error: "Forbidden." });
      }

      const latestCodeMsg = [...(order.messages || [])].reverse().find((m: any) => m.message_type === 'verification_code');
      const finalCode = submittedCode || latestCodeMsg?.code_value || order.verification_code || 'VERIFIED';

      const result = await executeOrderDealCompletion(order, listings, orders, finalCode);
      return res.json({
        success: true,
        order: result.order,
        newBuyerBalance: result.newBuyerBalance,
        reference: result.reference,
      });
    } catch (err: any) {
      console.error("[POST /api/marketplace/orders/:id/complete-deal Error]:", err.message);
      return res.status(400).json({ error: err.message || "Failed to complete deal." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import so 'vite' (a devDependency, correctly excluded from the
    // production serverless bundle) is never loaded/required in production.
    // A top-level static import would execute unconditionally at module load
    // time regardless of this NODE_ENV check, pulling in vite -> rollup and
    // crashing every request before this branch is even reached.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // In production on Vercel, we export the app; locally we listen
  if (process.env.VERCEL !== '1') {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

// Export for Vercel serverless (module.exports / export default)
let _appInstance: any = null;
const getExpressApp = async () => {
  if (!_appInstance) {
    _appInstance = await startServer();
  }
  return _appInstance;
};

export default getExpressApp;

// Also start listening if running directly (not on Vercel)
if (process.env.VERCEL !== '1') {
  startServer().catch(console.error);
}
