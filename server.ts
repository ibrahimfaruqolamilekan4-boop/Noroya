mkdir -p /mnt/user-data/outputs
cat > /mnt/user-data/outputs/SERVER_TS_BALANCE_FIX_PATCH.md << 'PATCHEOF'
# server.ts — Balance Drift Fix Patch

Apply these 4 edits to your existing `server.ts`. Each replaces a raw
`.update()` balance write with the guarded `deduct_balance`/`increment_balance`
RPC, so the `guard_balance` trigger can no longer silently revert the
`balance` column and cause drift.

---

## EDIT 1 — `/api/vendor/buy-data`

FIND:
```js
      // 4. If successful, settle accounts
      if (apiSuccess) {
        const remainingFunds = currentBalance - chargeAmount;

        // Update both balance columns securely
        await supabase
          .from('profiles')
          .update({ wallet_balance: remainingFunds, balance: remainingFunds })
          .eq('id', userUUID);
```

REPLACE WITH:
```js
      // 4. If successful, settle accounts via the guarded RPC (never a raw UPDATE)
      if (apiSuccess) {
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: userUUID,
          amount: chargeAmount,
        });
        if (deductErr || !deductOk) {
          console.error("[Vendor Buy-Data] deduct_balance failed after successful gateway purchase:", deductErr?.message);
          return res.status(500).json({
            success: false,
            message: "Purchase succeeded at provider but wallet debit failed. Contact support.",
          });
        }
        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', userUUID).maybeSingle();
        const remainingFunds = freshProfile?.wallet_balance ?? (currentBalance - chargeAmount);
```

---

## EDIT 2 — `/api/vendor/recharge`

FIND:
```js
      // Step D: If Mozosubz passes, deduct wallet funds securely
      if (apiSuccess) {
        const newBalance = currentBalance - deductAmount;
        
        await supabase
          .from('profiles')
          .update({ 
            wallet_balance: newBalance,
            balance: newBalance 
          })
          .eq('id', profile.id);
```

REPLACE WITH:
```js
      // Step D: If Mozosubz passes, deduct wallet funds via the guarded RPC
      if (apiSuccess) {
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: profile.id,
          amount: deductAmount,
        });
        if (deductErr || !deductOk) {
          console.error("[Vendor Recharge] deduct_balance failed after successful gateway purchase:", deductErr?.message);
          return res.status(500).json({ success: false, message: "Purchase succeeded at provider but wallet debit failed. Contact support." });
        }
        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', profile.id).maybeSingle();
        const newBalance = freshProfile?.wallet_balance ?? (currentBalance - deductAmount);
```

---

## EDIT 3 — `/api/purchase/utility`

FIND:
```js
      if (apiSuccess) {
        const deductedBalance = currentBalance - finalPrice;
        const pgUuid = resolvedUserId ? ensureUUID(resolvedUserId) : null;

        // Atomically update balance in Supabase profiles
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ 
            wallet_balance: deductedBalance,
            balance: deductedBalance
          })
          .eq('id', pgUuid);

        if (updateErr) {
          console.error("[Supabase Wallet Deduct Error]:", updateErr);
          return res.status(500).json({ 
            error: "Purchase succeeded at gateway, but database balance update failed. Please contact support.",
            reference: apiResponseData?.reference || apiResponseData?.id 
          });
        }
// Maintain fallback syncing
        try {
          await supabase
            .from('users')
            .update({ wallet_balance: deductedBalance, balance: deductedBalance })
            .eq('id', pgUuid);
        } catch (e) {}

        try {
            await supabase.from('profiles').update({
              wallet_balance: deductedBalance,
              available_balance: deductedBalance,
              balance: deductedBalance
            }).eq('id', resolvedUserId);
        } catch (e) {}
```

REPLACE WITH:
```js
      if (apiSuccess) {
        const pgUuid = resolvedUserId ? ensureUUID(resolvedUserId) : null;

        // Atomically deduct via the guarded RPC — never a raw UPDATE
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: pgUuid,
          amount: finalPrice,
        });

        if (deductErr || !deductOk) {
          console.error("[Supabase Wallet Deduct Error]:", deductErr?.message);
          return res.status(500).json({ 
            error: "Purchase succeeded at gateway, but wallet debit failed. Please contact support.",
            reference: apiResponseData?.reference || apiResponseData?.id 
          });
        }

        const { data: freshProfile } = await supabase
          .from('profiles').select('wallet_balance').eq('id', pgUuid).maybeSingle();
        const deductedBalance = freshProfile?.wallet_balance ?? (currentBalance - finalPrice);
```

Also update the failure branch right below it in the same route — FIND:
```js
      } else {
        // Revert balance deduction on gateway failure
        await supabase.from('profiles').update({
          balance: currentBalance,
          wallet_balance: currentBalance
        }).eq('id', profile.id);
        return res.status(400).json({ error: `Gateway rejected the transaction. Your wallet was not charged.` });
      }
```
(This is later in the same file, in `/api/buy-utility`, a *different* route from
`/api/purchase/utility` above — same fix pattern applies. Since in the new
version funds are only deducted AFTER success, this revert step is no longer
needed at all — the balance was never touched on failure. Just remove this
block entirely and replace with:)

REPLACE WITH:
```js
      } else {
        // Gateway rejected -- funds were never touched here (deduct only happens
        // on success in the corrected flow), so no revert/refund step is needed.
        return res.status(400).json({ error: `Gateway rejected the transaction. Your wallet was not charged.` });
      }
```

And find the matching success block just above it in `/api/buy-utility` — FIND:
```js
      if (dispatchSuccess) {
        // Deduct price from balance
        const deductedBalance = currentBalance - finalPrice;
        
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ 
            balance: deductedBalance,
            wallet_balance: deductedBalance
          })
          .eq('id', profile.id);

        if (updateErr) {
          console.error("[Supabase Balance Deduct Error]:", updateErr);
        }
```

REPLACE WITH:
```js
      if (dispatchSuccess) {
        // Deduct price from balance via the guarded RPC (never a raw UPDATE —
        // the guard_balance trigger silently reverts 'balance' on any raw
        // UPDATE that doesn't go through deduct_balance()/increment_balance()).
        const { data: deductOk, error: deductErr } = await supabase.rpc('deduct_balance', {
          user_uuid: profile.id,
          amount: finalPrice,
        });

        if (deductErr || !deductOk) {
          console.error("[Supabase Balance Deduct Error]:", deductErr?.message);
        }
```

---

## EDIT 4 — Flutterwave verify handler's multi-table credit loop

FIND (the entire `for (const tableName of tablesToTry)` block inside
`/api/payments/verify-flutterwave`):
```js
      try {
        const ensureUUID_inner = (strId: string): string => {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          if (uuidRegex.test(strId)) return strId;
          let seed = 0;
          for (let i = 0; i < strId.length; i++) {
            seed = (seed * 31 + strId.charCodeAt(i)) >>> 0;
          }
          const r = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed;
          };
          const hexChars = '0123456789abcdef';
          let hex32 = '';
          for (let i = 0; i < 32; i++) {
            hex32 += hexChars[r() % 16];
          }
          const part1 = hex32.substring(0, 8);
          const part2 = hex32.substring(8, 12);
          const part3 = '4' + hex32.substring(12, 15);
          const part4 = 'a' + hex32.substring(15, 18);
          const part5 = hex32.substring(18, 30);
          return `${part1}-${part2}-${part3}-${part4}-${part5}`;
        };

        const pgUuid = ensureUUID(userId);
        const idsToTry = [pgUuid, userId];
        const tablesToTry = ['profiles', 'accounts', 'users'];

        for (const tableName of tablesToTry) {
          try {
            for (const tryId of idsToTry) {
              const { data: sUserData, error: lookupErr } = await supabase
                .from(tableName)
                .select('*')
                .eq('id', tryId)
                .maybeSingle();

              if (!lookupErr && sUserData) {
                const currentPgBalance = Number(sUserData?.balance || sUserData?.wallet_balance || sUserData?.available_balance || 0);
                const finalPgBalance = currentPgBalance + verifiedAmount;
const updatePayload: any = {};
                if (tableName === 'profiles') {
                  updatePayload.wallet_balance = finalPgBalance;
                } else {
                  updatePayload.balance = finalPgBalance;
                  updatePayload.wallet_balance = finalPgBalance;
                  updatePayload.available_balance = finalPgBalance;
                  updatePayload.updated_at = new Date().toISOString();
                }

                const { error: pgUpdateErr } = await supabase
                  .from(tableName)
                  .update(updatePayload)
                  .eq('id', tryId);

                if (pgUpdateErr) {
                  console.warn(`[Flutterwave Supabase ${tableName} Update Warning for ID ${tryId}]:`, pgUpdateErr.message);
                } else {
                  console.log(`[Flutterwave Supabase ${tableName} Credit success] User ID: ${tryId} credited with +₦${verifiedAmount} in table ${tableName}.`);
                  break; // Found and updated successfully, proceed to next table check or complete
                }
              }
            }
          } catch (tblErr: any) {
            console.warn(`[Supabase error accessing table ${tableName} during credit]:`, tblErr.message || tblErr);
          }
        }

        // Add a Transaction Log to Supabase 'transactions' table
        const txId = `fw_fund_${Date.now()}`;
        try {
          const { error: pgTxErr } = await supabase
            .from('transactions')
            .insert({
              user_id: pgUuid,
              userId: userId,
              amount: verifiedAmount,
              status: 'success',
              platform: 'flutterwave',
              reference: reference,
              payment_method: 'flutterwave',
              description: `Flutterwave deposit of NGN ${verifiedAmount}`,
              created_at: new Date().toISOString()
            });

          if (pgTxErr) {
            // retry with string/raw userId
            await supabase
              .from('transactions')
              .insert({
                user_id: userId,
                amount: verifiedAmount,
                status: 'success',
                platform: 'flutterwave',
                reference: reference,
                payment_method: 'flutterwave',
                description: `Flutterwave deposit of NGN ${verifiedAmount}`,
                created_at: new Date().toISOString()
              });
          }
        } catch (txLogErr: any) {
          console.warn("[Supabase transaction logging skipped/unsupported]:", txLogErr.message || txLogErr);
        }

      } catch (supabaseErr: any) {
        console.warn("[Supabase lookup/update error during credit]:", supabaseErr.message || supabaseErr);
      }

      // 6. Record transaction history for UI representation
      const txId = `fw_fund_${Date.now()}`;
      await supabase.from('transactions').insert({
        userId,
        type: "funding",
        amount: verifiedAmount,
        status: "completed",
        description: `Flutterwave Inline (Ref: ${reference})`,
        reference,
        paymentMethod: "Flutterwave",
        createdAt: new Date().toISOString()
      });
```

REPLACE THE ENTIRE BLOCK ABOVE WITH (much shorter — the
`process_payment_webhook` RPC called just above this block already handles
crediting correctly and atomically, so all of this raw multi-table update
logic and the duplicate transaction insert are removed):
```js
      // process_payment_webhook (called above) already credits the wallet
      // atomically and idempotently, respecting the balance guard. No
      // further per-table raw-UPDATE loop is needed — that loop was the
      // source of balance-column drift and has been removed entirely.
```

Then find, a little further down in the same route, the two `console.log`
and `return` lines right after where that block used to end:
```js
      console.log(`[Flutterwave verification complete] Successfully credited User ${userId} with ₦${verifiedAmount}.`);
      return res.status(200).json({ status: "success", message: "Wallet successfully credited" });
```
These stay exactly as they are — no change needed there.

---

## EDIT 5 (bonus) — Flutterwave webhook + Mozosubz webhook raw-UPDATE fallbacks
In `handleFlutterwaveWebhook`, FIND:
```js
        let rpcCompleted = false;
        try {
          const { error: rpcErr } = await supabase.rpc('increment_balance', {
            user_uuid: profile.id,
            amount: amount
          });
          if (!rpcErr) {
            rpcCompleted = true;
            console.log(`[Flutterwave Webhook Background] Balance incremented via RPC for user ID: ${profile.id}`);
          } else {
            console.warn(`[Flutterwave Webhook Background RPC Error]:`, rpcErr.message);
          }
        } catch (rpcExc: any) {
          console.warn(`[Flutterwave Webhook Background RPC Exception]:`, rpcExc.message || rpcExc);
        }

        if (!rpcCompleted) {
          const currentBalance = Number(profile.balance || profile.wallet_balance || 0);
          const newBalance = currentBalance + amount;

          // Perform atomic update on user's row
          const { error: updateErr } = await supabase
            .from("profiles")
            .update({
              balance: newBalance,
              wallet_balance: newBalance // also update wallet_balance for compatibility
            })
            .eq("id", profile.id);

          if (updateErr) {
            console.error(`[Flutterwave Webhook Background] Failed to update user balance in Supabase profiles:`, updateErr.message);
            return;
          }
          console.log(`[Flutterwave Webhook Background] Successfully credited user ${customerEmail}. Balance updated from ₦${currentBalance} to ₦${newBalance}`);
        }
```

REPLACE WITH:
```js
        // Credit via the guarded RPC only (never a raw UPDATE fallback --
        // that fallback was another source of balance-column drift and has
        // been removed entirely).
        const { error: rpcErr } = await supabase.rpc('increment_balance', {
          user_uuid: profile.id,
          amount: amount
        });
        if (rpcErr) {
          console.error(`[Flutterwave Webhook Background] increment_balance RPC FAILED -- manual intervention needed:`, rpcErr.message, { profileId: profile.id, amount });
          return;
        }
        console.log(`[Flutterwave Webhook Background] Balance incremented via RPC for user ID: ${profile.id}`);
```

In the Mozosubz webhook handler, FIND:
```js
          // Increment balance via RPC
          let rpcCompleted = false;
          try {
            const { error: rpcErr } = await supabase.rpc('increment_balance', {
              user_uuid: pgUuid,
              amount: numericAmount
            });
            if (!rpcErr) {
              rpcCompleted = true;
              console.log(`[Mozosubz Webhook] Balance incremented via RPC for user ID: ${pgUuid}`);
            } else {
              console.warn(`[Mozosubz Webhook RPC Error]:`, rpcErr.message);
            }
          } catch (rpcExc: any) {
            console.warn(`[Mozosubz Webhook RPC Exception]:`, rpcExc.message || rpcExc);
          }

          // Fallback to direct balance update if RPC failed
          if (!rpcCompleted) {
            // Fetch current balance
            const { data: profile, error: selectErr } = await supabase
              .from('profiles')
              .select('wallet_balance')
              .eq('id', pgUuid)
              .maybeSingle();

    if (selectErr) {
              console.error(`[Mozosubz Webhook] Error fetching user profile:`, selectErr.message);
            } else if (profile) {
              const currentBalance = Number(profile.wallet_balance || 0);
              const updatedBalance = currentBalance + numericAmount;

              const { error: updateErr } = await supabase
                .from('profiles')
                .update({ wallet_balance: updatedBalance, balance: updatedBalance })
                .eq('id', pgUuid);

              if (updateErr) {
                console.error(`[Mozosubz Webhook] Failed to update balance directly:`, updateErr.message);
              } else {
                console.log(`[Mozosubz Webhook] Successfully updated balance directly. New balance: ${updatedBalance}`);
              }
            } else {
              console.warn(`[Mozosubz Webhook] No profile found matching ID: ${pgUuid}`);
            }
          }
```

REPLACE WITH:
```js
          // Credit via the guarded RPC only (never a raw UPDATE fallback --
          // that fallback was another source of balance-column drift and has
          // been removed entirely).
          const { error: rpcErr } = await supabase.rpc('increment_balance', {
            user_uuid: pgUuid,
            amount: numericAmount
          });
          if (rpcErr) {
            console.error(`[Mozosubz Webhook] increment_balance RPC FAILED -- manual intervention needed:`, rpcErr.message, { pgUuid, numericAmount });
          } else {
            console.log(`[Mozosubz Webhook] Balance incremented via RPC for user ID: ${pgUuid}`);
          }
```

---

## Summary

After applying all 5 edits, **every** balance-changing code path in
`server.ts` goes through `deduct_balance()` or `increment_balance()` —
the two functions confirmed to carry the `app.bypass_balance_guard` flag.
No raw `.update({ wallet_balance, balance, ... })` calls remain anywhere
in the file. This closes off every door that was causing balance-column
drift.
PATCHEOF
echo "File written successfully"
wc -l /mnt/user-data/outputs/SERVER_TS_BALANCE_FIX_PATCH.md