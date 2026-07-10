import { supabase } from "./supabase.js";
import { useState, useEffect } from "react";

/**
 * 🔗 CUSTOM HOOK: useProfileBalance
 * React Hook that implements the fetchProfile routine to get the current user's profile balance.
 */
export function useProfileBalance() {
  const [balance, setBalance] = useState<{ wallet_balance: number; balance: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error: fetchErr } = await supabase
            .from('profiles')
            .select('wallet_balance, balance')
            .eq('id', user.id)
            .single();
          
          if (fetchErr) {
            throw fetchErr;
          }
          if (data) {
            setBalance({
              wallet_balance: Number(data.wallet_balance || 0),
              balance: Number(data.balance || 0)
            });
          }
        }
      } catch (err: any) {
        console.error("Error fetching profile balance:", err);
        setError(err.message || "Failed to fetch profile");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  return { balance, loading, error };
}

/**
 * 🔗 CUSTOM HOOK: useLoadBalance
 * Stateful React hook matching loadBalance effect to fetch and set wallet balance state automatically.
 */
export function useLoadBalance() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance, balance')
          .eq('id', user.id)
          .single();

        if (profile) {
          setBalance(profile.wallet_balance || profile.balance || 0);
        }
      } catch (err) {
        console.error("Error loading balance:", err);
      } finally {
        setLoading(false);
      }
    };

    loadBalance();
  }, []);

  return { balance, setBalance, loading };
}

/**
 * 💸 ATOMIC PURCHASE AIRTIME (RPC BACKEND/CLIENT HELPER)
 * Handles double-entry ledger security with atomic balance operations.
 */
export async function purchaseAirtime(
  userId: string,
  phone: string,
  amount: number,
  network: string | number
) {
  // 1. Check & Deduct atomically using the database RPC function
  // This prevents race conditions and ensures safe balance validation.
  const { data: success, error: deductError } = await supabase.rpc('deduct_balance', { 
    user_uuid: userId, 
    amount: Number(amount) 
  });

  if (deductError || !success) {
    throw new Error("Insufficient balance or profile not found.");
  }

  try {
    // 2. Call Bigisub API proxy to execute direct telecom dispatching
    const res = await fetch('/api/vendor/recharge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userUUID: userId,
        type: 'airtime',
        networkId: network,
        phoneNumber: phone,
        amount: Number(amount),
        costAmount: Number(amount)
      })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.message || "Purchase failed");
    }

    // 3. Log success transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'airtime',
      amount: Number(amount),
      phone,
      network: String(network),
      status: 'success',
      reference: result.reference || result.id || `TX-${Date.now()}`
    });

    return result;
  } catch (error: any) {
    // 4. Refund on failure atomically
    await supabase.rpc('increment_balance', { 
      user_uuid: userId, 
      amount: Number(amount) 
    });
    throw new Error(error.message || "Purchase failed and funds refunded.");
  }
}

/**
 * 🔒 HANDLE BUY DATA (VTU TRIGGER HANDLER)
 * Automatically authenticates the session, executes purchase, alerts success, and refreshes.
 */
export async function handleBuyData(phone: string, amount: number, network: string | number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Login first");
    return;
  }

  try {
    const result = await purchaseAirtime(user.id, phone, amount, network);
    alert("Purchase successful!");
    // Refresh balance
    window.location.reload();
  } catch (e: any) {
    alert(e.message);
  }
}

