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

async function authedJson<T>(url: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated. Please log in again.');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...(options?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || `Request failed (${res.status})`);
  return json as T;
}

export const fetchWalletSnapshot = (): Promise<WalletSnapshot> =>
  authedJson<WalletSnapshot>('/api/wallet/snapshot');

export const fetchWalletTransactions = (): Promise<{ transactions: any[] }> =>
  authedJson<{ transactions: any[] }>('/api/wallet/transactions');

export interface TransferRecipient {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  referral_code: string;
}

export const lookupTransferRecipient = (query: string): Promise<{ recipient: TransferRecipient }> =>
  authedJson<{ recipient: TransferRecipient }>('/api/wallet/lookup-recipient', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

export interface TransferResponse {
  status: 'success' | 'insufficient_funds' | 'error';
  amount?: number;
  newBalance?: number;
  reference?: string;
  error?: string;
  recipient?: { id: string; name: string };
}

export const executeWalletTransfer = (payload: {
  recipientId: string;
  amount: number;
  note?: string;
}): Promise<TransferResponse> =>
  authedJson<TransferResponse>('/api/wallet/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

