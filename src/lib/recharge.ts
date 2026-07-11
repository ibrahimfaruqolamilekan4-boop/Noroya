import { supabase } from "./supabase.js";
import { useState, useEffect } from "react";

/**
 * 🔗 CUSTOM HOOK: useUserProfile
 * Automatically fetches the current user's Supabase profile and provides user state with balance data.
 */
export function useUserProfile() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance, balance, name')
          .eq('id', authUser.id)
          .single();

        if (profile) {
          setUser((prev: any) => ({ ...prev, ...profile, wallet_balance: profile.wallet_balance }));
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, []);

  return { user, setUser, loading };
}

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
  if (!userId || !phone || !amount || !network) {
    throw new Error("Missing required fields");
  }
  if (amount < 50) {
    throw new Error("Minimum amount is ₦50");
  }
  if (!/^\d{11}$/.test(phone)) {
    throw new Error("Invalid phone number");
  }

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
 * ⚡ ATOMIC PURCHASE DATA BUNDLE
 * Validates, debits balance atomically, executes transaction via Bigisub API, and logs transaction.
 */
export async function purchaseDataBundle(
  userId: string,
  phone: string,
  amount: number,
  network: string | number,
  planCode: string | number
) {
  if (!userId || !phone || !amount || !network) {
    throw new Error("Missing required fields");
  }
  if (amount < 50) {
    throw new Error("Minimum amount is ₦50");
  }
  if (!/^\d{11}$/.test(phone)) {
    throw new Error("Invalid phone number");
  }

  // 1. Check & Deduct atomically using the database RPC function
  const { data: deductSuccess, error: deductError } = await supabase.rpc('deduct_balance', { 
    user_uuid: userId, 
    amount: Number(amount) 
  });

  if (deductError || !deductSuccess) {
    throw new Error("Insufficient wallet balance");
  }

  try {
    // 2. Call Bigisub API or Proxy
    const isServer = typeof process !== "undefined" && process?.env;
    let result: any;

    if (isServer && process.env.BIGISUB_API_KEY) {
      // Direct call if running on server-side
      const res = await fetch('https://api.bigisub.ng/v2/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BIGISUB_API_KEY}`
        },
        body: JSON.stringify({
          network,
          phone,
          amount: Number(amount),
          plan_code: planCode
        })
      });
      result = await res.json();
    } else {
      // Proxy call if running on client-side
      const res = await fetch('/api/vendor/recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userUUID: userId,
          type: 'data',
          networkId: network,
          planId: planCode,
          phoneNumber: phone,
          amount: Number(amount),
          costAmount: Number(amount)
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Data bundle purchase failed");
      }
      result = {
        success: true,
        reference: data.reference || data.id || `DATA-${Date.now()}`
      };
    }

    if (!result.success) {
      // Auto refund
      await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
      throw new Error(result.message || "Data bundle purchase failed");
    }

    // 3. Log transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'data_bundle',
      amount: Number(amount),
      phone,
      network: String(network),
      plan_code: String(planCode),
      status: 'success',
      reference: result.reference || `DATA-${Date.now()}`
    });

    return result;
  } catch (error: any) {
    // Refund on any error
    await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
    throw error;
  }
}

/**
 * ⚡ ATOMIC PURCHASE ELECTRICITY
 * Validates, debits balance atomically, executes transaction via Bigisub API, and logs transaction.
 */
export async function purchaseElectricity(
  userId: string,
  meterNumber: string,
  amount: number,
  disco: string
) {
  if (!userId || !meterNumber || !amount || !disco) {
    throw new Error("Missing required fields");
  }
  if (amount < 100) {
    throw new Error("Minimum amount is ₦100");
  }

  // 1. Check & Deduct atomically using the database RPC function
  const { data: deductSuccess, error: deductError } = await supabase.rpc('deduct_balance', { 
    user_uuid: userId, 
    amount: Number(amount) 
  });

  if (deductError || !deductSuccess) {
    throw new Error("Insufficient balance");
  }

  try {
    // 2. Dispatch to API or proxy
    const isServer = typeof process !== "undefined" && process?.env;
    let result: any;

    if (isServer && process.env.BIGISUB_API_KEY) {
      // Direct call if running on server-side
      const res = await fetch('https://api.bigisub.ng/v2/electricity', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${process.env.BIGISUB_API_KEY}` 
        },
        body: JSON.stringify({ disco, meter_number: meterNumber, amount: Number(amount) })
      });
      result = await res.json();
    } else {
      // Proxy call if running on client-side
      const res = await fetch('/api/v1/utility/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          type: 'electricity',
          provider: disco,
          number: meterNumber,
          plan: `${disco} Electricity`,
          amount: Number(amount)
        })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.error || "Electricity payment failed");
      }
      result = {
        success: true,
        reference: data.transaction?.reference || `ELE-${Date.now()}`
      };
    }

    if (!result.success) {
      await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
      throw new Error(result.message || "Electricity payment failed");
    }

    // 3. Log success transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'electricity',
      amount: Number(amount),
      meter_number: meterNumber,
      disco,
      status: 'success',
      reference: result.reference
    });

    return result;
  } catch (error: any) {
    // 4. Refund on failure atomically
    await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
    throw error;
  }
}

/**
 * ⚡ ATOMIC PURCHASE CABLE TV
 * Validates, debits balance atomically, executes transaction via Bigisub API, and logs transaction.
 */
export async function purchaseCableTV(
  userId: string,
  smartcardNumber: string,
  amount: number,
  provider: string,
  plan: string
) {
  if (!userId || !smartcardNumber || !amount || !provider) {
    throw new Error("Missing required fields");
  }
  if (amount < 500) {
    throw new Error("Minimum amount is ₦500");
  }

  // 1. Check & Deduct atomically using the database RPC function
  const { data: deductSuccess, error: deductError } = await supabase.rpc('deduct_balance', { 
    user_uuid: userId, 
    amount: Number(amount) 
  });

  if (deductError || !deductSuccess) {
    throw new Error("Insufficient balance");
  }

  try {
    // 2. Dispatch to API or proxy
    const isServer = typeof process !== "undefined" && process?.env;
    let result: any;

    if (isServer && process.env.BIGISUB_API_KEY) {
      // Direct call if running on server-side
      const res = await fetch('https://api.bigisub.ng/v2/cable', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${process.env.BIGISUB_API_KEY}` 
        },
        body: JSON.stringify({ provider, smartcard_number: smartcardNumber, amount: Number(amount), plan })
      });
      result = await res.json();
    } else {
      // Proxy call if running on client-side
      const res = await fetch('/api/v1/utility/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          type: 'cable',
          provider,
          number: smartcardNumber,
          plan,
          amount: Number(amount)
        })
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.error || "Cable subscription failed");
      }
      result = {
        success: true,
        reference: data.transaction?.reference || `CAB-${Date.now()}`
      };
    }

    if (!result.success) {
      await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
      throw new Error(result.message || "Cable subscription failed");
    }

    // 3. Log success transaction
    await supabase.from('transactions').insert({
      user_id: userId,
      type: 'cable_tv',
      amount: Number(amount),
      smartcard_number: smartcardNumber,
      provider,
      plan,
      status: 'success',
      reference: result.reference
    });

    return result;
  } catch (error: any) {
    // 4. Refund on failure atomically
    await supabase.rpc('increment_balance', { user_uuid: userId, amount: Number(amount) });
    throw error;
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

/**
 * ⚡ CUSTOM HOOK: useOptimisticPurchase
 * Implements optimistic balance updates with rollbacks, loading indicators, and toast messages.
 */
export function useOptimisticPurchase(initialBalance: number, toast: any) {
  const [balance, setBalance] = useState<number>(initialBalance);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const optimisticDeduct = (amount: number) => {
    setBalance(prev => Math.max(0, prev - amount));
  };

  const refreshBalance = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setBalance(profile.wallet_balance || 0);
      }
    } catch (err) {
      console.error("Failed to sync balance:", err);
    }
  };

  const handleBuyDataOptimistic = async (userId: string, phone: string, amount: number, network: string | number) => {
    setIsUpdating(true);
    
    // Save old balance for rollback
    const oldBalance = balance;
    optimisticDeduct(amount);

    try {
      const result = await purchaseAirtime(userId, phone, amount, network);
      if (toast && toast.success) {
        toast.success("Purchase successful!");
      } else {
        alert("Purchase successful!");
      }
      return result;
    } catch (error: any) {
      // Rollback on error
      setBalance(oldBalance);
      if (toast && toast.error) {
        toast.error(error.message || "Purchase failed");
      } else {
        alert(error.message || "Purchase failed");
      }
      throw error;
    } finally {
      setIsUpdating(false);
      // Sync with server
      setTimeout(refreshBalance, 1500);
    }
  };

  return {
    balance,
    setBalance,
    isUpdating,
    optimisticDeduct,
    refreshBalance,
    handleBuyDataOptimistic
  };
}

