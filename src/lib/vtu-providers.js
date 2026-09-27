/**
 * VTU Provider Plugin System (ESM JavaScript build for Node runtime)
 */
import axios from 'axios';

let _supabase = null;
export function initProviders(supabaseClient) {
  _supabase = supabaseClient;
}

async function resolveKeyFromEnvOrDb(envVar, dbIdentifier) {
  if (process.env[envVar]) return process.env[envVar];
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

function normNetwork(network) {
  const n = String(network || '').toLowerCase();
  if (n.includes('mtn')) return 'mtn';
  if (n.includes('glo')) return 'glo';
  if (n.includes('airtel')) return 'airtel';
  if (n.includes('9mobile') || n.includes('etisalat')) return 'etisalat';
  return n;
}

function bigiNetworkId(network) {
  const n = normNetwork(network);
  if (n === 'mtn') return 1;
  if (n === 'glo') return 2;
  if (n === 'airtel') return 3;
  return 4;
}

const mozosubzProvider = {
  name: 'mozosubz',
  resolveApiKey: async () => {
    return process.env.MOZOSUBS_CONNECT_KEY
        || process.env.MOZOSUBZ_CONNECT_KEY
        || process.env.MOZOSUBZ_API_KEY
        || await resolveKeyFromEnvOrDb('MOZOSUBZ_API_KEY', 'mozosubz_api_key')
        || '';
  },
  async purchase(p) {
    const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
    const net = normNetwork(p.network);
    const url = p.type === 'data' ? `${base}/data/purchase` : `${base}/airtime/purchase`;
    const service = p.mozosubzService || `${net}_sme`;
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

export async function purchaseMozosubzUtility(p) {
  const base = process.env.MOZOSUBZ_BASE_URL || 'https://mozosubz.xyz/api/v1';
  const isCable = p.type === 'cable';
  const url = isCable ? `${base}/cable/purchase` : `${base}/electricity/purchase`;
  const discoNames = {
    IKEDC: 'ikeja electric', EKEDC: 'eko electric', AEDC: 'abuja electric',
    PHED: 'port harcourt electric', IBEDC: 'ibadan electric', KAEDCO: 'kaduna electric',
    KEDCO: 'kano electric', JED: 'jos electric', EEDC: 'enugu electric',
    BEDC: 'benin electric', YEDC: 'yola electric', BAEDC: 'bauchi electric',
  };
  const payload = isCable
    ? {
        provider: String(p.provider || '').toLowerCase(),
        package: p.packageName,
        smartcard: p.smartcard,
        phone: p.phone,
      }
    : {
        disco: discoNames[String(p.provider || '').toUpperCase()] || p.provider,
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

const bigisubProvider = {
  name: 'bigisub',
  resolveApiKey: () => resolveKeyFromEnvOrDb('BIGISUB_API_KEY', 'bigisub_api_key'),
  async purchase(p) {
    const base = process.env.BIGISUB_BASE_URL || 'https://www.bigisub.ng/api/v1';
    const endpoint = p.type === 'airtime' ? 'airtime' : 'data';
    const url = `${base}/${endpoint}`;
    const planCode = p.providerPlanId || p.planId;
    const payload = {
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

export const PROVIDERS = {
  mozosubz: mozosubzProvider,
  bigisub: bigisubProvider,
};

export function getProvider(name) {
  return PROVIDERS[name?.toLowerCase()] || null;
}

export function listProviders() {
  return Object.keys(PROVIDERS);
}
