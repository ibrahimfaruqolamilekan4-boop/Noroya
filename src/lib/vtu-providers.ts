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

  resolveApiKey: () => resolveKeyFromEnvOrDb('MOZOSUBZ_API_KEY', 'mozosubz_api_key'),

  async purchase(p: PurchaseParams): Promise<PurchaseResult> {
    const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
    const net  = normNetwork(p.network);

    const url     = p.type === 'data' ? `${base}/data/purchase` : `${base}/airtime/purchase`;
    const payload = p.type === 'data'
      ? { service: p.mozosubzService || `${net}_sme`, id: String(p.planId), phone: p.phone }
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
