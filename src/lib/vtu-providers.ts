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
  if (process.env[envVar]) return process.env[envVar]!;
  if (_supabase) {
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

function bigiNetworkId(network: string): number {
  const n = normNetwork(network);
  if (n === 'mtn')      return 1;
  if (n === 'glo')      return 2;
  if (n === 'airtel')   return 3;
  return 4; // 9mobile / etisalat
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

    const resp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'X-Connect-Key': p.apiKey },
      timeout: 12000,
    });

    const d = resp.data;
    if (d?.success === true) {
      return { success: true, reference: d.transaction_id || d.reference || d.id, raw: d };
    }
    return { success: false, error: d?.error || d?.message || 'Rejected by Mozosubz', raw: d };
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
  const resp = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'X-Connect-Key': p.apiKey },
    timeout: 12000,
  });
  const d = resp.data;
  if (d?.success === true) {
    return { success: true, reference: d.transaction_id || d.reference || d.id, raw: d };
  }
  return { success: false, error: d?.error || d?.message || `Rejected by Mozosubz (${p.type})`, raw: d };
}

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

    const resp = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
      timeout: 10000,
    });

    const d = resp.data;
    const ok = d?.status === 'success' || d?.status === 'SUCCESSFUL' || d?.success === true || d?.status === 'completed';
    if (ok) {
      return { success: true, reference: d.reference || d.id || d.transaction_id, raw: d };
    }
    return { success: false, error: d?.error || d?.message || 'Rejected by Bigisub', raw: d };
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
  // myprovider: myProvider,  ← add new providers here
};

export function getProvider(name: string): VtuProvider | null {
  return PROVIDERS[name?.toLowerCase()] || null;
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
