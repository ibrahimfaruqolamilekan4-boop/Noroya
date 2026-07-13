import { supabase } from "../lib/supabase";

export interface WalletModel {
  userId: string;
  balance: number;
}

export const walletService = {
  /**
   * Fetch current wallet balance for a user from the single source of truth: public.profiles.
   */
  async getWalletBalance(userId: string): Promise<number> {
    try {
      const { data, error } = await supabase.from("profiles").select("wallet_balance").eq("id", userId).maybeSingle();
      if (error) {
        console.error("Failed to fetch wallet balance:", error.message);
        return 0;
      }
      return data?.wallet_balance ?? 0;
    } catch (error) {
      console.error("Failed to fetch wallet balance:", error);
      return 0;
    }
  },

  /**
   * Subscribes to live wallet balance updates via Supabase Realtime (Postgres changes).
   */
  subscribeToBalance(userId: string, onUpdate: (balance: number) => void): () => void {
    const channel = supabase
      .channel(`wallet-balance-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated?.wallet_balance !== undefined) onUpdate(updated.wallet_balance);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  },

  /**
   * Modifies a user's wallet balance on the secure backend server. Requires a valid Supabase
   * session; the backend must verify the Supabase JWT (see server.ts / backend/controllers) --
   * this replaces the old Firebase ID token auth header.
   */
  async upgradeWalletBalanceOnServer(userId: string, amount: number, actionType: "credit" | "debit"): Promise<boolean> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const response = await fetch("/api/agent/bulk-fund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": accessToken ? `Bearer ${accessToken}` : "",
        },
        body: JSON.stringify({
          userIds: [userId],
          amount: actionType === "credit" ? amount : -amount,
          description: `Self-Service Remote Balance Adjustment`,
        }),
      });

      const result = await response.json();
      return response.ok && result.success;
    } catch (err) {
      console.error("[Wallet Service adjustment failed]:", err);
      return false;
    }
  },
};
