// Supabase Edge Function: sync-vtu-plans
// Fetches live plans from upstream providers (Mozosubz, Nifex), normalises them,
// upserts into vtu_plans, and marks missing plans as is_active = false.

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
}

const MOZO_SERVICES = [
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

    // 2. Fetch Mozosubz Plans
    if (mozoKey && mozoKey.length > 5 && !mozoKey.includes("PASTE_YOUR")) {
      const mozoBase = "https://mozosubz.xyz/api/v1";
      for (const svc of MOZO_SERVICES) {
        try {
          const res = await fetch(`${mozoBase}/data/plans?service=${svc.id}`, {
            headers: {
              "X-Connect-Key": mozoKey,
              "Content-Type": "application/json",
            },
          });
          const json = await res.json().catch(() => ({}));
          if (json && json.success && Array.isArray(json.plans)) {
            for (const p of json.plans) {
              const cost = Number(p.price || 0);
              const defaultMarkup = 1.10; // 10% standard margin
              const selling = Math.ceil(cost * defaultMarkup);
              const pId = String(p.id);

              livePlans.push({
                network: svc.network,
                plan_name: p.name || `${svc.network} ${p.plan_type || "Data"}`,
                provider_plan_id: pId,
                provider_price: cost,
                price_to_user: selling,
                is_active: true,
                last_synced_at: nowIso,
                provider: "mozosubz",
                service: svc.id,
                validity: "30 Days",
              });
            }
          }
        } catch (fetchErr) {
          console.warn(`Mozosubz fetch error for ${svc.id}:`, fetchErr);
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
        for (const p of plansList) {
          const rawNet = String(p.network || "MTN").toUpperCase();
          const net = rawNet.includes("GLO") ? "GLO" : rawNet.includes("AIRTEL") ? "AIRTEL" : rawNet.includes("9MOBILE") ? "9MOBILE" : "MTN";
          const cost = Number(p.price || 0);
          const defaultMarkup = 1.10;
          const selling = Math.ceil(cost * defaultMarkup);
          const pId = String(p.plan_id ?? p.pId ?? p.id);

          livePlans.push({
            network: net,
            plan_name: p.plan_name || `${net} Data`,
            provider_plan_id: pId,
            provider_price: cost,
            price_to_user: selling,
            is_active: true,
            last_synced_at: nowIso,
            provider: "nifex",
            service: p.type || "DATA",
            validity: p.validity || "30 Days",
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

    // 4. Fetch existing plans from vtu_plans to preserve custom price_to_user and track additions
    const { data: existingRows } = await supabase
      .from("vtu_plans")
      .select("provider_plan_id, price_to_user, is_active");

    const existingMap = new Map<string, any>();
    if (existingRows) {
      for (const row of existingRows) {
        existingMap.set(row.provider_plan_id, row);
      }
    }

    let addedCount = 0;
    let updatedCount = 0;

    // Deduplicate strictly by provider_plan_id to prevent ON CONFLICT DO UPDATE cannot affect row a second time
    const uniquePlansMap = new Map<string, any>();
    for (const p of livePlans) {
      const key = String(p.provider_plan_id || "").trim();
      if (!key) continue;
      const existing = existingMap.get(key);
      const row = {
        ...p,
        provider_plan_id: key,
        price_to_user: existing && existing.price_to_user > 0 ? existing.price_to_user : p.price_to_user,
      };
      if (existing) updatedCount++; else addedCount++;
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

    // 6. Deactivate stale plans that are no longer returned by providers
    const livePlanIdSet = new Set(livePlans.map((p) => p.provider_plan_id));
    let deactivatedCount = 0;

    if (existingRows) {
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
        total: livePlans.length,
        timestamp: nowIso,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
