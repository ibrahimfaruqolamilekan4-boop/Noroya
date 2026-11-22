/**
 * mozosubz-sync.ts — Shared live-plan synchronisation engine
 * ===========================================================
 * Mozosubz (https://mozosubz.xyz) exposes NO bulk "all plans" endpoint.
 * Plans must be pulled one service at a time:
 *
 *   GET https://mozosubz.xyz/api/v1/data/plans?service=<service_id>
 *   Header: X-Connect-Key: <connect key>
 *   Response: { success: true, plans: [{ id, name, price, ... }], next?, total_pages? }
 *
 * This module is the single implementation of that pull-and-upsert cycle.
 * It is used by:
 *   - POST /api/admin/sync-vtu-plans   (manual "Sync Plans from Provider" button)
 *   - GET|POST /api/cron/sync-vtu-plans (scheduled background sync, sees no button)
 *
 * Behaviour contract (unchanged from the original inline handler):
 *   - Upsert into `vtu_plans` keyed on `provider_plan_id`.
 *   - Customer price = manual_price_override if set, else ceil(cost * (1 + margin/100)).
 *   - Plans missing from a comprehensive upstream response are deactivated
 *     (guarded by `MIN_PLANS_FOR_DEACTIVATION`) so a partial upstream outage
 *     cannot wipe the live catalogue.
 */

import axios from 'axios';

// ─── Service catalogue ────────────────────────────────────────────────────────
// Every real Mozosubz data service, mapped to the display network + plan category
// used by `vtu_plans.network` / `vtu_plans.service`.
export const MOZOSUBZ_SERVICES: ReadonlyArray<{
  id: string;
  network: string;
  plan_type: string;
}> = [
  { id: 'mtn_sme',        network: 'MTN',     plan_type: 'SME' },
  { id: 'mtn_cg',         network: 'MTN',     plan_type: 'CG' },
  { id: 'mtn_gifting',    network: 'MTN',     plan_type: 'GIFTING' },
  { id: 'mtn_datashare',  network: 'MTN',     plan_type: 'DATASHARE' },
  { id: 'mtn_awoof',      network: 'MTN',     plan_type: 'AWOOF' },
  { id: 'mtn_awoof2',     network: 'MTN',     plan_type: 'AWOOF' },
  { id: 'mtn_coupon',     network: 'MTN',     plan_type: 'COUPON' },
  { id: 'glo_sme',        network: 'GLO',     plan_type: 'SME' },
  { id: 'glo_cg',         network: 'GLO',     plan_type: 'CG' },
  { id: 'glo_data',       network: 'GLO',     plan_type: 'DATA' },
  { id: 'airtel_sme',     network: 'AIRTEL',  plan_type: 'SME' },
  { id: 'airtel_cg',      network: 'AIRTEL',  plan_type: 'CG' },
  { id: 'airtel_gifting', network: 'AIRTEL',  plan_type: 'GIFTING' },
  { id: 'etisalat_sme',   network: '9MOBILE', plan_type: 'SME' },
  { id: 'etisalat_data',  network: '9MOBILE', plan_type: 'DATA' },
];

export const MOZOSUBZ_BASE_URL = 'https://mozosubz.xyz/api/v1';

/**
 * A sync response only counts as "comprehensive" enough to deactivate plans
 * when it returned at least this many live plans. Prevents a single failed
 * upstream call from deactivating the entire storefront.
 */
const MIN_PLANS_FOR_DEACTIVATION = 20;

/** Upstream plan shape as returned by mozosubz.xyz/api/v1/data/plans. */
interface MozosubzPlan {
  id: string | number;
  name?: string;
  price?: string | number;
  plan_type?: string;
}

export interface SyncResult {
  success: boolean;
  added: number;
  updated: number;
  deactivated: number;
  /** Plans the provider still returns but no admin has priced yet. */
  unpriced: number;
  /** Plans a previous sync priced, that this sync found gone upstream. */
  removed: number;
  total: number;
  service_counts: Record<string, number>;
  price_changes_count: number;
  price_changes: Array<{
    provider_plan_id: string;
    old_customer_price: number;
    new_customer_price: number;
  }>;
  timestamp: string;
  /** Which caller triggered this run — surfaced in logs + the admin UI. */
  trigger?: string;
  /** Non-fatal per-service upstream failures. */
  warnings: string[];
  error?: string;
}

export interface SyncOptions {
  /** Supabase client (service-role) used for reads/writes. */
  supabase: any;
  /** Resolved Mozosubz connect key. */
  mozosubzKey: string;
  /** Resolved Nifex API key (optional — skipped when empty). */
  nifexKey?: string;
  /** Default margin percentage for plans with no stored margin. */
  defaultMarginPct?: number;
  /** Free-form label for observability (e.g. 'cron', 'admin'). */
  trigger?: string;
}

/** True when a secret looks like a real credential rather than a placeholder. */
export const isUsableSecret = (value: string | undefined | null): boolean => {
  const v = String(value || '').trim();
  return v.length > 5 && !v.includes('PASTE_YOUR') && !v.includes('dummy');
};

// ─── Upstream fetch ───────────────────────────────────────────────────────────

/**
 * Pull every plan for one Mozosubz service, following `next` / `total_pages`
 * pagination when the upstream response advertises it.
 */
async function fetchServicePlans(
  serviceId: string,
  connectKey: string,
  warnings: string[],
): Promise<MozosubzPlan[]> {
  const out: MozosubzPlan[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url =
        page === 1
          ? `${MOZOSUBZ_BASE_URL}/data/plans?service=${encodeURIComponent(serviceId)}`
          : `${MOZOSUBZ_BASE_URL}/data/plans?service=${encodeURIComponent(serviceId)}&page=${page}`;

      const resp = await axios.get(url, {
        headers: { 'X-Connect-Key': connectKey, 'Content-Type': 'application/json' },
        timeout: 12000,
        validateStatus: () => true,
      });

      const d: any = resp.data || {};

      if (resp.status === 401 || resp.status === 403) {
        warnings.push(`${serviceId}: upstream rejected the connect key (HTTP ${resp.status})`);
        break;
      }
      if (!d?.success || !Array.isArray(d.plans)) {
        if (d?.error) warnings.push(`${serviceId}: ${d.error}`);
        break;
      }

      out.push(...d.plans);

      if (d.next || (d.total_pages && page < Number(d.total_pages))) {
        page += 1;
        // Hard stop: never chase more than 20 pages for one service.
        if (page > 20) break;
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      warnings.push(`${serviceId}: ${err?.message || 'network error'}`);
      break;
    }
  }

  return out;
}

/** Pull the Nifex catalogue (flat list, one request). */
async function fetchNifexPlans(
  nifexKey: string,
  warnings: string[],
): Promise<Array<Record<string, any>>> {
  try {
    const cleanKey = nifexKey.replace(/^Token\s+/i, '').trim();
    const resp = await axios.get('https://nifexdataapp.com.ng/api/data/', {
      headers: { Authorization: `Token ${cleanKey}`, 'Content-Type': 'application/json' },
      timeout: 15000,
      validateStatus: () => true,
    });
    const d: any = resp.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.plans)) return d.plans;
    if (Array.isArray(d?.data)) return d.data;
    if (Array.isArray(d?.results)) return d.results;
    if (d && typeof d === 'object') {
      const merged: Array<Record<string, any>> = [];
      for (const key of Object.keys(d)) {
        if (Array.isArray(d[key])) merged.push(...d[key]);
      }
      return merged;
    }
  } catch (err: any) {
    warnings.push(`nifex: ${err?.message || 'network error'}`);
  }
  return [];
}

// ─── Main sync ────────────────────────────────────────────────────────────────

/**
 * Full pull-from-provider → upsert-into-`vtu_plans` cycle.
 * Safe to call concurrently: upserts are keyed on the unique `provider_plan_id`
 * index, and duplicate keys are collapsed before the write.
 */
export async function syncVtuPlans(opts: SyncOptions): Promise<SyncResult> {
  const { supabase, mozosubzKey, nifexKey = '', defaultMarginPct = 10, trigger = 'manual' } = opts;

  const warnings: string[] = [];
  const nowIso = new Date().toISOString();
  const serviceCounts: Record<string, number> = {};
  const livePlans: any[] = [];

  const empty = (error?: string): SyncResult => ({
    success: false,
    added: 0,
    updated: 0,
    deactivated: 0,
    unpriced: 0,
    removed: 0,
    total: 0,
    service_counts: {},
    price_changes_count: 0,
    price_changes: [],
    timestamp: nowIso,
    trigger,
    warnings,
    ...(error ? { error } : {}),
  });

  if (!isUsableSecret(mozosubzKey) && !isUsableSecret(nifexKey)) {
    return empty(
      'No provider credentials configured. Set the Mozosubz Connect Key in Price Manager (or MOZOSUBZ_API_KEY).',
    );
  }

  // 1. Mozosubz
  if (isUsableSecret(mozosubzKey)) {
    for (const svc of MOZOSUBZ_SERVICES) {
      const plans = await fetchServicePlans(svc.id, mozosubzKey, warnings);
      if (plans.length === 0) continue;

      serviceCounts[svc.id] = (serviceCounts[svc.id] || 0) + plans.length;

      for (const p of plans) {
        const cost = Number(p.price || 0);
        const planId = String(p.id ?? '').trim();
        if (!planId) continue;

        livePlans.push({
          network: svc.network,
          plan_name: p.name || `${svc.network} ${svc.plan_type} Data`,
          provider_plan_id: planId,
          provider_price: cost,
          price_to_user: Math.ceil(cost * 1.1),
          is_active: true,
          last_synced_at: nowIso,
          provider: 'mozosubz',
          service: svc.id,
          validity: '30 Days',
          margin_percent: defaultMarginPct,
        });
      }
    }
  }

  // 2. Nifex (optional second provider)
  if (isUsableSecret(nifexKey)) {
    const list = await fetchNifexPlans(nifexKey, warnings);
    serviceCounts.nifex = list.length;

    for (const p of list) {
      const rawNet = String(p.network || p.network_name || 'MTN').toUpperCase();
      const net = rawNet.includes('GLO')
        ? 'GLO'
        : rawNet.includes('AIRTEL')
          ? 'AIRTEL'
          : rawNet.includes('9MOBILE')
            ? '9MOBILE'
            : 'MTN';

      const cost = Number(p.price ?? p.plan_amount ?? p.amount ?? 0);
      const planId = String(p.plan_id ?? p.pId ?? p.id ?? p.planid ?? '').trim();
      if (!planId) continue;

      livePlans.push({
        network: net,
        plan_name: p.plan_name || p.name || `${net} Data`,
        provider_plan_id: `nifex_${net.toLowerCase()}_${planId}`,
        provider_price: cost,
        price_to_user: Math.ceil(cost * 1.1),
        is_active: true,
        last_synced_at: nowIso,
        provider: 'nifex',
        service: p.type || 'DATA',
        validity: p.validity || '30 Days',
        margin_percent: defaultMarginPct,
      });
    }
  }

  if (livePlans.length === 0) {
    return empty('No plans retrieved from providers. Please verify the provider credentials.');
  }

  // 3. Reconcile against what is already stored.
  //
  //    Three catalogue dimensions are maintained here, mirroring how Mozosubz
  //    separates "what the provider offers" from "what has been priced":
  //
  //      provider_status : 'live'    -> provider returned it in this sync
  //                        'removed' -> provider no longer returns it
  //      is_priced       : admin has explicitly priced it for customers
  //      is_active       : hard kill-switch, independent of the two above
  //
  //    A plan therefore reaches the storefront only when all three agree:
  //    is_active && is_priced && provider_status === 'live'.
  const { data: existingRows, error: readErr } = await supabase
    .from('vtu_plans')
    .select(
      'provider_plan_id, price_to_user, provider_price, manual_price_override, margin_percent, is_active, is_priced, provider_status',
    );

  if (readErr) return empty(readErr.message);

  const existingMap = new Map<string, any>();
  for (const row of existingRows || []) {
    existingMap.set(String(row.provider_plan_id).trim(), row);
  }

  let added = 0;
  let updated = 0;
  let unpriced = 0;
  const priceChanges: SyncResult['price_changes'] = [];
  const uniquePlanMap = new Map<string, any>();

  for (const p of livePlans) {
    const key = String(p.provider_plan_id).trim();
    if (!key) continue;

    const ext = existingMap.get(key);

    const margin =
      ext?.margin_percent !== undefined && ext?.margin_percent !== null
        ? Number(ext.margin_percent)
        : defaultMarginPct;

    const manualOverride = ext?.manual_price_override;
    const hasOverride =
      manualOverride !== undefined && manualOverride !== null && Number(manualOverride) > 0;

    // is_priced is sticky once set by an admin. A provider sync must never
    // silently price a new plan on the admin's behalf.
    const isPriced = ext?.is_priced === true;

    const computedPrice = hasOverride
      ? Math.ceil(Number(manualOverride))
      : Math.ceil(Number(p.provider_price || 0) * (1 + margin / 100));

    if (ext) {
      updated += 1;
      const oldPrice = Number(ext.price_to_user || 0);
      if (Math.abs(oldPrice - computedPrice) > 0.01) {
        priceChanges.push({
          provider_plan_id: key,
          old_customer_price: oldPrice,
          new_customer_price: computedPrice,
        });
      }
    } else {
      added += 1;
    }

    // Counted once, regardless of whether the row is new or pre-existing.
    if (!isPriced) unpriced += 1;

    uniquePlanMap.set(key, {
      ...p,
      provider_plan_id: key,
      price_to_user: computedPrice,
      manual_price_override: hasOverride ? Number(manualOverride) : null,
      margin_percent: margin,
      is_priced: isPriced,
      provider_status: 'live',
      last_seen_at: nowIso,
      // A sync must never resurrect a plan an admin deliberately switched off.
      // New rows default to enabled; existing rows keep whatever kill-switch
      // state the admin set.
      is_active: ext ? ext.is_active !== false : true,
      last_synced_at: nowIso,
    });
  }

  const upsertRows = Array.from(uniquePlanMap.values());
  const { error: upsertErr } = await supabase
    .from('vtu_plans')
    .upsert(upsertRows, { onConflict: 'provider_plan_id' });

  if (upsertErr) return empty(upsertErr.message);

  // 4. Mark plans the provider no longer returns.
  //
  //    Two independent things happen, intentionally:
  //      - provider_status -> 'removed' : the truth is recorded even when the
  //        upstream response was partial, so the admin page can flag it.
  //      - is_active -> false           : the storefront kill-switch, only
  //        flipped when the sync was comprehensive enough to trust
  //        (MIN_PLANS_FOR_DEACTIVATION) so a partial outage cannot wipe the
  //        catalogue.
  const liveSet = new Set(livePlans.map((p) => String(p.provider_plan_id).trim()));
  let deactivated = 0;
  let removed = 0;

  const missing = (existingRows as any[])
    .filter((r) => !liveSet.has(String(r.provider_plan_id).trim()))
    .map((r) => String(r.provider_plan_id).trim())
    .filter(Boolean);

  if (missing.length > 0) {
    const comprehensive = livePlans.length >= MIN_PLANS_FOR_DEACTIVATION;

    // Always record the removal so the admin UI surfaces it as
    // "removed from provider", even if we do not dare deactivate yet.
    const { error: statusErr } = await supabase
      .from('vtu_plans')
      .update({ provider_status: 'removed', last_synced_at: nowIso })
      .in('provider_plan_id', missing);

    if (!statusErr) removed = missing.length;

    if (comprehensive) {
      const { error: deactErr } = await supabase
        .from('vtu_plans')
        .update({ is_active: false, last_synced_at: nowIso })
        .in('provider_plan_id', missing);

      if (!deactErr) deactivated = missing.length;
    } else {
      warnings.push(
        `Provider returned only ${livePlans.length} plans (<${MIN_PLANS_FOR_DEACTIVATION}); ` +
          `${missing.length} missing plans flagged 'removed' but left active to avoid a partial-outage wipe.`,
      );
    }
  }

  return {
    success: true,
    added,
    updated,
    deactivated,
    unpriced,
    removed,
    total: livePlans.length,
    service_counts: serviceCounts,
    price_changes_count: priceChanges.length,
    price_changes: priceChanges.slice(0, 50),
    timestamp: nowIso,
    trigger,
    warnings,
  };
}

/**
 * Convenience wrapper: resolves `last_synced_at` for the freshest stored plan so
 * the admin UI can show genuine data age rather than "when the browser loaded".
 */
export async function getPlanFreshness(supabase: any): Promise<{
  last_synced_at: string | null;
  active_plans: number;
  total_plans: number;
}> {
  const { data } = await supabase
    .from('vtu_plans')
    .select('last_synced_at, is_active')
    .order('last_synced_at', { ascending: false })
    .limit(5000);

  const rows = (data || []) as Array<{ last_synced_at?: string; is_active?: boolean }>;
  return {
    last_synced_at: rows[0]?.last_synced_at || null,
    active_plans: rows.filter((r) => r.is_active).length,
    total_plans: rows.length,
  };
}
