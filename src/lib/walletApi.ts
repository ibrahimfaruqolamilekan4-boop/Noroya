import { supabase } from './supabase';

// Authoritative wallet reads for the dashboard.
//
// These go through the same-origin API (service-role DB reads, identical
// source the admin User Management uses) instead of direct browser→Supabase
// queries. That makes the user-visible balance immune to:
//   - tables missing from the supabase_realtime publication (updates pushed)
//   - SELECT grants/RLS for the `authenticated` role (direct reads 42501)
//   - stale runtime Supabase config in an old PWA shell
//   - background-tab timer throttling (we refetch on focus/visibility too)
// If the admin panel can see a funding, the dashboard WILL see it.

export interface WalletSnapshot {
  balance: number;
  profile: any | null;
  transactions: any[];
  serverTime: string;
}

async function authedJson<T>(url: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated. Please log in again.');
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export const fetchWalletSnapshot = (): Promise<WalletSnapshot> =>
  authedJson<WalletSnapshot>('/api/wallet/snapshot');

export const fetchWalletTransactions = (): Promise<{ transactions: any[] }> =>
  authedJson<{ transactions: any[] }>('/api/wallet/transactions');
