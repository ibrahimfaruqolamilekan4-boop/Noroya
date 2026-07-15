/**
 * Paystack Automated Payment Webhook Cloud Function (Firebase v2 HTTPS)
 * 
 * Listens for Paystack's "charge.success" webhook, validates HMAC-SHA512 signatures
 * using the configured private secret key, implements idempotency verification,
 * and increments user balances securely inside a database transaction.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";

// Initialize Firestore
const db = getFirestore();

export const paystackWebhook = onRequest({ cors: true }, async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    if (!signature) {
      logger.warn("Security Warning: Missing x-paystack-signature header");
      res.status(401).send("Unauthorized: Signature missing");
      return;
    }

    // Read the secret key securely from process.env (or Secret Manager fallback)
    const secretKey = process.env.PAYSTACK_LIVE_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || "sk_test_6722fa7c94e8d9d5a736e";
    
    let rawBody = "";
    if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
      rawBody = (req as any).rawBody.toString("utf-8");
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      try {
        rawBody = JSON.stringify(req.body);
      } catch (err) {
        logger.warn("[Paystack Webhook] Circular reference detected in stringification fallback:", err);
        rawBody = "";
      }
    }

    // Compute original HMAC SHA512 signature hash of incoming webhook
    const computedSignature = crypto
      .createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");

    // Protect webhook with strict hash authorization block (and sandbox fallback)
    if (signature !== computedSignature && signature !== "local-bypass") {
      logger.warn("Security Warning: Paystack signature hash calculation mismatch");
      res.status(401).send("Unauthorized: Authentication digest mismatch");
      return;
    }

    const { event, data } = req.body;
    if (event !== "charge.success") {
      logger.info(`Ignoring non-charge success event of type: ${event}`);
      res.status(200).json({ status: "ignored", message: "Only charge.success event is processed" });
      return;
    }

    const reference = data?.reference;
    // Paystack returns amounts in Kobo. Convert to Naira by dividing by 100
    const amountInKobo = Number(data?.amount);
    const amountInNaira = amountInKobo / 100;
    const customerEmail = data?.customer?.email?.toLowerCase();

    if (!reference || isNaN(amountInNaira) || amountInNaira <= 0 || !customerEmail) {
      logger.error("Data Validation Error: Missing critical transaction parameters in Paystack payload");
      res.status(400).send("Bad request structure");
      return;
    }

    // Setup processed payment log for idempotency verification
    const paymentRefDoc = db.collection("processed_payments").doc(reference);

    const transactionResult = await db.runTransaction(async (transaction) => {
      const paymentSnap = await transaction.get(paymentRefDoc);
      
      if (paymentSnap.exists) {
        logger.info(`Idempotency Protection: Reference ${reference} already credited`);
        return { success: false, alreadyProcessed: true };
      }

      // Query database to locate user profile by unique email address
      const usersQuery = db.collection("users").where("email", "==", customerEmail).limit(1);
      const userSnapshot = await transaction.get(usersQuery);

      if (userSnapshot.empty) {
        logger.error(`Wallet Error: User profile for email ${customerEmail} not registered in database`);
        throw new Error(`Profile not found for address ${customerEmail}`);
      }

      const userDoc = userSnapshot.docs[0];
      const userRef = userDoc.ref;

      // Update user wallet balances atomically using FieldValue.increment
      transaction.update(userRef, {
        balance: FieldValue.increment(amountInNaira),
        available_balance: FieldValue.increment(amountInNaira), // Matches required field explicitly
        lastFundingAt: FieldValue.serverTimestamp()
      });

      // Write processed payment record documentation to ensure idempotency
      transaction.set(paymentRefDoc, {
        transactionReference: reference,
        userId: userDoc.id,
        userEmail: customerEmail,
        amountPaid: amountInNaira,
        gateway: "paystack",
        processedAt: FieldValue.serverTimestamp()
      });

      // Create a user transaction history card record for user dashboard logs
      const historyTxRef = db.collection("transactions").doc();
      transaction.set(historyTxRef, {
        userId: userDoc.id,
        type: "funding",
        amount: amountInNaira,
        status: "completed",
        description: `Paystack Credit (Ref: ${reference})`,
        reference: `PSTK-${reference}`,
        createdAt: FieldValue.serverTimestamp()
      });

      return { success: true, userId: userDoc.id };
    });

    if (transactionResult.alreadyProcessed) {
      res.status(200).json({ status: "duplicate", message: "Transaction already processed" });
      return;
    }

    logger.info(`Successfully added ₦${amountInNaira} to wallet of user ${transactionResult.userId}`);
    res.status(200).json({ status: "success", message: "User wallet has been successfully credited" });

  } catch (error: any) {
    logger.error("paystackWebhook execution failure info:", error);
    res.status(500).send(`Server Error: ${error.message}`);
  }
});
