import Transaction from '../models/Transaction.js';
import { purchaseData } from '../services/vtuService.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { supabase } from "../../src/lib/supabase.js";

// Load local database utilities to maintain compatibility with server.ts fallback system
const LOCAL_DB_PATH = path.join(process.cwd(), "local-db.json");

function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf-8"));
    }
  } catch (e) {
    console.error("Error loading local DB:", e);
  }
  return { users: {}, referralCodes: {}, processed_payments: {}, transactions: {}, _connection_test_: {} };
}

function safeJsonStringify(obj, space) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  }, space);
}

function saveLocalDb(data) {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, safeJsonStringify(data, 2), "utf-8");
  } catch (e) {
    console.error("Error saving local DB:", e);
  }
}

// Lazy connect to mongoose
let isMongoConnected = false;
async function connectToMongo() {
  if (isMongoConnected) return true;
  const uri = process.env.MONGODB_URI;
  if (!uri || uri === "your_mongodb_connection" || uri.includes("localhost")) {
    // MongoDB not configured or running local, use fallback
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    isMongoConnected = true;
    console.log("[MONGODB CONNECTION] Successfully connected for Transaction logging!");
    return true;
  } catch (err) {
    console.warn("[MONGODB CONNECTION WARNING] Failed to connect to MONGODB_URI. Normal file-system fallback continues:", err.message);
    return false;
  }
}

/**
 * Purchases a data or airtime package.
 * Deducts wallet balance, makes VTU API call, handles auto-refunds on failure.
 */
export async function buyData(req, res) {
  const { userId, network, planName, amount, phoneNumber, planType, apiPlanId } = req.body;

  if (!userId || !network || !planName || !amount || !phoneNumber) {
    return res.status(400).json({ error: "Missing required parameters: userId, network, planName, amount, phoneNumber" });
  }

  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Invalid transaction amount" });
  }

  const plansId = apiPlanId || 'vtu_standard_plan';
  console.log(`[BUY DATA FLOW INITIATED] User: ${userId}, Plan: ${planName}, Network: ${network}, Amount: ${parsedAmount}, Phone: ${phoneNumber}`);

  let currentBalance = 0;
  let userData = null;
  let userRef = null;

  // Attempt to load from Firestore
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      userData = userDoc.data();
      currentBalance = userData?.wallet_balance !== undefined
        ? Number(userData.wallet_balance)
        : (userData?.balance || 0);
    }
  } catch (err) {
    console.warn("[dataController] Firebase Admin Firestore query skipped or caught error, using local fallback:", err.message);
  }

  // Load from local fallback if firestore wasn't active
  if (!userData) {
    const localStore = loadLocalDb();
    userData = localStore.users[userId];
    if (userData) {
      currentBalance = userData.wallet_balance !== undefined
        ? Number(userData.wallet_balance)
        : (userData.balance || 0);
    }
  }

  if (!userData) {
    return res.status(404).json({ error: "User profile record not found. Please register or log in again." });
  }

  if (currentBalance < parsedAmount) {
    return res.status(400).json({ error: `Insufficient wallet balance. You need ₦${parsedAmount.toLocaleString()} but currently have ₦${currentBalance.toLocaleString()}.` });
  }

  // Step 3: Deduct wallet balance
  const deductedBalance = currentBalance - parsedAmount;
  let isDeductedInFirestore = false;

  if (userRef) {
    try {
      await userRef.update({
        wallet_balance: deductedBalance,
        balance: deductedBalance,
        available_balance: deductedBalance
      });
      isDeductedInFirestore = true;
    } catch (err) {
      console.error("[dataController] Firestore deduction failed, local store sync continues:", err.message);
    }
  }

  // Keep local store in sync
  const localStore = loadLocalDb();
  if (localStore.users[userId]) {
    localStore.users[userId].wallet_balance = deductedBalance;
    localStore.users[userId].balance = deductedBalance;
    localStore.users[userId].available_balance = deductedBalance;
    saveLocalDb(localStore);
  }

  const rawTxId = `vtu_tx_${Date.now()}`;
  const reference = `TRX-BUY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Build the dynamic Transaction details record
  const txRecord = {
    userId,
    network,
    planName,
    amount: parsedAmount,
    phoneNumber,
    reference,
    status: 'pending',
    providerResponse: null,
    createdAt: new Date()
  };

  // Step 4: Dispatch VTU carrier API purchase
  const purchaseResult = await purchaseData({
    network,
    phone: phoneNumber,
    planId: plansId,
    amount: parsedAmount
  });

  const finalStatus = purchaseResult.status; // 'completed' or 'failed'
  txRecord.status = finalStatus;
  txRecord.providerResponse = purchaseResult.providerResponse;
  txRecord.reference = purchaseResult.reference || reference;

  let successMessage = "";
  if (purchaseResult.success) {
    successMessage = `${network} ${planName} successfully purchased to ${phoneNumber}!`;
    console.log(`[BUY DATA SUCCESS] Transaction reference: ${txRecord.reference}`);
  } else {
    // Step 5: Failed transaction handling with automated refund
    const refundedBalance = deductedBalance + parsedAmount;
    txRecord.status = 'failed'; // Mark transaction as failed or refunded

    if (userRef && isDeductedInFirestore) {
      try {
        await userRef.update({
          wallet_balance: refundedBalance,
          balance: refundedBalance,
          available_balance: refundedBalance
        });
      } catch (err) {
        console.error("[dataController] Firestore refund wallet exception caught:", err.message);
      }
    }

    const localStoreRefund = loadLocalDb();
    if (localStoreRefund.users[userId]) {
      localStoreRefund.users[userId].wallet_balance = refundedBalance;
      localStoreRefund.users[userId].balance = refundedBalance;
      localStoreRefund.users[userId].available_balance = refundedBalance;
      saveLocalDb(localStoreRefund);
    }

    console.warn(`[BUY DATA AUTOMATED REFUND COMPLETE] Restored ₦${parsedAmount.toLocaleString()} to user ${userId} wallet due to carrier gateway timeout/error.`);
  }

  // 1. Save to local fallback DB
  const localStoreTx = loadLocalDb();
  localStoreTx.transactions[rawTxId] = {
    ...txRecord,
    id: rawTxId,
    createdAt: new Date().toISOString(),
    type: 'data',
    description: txRecord.status === 'failed'
      ? `Refunded: ${network} ${planName} request failed for ${phoneNumber}`
      : `${network} ${planName} purchase completed successfully to ${phoneNumber}`
  };
  saveLocalDb(localStoreTx);

  // 2. Save to Firestore if accessible
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const firestoreDb = getFirestore();
    await firestoreDb.collection('transactions').doc(rawTxId).set({
      ...localStoreTx.transactions[rawTxId],
      createdAt: new Date()
    });
  } catch (err) {
    console.warn("[dataController] Firestore transaction log bypassed:", err.message);
  }

  // 3. Save to MongoDB Mongoose if active
  try {
    const mongoActive = await connectToMongo();
    if (mongoActive) {
      const dbTx = new Transaction(txRecord);
      await dbTx.save();
      console.log(`[MONGODB STATE SUCCESS] Logged transaction to mongoDB successfully: ${txRecord.reference}`);
    }
  } catch (dbErr) {
    console.error("[MONGODB PERSISTENCE ERROR]", dbErr.message);
  }

  if (purchaseResult.success) {
    return res.json({
      success: true,
      message: successMessage,
      transaction: localStoreTx.transactions[rawTxId]
    });
  } else {
    return res.status(402).json({
      success: false,
      error: purchaseResult.providerResponse?.error || "Transaction failed at cellular provider core. Your wallet has been refunded.",
      transaction: localStoreTx.transactions[rawTxId]
    });
  }
}

/**
 * Update our backend server transaction handler (/api/v1/data/purchase)
 * using strict Firebase/Firestore transaction blocks.
 */
export async function v1DataPurchase(req, res) {
  const { userId, phone_number, network, peyflex_id, peyflex_variation_id, retail_price, plan_name } = req.body;

  const variationId = peyflex_variation_id || peyflex_id;

  if (!userId || !phone_number || !network || !variationId) {
    return res.status(400).json({ error: "Missing required parameters: userId, phone_number, network, peyflex_variation_id" });
  }

  // 1. Resolve selected plan dynamically from Supabase (as primary source of truth) with Firestore as fallback
  let plan = null;
  
  try {
    const { data: supabasePlan, error: pgError } = await supabase
      .from('data_plans')
      .select('*')
      .or(`peyflex_variation_id.eq.${variationId},peyflex_id.eq.${variationId},id.eq.${variationId}`)
      .maybeSingle();

    if (supabasePlan) {
      plan = supabasePlan;
      console.log(`[Supabase Resolve SUCCESS] Row fetched successfully from 'data_plans' for variation: ${variationId}`);
    } else if (pgError) {
      console.warn("[v1DataPurchase] Supabase lookup query returned warning:", pgError.message);
    }
  } catch (err) {
    console.warn("[v1DataPurchase] Supabase direct query skipped/caught exception:", err.message);
  }

  // Fallback 1: Firestore data_plans mapping
  if (!plan) {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const dynamicDb = getFirestore();
      
      const dataPlansSnap = await dynamicDb.collection('data_plans').get();
      const allPlans = dataPlansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      plan = allPlans.find(p => 
        String(p.peyflex_variation_id || '').toLowerCase() === String(variationId).toLowerCase() ||
        String(p.peyflex_id || '').toLowerCase() === String(variationId).toLowerCase() ||
        String(p.id || '').toLowerCase() === String(variationId).toLowerCase()
      );
    } catch (err) {
      console.warn("[v1DataPurchase] Skipping firestore dynamic lookup, trying local JSON fallback:", err.message);
    }
  }

  // Fallback 2: Local JSON database
  if (!plan) {
    try {
      const localStore = loadLocalDb();
      const localPlans = localStore.data_plans || {};
      const matchedPlan = Object.entries(localPlans).find(([id, p]) => {
        return (
          id.toLowerCase() === variationId.toLowerCase() ||
          String(p.peyflex_variation_id || '').toLowerCase() === variationId.toLowerCase() ||
          String(p.peyflex_id || '').toLowerCase() === variationId.toLowerCase()
        );
      });
      if (matchedPlan) {
        plan = matchedPlan[1];
      }
    } catch (e) {
      console.error("[v1DataPurchase] Error reading local-db fallback:", e);
    }
  }

  // Initialize raw retailPrice value first, which we will re-verify securely inside transactions
  let retailPrice = Number(retail_price || plan?.retail_price || plan?.price || 0);
  const planName = plan_name || plan?.plan_name || plan?.name || `${network} Dynamic Bundle`;
  console.log(`[V1 DATA PURCHASE START] User: ${userId}, Target: ${phone_number}, Plan: ${planName} (${variationId})`);

  let isDeductedInFirestore = false;
  let userRef = null;
  let dbInstance = null;

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    dbInstance = getFirestore();
    userRef = dbInstance.collection('users').doc(userId);

    // * Update using strict Firebase/Firestore transaction blocks:
    await dbInstance.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error("User record not found");
      }
      
      const userData = userDoc.data();

      // Look up user's role and flags to determine if they are on reseller tier
      const isReseller = userData.is_reseller === true || 
                         userData.user_role === 'reseller' || 
                         userData.role === 'reseller';

      // Deduct the exact mapped 'reseller_price' or 'price' directly from Supabase/Firestore row
      let correctPrice = Number(plan?.price || plan?.retail_price || plan?.amount || 0);
      if (isReseller) {
        if (plan?.reseller_price !== undefined && plan?.reseller_price !== null && plan?.reseller_price > 0) {
          correctPrice = Number(plan.reseller_price);
        } else if (plan?.resellerPrice !== undefined && plan?.resellerPrice !== null && plan?.resellerPrice > 0) {
          correctPrice = Number(plan.resellerPrice);
        }
      }

      // Overwrite the retailPrice variable scope with secure calculated price
      retailPrice = correctPrice;

      // * Secure Check: Read the selected plan's retail price. 
      // Check if the user's document field 'wallet_balance' contains sufficient funds.
      const availableBalance = userData.wallet_balance !== undefined 
        ? Number(userData.wallet_balance)
        : (userData.available_balance !== undefined 
          ? Number(userData.available_balance)
          : Number(userData.balance ?? 0));

      if (availableBalance < retailPrice) {
        throw new Error("Insufficient Balance");
      }

      // * Wallet Debit: Atomically subtract the verified price from the user's Firestore 'wallet_balance' collection ledger.
      const finalBalance = availableBalance - retailPrice;
      transaction.update(userRef, {
        wallet_balance: finalBalance,
        available_balance: finalBalance,
        balance: finalBalance
      });
      isDeductedInFirestore = true;
    });

  } catch (err) {
    console.warn("[v1DataPurchase] Firestore Transaction failed or skipped:", err.message);
    if (err.message === "Insufficient Balance") {
      return res.status(400).json({ error: "Insufficient Balance" });
    }
  }

  // Fallback / sync local db block
  const localStore = loadLocalDb();
  if (!isDeductedInFirestore) {
    // If firestore database was not responsive, fall back to local database transaction block
    const localUser = localStore.users[userId];
    if (!localUser) {
      return res.status(404).json({ error: "User profile record not found. Please log in again." });
    }

    const isReseller = localUser.is_reseller === true || 
                       localUser.user_role === 'reseller' || 
                       localUser.role === 'reseller';

    let correctPrice = Number(plan?.price || plan?.retail_price || plan?.amount || 0);
    if (isReseller) {
      if (plan?.reseller_price !== undefined && plan?.reseller_price !== null && plan?.reseller_price > 0) {
        correctPrice = Number(plan.reseller_price);
      } else if (plan?.resellerPrice !== undefined && plan?.resellerPrice !== null && plan?.resellerPrice > 0) {
        correctPrice = Number(plan.resellerPrice);
      }
    }
    retailPrice = correctPrice;

    const currentLocBal = localUser.wallet_balance !== undefined
      ? Number(localUser.wallet_balance)
      : (localUser.available_balance !== undefined
        ? Number(localUser.available_balance)
        : Number(localUser.balance || 0));

    if (currentLocBal < retailPrice) {
      return res.status(400).json({ error: "Insufficient Balance" });
    }

    const nextLocBal = currentLocBal - retailPrice;
    localUser.wallet_balance = nextLocBal;
    localUser.available_balance = nextLocBal;
    localUser.balance = nextLocBal;
    saveLocalDb(localStore);
    isDeductedInFirestore = true;
  } else {
    // Sync local DB copy
    if (localStore.users[userId]) {
      const currentLocBal = localStore.users[userId].wallet_balance !== undefined
        ? Number(localStore.users[userId].wallet_balance)
        : (localStore.users[userId].available_balance !== undefined
          ? Number(localStore.users[userId].available_balance)
          : Number(localStore.users[userId].balance || 0));
      const nextLocBal = currentLocBal - retailPrice;
      localStore.users[userId].wallet_balance = nextLocBal;
      localStore.users[userId].available_balance = nextLocBal;
      localStore.users[userId].balance = nextLocBal;
      saveLocalDb(localStore);
    }
  }

  // * Dispatch to Network: Send an authorized HTTP POST request to the Peyflex API processing server
  const PEYFLEX_API_TOKEN = process.env.PEYFLEX_API_TOKEN || process.env.VTU_API_KEY || "peyflex_dummy_token";
  let dispatchSuccess = false;
  let responseBody = null;
  let networkErr = "";

  // Dynamic simulation if running sandbox configurations
  if (!PEYFLEX_API_TOKEN || PEYFLEX_API_TOKEN.includes("dummy") || PEYFLEX_API_TOKEN.includes("your_peyflex") || PEYFLEX_API_TOKEN.includes("test")) {
    console.log("[PEYFLEX API SIMULATOR ACTIVE] Dispatched to sandbox simulator endpoint");
    await new Promise(r => setTimeout(r, 800));
    if (phone_number.endsWith("99") || phone_number.endsWith("999")) {
      dispatchSuccess = false;
      networkErr = "Simulated provider gateway timeout";
    } else {
      dispatchSuccess = true;
      responseBody = {
        status: "success",
        reference: `PEY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
        message: "Successfully processed through sandbox gateway"
      };
    }
  } else {
    try {
      const apiResponse = await fetch("https://peyflex.com.ng/api/v1/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${PEYFLEX_API_TOKEN}`
        },
        body: JSON.stringify({
          phone_number,
          network,
          peyflex_id: variationId
        })
      });

      responseBody = await apiResponse.json().catch(() => ({}));
      
      console.log(`================ PEYFLEX API CORE RESPONSE ================`);
      console.log(`STATUS CODE: ${apiResponse.status}`);
      console.log(`RESPONSE BODY: ${safeJsonStringify(responseBody)}`);
      console.log(`============================================================`);

      if (apiResponse.ok && (responseBody.status === "success" || responseBody.success || responseBody.status === "completed" || responseBody.status === "SUCCESSFUL")) {
        dispatchSuccess = true;
      } else {
        networkErr = responseBody.error || responseBody.message || `Provider internal error status ${apiResponse.status}`;
        console.error(`❌ [PEYFLEX DISPATCH REJECTED] Error: ${networkErr}`);
        if (safeJsonStringify(responseBody).toLowerCase().includes("insufficient")) {
          console.error("⚠️ [CRITICAL] Peyflex API returned an INSUFFICIENT BALANCE error. Check wholesale account wallet at Peyflex!");
        }
      }
    } catch (fetchErr) {
      console.error("[PEYFLEX NETWORK DISPATCH EXCEPTION]:", fetchErr);
      networkErr = fetchErr.message || "Network Timeout";
    }
  }

  const transactionRef = responseBody?.reference || responseBody?.id || `PEY-${Date.now()}`;
  const targetStatus = dispatchSuccess ? 'SUCCESSFUL' : 'FAILED_REFUNDED';

  const purchaseLog = {
    userId,
    network,
    planName,
    amount: retailPrice,
    phoneNumber: phone_number,
    reference: transactionRef,
    status: targetStatus,
    providerResponse: responseBody || { error: networkErr },
    createdAt: new Date().toISOString()
  };

  // * If Peyflex responds with a success status code, log the action inside a global 'purchases' collection as status: 'SUCCESSFUL'.
  if (dbInstance) {
    try {
      await dbInstance.collection('purchases').doc(transactionRef).set({
        ...purchaseLog,
        createdAt: new Date()
      });
    } catch (dbLogErr) {
      console.warn("[v1DataPurchase] Firestore log to purchases skipped:", dbLogErr.message);
    }
  }

  // Log also to normal transactions search index for transaction lists
  const globalTxId = `tx_${Date.now()}`;
  const txRecord = {
    id: globalTxId,
    userId,
    network,
    planName,
    amount: retailPrice,
    phoneNumber: phone_number,
    status: dispatchSuccess ? 'completed' : 'failed',
    reference: transactionRef,
    type: 'data',
    description: dispatchSuccess 
      ? `Purchased: ${network} ${planName} request successful for ${phone_number}`
      : `Failed & Refunded: ${network} ${planName} request failed for ${phone_number}`,
    createdAt: new Date().toISOString()
  };

  if (dbInstance) {
    try {
      await dbInstance.collection('transactions').doc(globalTxId).set({
        ...txRecord,
        createdAt: new Date()
      });
    } catch (dbLogErr) {
      console.warn("[v1DataPurchase] Firestore log to transactions skipped:", dbLogErr.message);
    }
  }

  // Persistent storage in JSON DB file Fallback system
  const localStoreFinal = loadLocalDb();
  if (!localStoreFinal.purchases) localStoreFinal.purchases = {};
  localStoreFinal.purchases[transactionRef] = purchaseLog;
  localStoreFinal.transactions[globalTxId] = txRecord;
  saveLocalDb(localStoreFinal);

  // * If the Peyflex endpoint fails, times out, or returns a network error, trigger an instant atomic database rollback to credit the deducted Naira back into the user's dashboard balance immediately, then show an error notification: "Network Error - Wallet Refunded".
  if (!dispatchSuccess) {
    console.warn(`[REVERSAL TRIGGERED] Refunding ₦${retailPrice} to user ${userId} instantly due to error: ${networkErr}`);
    
    if (dbInstance) {
      try {
        await dbInstance.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userRef);
          if (userDoc.exists) {
            const userData = userDoc.data();
            const curBal = userData.wallet_balance !== undefined
              ? Number(userData.wallet_balance)
              : (userData.available_balance !== undefined 
                ? Number(userData.available_balance)
                : Number(userData.balance ?? 0));
            const refundedBal = curBal + retailPrice;
            transaction.update(userRef, {
              wallet_balance: refundedBal,
              available_balance: refundedBal,
              balance: refundedBal
            });
          }
        });
      } catch (rollbackErr) {
        console.error("[REVERSAL FAILURE] Firestore state modification error during checkout rollback:", rollbackErr.message);
      }
    }

    // Sync JSON copy immediately
    const localStoreRollback = loadLocalDb();
    if (localStoreRollback.users[userId]) {
      const curBal = localStoreRollback.users[userId].wallet_balance !== undefined
        ? Number(localStoreRollback.users[userId].wallet_balance)
        : (localStoreRollback.users[userId].available_balance !== undefined
          ? Number(localStoreRollback.users[userId].available_balance)
          : Number(localStoreRollback.users[userId].balance ?? 0));
      const refundedBal = curBal + retailPrice;
      localStoreRollback.users[userId].wallet_balance = refundedBal;
      localStoreRollback.users[userId].available_balance = refundedBal;
      localStoreRollback.users[userId].balance = refundedBal;
      saveLocalDb(localStoreRollback);
    }

    return res.status(400).json({
      success: false,
      error: "Network Error - Wallet Refunded",
      transaction: txRecord
    });
  }

  // Log to MongoDB Mongoose if active
  try {
    const mongoActive = await connectToMongo();
    if (mongoActive) {
      const dbTx = new Transaction({
        userId,
        network,
        planName,
        amount: retailPrice,
        phoneNumber: phone_number,
        reference: transactionRef,
        status: 'completed',
        providerResponse: responseBody,
        createdAt: new Date()
      });
      await dbTx.save();
      console.log(`[MONGODB PERSIST SUCCESS] Synced checkout transactional data record to MongoDB.`);
    }
  } catch (mongoErr) {
    console.warn("[v1DataPurchase] MongoDB transactions log exception:", mongoErr.message);
  }

  return res.json({
    success: true,
    message: `${network} ${planName} successfully purchased to ${phone_number}!`,
    transaction: txRecord
  });
}

/**
 * Returns user transaction log.
 */
export async function getTransactions(req, res) {
  const { userId } = req.query;

  try {
    const mongoActive = await connectToMongo();
    if (mongoActive && userId) {
      const records = await Transaction.find({ userId }).sort({ createdAt: -1 }).lean();
      return res.json(records);
    }
  } catch (err) {
    console.warn("[dataController] MongoDB transactions lookup bypassed:", err.message);
  }

  // Fallback to local DB store filter
  const localStore = loadLocalDb();
  let userTx = Object.values(localStore.transactions);
  if (userId) {
    userTx = userTx.filter(tx => tx.userId === userId);
  }
  userTx.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json(userTx);
}

export default { buyData, v1DataPurchase, getTransactions };
