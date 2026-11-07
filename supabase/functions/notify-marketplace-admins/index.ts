import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const { listing_name, buyer_first_name, order_id } = payload;

    if (!listing_name || !buyer_first_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: listing_name, buyer_first_name." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[notify-marketplace-admins] Supabase environment variables not configured.");
      return new Response(JSON.stringify({ error: "Server misconfiguration." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Find all admin user IDs (role = marketplace_admin, super_admin, or admin)
    const { data: adminProfiles, error: adminErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, email")
      .or("role.eq.marketplace_admin,role.eq.super_admin,role.eq.admin");

    if (adminErr) {
      console.error("[notify-marketplace-admins] Error fetching admin profiles:", adminErr.message);
    }

    const adminIds = (adminProfiles || []).map((p: any) => p.id);

    if (adminIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No admin profiles found to notify." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch push subscriptions for those admins
    const { data: subscriptions, error: subErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", adminIds);

    if (subErr || !subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active push subscriptions found for admins." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If VAPID keys are missing, log non-fatal warning so purchase is never interrupted
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn("[notify-marketplace-admins] VAPID keys not configured in Edge secrets. Push skipped.");
      return new Response(
        JSON.stringify({ success: true, message: "VAPID keys not configured; push skipped." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    webPush.setVapidDetails(
      "mailto:admin@norodata.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    // Privacy constraint: Never send buyer's full email, phone number, or wallet balance
    const pushPayload = JSON.stringify({
      title: "New marketplace order",
      body: `${buyer_first_name} started an order for ${listing_name}.`,
      data: {
        url: `/?tab=admin&orderId=${order_id || ""}`,
        order_id: order_id || null,
      },
    });

    let sentCount = 0;
    const expiredEndpoints: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub: any) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webPush.sendNotification(pushSubscription, pushPayload);
          sentCount++;
        } catch (err: any) {
          const statusCode = err?.statusCode || err?.status;
          console.warn(`[notify-marketplace-admins] Push error for endpoint:`, statusCode, err?.message);
          // Delete subscription if expired (HTTP 404 or 410)
          if (statusCode === 404 || statusCode === 410) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Delete expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, expiredRemoved: expiredEndpoints.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[notify-marketplace-admins Exception]:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error sending push notification." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
