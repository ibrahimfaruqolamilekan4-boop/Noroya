import { createClient } from "@supabase/supabase-js";

const getEnv = (key) => {
  if (typeof window !== "undefined") {
    // Purge any stale localStorage values that poison the browser
    try {
      localStorage.removeItem("DYNAMIC_SUPABASE_URL");
      localStorage.removeItem("DYNAMIC_SUPABASE_ANON_KEY");
      localStorage.removeItem("DYNAMIC_SUPABASE_SERVICE_ROLE_KEY");
    } catch (_) {}

    if (window.SUPABASE_CONFIG) {
      if (key === "VITE_SUPABASE_URL" || key === "SUPABASE_URL") {
        const u = window.SUPABASE_CONFIG.supabaseUrl;
        if (u && !u.includes("placeholder-project") && !u.includes("undefined")) return u.trim();
      }
      if (key === "VITE_SUPABASE_ANON_KEY" || key === "SUPABASE_ANON_KEY") {
        const k = window.SUPABASE_CONFIG.supabaseAnonKey;
        if (k && !k.includes("placeholder-anon-key") && !k.includes("undefined")) return k.trim();
      }
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

const DEFAULT_SUPABASE_URL = "https://sdbfuuxdquzvtcwryimh.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkYmZ1dXhkcXV6dnRjd3J5aW1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODYzMTUsImV4cCI6MjA5MzA2MjMxNX0.AZMl623EBoNm3I-_2BskkIGkZ0d272uhgsRaoClhB9c";

const supabaseUrl = getEnv("VITE_SUPABASE_URL") || getEnv("SUPABASE_URL") || (typeof process !== "undefined" && (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL)) || DEFAULT_SUPABASE_URL;

const serviceRoleKey = isServer ? (getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("VITE_SUPABASE_SERVICE_ROLE_KEY") || (typeof process !== "undefined" && process.env.SUPABASE_SERVICE_ROLE_KEY)) : null;

const anonKey = getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("SUPABASE_ANON_KEY") || (typeof process !== "undefined" && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY)) || DEFAULT_SUPABASE_ANON_KEY;

const apiKey = isServer ? (serviceRoleKey || anonKey) : anonKey;

if (isServer && serviceRoleKey) {
  console.log("Supabase Client initialized successfully with Service Role Key (Bypass RLS Enabled).");
} else if (isServer) {
  console.log("Supabase Client initialized with Anon Key on Server-side (No service role key provided).");
}

export const serverHasServiceRoleKey = Boolean(isServer && serviceRoleKey);
export const supabase = createClient(supabaseUrl, apiKey);
