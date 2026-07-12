# Noroya — Auth & Data Layer Overhaul (July 2026)

This documents everything fixed in this pass. Root cause of "Supabase doesn't save users": **the required Postgres tables and RLS policies for user profiles never existed** — the only tracked migration created an unrelated `services_config` table. Every signup/login silently failed to persist a profile.

## 1. Root cause fix — `supabase_migration.sql`

A single, idempotent SQL file (safe to re-run) that:

- Creates one consolidated `public.profiles` table (`id, email, full_name, username, phone_number, referral_code, referred_by, transaction_pin, wallet_balance, role, created_at, updated_at`) — replacing the old dual `profiles`/`users` design that caused race conditions.
- Adds a `public.users` **view** over `profiles` (with legacy column aliases like `balance`, `uid`, `phoneNumber`) so any code still reading `.from('users')` keeps working without a rewrite.
- Enables **Row Level Security**: users can read/update only their own row; a trigger blocks users from changing their own `role` or `wallet_balance` directly (only `service_role` or an admin can); admins can read/update all rows.
- Adds `get_referral_owner(code)` — a `SECURITY DEFINER` function so referral-code lookups don't need broad public read access to the whole `profiles` table.
- **The big one:** a trigger (`handle_new_user`) on `auth.users` that automatically creates the matching `profiles` row the instant a Supabase Auth account is created — atomically, server-side. Pulls `name`, `username`, `phone_number`, `transaction_pin`, `referral_code` straight from the signup metadata. Auto-grants `role='admin'` to `ibrahimfaruqolamilekan4@gmail.com`. This is what eliminates the "signup doesn't save" bug for good — there's no client-side write to fail or race anymore.

**⚠️ You still need to run this SQL once.** I don't have a database password or a Supabase personal access token (Management API), only the two anon-level API keys — those can't execute schema changes. Either:
1. Paste `supabase_migration.sql` into **Supabase Dashboard → SQL Editor → Run**, or
2. Give me the DB password (Project Settings → Database) or a personal access token (supabase.com/dashboard/account/tokens) and I'll run it directly.

Also check **Authentication → Providers** (Google OAuth must be enabled) and **Authentication → Settings** (email confirmation requirement) — see `SUPABASE_SETUP.md`.

## 2. Removed the fake "Simulated Auth Bypass"

`AuthPage.tsx` had a button that let **anyone** — no password, no real account — fake being fully logged in, including as admin, just by typing an email. Backed by a `localStorage` flag (`vtu_simulated_user`) that `AuthContext`, `Dashboard`, `ResellerPortal`, and `walletService` all checked and would happily rehydrate a fake session from. All of it is gone:
- The bypass button + handler in `AuthPage.tsx`
- `setSimulatedUser` / `vtu_simulated_user` localStorage logic in `AuthContext.tsx`
- Every call site in `Dashboard.tsx`, `ResellerPortal.tsx`, `walletService.ts` — replaced with a legitimate `updateLocalProfile()` that optimistically updates the **real** signed-in user's cached balance after a real backend call succeeds (top-up, upgrade, POS sale, etc.), nothing more.

## 3. Removed Firebase from the entire auth + wallet path

`AuthContext.tsx` and `AuthPage.tsx` no longer touch Firebase at all. Profile creation used to independently write to Firestore *and* upsert to two different Supabase tables on every login/signup — three unsynchronized writes racing each other. Now: the DB trigger creates the profile once, atomically, and the client just reads it (with a short retry in case of replication lag).

Wallet balance updates (Dashboard.tsx, after Flutterwave/Paystack top-ups) used to write to **five different places** — `profiles`, `users`, `accounts` tables, a Firestore document, and the fake simulated-user state — all supposed to hold the same number. Now: one write to `profiles.wallet_balance`, full stop.

**Scoped out of this pass:** `AdminPanelSection.tsx`, `ServicePurchase.tsx`, and `transactionService.ts` still use Firebase as a fallback data source for the service-plan catalog (`data_plans`/`utility_plans`/`exam_plans`) and transaction logging — Supabase is already primary there, Firestore is just a backup stream. I left these alone: fully removing them needs me to confirm those Supabase tables actually exist and hold real catalog data, which requires live DB access I don't have yet. Low risk to leave as-is; happy to tackle in a follow-up once the DB credentials above are sorted.

## 4. Fixed the broken password-reset flow

`handleForgotPassword` redirected to `${origin}/recovery`, but the app has no router at all — that path did nothing. Added simple path detection in `App.tsx` (checks `window.location.pathname === '/recovery'` or a `type=recovery` hash) and a new `ResetPasswordPage.tsx` with a real "set new password" form using `supabase.auth.updateUser()`.

## 5. On the hardcoded admin email

`ibrahimfaruqolamilekan4@gmail.com` is still used as the bootstrap admin — both in the DB trigger (grants `role='admin'` server-side, which is what actually matters for security) and as a cosmetic "👑 Platform Admin Account Detected" label in the signup form UI (harmless, just visual). This is a normal, common pattern for seeding the *first* admin account. Once that account exists, promoting additional admins should go through the admin panel (an existing admin updating another user's `role`), not more hardcoded emails scattered through the code — worth keeping in mind as the team grows.

## Still open (flagged, not silently ignored)

- Run `supabase_migration.sql` against the live project (needs DB password or personal access token from you).
- Firestore fallback paths in `AdminPanelSection.tsx` / `ServicePurchase.tsx` / `transactionService.ts` (see §3).
- The Express backend (`server.ts`, `backend/controllers/dataController.js`) verifies Firebase ID tokens for admin actions like bulk-fund; the frontend now sends a Supabase access token instead (see `walletService.ts`). The backend needs a matching update to verify Supabase JWTs instead of Firebase Admin tokens — this is a separate, sizeable backend pass I didn't want to rush blind.

---

## UPDATE (same day) — Migration executed against the live database, root cause confirmed

You provided the DB password, so I connected directly (via the session pooler — the direct `db.xxx.supabase.co` host is IPv6-only and wasn't reachable from here) and found the **actual** live schema, which differed from my earlier assumptions. `supabase_migration.sql` above was written blind and is now superseded — the real fix that ran is `supabase_patch_live.sql`.

**Confirmed root cause:** two conflicting triggers existed on `auth.users`. One of them, `handle_new_user_setup()`, tried to log every signup as a row in `public.transactions` using a column called `type` — but the real column is `transaction_type`, and two other required columns weren't supplied at all. That `INSERT` threw a hard SQL error on *every single signup*, which aborted the whole `auth.users` insert transaction. That's why **only one account ever made it into the database** (created before this trigger existed) — every signup since has been silently failing at the database level with no useful error surfaced to the UI.

**What the patch (`supabase_patch_live.sql`) did:**
1. Dropped both broken triggers/functions, replaced with one clean `handle_new_user()` that populates the profile correctly (name, username, phone, PIN, referral code) and does **not** touch `transactions`.
2. Added the missing `full_name` and `role` columns the client code actually expects (backfilled from the existing `name` column; your admin email auto-granted `role='admin'`).
3. **Found and closed a live security hole:** a `"Master Open Access"` RLS policy (`USING (true) WITH CHECK (true)` for ALL commands) meant any signed-in user could read or overwrite *any other user's* row — including `wallet_balance` and `transaction_pin`. Removed it, along with several redundant duplicate policies, down to a clean three-policy set (view own / update own / insert own), plus admins can see/update all via a proper `is_admin()` check.
4. Added a defense-in-depth trigger so even a user's own row can't have `wallet_balance`, `balance`, `role`, or `referral_code` changed directly from the client — only your backend (service role) or an admin.
5. Added `get_referral_owner(code)` RPC so referral lookups still work now that direct row reads are locked to your own profile.

**Verified live, end-to-end:** ran a real signup through the actual Supabase Auth API with the anon key (the exact same call the app makes) — got HTTP 200, and the profile row appeared instantly with every field populated correctly. Then confirmed the tamper-guard actually blocks a client from editing their own `wallet_balance` directly. Test account cleaned up afterward, nothing left behind.

**Not touched:** `transactions`, `wallet_funding_logs`, `services_config`, `system_config` tables — untouched and unaudited in this pass, since they weren't part of the diagnosed bug.
