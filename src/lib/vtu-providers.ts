/**
 * VTU Provider Plugin System
 * ===========================
 * Multi-provider architecture supporting:
 *  - Mozosubz (mozosubz.xyz)
 *  - Nifex Data (nifexdataapp.com.ng)
 *  - Bigisub (bigisub.ng)
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
  ambiguous?: boolean;
}

export interface VtuProvider {
  name: string;
  resolveApiKey: () => Promise<string>;
  purchase: (params: PurchaseParams) => Promise<PurchaseResult>;
}

// ─── Supabase client (injected at runtime to avoid circular deps) ─────────────
let _supabase: any = null;
export function initProviders(supabaseClient: any) {
  _supabase = supabaseClient;
}

// ─── Key resolvers ────────────────────────────────────────────────────────────

async function resolveKeyFromEnvOrDb(envVar: string, dbIdentifier: string): Promise<string> {
  // 1. Check provider_secrets table in Supabase
  if (_supabase) {
    try {
      const { data } = await _supabase
        .from('provider_secrets')
        .select('secret')
        .eq('identifier', dbIdentifier)
        .maybeSingle();
      if (data?.secret && !data.secret.includes('PASTE_YOUR') && !data.secret.includes('dummy') && data.secret.trim().length > 5) {
        return data.secret.trim();
      }
    } catch (_) {}

    // 2. Check services_config table in Supabase
    try {
      const { data } = await _supabase
        .from('services_config')
        .select('item_name')
        .or(`bigisub_identifier_id.eq.${dbIdentifier},mozosubz_plan_id.eq.${dbIdentifier}`)
        .maybeSingle();
      if (data?.item_name && !data.item_name.includes('PASTE_YOUR') && !data.item_name.includes('dummy') && data.item_name.trim().length > 5) {
        return data.item_name.trim();
      }
    } catch (_) {}
  }

  // 3. Fallback to environment variable
  const val = process.env[envVar];
  if (val && !val.includes('PASTE_YOUR') && !val.includes('dummy') && val.trim().length > 5) {
    return val.trim();
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

function bigiNetworkId(network: string): number {
  const n = normNetwork(network);
  if (n === 'mtn')      return 1;
  if (n === 'glo')      return 2;
  if (n === 'airtel')   return 3;
  return 4; // 9mobile / etisalat
}

function nifexNetworkId(network: string): number {
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
    return await resolveKeyFromEnvOrDb('MOZOSUBZ_API_KEY', 'mozosubz_api_key')
        || await resolveKeyFromEnvOrDb('MOZOSUBS_CONNECT_KEY', 'mozosubz_connect_key')
        || (process.env.MOZOSUBS_CONNECT_KEY && !process.env.MOZOSUBS_CONNECT_KEY.includes('PASTE_YOUR') && !process.env.MOZOSUBS_CONNECT_KEY.includes('connect_030660') ? process.env.MOZOSUBS_CONNECT_KEY.trim() : '')
        || (process.env.MOZOSUBZ_CONNECT_KEY && !process.env.MOZOSUBZ_CONNECT_KEY.includes('PASTE_YOUR') ? process.env.MOZOSUBZ_CONNECT_KEY.trim() : '')
        || (process.env.MOZOSUBZ_API_KEY && !process.env.MOZOSUBZ_API_KEY.includes('PASTE_YOUR') ? process.env.MOZOSUBZ_API_KEY.trim() : '')
        || (process.env.MOZOSUBS_API_KEY && !process.env.MOZOSUBS_API_KEY.includes('PASTE_YOUR') ? process.env.MOZOSUBS_API_KEY.trim() : '')
        || '';
  },

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
    const net  = normNetwork(p.network);

    const url     = p.type === 'data' ? `${base}/data/purchase` : `${base}/airtime/purchase`;
    const service = p.mozosubzService || `${net}_sme`;
    const rawPlanIdStr = String(p.providerPlanId || p.planId);
    const rawPlanId = rawPlanIdStr.startsWith(`${service}_`)
      ? rawPlanIdStr.slice(service.length + 1)
      : rawPlanIdStr;
    const payload = p.type === 'data'
      ? { service, plan_id: rawPlanId, phone: p.phone }
      : { network: net, amount: p.amount, phone: p.phone };

    console.log(`[Mozosubz] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

    try {
      const resp = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Connect-Key': p.apiKey,
          'Authorization': `Token ${p.apiKey}`
        },
        timeout: 15000,
      });

      const d = resp.data;
      if (d?.success === true || d?.status === 'success' || d?.status === 'successful') {
        return { success: true, reference: d.transaction_id || d.reference || d.id || d.ident, raw: d };
      }
      return { success: false, error: d?.error || d?.message || d?.msg || 'Rejected by Mozosubz', raw: d };
    } catch (err: any) {
      console.error(`[Mozosubz Exception]`, err.response?.data || err.message);
      return { success: false, error: err.response?.data?.error || err.response?.data?.message || err.message, raw: err.response?.data };
    }
  },
};

// ─── Provider: Nifex Data (https://nifexdataapp.com.ng) ────────────────────────

const nifexProvider: VtuProvider = {
  name: 'nifex',

  resolveApiKey: async () => {
    return process.env.NIFEX_API_KEY
        || process.env.NIFEXDATA_API_KEY
        || await resolveKeyFromEnvOrDb('NIFEX_API_KEY', 'nifex_api_key')
        || await resolveKeyFromEnvOrDb('NIFEX_API_KEY', 'nifex_token')
        || '';
  },

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    const base = process.env.NIFEX_BASE_URL || 'https://nifexdataapp.com.ng/api';
    const netId = nifexNetworkId(p.network);
    const rawPlanCode = String(p.providerPlanId || p.planId || '').trim();
    // Support prefixed IDs like 'nifex_mtn_226' or 'nifex_226' as well as pure numeric '226'
    const planMatch = rawPlanCode.match(/\d+$/);
    const planCode = planMatch ? planMatch[0] : rawPlanCode;

    const url = p.type === 'data' ? `${base}/data/` : `${base}/airtime/`;
    const payload: any = p.type === 'data'
      ? {
          network: netId,
          mobile_number: p.phone,
          plan: planCode,
          Ported_number: true,
        }
      : {
          network: netId,
          amount: p.amount,
          mobile_number: p.phone,
          Ported_number: true,
          airtime_type: 'VTU',
        };

    console.log(`[Nifex Data] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

    try {
      const resp = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${p.apiKey.replace(/^Token\s+/i, '').trim()}`,
        },
        timeout: 15000,
      });

      const d = resp.data;
      const isSuccess =
        d?.status === 'success' ||
        d?.Status === 'successful' ||
        d?.status === 'successful' ||
        d?.status === 'completed' ||
        d?.status === true ||
        d?.success === true;

      if (isSuccess) {
        return { success: true, reference: d.ident || d.id || d.reference || d.transid || d.transaction_id, raw: d };
      }
      return { success: false, error: d?.msg || d?.message || d?.error || 'Rejected by Nifex Data', raw: d };
    } catch (err: any) {
      console.error(`[Nifex Exception]`, err.response?.data || err.message);
      const errBody = err.response?.data;
      return {
        success: false,
        error: errBody?.msg || errBody?.message || errBody?.error || err.message || 'Network error contacting Nifex Data',
        raw: errBody,
      };
    }
  },
};

// ─── Provider: Bigisub ────────────────────────────────────────────────────────

const bigisubProvider: VtuProvider = {
  name: 'bigisub',

  resolveApiKey: () => resolveKeyFromEnvOrDb('BIGISUB_API_KEY', 'bigisub_api_key'),

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    const base     = process.env.BIGISUB_BASE_URL || 'https://www.bigisub.ng/api/v1';
    const endpoint = p.type === 'airtime' ? 'airtime' : 'data';
    const url      = `${base}/${endpoint}`;
    const planCode = p.providerPlanId || p.planId;

    const payload: any = {
      network: bigiNetworkId(p.network),
      mobile_number: p.phone,
      amount: p.amount,
      Ported_number: true,
    };
    if (p.type === 'data') {
      payload.plan = planCode;
      payload.plan_id = planCode;
      payload.data_plan = planCode;
    } else {
      payload.airtime_type = 'VTU';
    }

    console.log(`[Bigisub] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));

    try {
      const resp = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
        timeout: 12000,
      });

      const d = resp.data;
      const ok = d?.status === 'success' || d?.status === 'SUCCESSFUL' || d?.success === true || d?.status === 'completed';
      if (ok) {
        return { success: true, reference: d.reference || d.id || d.transaction_id, raw: d };
      }
      return { success: false, error: d?.error || d?.message || 'Rejected by Bigisub', raw: d };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || err.message, raw: err.response?.data };
    }
  },
};

// ─── Utility & Bill Payments ─────────────────────────────────────────────────

export interface UtilityPurchaseParams {
  type: 'cable' | 'electricity';
  provider: string;              // e.g. "mozosubz", "nifex", "IKEDC", "GOTV"
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
  try {
    const resp = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Connect-Key': p.apiKey,
        'Authorization': `Token ${p.apiKey}`
      },
      timeout: 15000,
    });
    const d = resp.data;
    if (d?.success === true || d?.status === 'success') {
      return { success: true, reference: d.transaction_id || d.reference || d.id || d.ident, raw: d };
    }
    return { success: false, error: d?.error || d?.message || `Rejected by Mozosubz (${p.type})`, raw: d };
  } catch (err: any) {
    return { success: false, error: err.response?.data?.error || err.message, raw: err.response?.data };
  }
}

export async function purchaseNifexUtility(p: UtilityPurchaseParams): Promise<PurchaseResult> {
  const base = process.env.NIFEX_BASE_URL || 'https://nifexdataapp.com.ng/api';
  const isCable = p.type === 'cable';
  const url = isCable ? `${base}/cabletv/` : `${base}/electricity/`;

  const cableMap: Record<string, number> = { gotv: 1, dstv: 2, startimes: 3 };
  const discoMap: Record<string, number> = {
    IKEDC: 1, EKEDC: 2, AEDC: 3, KEDCO: 4, PHED: 5,
    JED: 6, IBEDC: 7, KAEDCO: 8, EEDC: 9, BEDC: 10, YEDC: 11
  };

  const payload = isCable
    ? {
        cablename: cableMap[p.provider.toLowerCase()] || 1,
        cableplan: p.packageName,
        smart_card_number: p.smartcard,
      }
    : {
        disco_name: discoMap[p.provider.toUpperCase()] || 1,
        amount: p.amount,
        meter_number: p.meterNumber,
        MeterType: p.meterType === 'POSTPAID' ? 2 : 1,
      };

  console.log(`[Nifex Data] ${p.type.toUpperCase()} purchase →`, JSON.stringify(payload));
  try {
    const resp = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${p.apiKey.replace(/^Token\s+/i, '').trim()}`,
      },
      timeout: 15000,
    });
    const d = resp.data;
    const ok = d?.status === 'success' || d?.Status === 'successful' || d?.status === true || d?.success === true;
    if (ok) {
      return { success: true, reference: d.ident || d.id || d.reference || d.transid, raw: d };
    }
    return { success: false, error: d?.msg || d?.message || `Rejected by Nifex Data (${p.type})`, raw: d };
  } catch (err: any) {
    return { success: false, error: err.response?.data?.msg || err.message, raw: err.response?.data };
  }
}

// ─── Nifex User / Balance Lookup ──────────────────────────────────────────────

export async function fetchNifexUser(apiKey: string) {
  const base = process.env.NIFEX_BASE_URL || 'https://nifexdataapp.com.ng/api';
  const cleanKey = apiKey.replace(/^Token\s+/i, '').trim();
  const resp = await axios.get(`${base}/user/`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${cleanKey}`,
    },
    timeout: 10000,
  });
  return resp.data;
}

// ─── Nifex Live Plans & Network Status Lookup ───────────────────────────────────

export interface NifexLivePlan {
  plan_id: number;
  pId?: number;
  network_id: number;
  network: string;
  plan_name: string;
  type: string;
  validity: string;
  price: number;
  network_status?: string;
}

export async function fetchNifexPlans(apiKey?: string): Promise<{
  success: boolean;
  plans: NifexLivePlan[];
  account_type?: string;
  count?: number;
  raw?: any;
  error?: string;
}> {
  const base = process.env.NIFEX_BASE_URL || 'https://nifexdataapp.com.ng/api';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const cleanKey = apiKey ? apiKey.replace(/^Token\s+/i, '').trim() : '';
  if (cleanKey && cleanKey.length > 5 && !cleanKey.includes('PASTE_YOUR') && !cleanKey.includes('dummy')) {
    headers['Authorization'] = `Token ${cleanKey}`;
  }

  try {
    const resp = await axios.get(`${base}/data/`, {
      headers,
      timeout: 15000,
    });
    const d = resp.data;
    if (d?.status === 'success' || Array.isArray(d?.plans)) {
      return {
        success: true,
        plans: Array.isArray(d.plans) ? d.plans : [],
        account_type: d.account_type || 'Vendor',
        count: d.count || (Array.isArray(d.plans) ? d.plans.length : 0),
        raw: d,
      };
    }
    return {
      success: false,
      plans: [],
      error: d?.message || 'Failed to retrieve plans from Nifex Data',
      raw: d,
    };
  } catch (err: any) {
    console.error('[fetchNifexPlans Exception]', err.response?.data || err.message);
    return {
      success: false,
      plans: [],
      error: err.response?.data?.message || err.response?.data?.msg || err.message,
      raw: err.response?.data,
    };
  }
}

export async function fetchNifexNetworks(): Promise<any[]> {
  const base = process.env.NIFEX_BASE_URL || 'https://nifexdataapp.com.ng/api';
  try {
    const resp = await axios.get(`${base}/network/`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return resp.data?.networks || [];
  } catch (_) {
    return [];
  }
}

export async function fetchNifexLivePlans(apiKey?: string): Promise<{
  balance: number;
  plans: any[];
  account_type?: string;
}> {
  let balance = 0;
  if (apiKey) {
    try {
      const u = await fetchNifexUser(apiKey);
      const userObj = u?.user || u?.data || u;
      if (userObj && (userObj.wallet_balance !== undefined || userObj.balance !== undefined)) {
        balance = Number(userObj.wallet_balance ?? userObj.balance ?? 0);
      }
    } catch (_) {}
  }

  const res = await fetchNifexPlans(apiKey);
  if (!res.success) {
    throw new Error(res.error || 'Failed to retrieve live plans from Nifex Data API.');
  }

  const mapped = (res.plans || []).map((p: any) => {
    const netRaw = String(p.network || 'MTN').toUpperCase();
    const netUpper = netRaw.includes('MTN')
      ? 'MTN'
      : netRaw.includes('AIRTEL')
      ? 'AIRTEL'
      : netRaw.includes('GLO')
      ? 'GLO'
      : '9MOBILE';
    const planType = String(p.type || 'SME').toUpperCase();
    const service =
      netUpper === 'MTN'
        ? planType.includes('CG') || planType.includes('CORPORATE')
          ? 'mtn_cg'
          : planType.includes('GIFT')
          ? 'mtn_gifting'
          : 'mtn_sme'
        : netUpper === 'AIRTEL'
        ? 'airtel_data'
        : netUpper === 'GLO'
        ? 'glo_data'
        : 'etisalat_data';
    const planId = Number(p.plan_id ?? p.pId ?? p.id ?? 0);
    return {
      id: `nifex_${netUpper.toLowerCase()}_${planId}`,
      plan_id: planId,
      name: `${netUpper} ${p.plan_name} ${planType} (${p.validity || '30 Days'})`,
      price: Number(p.price || 0),
      network: netUpper,
      plan_type: planType,
      validity: p.validity || '30 Days',
      service,
      provider: 'nifex',
    };
  });

  return {
    balance,
    plans: mapped,
    account_type: res.account_type,
  };
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, VtuProvider> = {
  mozosubz:  mozosubzProvider,
  mozosubs:  mozosubzProvider,
  nifex:     nifexProvider,
  nifexdata: nifexProvider,
  bigisub:   bigisubProvider,
};

export function getProvider(name: string): VtuProvider | null {
  return PROVIDERS[name?.toLowerCase()] || null;
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
