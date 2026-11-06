import { supabase } from '../../../../src/lib/supabase.js';

const MOZO_SERVICES = [
  { id: 'mtn_sme', network: 'MTN', plan_type: 'SME' },
  { id: 'mtn_cg', network: 'MTN', plan_type: 'CG' },
  { id: 'mtn_gifting', network: 'MTN', plan_type: 'GIFTING' },
  { id: 'mtn_datashare', network: 'MTN', plan_type: 'DATASHARE' },
  { id: 'mtn_awoof', network: 'MTN', plan_type: 'AWOOF' },
  { id: 'mtn_awoof2', network: 'MTN', plan_type: 'AWOOF' },
  { id: 'mtn_coupon', network: 'MTN', plan_type: 'COUPON' },
  { id: 'glo_sme', network: 'GLO', plan_type: 'SME' },
  { id: 'glo_cg', network: 'GLO', plan_type: 'CG' },
  { id: 'glo_data', network: 'GLO', plan_type: 'DATA' },
  { id: 'airtel_sme', network: 'AIRTEL', plan_type: 'SME' },
  { id: 'airtel_cg', network: 'AIRTEL', plan_type: 'CG' },
  { id: 'airtel_gifting', network: 'AIRTEL', plan_type: 'GIFTING' },
  { id: 'etisalat_sme', network: '9MOBILE', plan_type: 'SME' },
  { id: 'etisalat_data', network: '9MOBILE', plan_type: 'DATA' },
];

/**
 * POST /api/admin/sync-vtu-plans
 * Triggers full synchronization of plans from Mozosubz and Nifex directly into vtu_plans.
 * Upserts using provider_plan_id, marks discontinued plans is_active = false.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let mozoKey = process.env.MOZOSUBZ_API_KEY || '';
    let nifexKey = process.env.NIFEX_API_KEY || '';

    try {
      const { data: secrets } = await supabase
        .from('provider_secrets')
        .select('identifier, secret');

      if (secrets && Array.isArray(secrets)) {
        for (const s of secrets) {
          if (s.identifier === 'mozosubz_api_key' && s.secret) mozoKey = s.secret.trim();
          if (s.identifier === 'nifex_api_key' && s.secret) nifexKey = s.secret.trim();
        }
      }
    } catch (_) {}

    const livePlans: any[] = [];
    const nowIso = new Date().toISOString();

    // Fetch Mozosubz plans
    if (mozoKey && mozoKey.length > 5 && !mozoKey.includes('PASTE_YOUR')) {
      const mozoBase = 'https://mozosubz.xyz/api/v1';
      for (const svc of MOZO_SERVICES) {
        try {
          const resp = await fetch(`${mozoBase}/data/plans?service=${svc.id}`, {
            headers: {
              'X-Connect-Key': mozoKey,
              'Content-Type': 'application/json',
            },
          });
          const json: any = await resp.json().catch(() => ({}));
          if (json && json.success && Array.isArray(json.plans)) {
            for (const p of json.plans) {
              const cost = Number(p.price || 0);
              const selling = Math.ceil(cost * 1.10);
              const pId = String(p.id);

              livePlans.push({
                network: svc.network,
                plan_name: p.name || `${svc.network} ${p.plan_type || 'Data'}`,
                provider_plan_id: pId,
                provider_price: cost,
                price_to_user: selling,
                is_active: true,
                last_synced_at: nowIso,
                provider: 'mozosubz',
                service: svc.id,
                validity: '30 Days',
              });
            }
          }
        } catch (e) {
          console.warn(`[Sync] Mozosubz fetch error for ${svc.id}:`, e);
        }
      }
    }

    // Fetch Nifex plans
    if (nifexKey && nifexKey.length > 5 && !nifexKey.includes('PASTE_YOUR')) {
      try {
        const cleanKey = nifexKey.replace(/^Token\s+/i, '').trim();
        const resp = await fetch('https://nifexdataapp.com.ng/api/data/', {
          headers: {
            'Authorization': `Token ${cleanKey}`,
            'Content-Type': 'application/json',
          },
        });
        const json: any = await resp.json().catch(() => ({}));
        const plansList = Array.isArray(json.plans) ? json.plans : (Array.isArray(json) ? json : []);
        for (const p of plansList) {
          const rawNet = String(p.network || 'MTN').toUpperCase();
          const net = rawNet.includes('GLO') ? 'GLO' : rawNet.includes('AIRTEL') ? 'AIRTEL' : rawNet.includes('9MOBILE') ? '9MOBILE' : 'MTN';
          const cost = Number(p.price || 0);
          const selling = Math.ceil(cost * 1.10);
          const pId = String(p.plan_id ?? p.pId ?? p.id);

          livePlans.push({
            network: net,
            plan_name: p.plan_name || `${net} Data`,
            provider_plan_id: pId,
            provider_price: cost,
            price_to_user: selling,
            is_active: true,
            last_synced_at: nowIso,
            provider: 'nifex',
            service: p.type || 'DATA',
            validity: p.validity || '30 Days',
          });
        }
      } catch (e) {
        console.warn('[Sync] Nifex fetch error:', e);
      }
    }

    if (livePlans.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No plans retrieved from providers. Please verify provider credentials.',
      });
    }

    // Read existing plans to compute added vs updated and preserve custom retail prices
    const { data: existingRows } = await supabase
      .from('vtu_plans')
      .select('provider_plan_id, price_to_user, is_active');

    const existingMap = new Map<string, any>();
    if (existingRows) {
      for (const row of existingRows) {
        existingMap.set(row.provider_plan_id, row);
      }
    }

    let added = 0;
    let updated = 0;

    // Deduplicate strictly by provider_plan_id to prevent ON CONFLICT DO UPDATE cannot affect row a second time
    const uniquePlansMap = new Map<string, any>();
    for (const p of livePlans) {
      const key = String(p.provider_plan_id || '').trim();
      if (!key) continue;
      const existing = existingMap.get(key);
      const row = {
        ...p,
        provider_plan_id: key,
        price_to_user: existing && existing.price_to_user > 0 ? existing.price_to_user : p.price_to_user,
      };
      if (existing) updated++; else added++;
      uniquePlansMap.set(key, row);
    }

    const upsertRows = Array.from(uniquePlansMap.values());

    const { error: upsertErr } = await supabase
      .from('vtu_plans')
      .upsert(upsertRows, { onConflict: 'provider_plan_id' });

    if (upsertErr) {
      return res.status(500).json({ error: upsertErr.message });
    }

    // Deactivate plans no longer returned by provider
    const livePlanIdSet = new Set(livePlans.map((p) => p.provider_plan_id));
    let deactivated = 0;

    if (existingRows) {
      const missingPlanIds = existingRows
        .filter((r) => r.is_active && !livePlanIdSet.has(r.provider_plan_id))
        .map((r) => r.provider_plan_id);

      if (missingPlanIds.length > 0) {
        const { error: deactErr } = await supabase
          .from('vtu_plans')
          .update({ is_active: false, last_synced_at: nowIso })
          .in('provider_plan_id', missingPlanIds);

        if (!deactErr) {
          deactivated = missingPlanIds.length;
        }
      }
    }

    return res.status(200).json({
      success: true,
      added,
      updated,
      deactivated,
      total: livePlans.length,
      timestamp: nowIso,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}
