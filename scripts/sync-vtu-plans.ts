// sync-vtu-plans.ts – Supabase Edge Function (run on server side)
// Fetch live VTU plans from Mozosubz and Nifex, upsert into vtu_plans table.

import { createClient } from "@supabase/supabase-js";
import axios from "axios";

// Supabase credentials (environment variables set in deployment)
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseServiceRole);

// Provider base URLs – can be overridden via env vars
const MOZOSUBZ_BASE = process.env.MOZOSUBZ_BASE_URL || "https://mozosubz.xyz/api/v1";
const NIFEX_BASE = process.env.NIFEX_BASE_URL || "https://nifexdataapp.com.ng/api";

// Helper to fetch Mozosubz plans
async function fetchMozosubzPlans(apiKey: string) {
  const url = `${MOZOSUBZ_BASE}/data/plans`;
  const resp = await axios.get(url, {
    headers: {
      "X-Connect-Key": apiKey,
      Authorization: `Token ${apiKey}`,
    },
    timeout: 15000,
  });
  // Expected response: { success: true, data: [{ id, name, price, network, service }] }
  const data = resp.data?.data || [];
  return data.map((p: any) => ({
    provider: "mozosubz",
    provider_plan_id: String(p.id),
    network: (p.network || "").toUpperCase(),
    plan_name: p.name || "",
    price_to_user: Number(p.price) || 0,
    provider_price: Number(p.price) || 0,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  }));
}

// Helper to fetch Nifex plans
async function fetchNifexPlans(apiKey: string) {
  const url = `${NIFEX_BASE}/data/plans`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 15000,
  });
  // Expected response: { data: [{ plan_id, plan_name, price, network }] }
  const data = resp.data?.data || [];
  return data.map((p: any) => ({
    provider: "nifex",
    provider_plan_id: String(p.plan_id),
    network: (p.network || "").toUpperCase(),
    plan_name: p.plan_name || "",
    price_to_user: Number(p.price) || 0,
    provider_price: Number(p.price) || 0,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  }));
}

// Resolve API key from provider_secrets table or env vars
async function resolveKey(identifier: string, envVars: string[]) {
  const { data: secretData, error: secretErr } = await supabase
    .from("provider_secrets")
    .select("secret")
    .eq("identifier", identifier)
    .maybeSingle();
  if (!secretErr && secretData?.secret) return secretData.secret.trim();
  for (const ev of envVars) {
    const val = process.env[ev];
    if (val && !val.includes("PASTE_YOUR") && val.trim().length > 5) return val.trim();
  }
  return "";
}

async function sync() {
  const mozoKey = await resolveKey("mozosubz_api_key", ["MOZOSUBZ_API_KEY", "MOZOSUBS_CONNECT_KEY"]);
  const nifexKey = await resolveKey("nifex_api_key", ["NIFEX_API_KEY", "NIFEXDATA_API_KEY"]);

  const [mozoPlans, nifexPlans] = await Promise.all([
    mozoKey ? fetchMozosubzPlans(mozoKey) : [],
    nifexKey ? fetchNifexPlans(nifexKey) : [],
  ]);

  const incoming = [...mozoPlans, ...nifexPlans];
  const incomingIds = incoming.map((p) => p.provider_plan_id);

  // Upsert incoming plans (conflict on provider_plan_id)
  const { error: upsertErr } = await supabase.from("vtu_plans").upsert(incoming, {
    onConflict: "provider_plan_id",
    returning: "minimal",
  });

  // Deactivate any plans not in the latest fetch
  const { error: deactivateErr } = await supabase
    .from("vtu_plans")
    .update({ is_active: false })
    .not("provider_plan_id", "in", `(${incomingIds.map((id) => `'${id}'`).join(",")})`);

  return {
    added: incoming.length,
    updated: incoming.length,
    deactivated: incomingIds.length, // placeholder – real count requires prior state query
    error: upsertErr?.message || deactivateErr?.message || null,
  };
}

export async function handler(req: Request) {
  try {
    const result = await sync();
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
