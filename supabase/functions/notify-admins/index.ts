import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "https://esm.sh/web-push@3.6.7";

// Edge Function to send a push notification to all admin/subscribed users
// Expects JSON body: { title: string, body: string, data?: any }

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Authenticate service role – we only allow internal calls (e.g., from server code)
  // For simplicity, check for a secret header (to be set via env variable)
  const secretHeader = req.headers.get("x-internal-secret") ?? "";
  const expected = Deno.env.get("NOTIFY_INTERNAL_SECRET") ?? "";
  if (secretHeader !== expected) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const payload = await req.json();
  const { title, body, data } = payload;
  if (!title || !body) {
    return new Response(JSON.stringify({ error: "Missing title or body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Load VAPID keys from env (must be set via Supabase secrets)
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  webPush.setVapidDetails(
    "mailto:admin@norodata.com",
    vapidPublicKey,
    vapidPrivateKey,
  );

  // Fetch all subscriptions (service role bypasses RLS)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: subs, error: fetchErr } = await admin
    .from("push_subscriptions")
    .select("endpoint,keys");

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const notification = JSON.stringify({ title, body, data });
  const results: any[] = [];
  for (const sub of subs ?? []) {
    try {
      await webPush.sendNotification(sub, notification);
      results.push({ endpoint: sub.endpoint, status: "sent" });
    } catch (e: any) {
      // If endpoint is gone, remove it
      if (e.statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
      results.push({ endpoint: sub.endpoint, error: e.message });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
