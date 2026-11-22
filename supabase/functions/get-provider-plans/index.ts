// Supabase Edge Function: get-provider-plans
// Input: { provider, service_code? }
// Fetches live wholesale plans directly from the named upstream provider.
// Never reads from the database plans table; never merges other providers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-email",
};

interface NormalizedPlan {
  id: string;
  name: string;
  network: string;
  service_code: string;
  provider_price: number;
  plan_type?: string;
  validity?: string;
}

const MOZOSUBZ_SERVICES_DEF: Array<{ id: string; network: string; plan_type: string }> = [
  { id: "mtn_sme",        network: "MTN",     plan_type: "SME"        },
  { id: "mtn_cg",         network: "MTN",     plan_type: "CG"         },
  { id: "mtn_gifting",    network: "MTN",     plan_type: "GIFTING"    },
  { id: "mtn_datashare",  network: "MTN",     plan_type: "DATASHARE"  },
  { id: "mtn_awoof",      network: "MTN",     plan_type: "AWOOF"      },
  { id: "mtn_awoof2",     network: "MTN",     plan_type: "AWOOF"      },
  { id: "mtn_coupon",     network: "MTN",     plan_type: "COUPON"     },
  { id: "glo_sme",        network: "GLO",     plan_type: "SME"        },
  { id: "glo_cg",         network: "GLO",     plan_type: "CG"         },
  { id: "glo_data",       network: "GLO",     plan_type: "DATA"       },
  { id: "airtel_sme",     network: "AIRTEL",  plan_type: "SME"        },
  { id: "airtel_cg",      network: "AIRTEL",  plan_type: "CG"         },
  { id: "airtel_gifting", network: "AIRTEL",  plan_type: "GIFTING"    },
  { id: "etisalat_sme",   network: "9MOBILE", plan_type: "SME"        },
  { id: "etisalat_data",  network: "9MOBILE", plan_type: "DATA"       },
];

function parseValidityFromName(name: string): string {
  const m = name.match(/(\d+)\s*(day|days|month|months|week|weeks|hr|hour|hours)/i);
  return m ? `${m[1]} ${m[2]}` : "30 Days";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const fetchStartTime = new Date().toISOString();

  try {
    const url = new URL(req.url);
    let provider = url.searchParams.get("provider") || "";
    let serviceCode = url.searchParams.get("service_code") || url.searchParams.get("service") || "";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.provider) provider = body.provider;
        if (body.service_code) serviceCode = body.service_code;
        if (body.service && !serviceCode) serviceCode = body.service;
      } catch (_) {}
    }

    const cleanProvider = (provider || "mozosubz").toLowerCase().trim();

    if (cleanProvider !== "mozosubz" && cleanProvider !== "nifex") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid provider: '${provider}'. Must be 'mozosubz' or 'nifex'.`,
          fetch_time: fetchStartTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── MOZOSUBZ FETCH ──────────────────────────────────────────────────────────
    if (cleanProvider === "mozosubz") {
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
          JSON.stringify({
            success: false,
            error: "MozoSubz API Connect Key is not configured on the server. Please save your key in the Pricing Manager.",
            fetch_time: fetchStartTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
        );
      }

      const mozoBase = "https://mozosubz.xyz/api/v1";
      const servicesToQuery = serviceCode
        ? MOZOSUBZ_SERVICES_DEF.filter(s => s.id.toLowerCase() === serviceCode.toLowerCase())
        : MOZOSUBZ_SERVICES_DEF;

      if (serviceCode && servicesToQuery.length === 0) {
        // Fallback for custom or unknown service code passed directly
        servicesToQuery.push({
          id: serviceCode.toLowerCase().trim(),
          network: serviceCode.toUpperCase().includes("GLO") ? "GLO"
            : serviceCode.toUpperCase().includes("AIRTEL") ? "AIRTEL"
            : serviceCode.toUpperCase().includes("ETISALAT") || serviceCode.toUpperCase().includes("9MOBILE") ? "9MOBILE"
            : "MTN",
          plan_type: "DATA"
        });
      }

      const allPlans: NormalizedPlan[] = [];
      const groupedByService: Record<string, NormalizedPlan[]> = {};
      const serviceErrors: Record<string, string> = {};

      for (const svc of servicesToQuery) {
        groupedByService[svc.id] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          try {
            const pageUrl = page === 1
              ? `${mozoBase}/data/plans?service=${svc.id}`
              : `${mozoBase}/data/plans?service=${svc.id}&page=${page}`;

            const resp = await fetch(pageUrl, {
              method: "GET",
              headers: {
                "X-Connect-Key": mozoKey,
                "Content-Type": "application/json",
              },
            });

            if (!resp.ok) {
              const errBody = await resp.json().catch(() => null);
              const errMsg = errBody?.error || errBody?.message || `HTTP ${resp.status}`;
              serviceErrors[svc.id] = errMsg;
              hasMore = false;
              break;
            }

            const data: any = await resp.json().catch(() => null);
            if (!data || !data.success || !Array.isArray(data.plans)) {
              if (data && !data.success) {
                serviceErrors[svc.id] = data.error || data.message || "Unsuccessful response from provider";
              }
              hasMore = false;
              break;
            }

            const rawPlans = data.plans;
            for (const p of rawPlans) {
              const planObj: NormalizedPlan = {
                id: String(p.id),
                name: String(p.name),
                network: svc.network,
                service_code: svc.id,
                provider_price: Number(p.price || 0),
                plan_type: p.plan_type || svc.plan_type,
                validity: parseValidityFromName(String(p.name || "")),
              };
              allPlans.push(planObj);
              groupedByService[svc.id].push(planObj);
            }

            // Pagination check
            if (data.next || (data.total_pages && page < data.total_pages)) {
              page++;
            } else {
              hasMore = false;
            }
          } catch (fetchErr: any) {
            serviceErrors[svc.id] = fetchErr.message || String(fetchErr);
            hasMore = false;
          }
        }
      }

      // Log: provider, count, time, no keys
      console.log(`[get-provider-plans] provider: mozosubz, count: ${allPlans.length}, time: ${fetchStartTime}`);

      // If a single service was queried and failed completely
      if (serviceCode && allPlans.length === 0 && serviceErrors[serviceCode]) {
        return new Response(
          JSON.stringify({
            success: false,
            provider: "mozosubz",
            service_code: serviceCode,
            error: `MozoSubz returned: ${serviceErrors[serviceCode]}`,
            fetch_time: fetchStartTime,
            count: 0,
            plans: [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
        );
      }

      const responsePayload = {
        success: true,
        provider: "mozosubz",
        service_code: serviceCode || null,
        count: allPlans.length,
        fetch_time: fetchStartTime,
        plans: allPlans,
        grouped_by_service: groupedByService,
        errors: Object.keys(serviceErrors).length > 0 ? serviceErrors : undefined,
      };

      return new Response(JSON.stringify(responsePayload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ─── NIFEX DATA FETCH ────────────────────────────────────────────────────────
    if (cleanProvider === "nifex") {
      let nifexKey = Deno.env.get("NIFEX_API_KEY") || "";
      try {
        const { data: secretRow } = await supabase
          .from("provider_secrets")
          .select("secret")
          .eq("identifier", "nifex_api_key")
          .maybeSingle();

        if (secretRow?.secret) {
          nifexKey = secretRow.secret.trim();
        }
      } catch (_) {}

      if (!nifexKey || nifexKey.length < 5) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Nifex API Token is not configured on the server. Please save your key in the Pricing Manager.",
            fetch_time: fetchStartTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 }
        );
      }

      const cleanKey = nifexKey.replace(/^Token\s+/i, "").trim();
      let page = 1;
      let hasMore = true;
      const allNifexPlans: NormalizedPlan[] = [];
      const groupedByService: Record<string, NormalizedPlan[]> = {};

      while (hasMore) {
        const nifexUrl = page === 1
          ? "https://nifexdataapp.com.ng/api/data/"
          : `https://nifexdataapp.com.ng/api/data/?page=${page}`;

        const resp = await fetch(nifexUrl, {
          method: "GET",
          headers: {
            "Authorization": `Token ${cleanKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          hasMore = false;
          if (page === 1) {
            return new Response(
              JSON.stringify({
                success: false,
                provider: "nifex",
                error: `Nifex API error HTTP ${resp.status}: ${errText}`,
                fetch_time: fetchStartTime,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
            );
          }
          break;
        }

        const rawJson: any = await resp.json().catch(() => null);
        const rawList = Array.isArray(rawJson?.plans)
          ? rawJson.plans
          : (Array.isArray(rawJson) ? rawJson : (Array.isArray(rawJson?.results) ? rawJson.results : []));

        for (const p of rawList) {
          const rawNet = String(p.network || "MTN").toUpperCase();
          const net = rawNet.includes("GLO") ? "GLO"
            : rawNet.includes("AIRTEL") ? "AIRTEL"
            : rawNet.includes("9MOBILE") || rawNet.includes("ETISALAT") ? "9MOBILE"
            : "MTN";
          const rawId = String(p.plan_id ?? p.pId ?? p.id);
          const pId = `nifex_${net.toLowerCase()}_${rawId}`;
          const svcType = String(p.type || p.plan_type || "DATA").toLowerCase();

          const planObj: NormalizedPlan = {
            id: pId,
            name: String(p.plan_name || p.name || `${net} Data`),
            network: net,
            service_code: svcType,
            provider_price: Number(p.price || 0),
            plan_type: svcType.toUpperCase(),
            validity: p.validity || parseValidityFromName(String(p.plan_name || "")),
          };

          if (!groupedByService[svcType]) groupedByService[svcType] = [];
          groupedByService[svcType].push(planObj);
          allNifexPlans.push(planObj);
        }

        if (rawJson?.next && rawList.length > 0) {
          page++;
        } else {
          hasMore = false;
        }
      }

      // Filter by service_code if requested
      let filteredPlans = allNifexPlans;
      if (serviceCode) {
        const sc = serviceCode.toLowerCase();
        filteredPlans = allNifexPlans.filter(p =>
          p.service_code.toLowerCase().includes(sc) ||
          p.network.toLowerCase().includes(sc)
        );
      }

      // Log: provider, count, time, no keys
      console.log(`[get-provider-plans] provider: nifex, count: ${filteredPlans.length}, time: ${fetchStartTime}`);

      return new Response(
        JSON.stringify({
          success: true,
          provider: "nifex",
          service_code: serviceCode || null,
          count: filteredPlans.length,
          fetch_time: fetchStartTime,
          plans: filteredPlans,
          grouped_by_service: groupedByService,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported provider: ${provider}`, fetch_time: fetchStartTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message, fetch_time: fetchStartTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
