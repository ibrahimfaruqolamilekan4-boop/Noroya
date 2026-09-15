import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Resolution order for Supabase URL / anon key (browser):
//  1. window.SUPABASE_CONFIG — injected server-side on every page load from the
//     CURRENT environment. It always matches the key the API itself uses, so a
//     key rotation + redeploy propagates to browsers automatically.
//  2. localStorage DYNAMIC_SUPABASE_* — legacy dev override, honoured ONLY when
//     no valid runtime config exists, and purged as soon as one does (a stale
//     value here pins a revoked key after a rotation and every request fails
//     with "Invalid API key", surviving refreshes and redeploys).
//  3. Build-time constants / process.env — final fallbacks.
const getEnv = (key: string): string | null => {
  if (typeof window !== "undefined") {
    const cfg: any = (window as any).SUPABASE_CONFIG;
    let cfgUrl: string | null = null;
    let cfgKey: string | null = null;
    if (cfg) {
      const u = cfg.supabaseUrl;
      if (typeof u === "string" && u.trim() !== "" && !u.includes("placeholder-project") && !u.includes("undefined")) cfgUrl = u.trim();
      const k = cfg.supabaseAnonKey;
      if (typeof k === "string" && k.trim() !== "" && !k.includes("placeholder-anon-key") && !k.includes("undefined")) cfgKey = k.trim();
    }
    // Self-heal: a live runtime config makes stale dev overrides dangerous —
    // remove them so a rotated key can never be masked by a browser-cached one.
    if (cfgUrl && cfgKey) {
      try {
        localStorage.removeItem("DYNAMIC_SUPABASE_URL");
        localStorage.removeItem("DYNAMIC_SUPABASE_ANON_KEY");
        localStorage.removeItem("DYNAMIC_SUPABASE_SERVICE_ROLE_KEY");
      } catch { /* ignore */ }
    }
    if (key === "VITE_SUPABASE_URL" || key === "SUPABASE_URL") {
      if (cfgUrl) return cfgUrl;
      const overridingUrl = localStorage.getItem("DYNAMIC_SUPABASE_URL");
      if (overridingUrl && overridingUrl.trim() !== "" && !overridingUrl.includes("placeholder")) {
        return overridingUrl.trim();
      }
    }
    if (key === "VITE_SUPABASE_ANON_KEY" || key === "SUPABASE_ANON_KEY") {
      if (cfgKey) return cfgKey;
      const overridingKey = localStorage.getItem("DYNAMIC_SUPABASE_ANON_KEY");
      if (overridingKey && overridingKey.trim() !== "" && !overridingKey.includes("placeholder")) {
        return overridingKey.trim();
      }
    }
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== "undefined" && process?.env && process.env[key]) {
    return process.env[key];
  }
  return null;
};

// Determine if we are running in a server-side environment
const isServer = typeof window === "undefined" && typeof process !== "undefined";

const supabaseUrl = getEnv("VITE_SUPABASE_URL") || 
                    getEnv("SUPABASE_URL") || 
                    (typeof process !== "undefined" && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL)) || 
                    "https://placeholder-project.supabase.co";

// On server-side, load SUPABASE_SERVICE_ROLE_KEY to bypass RLS and perform administrative operations securely.
const serviceRoleKey = isServer ? (getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("VITE_SUPABASE_SERVICE_ROLE_KEY") || (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY)) : null;

// Exported so request handlers can fail fast with an actionable message
// instead of emitting confusing "permission denied for table ... TO anon"
// errors from every service-role query.
export const serverHasServiceRoleKey = Boolean(serviceRoleKey);

const anonKey = getEnv("VITE_SUPABASE_ANON_KEY") || 
                getEnv("SUPABASE_ANON_KEY") || 
                (typeof process !== "undefined" && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY)) || 
                "placeholder-anon-key";

// In the browser this MUST be the public anon key served by /config/supabase.js
// (or the build-time value) — never a service-role key.
const apiKey = isServer ? (serviceRoleKey || anonKey) : anonKey;

if (!supabaseUrl || !apiKey || supabaseUrl.includes("placeholder-project") || apiKey.includes("placeholder-anon-key")) {
  console.warn("WARNING: Supabase environment configuration keys are using default placeholders or are unconfigured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY to link to your live database.");
}

if (isServer && serviceRoleKey) {
  console.log("Supabase Client initialized successfully with Service Role Key (Bypass RLS Enabled).");
} else if (isServer) {
  console.error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is NOT set — the server is running with the anon key only. Admin operations, balance funding, payment crediting and protected reads WILL fail. Set SUPABASE_SERVICE_ROLE_KEY (project's service_role key) in the deployment environment and redeploy.");
}

// Node.js < 22 (Vercel's runtime) lacks native WebSocket support, which the
// Supabase realtime client requires and throws a fatal error over at
// construction time if not provided. Supply the `ws` package as the
// transport on the server; browsers already have native WebSocket and
// bundlers substitute ws's `browser` field stub automatically, so this is
// safe to import unconditionally in this isomorphic file.
export const supabase = createClient(supabaseUrl, apiKey, isServer ? { realtime: { transport: ws as any } } : undefined);
