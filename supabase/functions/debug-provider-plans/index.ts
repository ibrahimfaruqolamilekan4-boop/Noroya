// Supabase Edge Function: debug-provider-plans
// Probes upstream provider endpoints (MozoSubz) with server-side credentials
// and outputs the raw JSON response with all secrets securely redacted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALL_CANDIDATE_SERVICES = [
  "mtn_sme",
  "mtn_cg",
  "mtn_gifting",
  "mtn_datashare",
  "mtn_awoof",
  "mtn_awoof2",
  "mtn_coupon",
  "glo_sme",
  "glo_cg",
  "glo_data",
  "airtel_sme",
  "airtel_cg",
  "airtel_gifting",
  "etisalat_sme",
  "etisalat_data"
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Resolve Provider Key securely from provider_secrets
    let mozoKey = Deno.env.get("MOZOSUBZ_API_KEY") || "";
    try {
      const { data: secretRow } = await supabase
        .from("provider_secrets")
        .select("secret")
        .eq("identifier", "mozosubz_api_key")
        .maybeSingle();

      if (secretRow?.secret) {
        mozoKey = secretRow.secret.trim();
      }
    } catch (err) {
      console.warn("Could not query provider_secrets:", err);
    }

    if (!mozoKey || mozoKey.length < 5 || mozoKey.includes("PASTE_YOUR")) {
      return new Response(
        JSON.stringify({
          error: "MozoSubz provider credentials not configured in provider_secrets.",
          key_configured: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
      );
    }

    const mozoBase = "https://mozosubz.xyz/api/v1";
    const report: Record<string, any> = {};
    let totalPlansCount = 0;
    const allPlansList: any[] = [];

    for (const service of ALL_CANDIDATE_SERVICES) {
      try {
        const url = `${mozoBase}/data/plans?service=${service}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: {
            "X-Connect-Key": mozoKey,
            "Content-Type": "application/json"
          }
        });

        const rawData = await resp.json().catch(() => ({ error: "Invalid JSON response" }));
        const plans = Array.isArray(rawData?.plans) ? rawData.plans : [];
        const planCount = plans.length;
        totalPlansCount += planCount;

        report[service] = {
          http_status: resp.status,
          success: rawData?.success ?? false,
          count: planCount,
          raw_sample: plans.slice(0, 2),
          plans: plans.map((p: any) => ({
            id: p.id,
            id_type: typeof p.id,
            name: p.name,
            price: Number(p.price),
            plan_type: p.plan_type
          }))
        };

        for (const p of plans) {
          allPlansList.push({
            service,
            id: p.id,
            id_type: typeof p.id,
            name: p.name,
            price: Number(p.price),
            plan_type: p.plan_type
          });
        }
      } catch (svcErr: any) {
        report[service] = {
          error: svcErr.message || String(svcErr)
        };
      }
    }

    // Filter specifically for 1GB / ₦399 / ₦494 plans across all provider data
    const matchedPlans = allPlansList.filter(
      (p) =>
        p.price === 399 ||
        p.price === 494 ||
        (p.price >= 390 && p.price <= 410) ||
        String(p.name).toLowerCase().includes("1gb") ||
        String(p.name).toLowerCase().includes("1.0 gb")
    );

    return new Response(
      JSON.stringify({
        provider: "mozosubz",
        base_url: mozoBase,
        endpoint_pattern: "GET /api/v1/data/plans?service={service}",
        auth_header: "X-Connect-Key: ****",
        total_plans_returned: totalPlansCount,
        services_queried: ALL_CANDIDATE_SERVICES.length,
        services_with_plans: Object.entries(report).filter(([_, v]) => v.count > 0).map(([k]) => k),
        matched_1gb_or_target_price_plans: matchedPlans,
        service_breakdown: report
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
