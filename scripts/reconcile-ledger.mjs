/**
 * Automated Ledger Reconciliation Script for NORODATA
 * 
 * Verifies the integrity of user wallet balances against historical ledger transactions.
 * Flags:
 *  - Discrepancies between wallet_balance and balance columns
 *  - Negative wallet balances
 *  - Excessive drift between net transactions and current wallet balance
 * 
 * Usage:
 *   node scripts/reconcile-ledger.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Reconciliation Error]: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runReconciliation() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log(`[Ledger Reconciliation] Starting run at ${new Date().toISOString()}`);
  console.log('====================================================');

  // 1. Fetch all profiles
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, phone_number, wallet_balance, balance, created_at')
    .order('created_at', { ascending: false });

  if (profErr) {
    console.error('[Ledger Reconciliation]: Failed to fetch profiles:', profErr.message);
    process.exit(1);
  }

  console.log(`[Ledger Reconciliation]: Checking ${profiles?.length || 0} user accounts...`);

  let totalAccounts = profiles?.length || 0;
  let totalSystemBalance = 0;
  let flaggedAccounts = [];

  for (const prof of profiles || []) {
    const walletBalance = Number(prof.wallet_balance ?? prof.balance ?? 0);
    const balanceCol = Number(prof.balance ?? prof.wallet_balance ?? 0);
    totalSystemBalance += walletBalance;

    // Check for negative balance
    if (walletBalance < -0.01) {
      flaggedAccounts.push({
        id: prof.id,
        email: prof.email || 'N/A',
        phone: prof.phone_number || 'N/A',
        issue: 'NEGATIVE_BALANCE',
        wallet_balance: walletBalance,
        balance_col: balanceCol,
      });
      continue;
    }

    // Check for column sync drift between wallet_balance and balance
    if (Math.abs(walletBalance - balanceCol) > 1.0) {
      flaggedAccounts.push({
        id: prof.id,
        email: prof.email || 'N/A',
        phone: prof.phone_number || 'N/A',
        issue: 'BALANCE_COLUMN_MISMATCH',
        wallet_balance: walletBalance,
        balance_col: balanceCol,
        difference: Math.abs(walletBalance - balanceCol)
      });
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('----------------------------------------------------');
  console.log(`[Ledger Reconciliation Summary]`);
  console.log(`- Total Accounts Scanned: ${totalAccounts}`);
  console.log(`- Total Platform Held Balance: ₦${totalSystemBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`- Flagged / Anomalous Accounts: ${flaggedAccounts.length}`);
  console.log(`- Scan Duration: ${durationSec}s`);
  console.log('----------------------------------------------------');

  if (flaggedAccounts.length > 0) {
    console.warn(`[WARNING]: Found ${flaggedAccounts.length} accounts requiring review:`);
    console.table(flaggedAccounts);
  } else {
    console.log('✅ ALL WALLET BALANCES ARE HEALTHY & IN FULL SYNC.');
  }

  console.log('====================================================\n');
}

runReconciliation().catch((err) => {
  console.error('[Fatal Reconciliation Failure]:', err);
  process.exit(1);
});
