/**
 * VTU Provider Plugin System
 * ===========================
 * To add a new provider:
 *   1. Create a new object implementing `VtuProvider`
 *   2. Add it to the `PROVIDERS` map below
 *   3. Set `provider = 'yourprovider'` on plans in services_config
 *   Done. No other changes needed anywhere.
 */

import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PurchaseParams {
  type: 'data' | 'airtime';
  network: string;               // e.g. "MTN", "GLO", "Airtel", "9mobile"
  phone: string;
  amount: number;
  planId: string;                // provider-specific plan identifier
  providerPlanId?: string;       // override if stored separately (e.g. bigisub_identifier_id)
  mozosubzService?: string;      // e.g. "mtn_sme" — Mozosubz-specific
  apiKey: string;
}

export interface PurchaseResult {
  success: boolean;
  reference?: string;
  raw?: any;
  error?: string;
  /**
   * Outcome is UNKNOWN (timeout / connection error / unparseable gateway
   * response). The provider MAY still have delivered the value, so the caller
   * must NOT auto-refund -- it should keep the charge and mark the transaction
   * pending/processing until the outcome is known.
   */
  ambiguous?: boolean;
}

export interface VtuProvider {
  name: string;
  resolveApiKey: () => Promise<string>;
  purchase: (params: PurchaseParams) => Promise<PurchaseResult>;
}

/**
 * VTU gateways legitimately take 10-40s to confirm a data delivery (the
 * carrier confirms asynchronously). The previous 10-12s timeouts fired while
 * the delivery was still in flight, so the order was marked failed and the
 * wallet was auto-refunded even though the user DID receive the data.
 * The serverless function allows 60s, so 45s leaves room for the rest of the
 * handler (RPC + logging) while giving the provider time to answer.
 */
const PROVIDER_TIMEOUT_MS = 45000;

/**
 * Classify an axios failure:
 *  - `responded`  -> the gateway answered with an error status/body. This is a
 *                   DEFINITE rejection: safe to refund.
 *  - `unknown`    -> timeout / DNS / connection reset / aborted socket. The
 *                   request may still have been processed: NOT safe to refund.
 */
function classifyAxiosError(err: any): 'responded' | 'unknown' {
  if (err?.response) return 'responded';       // gateway replied (4xx/5xx with body)
  if (err?.code === 'ECONNABORTED') return 'unknown'; // our timeout fired
  if (err?.code && String(err.code).startsWith('E')) return 'unknown'; // ECONNRESET, ENOTFOUND, ...
  return 'unknown';
}

function isTimeoutError(err: any): boolean {
  return err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''));
}

/** Extract a human-readable error from an axios error (or generic error). */
function axiosErrorMessage(err: any, fallback: string): string {
  return (
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.response?.data?.Status ||
    err?.message ||
    fallback
  );
}

/** Case-insensitive field lookup (Bigisub returns `Status` with a capital S). */
function pickField(obj: any, ...keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  const lowered: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) lowered[k.toLowerCase()] = v;
  for (const k of keys) {
    if (lowered[k.toLowerCase()] !== undefined && lowered[k.toLowerCase()] !== null) return lowered[k.toLowerCase()];
  }
  return undefined;
}

const SUCCESS_WORDS = ['success', 'successful', 'successfully', 'completed', 'complete', 'delivered', 'approved'];

/** True when the gateway body explicitly reports success. */
function bodyReportsSuccess(d: any): boolean {
  if (!d || typeof d !== 'object') return false;
  if (d.success === true || d.ok === true) return true;
  const status = String(pickField(d, 'status', 'Status', 'state') ?? '').toLowerCase().trim();
  if (status && SUCCESS_WORDS.includes(status)) return true;
  const apiResponse = String(pickField(d, 'api_response', 'apiResponse', 'message', 'remark') ?? '');
  // Bigisub returns e.g. api_response: "You have successfully subscribed to SME data 500.0MB..."
  if (/successfully|successful|subscribed|delivered|approved/i.test(apiResponse) && !/fail|insufficient|error/i.test(apiResponse)) {
    return true;
  }
  return false;
}

/** True when the gateway body explicitly reports failure. */
function bodyReportsFailure(d: any): boolean {
  if (!d || typeof d !== 'object') return false;
  if (d.success === false) return true;
  const status = String(pickField(d, 'status', 'Status', 'state') ?? '').toLowerCase().trim();
  if (status && (status.includes('fail') || status.includes('reject') || status.includes('error') || status.includes('declined'))) {
    return true;
  }
  const apiResponse = String(pickField(d, 'api_response', 'apiResponse') ?? '');
  if (/fail|insufficient|error|declined|reversed/i.test(apiResponse)) return true;
  return false;
}

// ─── Supabase client (injected at runtime to avoid circular deps) ─────────────
let _supabase: any = null;
export function initProviders(supabaseClient: any) {
  _supabase = supabaseClient;
}

// ─── Key resolvers ────────────────────────────────────────────────────────────

async function resolveKeyFromEnvOrDb(envVar: string, dbIdentifier: string): Promise<string> {
  if (process.env[envVar]) return process.env[envVar]!;
  if (_supabase) {
    // SECURITY: secrets live in the service-role-only provider_secrets table
    // (supabase_security_hardening.sql); services_config is legacy fallback.
    try {
      const { data } = await _supabase
        .from('provider_secrets')
        .select('secret')
        .eq('identifier', dbIdentifier)
        .maybeSingle();
      if (data?.secret) return data.secret;
    } catch (_) { /* table may not exist pre-migration */ }
    try {
      const { data } = await _supabase
        .from('services_config')
        .select('item_name')
        .eq('bigisub_identifier_id', dbIdentifier)
        .maybeSingle();
      if (data?.item_name) return data.item_name;
    } catch (_) {}
  }
  return '';
}

// ─── Network name helpers ─────────────────────────────────────────────────────

function normNetwork(network: string): string {
  const n = network.toLowerCase();
  if (n.includes('mtn'))                               return 'mtn';
  if (n.includes('glo'))                               return 'glo';
  if (n.includes('airtel'))                            return 'airtel';
  if (n.includes('9mobile') || n.includes('etisalat')) return 'etisalat';
  return n;
}

/**
 * Bigisub network IDs (per their official API docs):
 *   1 = MTN, 2 = GLO, 3 = 9MOBILE, 4 = AIRTEL
 * NOTE: this previously returned 3 for Airtel and 4 for 9mobile, which routed
 * every Airtel/9mobile purchase to the WRONG network at the provider.
 */
function bigiNetworkId(network: string): number {
  const n = normNetwork(network);
  if (n === 'mtn')      return 1;
  if (n === 'glo')      return 2;
  if (n === 'etisalat') return 3; // 9mobile
  if (n === 'airtel')   return 4;
  return 1;
}

// ─── Provider: Mozosubz ───────────────────────────────────────────────────────

const mozosubzProvider: VtuProvider = {
  name: 'mozosubz',

  resolveApiKey: async () => {
    // Support all env var names the project has historically used
    return process.env.MOZOSUBS_CONNECT_KEY
        || process.env.MOZOSUBZ_CONNECT_KEY
        || process.env.MOZOSUBZ_API_KEY
        || await resolveKeyFromEnvOrDb('MOZOSUBZ_API_KEY', 'mozosubz_api_key')
        || '';
  },

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
    const net  = normNetwork(p.network);

    const url     = p.type === 'data' ? `${base}/data/purchase` : `${base}/airtime/purchase`;
    const service = p.mozosubzService || `${net}_sme`;
    // Plan IDs are stored composite as `${service}_${rawId}` because Mozosubz reuses the
    // same raw numeric id across different services (e.g. id "166" exists in mtn_sme,
    // mtn_datashare AND mtn_gifting with different prices) -- strip the prefix back off
    // before calling the real API, which only wants the raw id.
    const rawPlanIdStr = String(p.planId);
    const rawPlanId = rawPlanIdStr.startsWith(`${service}_`)
      ? rawPlanIdStr.slice(service.length + 1)
      : rawPlanIdStr;
    const payload = p.type === 'data'
      ? { service, plan_id: rawPlanId, phone: p.phone }
      : { network: net, amount: p.amount, phone: p.phone };

    console.log(`[Mozosubz] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

    let resp: any;
    try {
      resp = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'X-Connect-Key': p.apiKey },
        timeout: PROVIDER_TIMEOUT_MS,
      });
    } catch (err: any) {
      // Timeout / connection failure: the order may still be in flight.
      // Return `ambiguous` so the caller keeps the charge and marks the
      // transaction pending instead of refunding a delivered bundle.
      if (classifyAxiosError(err) === 'unknown') {
        console.warn(`[Mozosubz] ${p.type} purchase outcome UNKNOWN (${isTimeoutError(err) ? 'timeout' : 'network error'}): ${axiosErrorMessage(err, 'connection failed')} -- leaving charge pending for review`);
        return {
          success: false,
          ambiguous: true,
          error: isTimeoutError(err) ? 'Provider is taking longer than usual to confirm this transaction.' : axiosErrorMessage(err, 'Provider connection failed.'),
          raw: { error: axiosErrorMessage(err, 'connection failed'), code: err?.code },
        };
      }
      // Gateway answered with a definitive error -> safe to reject/refund.
      return {
        success: false,
        error: axiosErrorMessage(err, 'Rejected by Mozosubz'),
        raw: err?.response?.data,
      };
    }

    const d = resp.data;
    if (bodyReportsSuccess(d)) {
      const reference = pickField(d, 'transaction_id', 'reference', 'id', 'tran_id');
      return { success: true, reference, raw: d };
    }
    if (bodyReportsFailure(d) || d?.error || d?.message) {
      const errMsg = pickField(d, 'error', 'message') || 'Rejected by Mozosubz';
      return { success: false, error: errMsg, raw: d };
    }
    // 2xx but an unrecognised body: outcome unknown, do NOT refund.
    return {
      success: false,
      ambiguous: true,
      error: 'Provider returned an unrecognised response for this transaction.',
      raw: d,
    };
  },
};



export interface UtilityPurchaseParams {
  type: 'cable' | 'electricity';
  provider: string;
  packageName?: string;
  smartcard?: string;
  meterType?: 'PREPAID' | 'POSTPAID';
  meterNumber?: string;
  amount: number;
  phone: string;
  apiKey: string;
}

export async function purchaseMozosubzUtility(p: UtilityPurchaseParams): Promise<PurchaseResult> {
  const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
  const isCable = p.type === 'cable';
  const url = isCable ? `${base}/cable/purchase` : `${base}/electricity/purchase`;
  const discoNames: Record<string, string> = {
    IKEDC: 'ikeja electric', EKEDC: 'eko electric', AEDC: 'abuja electric',
    PHED: 'port harcourt electric', IBEDC: 'ibadan electric', KAEDCO: 'kaduna electric',
    KEDCO: 'kano electric', JED: 'jos electric', EEDC: 'enugu electric',
    BEDC: 'benin electric', YEDC: 'yola electric', BAEDC: 'bauchi electric',
  };
  const payload = isCable
    ? {
        provider: p.provider.toLowerCase(),
        package: p.packageName,
        smartcard: p.smartcard,
        phone: p.phone,
      }
    : {
        disco: discoNames[p.provider.toUpperCase()] || p.provider,
        meter_type: p.meterType || 'PREPAID',
        meter_number: p.meterNumber,
        amount: p.amount,
        phone: p.phone,
      };

  console.log(`[Mozosubz] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

  let resp: any;
  try {
    resp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'X-Connect-Key': p.apiKey },
      timeout: PROVIDER_TIMEOUT_MS,
    });
  } catch (err: any) {
    if (classifyAxiosError(err) === 'unknown') {
      return {
        success: false,
        ambiguous: true,
        error: isTimeoutError(err) ? 'Provider is taking longer than usual to confirm this transaction.' : axiosErrorMessage(err, 'Provider connection failed.'),
        raw: { error: axiosErrorMessage(err, 'connection failed'), code: err?.code },
      };
    }
    return {
      success: false,
      error: axiosErrorMessage(err, `Rejected by Mozosubz (${p.type})`),
      raw: err?.response?.data,
    };
  }

  const d = resp.data;
  if (bodyReportsSuccess(d)) {
    const reference = pickField(d, 'transaction_id', 'reference', 'id', 'tran_id');
    return { success: true, reference, raw: d };
  }
  if (bodyReportsFailure(d) || d?.error || d?.message) {
    const errMsg = pickField(d, 'error', 'message') || `Rejected by Mozosubz (${p.type})`;
    return { success: false, error: errMsg, raw: d };
  }
  return {
    success: false,
    ambiguous: true,
    error: 'Provider returned an unrecognised response for this transaction.',
    raw: d,
  };
}

// ─── Provider: Bigisub ────────────────────────────────────────────────────────

const bigisubProvider: VtuProvider = {
  name: 'bigisub',

  resolveApiKey: () => resolveKeyFromEnvOrDb('BIGISUB_API_KEY', 'bigisub_api_key'),

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    // Documented API (Bigisub official docs):
    //   data:    POST /api/v1/data_topup/    { network, phone_number, plan, Ported_number }
    //   airtime: POST /api/v1/airtime_topup/ { network, amount, phone_number, airtime_type }
    //   auth:    Authorization: Token <api key>
    //   success: { "Status": "successful", ... }
    const base     = process.env.BIGISUB_BASE_URL || 'https://bigisub.ng/api/v1';
    const endpoint = p.type === 'airtime' ? 'airtime_topup/' : 'data_topup/';
    const url      = `${base.replace(/\/$/, '')}/${endpoint}`;
    const planCode = p.providerPlanId || p.planId;

    const payload: any = {
      network: bigiNetworkId(p.network),
      phone_number: p.phone,
      Ported_number: true,
    };
    if (p.type === 'data') {
      payload.plan = planCode;
    } else {
      payload.amount = String(p.amount);
      payload.airtime_type = 'vtu';
    }

    console.log(`[Bigisub] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

    let resp: any;
    try {
      resp = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          // Bigisub authenticates with a `Token <key>` scheme, NOT Bearer.
          'Authorization': `Token ${p.apiKey}`,
        },
        timeout: PROVIDER_TIMEOUT_MS,
      });
    } catch (err: any) {
      if (classifyAxiosError(err) === 'unknown') {
        console.warn(`[Bigisub] ${p.type} purchase outcome UNKNOWN (${isTimeoutError(err) ? 'timeout' : 'network error'}): ${axiosErrorMessage(err, 'connection failed')} -- leaving charge pending for review`);
        return {
          success: false,
          ambiguous: true,
          error: isTimeoutError(err) ? 'Provider is taking longer than usual to confirm this transaction.' : axiosErrorMessage(err, 'Provider connection failed.'),
          raw: { error: axiosErrorMessage(err, 'connection failed'), code: err?.code },
        };
      }
      return {
        success: false,
        error: axiosErrorMessage(err, 'Rejected by Bigisub'),
        raw: err?.response?.data,
      };
    }

    const d = resp.data;
    if (bodyReportsSuccess(d)) {
      const reference = pickField(d, 'tran_id', 'reference', 'id', 'transaction_id');
      return { success: true, reference, raw: d };
    }
    if (bodyReportsFailure(d) || d?.error || d?.message) {
      const errMsg = pickField(d, 'error', 'message', 'api_response') || 'Rejected by Bigisub';
      return { success: false, error: errMsg, raw: d };
    }
    return {
      success: false,
      ambiguous: true,
      error: 'Provider returned an unrecognised response for this transaction.',
      raw: d,
    };
  },
};

// ─── Provider: Template for future providers ──────────────────────────────────
// Copy this block and fill in your provider's details:
//
// const myProvider: VtuProvider = {
//   name: 'myprovider',
//   resolveApiKey: () => resolveKeyFromEnvOrDb('MYPROVIDER_API_KEY', 'myprovider_api_key'),
//   async purchase(p) {
//     // call your API, return { success, reference, raw, error }
//   },
// };

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, VtuProvider> = {
  mozosubz: mozosubzProvider,
  bigisub:  bigisubProvider,
  // myprovider: myProvider,  <- add new providers here
};

export function getProvider(name: string): VtuProvider | null {
  return PROVIDERS[name?.toLowerCase()] || null;
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
