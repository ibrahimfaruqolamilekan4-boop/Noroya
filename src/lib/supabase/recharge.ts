import { supabase } from "../supabase.js";

/**
 * 💸 BUY AIRTIME (SUPABASE VTU CLIENT HELPER)
 * Securely handles client-side checks and dispatches recharge operations.
 */
export async function buyAirtime(
  userId: string,
  phone: string,
  amount: number,
  network: string | number
) {
  // 1. Get current user profile securely
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, wallet_balance, balance')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("User profile not found. Please contact support.");
  }

  const currentBalance = parseFloat(
    profile.wallet_balance !== undefined ? profile.wallet_balance : (profile.balance ?? 0)
  );

  if (currentBalance < amount) {
    throw new Error("Insufficient wallet balance.");
  }

  // 2. Call Bigisub API securely via the local proxy to keep API keys safe from client-side exposure.
  // Note: For native setups, this can also fall back to a direct fetch if process.env has the key.
  const response = await fetch('/api/vendor/recharge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userUUID: userId,
      type: 'airtime',
      networkId: network,
      phoneNumber: phone,
      amount: amount,
      costAmount: amount
    })
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Transaction failed with operator");
  }

  return {
    success: true,
    newBalance: result.newBalance,
    reference: result.reference || `TX-${Date.now()}`,
    ...result
  };
}
