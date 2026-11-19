// Supabase Edge Function: sync-vtu-plans
// Fetches live plans from upstream providers (MozoSubz, Nifex), normalises them,
// computes customer price (provider_price + margin or respects manual_price_override),
// upserts into vtu_plans on EVERY run (updating existing prices),
// and marks missing plans as inactive ONLY upon comprehensive successful fetches.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NormalizedPlan {
  network: string;
  plan_name: string;
  provider_plan_id: string;
  price_to_user: number;
  provider_price: number;
  is_active: boolean;
  last_synced_at: string;
  provider: string;
  service?: string;
  validity?: string;
  margin_percent?: number;
}

// All services supported across Nigerian telcos
const KNOWN_MOZO_SERVICES = [
  { id: "mtn_sme", network: "MTN", plan_type: "SME" },
  { id: "mtn_cg", network: "MTN", plan_type: "CG" },
  { id: "mtn_gifting", network: "MTN", plan_type: "GIFTING" },
  { id: "mtn_datashare", network: "MTN", plan_type: "DATASHARE" },
  { id: "mtn_awoof", network: "MTN", plan_type: "AWOOF" },
  { id: "mtn_awoof2", network: "MTN", plan_type: "AWOOF" },
  { id: "mtn_coupon", network: "MTN", plan_type: "COUPON" },
  { id: "glo_sme", network: "GLO", plan_type: "SME" },
  { id: "glo_cg", network: "GLO", plan_type: "CG" },
  { id: "glo_data", network: "GLO", plan_type: "DATA" },
  { id: "airtel_sme", network: "AIRTEL", plan_type: "SME" },
  { id: "airtel_cg", network: "AIRTEL", plan_type: "CG" },
  { id: "airtel_gifting", network: "AIRTEL", plan_type: "GIFTING" },
  { id: "etisalat_sme", network: "9MOBILE", plan_type: "SME" },
  { id: "etisalat_data", network: "9MOBILE", plan_type: "DATA" },
];

/**
 * Shared price calculation formula:
 * If a manual override is active, use it.
 * Otherwise compute provider_cost * (1 + margin/100) rounded up to nearest Naira.
 */
function calculateCustomerPrice(providerPrice: number, manualOverride: number | null | undefined, marginPct = 10): number {
  if (manualOverride !== undefined && manualOverride !== null && Number(manualOverride) > 0) {
    return Math.ceil(Number(manualOverride));
  }
  const cost = Number(providerPrice) || 0;
  if (cost <= 0) return 0;
  const factor = 1.0 + (marginPct / 100.0);
  return Math.ceil(cost * factor);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Resolve API Keys from DB or environment
    let mozoKey = Deno.env.get("MOZOSUBZ_API_KEY") || "";
    let nifexKey = Deno.env.get("NIFEX_API_KEY") || "";

    try {
      const { data: secrets } = await supabase
        .from("provider_secrets")
        .select("identifier, secret");

      if (secrets && Array.isArray(secrets)) {
        for (const s of secrets) {
          if (s.identifier === "mozosubz_api_key" && s.secret) {
            mozoKey = s.secret.trim();
          }
          if (s.identifier === "nifex_api_key" && s.secret) {
            nifexKey = s.secret.trim();
          }
        }
      }
    } catch (secErr) {
      console.warn("Could not load provider_secrets:", secErr);
    }

    const livePlans: NormalizedPlan[] = [];
    const nowIso = new Date().toISOString();
    const serviceCounts: Record<string, number> = {};

    // 2. Fetch MozoSubz Plans
    if (mozoKey && mozoKey.length > 5 && !mozoKey.includes("PASTE_YOUR")) {
      const mozoBase = "https://mozosubz.xyz/api/v1";
      for (const svc of KNOWN_MOZO_SERVICES) {
        try {
          // Check for pagination if provider introduces pages
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const url = page === 1
              ? `${mozoBase}/data/plans?service=${svc.id}`
              : `${mozoBase}/data/plans?service=${svc.id}&page=${page}`;

            const res = await fetch(url, {
              headers: {
                "X-Connect-Key": mozoKey,
                "Content-Type": "application/json",
              },
            });
            const json = await res.json().catch(() => ({}));
            if (json && json.success && Array.isArray(json.plans)) {
              serviceCounts[svc.id] = (serviceCounts[svc.id] || 0) + json.plans.length;
              for (const p of json.plans) {
                const cost = Number(p.price || 0);
                const pId = String(p.id);

                livePlans.push({
                  network: svc.network,
                  plan_name: p.name || `${svc.network} ${p.plan_type || "Data"}`,
                  provider_plan_id: pId,
                  provider_price: cost,
                  price_to_user: calculateCustomerPrice(cost, null, 10),
                  is_active: true,
                  last_synced_at: nowIso,
                  provider: "mozosubz",
                  service: svc.id,
                  validity: "30 Days",
                  margin_percent: 10,
                });
              }

              // Check if pagination exists (next page or pagination object)
              if (json.next || (json.total_pages && page < json.total_pages)) {
                page++;
              } else {
                hasMore = false;
              }
            } else {
              hasMore = false;
            }
          }
        } catch (fetchErr) {
          console.warn(`MozoSubz fetch error for ${svc.id}:`, fetchErr);
        }
      }
    }

    // 3. Fetch Nifex Plans
    if (nifexKey && nifexKey.length > 5 && !nifexKey.includes("PASTE_YOUR")) {
      try {
        const cleanKey = nifexKey.replace(/^Token\s+/i, "").trim();
        const res = await fetch("https://nifexdataapp.com.ng/api/data/", {
          headers: {
            "Authorization": `Token ${cleanKey}`,
            "Content-Type": "application/json",
          },
        });
        const json = await res.json().catch(() => ({}));
        const plansList = Array.isArray(json.plans) ? json.plans : (Array.isArray(json) ? json : []);
        serviceCounts["nifex"] = plansList.length;

        for (const p of plansList) {
          const rawNet = String(p.network || "MTN").toUpperCase();
          const net = rawNet.includes("GLO") ? "GLO" : rawNet.includes("AIRTEL") ? "AIRTEL" : rawNet.includes("9MOBILE") ? "9MOBILE" : "MTN";
          const cost = Number(p.price || 0);
          const rawId = String(p.plan_id ?? p.pId ?? p.id);
          const pId = `nifex_${net.toLowerCase()}_${rawId}`;

          livePlans.push({
            network: net,
            plan_name: p.plan_name || `${net} Data`,
            provider_plan_id: pId,
            provider_price: cost,
            price_to_user: calculateCustomerPrice(cost, null, 10),
            is_active: true,
            last_synced_at: nowIso,
            provider: "nifex",
            service: p.type || "DATA",
            validity: p.validity || "30 Days",
            margin_percent: 10,
          });
        }
      } catch (nifexErr) {
        console.warn("Nifex fetch error:", nifexErr);
      }
    }

    if (livePlans.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No plans retrieved from providers. Check provider API keys.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 4. Load existing plans from vtu_plans to check overrides and track price changes
    const { data: existingRows } = await supabase
      .from("vtu_plans")
      .select("provider_plan_id, price_to_user, provider_price, manual_price_override, margin_percent, is_active");

    const existingMap = new Map<string, any>();
    if (existingRows) {
      for (const row of existingRows) {
        existingMap.set(String(row.provider_plan_id).trim(), row);
      }
    }

    let addedCount = 0;
    let updatedCount = 0;
    const priceChanges: Array<{
      provider_plan_id: string;
      plan_name: string;
      old_provider_price: number;
      new_provider_price: number;
      old_customer_price: number;
      new_customer_price: number;
    }> = [];

    // Deduplicate strictly by provider_plan_id
    const uniquePlansMap = new Map<string, any>();
    for (const p of livePlans) {
      const key = String(p.provider_plan_id || "").trim();
      if (!key) continue;
      const existing = existingMap.get(key);

      const margin = existing?.margin_percent ? Number(existing.margin_percent) : 10;
      const manualOverride = existing?.manual_price_override;
      const computedPrice = calculateCustomerPrice(p.provider_price, manualOverride, margin);

      if (existing) {
        updatedCount++;
        if (Math.abs(Number(existing.provider_price) - p.provider_price) > 0.01 ||
            Math.abs(Number(existing.price_to_user) - computedPrice) > 0.01) {
          priceChanges.push({
            provider_plan_id: key,
            plan_name: p.plan_name,
            old_provider_price: Number(existing.provider_price || 0),
            new_provider_price: p.provider_price,
            old_customer_price: Number(existing.price_to_user || 0),
            new_customer_price: computedPrice,
          });
        }
      } else {
        addedCount++;
      }

      const row = {
        ...p,
        provider_plan_id: key,
        provider_price: p.provider_price,
        price_to_user: computedPrice, // ALWAYS updates customer price unless manual_price_override is set!
        manual_price_override: manualOverride ?? null,
        margin_percent: margin,
        is_active: true,
        last_synced_at: nowIso,
      };

      uniquePlansMap.set(key, row);
    }
    const upsertRows = Array.from(uniquePlansMap.values());

    // 5. Upsert into vtu_plans using provider_plan_id as unique key
    const { error: upsertErr } = await supabase
      .from("vtu_plans")
      .upsert(upsertRows, { onConflict: "provider_plan_id" });

    if (upsertErr) {
      throw new Error(`Upsert error: ${upsertErr.message}`);
    }

    // 6. Deactivate stale plans ONLY if livePlans returned a healthy, non-trivial set (>= 20 plans)
    const livePlanIdSet = new Set(livePlans.map((p) => p.provider_plan_id));
    let deactivatedCount = 0;

    if (existingRows && livePlans.length >= 20) {
      const missingPlanIds = existingRows
        .filter((r) => r.is_active && !livePlanIdSet.has(r.provider_plan_id))
        .map((r) => r.provider_plan_id);

      if (missingPlanIds.length > 0) {
        const { error: deactErr } = await supabase
          .from("vtu_plans")
          .update({ is_active: false, last_synced_at: nowIso })
          .in("provider_plan_id", missingPlanIds);

        if (!deactErr) {
          deactivatedCount = missingPlanIds.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        added: addedCount,
        updated: updatedCount,
        deactivated: deactivatedCount,
        total_live_fetched: livePlans.length,
        service_counts: serviceCounts,
        price_changes_count: priceChanges.length,
        price_changes: priceChanges.slice(0, 50),
        timestamp: nowIso,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
