import { doc, getDoc, updateDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore";
import type { UserProfile } from "../types";

export interface WalletModel {
  userId: string;
  balance: number;
}

export const walletService = {
  /**
   * Fetch current wallet balance for a user.
   */
  async getWalletBalance(userId: string): Promise<number> {
    const userRef = doc(db, "users", userId);
    try {
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        return data.balance || 0;
      }
      
      // Checking local storage fallback for simulated users
      const stored = localStorage.getItem("vtu_simulated_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.uid === userId) {
          return parsed.balance || 0;
        }
      }
      return 0;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      return 0;
    }
  },

  /**
   * Helper that subscribes to wallet balance updates or profile updates.
   */
  subscribeToBalance(userId: string, onUpdate: (balance: number) => void): () => void {
    const userRef = doc(db, "users", userId);
    
    // Check if we are running in simulated environment
    const isSimulated = localStorage.getItem("vtu_simulated_user") !== null;
    if (isSimulated) {
      // Set up simple interval to sync with simulated user profile state in localStorage
      const interval = setInterval(() => {
        const stored = localStorage.getItem("vtu_simulated_user");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.uid === userId) {
              onUpdate(parsed.balance || 0);
            }
          } catch (e) {}
        }
      }, 1000);
      return () => clearInterval(interval);
    }

    return onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const uProfile = snap.data() as UserProfile;
          onUpdate(uProfile.balance || 0);
        }
      },
      (error) => {
        console.error("Balance subscription error:", error);
      }
    );
  },

  /**
   * Modifies a user's wallet balance on the secure backend server.
   */
  async upgradeWalletBalanceOnServer(userId: string, amount: number, actionType: "credit" | "debit"): Promise<boolean> {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/agent/bulk-fund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": idToken ? `Bearer ${idToken}` : ""
        },
        body: JSON.stringify({
          userIds: [userId],
          amount: actionType === "credit" ? amount : -amount,
          description: `Self-Service Remote Balance Adjustment`
        })
      });

      const result = await response.json();
      return response.ok && result.success;
    } catch (err) {
      console.error("[Wallet Service adjustment failed]:", err);
      return false;
    }
  }
};
