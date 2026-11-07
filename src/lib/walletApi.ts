import { supabase } from './supabase';

// Authoritative wallet reads for the dashboard.
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
  display_name: string;
}

export const lookupTransferRecipient = (phone: string): Promise<{ recipient: TransferRecipient }> =>
  authedJson<{ recipient: TransferRecipient }>('/api/wallet/lookup-recipient', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

export interface TransferResponse {
  status: 'success' | 'insufficient_funds' | 'error';
  amount?: number;
  fee?: number;
  total_debited?: number;
  newBalance?: number;
  reference?: string;
  error?: string;
  recipient_name?: string;
}

export const executeWalletTransfer = (payload: {
  recipientId: string;
  amount: number;
  transferKey: string;
  note?: string;
}): Promise<TransferResponse> =>
  authedJson<TransferResponse>('/api/wallet/transfer', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
