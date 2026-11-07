import { collection, doc, setDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { handleFirestoreError, OperationType } from "../lib/firestore";
import type { Transaction } from "../types";

export interface FundingTransactionModel {
  id: string;
  userId: string;
  amount: number;
  reference: string;
  paymentMethod: "OPay";
  status: "pending" | "completed" | "failed";
  createdAt: string;
  description: string;
}

export const transactionService = {
  /**
   * Save a funding transaction to Firestore.
   */
  async createFundingTransaction(
    userId: string,
    amount: number,
    reference: string,
    status: "pending" | "completed" | "failed" = "pending"
  ): Promise<FundingTransactionModel> {
    const txId = `opay_fund_${Date.now()}`;
    const txData: FundingTransactionModel = {
      id: txId,
      userId,
      amount,
      reference,
      paymentMethod: "OPay",
      status,
      createdAt: new Date().toISOString(),
      description: `OPay Wallet Instant Funding (Ref: ${reference})`
    };

    try {
      const txRef = doc(db, "transactions", txId);
      await setDoc(txRef, {
        ...txData,
        createdAt: serverTimestamp() // Set server-side timestamp securely
      });
    } catch (e) {
      // Offline fallback: save to localStorage list
      console.warn("Firestore error persisting transaction: using offline sync fallback");
      const localStored = localStorage.getItem("vtu_simulated_transactions") || "[]";
      try {
        const parsed = JSON.parse(localStored);
        parsed.unshift(txData);
        localStorage.setItem("vtu_simulated_transactions", JSON.stringify(parsed));
      } catch (err) {}
    }

    return txData;
  },

  /**
   * Retrieve transaction history list for a user.
   */
  async getTransactionHistory(userId: string): Promise<Transaction[]> {
    const collRef = collection(db, "transactions");
    const q = query(collRef, where("userId", "==", userId), orderBy("createdAt", "desc"), limit(50));
    try {
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Merge with simulated offline transactions
      const simulated = localStorage.getItem("vtu_simulated_transactions");
      if (simulated) {
        try {
          const parsed = JSON.parse(simulated) as Transaction[];
          const filteredSig = parsed.filter(t => t.userId === userId);
          // Return merged and deduplicated records
          const all = [...filteredSig, ...docs];
          const seen = new Set();
          return all.filter(item => {
            const dup = seen.has(item.id);
            seen.add(item.id);
            return !dup;
          });
        } catch (e) {}
      }
      return docs;
    } catch (error) {
      console.warn("Falling back to local simulation transaction database fetch:");
      const simulated = localStorage.getItem("vtu_simulated_transactions");
      if (simulated) {
        try {
          const parsed = JSON.parse(simulated) as Transaction[];
          return parsed.filter(t => t.userId === userId);
        } catch (e) {}
      }
      return [];
    }
  },

  /**
   * Retrieve all global transaction records (for admins).
   */
  async getAllFundingTransactions(): Promise<Transaction[]> {
    try {
      const collRef = collection(db, "transactions");
      const q = query(collRef, where("type", "==", "funding"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    } catch (e) {
      // Simulated sandbox backup query
      console.warn("Using offline fallback to retreive administration funding metrics:");
      const stored = localStorage.getItem("vtu_simulated_transactions");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Transaction[];
          return parsed.filter(t => t.type === "funding");
        } catch (err) {}
      }
      return [];
    }
  },

  /**
   * Aggregate total wallet revenue stats dynamically (successful payments vs failed recharges)
   */
  async getAdminRevenueStats(): Promise<{ totalRevenue: number; successfulCount: number; failedCount: number }> {
    try {
      const response = await fetch("/api/admin/revenue-analytics", {
        method: "GET",
        headers: {
          "Content-type": "application/json"
        }
      });
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {}

    // Dynamic Client fallback calculator
    let totalRevenue = 0;
    let successfulCount = 0;
    let failedCount = 0;

    const allTx = await this.getAllFundingTransactions();
    allTx.forEach(tx => {
      if (tx.status === "completed") {
        totalRevenue += tx.amount;
        successfulCount++;
      } else if (tx.status === "failed") {
        failedCount++;
      }
    });

    return { totalRevenue, successfulCount, failedCount };
  }
};
