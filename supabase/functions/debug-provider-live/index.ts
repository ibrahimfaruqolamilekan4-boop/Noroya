// Supabase Edge Function: debug-provider-live
// Probes upstream provider endpoints with server-side credentials and returns raw responses with keys redacted.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-email",
};

const MOZOSUBZ_KNOWN_SERVICES = [
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
    const url = new URL(req.url);
    let provider = url.searchParams.get("provider") || "mozosubz";
    let requestedService = url.searchParams.get("service") || "";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.provider) provider = body.provider;
        if (body.service) requestedService = body.service;
      } catch (_) {}
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (provider.toLowerCase() === "mozosubz") {
      let mozoKey = Deno.env.get("MOZOSUBZ_API_KEY") || Deno.env.get("MOZOSUBZ_CONNECT_KEY") || "";
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
          JSON.stringify({ error: "MozoSubz key not configured", key_configured: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
        );
      }

      const mozoBase = "https://mozosubz.xyz/api/v1";
      const servicesToQuery = requestedService ? [requestedService] : MOZOSUBZ_KNOWN_SERVICES;

      const serviceResponses: Record<string, any> = {};
      let totalPlans = 0;
      const allPlans: any[] = [];

      // Also probe base endpoint without query param if querying all
      let noParamResponse: any = null;
      if (!requestedService) {
        try {
          const noParamResp = await fetch(`${mozoBase}/data/plans`, {
            method: "GET",
            headers: { "X-Connect-Key": mozoKey, "Content-Type": "application/json" }
          });
          noParamResponse = {
            status: noParamResp.status,
            body: await noParamResp.json().catch(() => null)
          };
        } catch (e: any) {
          noParamResponse = { error: e.message };
        }
      }

      for (const svc of servicesToQuery) {
        try {
          const resp = await fetch(`${mozoBase}/data/plans?service=${svc}`, {
            method: "GET",
            headers: {
              "X-Connect-Key": mozoKey,
              "Content-Type": "application/json"
            }
          });
          const rawData = await resp.json().catch(() => null);
          const plans = Array.isArray(rawData?.plans) ? rawData.plans : [];
          totalPlans += plans.length;

          serviceResponses[svc] = {
            http_status: resp.status,
            raw_response: rawData,
            plan_count: plans.length,
            plans: plans.map((p: any) => ({
              id: String(p.id),
              name: p.name,
              price: Number(p.price),
              plan_type: p.plan_type
            }))
          };

          for (const p of plans) {
            allPlans.push({
              service: svc,
              id: String(p.id),
              name: p.name,
              price: Number(p.price),
              plan_type: p.plan_type
            });
          }
        } catch (e: any) {
          serviceResponses[svc] = { error: e.message };
        }
      }

      const plans1gb = allPlans.filter(p =>
        p.price === 399 ||
        p.price === 450 ||
        p.price === 494 ||
        String(p.name).toLowerCase().includes("1gb") ||
        String(p.name).toLowerCase().includes("1.0 gb") ||
        String(p.name).toLowerCase().includes("1.0gb")
      );

      return new Response(
        JSON.stringify({
          provider: "mozosubz",
          endpoint_pattern: "GET /api/v1/data/plans?service={service_code}",
          auth_header: "X-Connect-Key: ****",
          total_plans_returned: totalPlans,
          response_wrapper: "{ success: boolean, plans: Array<{ id, name, price, plan_type }> }",
          services_present: Object.keys(serviceResponses).filter(s => (serviceResponses[s]?.plan_count || 0) > 0),
          all_services_queried: Object.keys(serviceResponses),
          target_1gb_or_notable_plans: plans1gb,
          base_endpoint_no_param: noParamResponse,
          service_breakdown: serviceResponses
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (provider.toLowerCase() === "nifex") {
      let nifexKey = Deno.env.get("NIFEX_API_KEY") || "";
      try {
        const { data: secretRow } = await supabase
          .from("provider_secrets")
          .select("secret")
          .eq("identifier", "nifex_api_key")
          .maybeSingle();
        if (secretRow?.secret) nifexKey = secretRow.secret.trim();
      } catch (_) {}

      if (!nifexKey) {
        return new Response(
          JSON.stringify({ error: "Nifex key not configured", key_configured: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
        );
      }

      const cleanKey = nifexKey.replace(/^Token\s+/i, "").trim();
      const resp = await fetch("https://nifexdataapp.com.ng/api/data/", {
        headers: { "Authorization": `Token ${cleanKey}`, "Content-Type": "application/json" }
      });
      const raw = await resp.json().catch(() => null);
      const plansList = Array.isArray(raw?.plans) ? raw.plans : (Array.isArray(raw) ? raw : []);

      return new Response(
        JSON.stringify({
          provider: "nifex",
          endpoint: "GET https://nifexdataapp.com.ng/api/data/",
          auth_header: "Authorization: Token ****",
          total_plans_returned: plansList.length,
          response_wrapper: Array.isArray(raw) ? "Array<Plan>" : "{ plans: Array<Plan> }",
          raw_response: raw
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${provider}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
