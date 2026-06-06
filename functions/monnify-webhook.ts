/**
 * Monnify Automated Payment Webhook Handler
 * Firebase Cloud Functions (v2 HTTPS)
 * 
 * listens to the 'customer_reserved_account_payment' webhook event, computes & validates signature hashes,
 * verifies IP whitelists, implements idempotency, and safely increments wallet balance in Firestore.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";

// Initialize Firestore if not already initialized
const db = getFirestore();

// Trusted Monnify Webhook origin IP
const MONNIFY_IP_WHITELIST = "35.242.133.146";

export const monnifyWebhook = onRequest({ cors: true }, async (req, res) => {
  try {
    const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress;
    logger.info(`Received Monnify webhook from IP: ${clientIp}`);

    // 1. IP Whitelist Security Requirement
    if (clientIp !== MONNIFY_IP_WHITELIST) {
      logger.warn(`Security Warning: Unauthorized IP access attempt from ${clientIp}`);
      // Send 403 Forbidden to deter attackers
      res.status(403).send("Unauthorized Webhook Source");
      return;
    }

    // 2. Monnify Request Validation hash using Monnify Client Secret Key
    const clientSecret = process.env.MONNIFY_CLIENT_SECRET;
    if (!clientSecret) {
      logger.error("Configuration Error: MONNIFY_CLIENT_SECRET environment variable is not defined");
      res.status(500).send("Server configuration error");
      return;
    }

    const incomingSignature = req.headers["monnify-signature"];
    if (!incomingSignature) {
      logger.warn("Security Warning: Missing monnify-signature header");
      res.status(401).send("Missing security signature");
      return;
    }

    // Compute the verification SHA512 signature hash of the raw stringified body
    let rawBody = "";
    if ((req as any).rawBody && Buffer.isBuffer((req as any).rawBody)) {
      rawBody = (req as any).rawBody.toString("utf-8");
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      try {
        rawBody = JSON.stringify(req.body);
      } catch (err) {
        logger.warn("[Monnify Webhook] Circular reference detected in stringification fallback:", err);
        rawBody = "";
      }
    }

    const computedSignature = crypto
      .createHmac("sha512", clientSecret)
      .update(rawBody)
      .digest("hex");

    if (incomingSignature !== computedSignature) {
      logger.warn("Security Warning: Invalid monnify-signature calculated.");
      res.status(401).send("Invalid security signature hash");
      return;
    }

    const { eventType, eventData } = req.body;

    // 3. Listen to 'customer_reserved_account_payment' webhook event specifically
    if (eventType !== "customer_reserved_account_payment") {
      logger.info(`Ignoring unsupported event type: ${eventType}`);
      res.status(200).json({ status: "ignored", message: "Only reserved account payment is supported" });
      return;
    }

    const { transactionReference, amountPaid, customer } = eventData;
    const customerEmail = customer?.email?.toLowerCase();

    if (!transactionReference || !amountPaid || !customerEmail) {
      logger.error("Data Error: Missing critical transactionReference, amountPaid, or customer.email fields in webhook payload");
      res.status(400).send("Incomplete webhook payload fields");
      return;
    }

    // 4. Idempotency Check: use 'processed_payments' collection to prevent double-crediting
    const paymentRefDoc = db.collection("processed_payments").doc(transactionReference);
    
    const result = await db.runTransaction(async (transaction) => {
      const paymentSnap = await transaction.get(paymentRefDoc);
      
      if (paymentSnap.exists) {
        logger.info(`Idempotency Block: Payment reference ${transactionReference} already handled.`);
        return { success: false, alreadyProcessed: true };
      }

      // Query the user by email (Firestore allows querying because of unique user registration emails)
      const usersQuery = db.collection("users").where("email", "==", customerEmail).limit(1);
      const userSnapshot = await transaction.get(usersQuery);

      if (userSnapshot.empty) {
        logger.error(`Wallet Error: User profile for email ${customerEmail} does not exist in Firestore`);
        throw new Error(`Profile not found for address ${customerEmail}`);
      }

      const userDoc = userSnapshot.docs[0];
      const userRef = userDoc.ref;

      // 5. Safely increment user balance (and available_balance per spec) using FieldValue.increment
      transaction.update(userRef, {
        balance: FieldValue.increment(amountPaid),
        available_balance: FieldValue.increment(amountPaid), // matches prompt's field name explicitly
        lastFundingAt: FieldValue.serverTimestamp()
      });

      // Log the reference and payment metadata in the processed_payments collection to enforce future idempotency
      transaction.set(paymentRefDoc, {
        transactionReference,
        userId: userDoc.id,
        userEmail: customerEmail,
        amountPaid,
        processedAt: FieldValue.serverTimestamp()
      });

      // Create a transaction record in the user's transactions history for UI dashboard visibility
      const historyTxRef = db.collection("transactions").doc();
      transaction.set(historyTxRef, {
        userId: userDoc.id,
        type: "funding",
        amount: amountPaid,
        status: "completed",
        description: `Auto-Fund via Reserved Bank Account (Ref: ${transactionReference})`,
        reference: `MNFY-${transactionReference}`,
        createdAt: FieldValue.serverTimestamp()
      });

      return { success: true, userId: userDoc.id };
    });

    if (result.alreadyProcessed) {
      res.status(200).json({ status: "duplicate", message: "Payment already processed previously" });
      return;
    }

    logger.info(`Wallet successfully funded with ₦${amountPaid} for user ${result.userId} using ref ${transactionReference}`);
    res.status(200).json({ status: "success", message: "Wallet successfully credited" });

  } catch (error: any) {
    logger.error("monnifyWebhook controller failure:", error);
    res.status(500).send(`Server Error: ${error.message}`);
  }
});
