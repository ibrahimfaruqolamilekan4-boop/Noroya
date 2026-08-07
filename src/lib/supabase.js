import { createClient } from "@supabase/supabase-js";

const getEnv = (key) => {
  if (typeof window !== "undefined") {
    if (key === "VITE_SUPABASE_URL" || key === "SUPABASE_URL") {
      const overridingUrl = localStorage.getItem("DYNAMIC_SUPABASE_URL");
      if (overridingUrl && overridingUrl.trim() !== "" && !overridingUrl.includes("placeholder")) {
        return overridingUrl.trim();
      }
    }
    if (key === "VITE_SUPABASE_ANON_KEY" || key === "SUPABASE_ANON_KEY") {
      const overridingKey = localStorage.getItem("DYNAMIC_SUPABASE_ANON_KEY");
      if (overridingKey && overridingKey.trim() !== "" && !overridingKey.includes("placeholder")) {
        return overridingKey.trim();
      }
    }
    if (window.SUPABASE_CONFIG) {
      const u = window.SUPABASE_CONFIG.supabaseUrl;
      if (u && !u.includes("placeholder-project") && !u.includes("undefined")) return u;
    }
    if (window.SUPABASE_CONFIG) {
      const k = window.SUPABASE_CONFIG.supabaseAnonKey;
      if (k && !k.includes("placeholder-anon-key") && !k.includes("undefined")) return k;
    }
  }
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== "undefined" && process?.env && process.env[key]) {
    return process.env[key];
  }
  return null;
};

const isServer = typeof window === "undefined" && typeof process !== "undefined";

const supabaseUrl = getEnv("VITE_SUPABASE_URL") || getEnv("SUPABASE_URL") || (typeof process !== "undefined" && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL)) || "https://placeholder-project.supabase.co";

const serviceRoleKey = isServer ? (getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("VITE_SUPABASE_SERVICE_ROLE_KEY") || (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY)) : null;

const anonKey = getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("SUPABASE_ANON_KEY") || (typeof process !== "undefined" && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY)) || "placeholder-anon-key";

const apiKey = serviceRoleKey || anonKey;

if (!supabaseUrl || !apiKey || supabaseUrl.includes("placeholder-project") || apiKey.includes("placeholder-anon-key")) {
  console.warn("WARNING: Supabase environment configuration keys are using default placeholders or are unconfigured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY to link to your live database.");
}

if (isServer && serviceRoleKey) {
  console.log("Supabase Client initialized successfully with Service Role Key (Bypass RLS Enabled).");
} else if (isServer) {
  console.log("Supabase Client initialized with Anon Key on Server-side (No service role key provided).");
}

export const supabase = createClient(supabaseUrl, apiKey);

