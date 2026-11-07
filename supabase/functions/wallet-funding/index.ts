import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateFundingFee } from "../../../src/lib/fundingFee.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Unauthenticated");

    // Payload
    const { amount } = await req.json();
    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new Error("Invalid amount");
    }

    // Fee calculation
    const { margin, totalCharged, gatewayFee } = calculateFundingFee(amount);

    // Insert transaction using service role (bypass RLS)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error: insertErr } = await admin.from("wallet_transactions").insert({
      user_id: user.id,
      amount,
      norodata_margin: margin,
      gateway_fee: gatewayFee,
      total_charged: totalCharged,
      status: "pending",
      created_at: new Date().toISOString(),
    });
    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ success: true, amount, margin, totalCharged, gatewayFee }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
