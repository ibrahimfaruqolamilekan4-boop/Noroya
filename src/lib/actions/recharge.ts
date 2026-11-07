import { supabase } from "../supabase.js";

/**
 * 💸 BUY AIRTIME (ACTIONS VTU HELPER)
 * Securely handles balance validation and dispatches the request.
 */
export async function buyAirtime(
  userId: string,
  phone: string,
  amount: number,
  network: string | number
) {
  // 1. Get current user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, wallet_balance, balance')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("User profile not found. Please contact support.");
  }

  const walletBalance = parseFloat(
    profile.wallet_balance !== undefined ? profile.wallet_balance : (profile.balance ?? 0)
  );

  if (walletBalance < amount) {
    throw new Error("Insufficient balance");
  }

  // 2. Call Bigisub API via the secure server-side endpoint proxy.
  // This keeps process.env.BIGISUB_API_KEY secure and prevents client-side leaks.
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
      amount: amount,
      costAmount: amount
    })
  });

  const result = await res.json();

  if (!res.ok || !result.success) {
    throw new Error(result.message || "Purchase failed");
  }

  return result;
}
