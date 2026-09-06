-- ============================================================================
-- Noroya: Security Hardening Migration (follows v3 / 004)
-- Run in Supabase SQL Editor. Idempotent: safe to run multiple times.
--
-- Fixes the following audit findings:
--   C1  Money RPCs were executable by ANY anon/authenticated client
--       (Postgres grants EXECUTE to PUBLIC by default; the migrations only
--       added GRANTs to service_role without revoking PUBLIC).
--   C2  profiles RLS allowed users to UPDATE their own wallet_balance /
--       balance / available_balance (no balance guard existed).
--   C7  Provider API keys stored in the publicly-readable services_config
--       table (item_name of rows keyed 'mozosubz_api_key'/'bigisub_api_key').
--   C9  services_config had a policy granting ALL authenticated users full
--       write access ("Allow full admin write access to services").
--   H5  process_payment_webhook credited the wallet BEFORE inserting the
--       idempotency lock (concurrent duplicate webhooks double-credit).
--
-- DEPLOY NOTE: run this once in the Supabase SQL Editor, then deploy the
-- accompanying application changes. The app code in this branch already
-- expects the new provider_secrets table and guarded functions.
-- ============================================================================

-- ── 1. REVOKE public execute on money-touching RPCs (C1) ────────────────────
-- Postgres grants EXECUTE to PUBLIC by default. These functions are
-- SECURITY DEFINER and bypass RLS, so public execute = free wallet minting.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'increment_balance',
    'process_payment_webhook',
    'deduct_wallet_and_record',
    'deduct_balance'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I FROM PUBLIC, anon, authenticated;', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I TO service_role;', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Function % does not exist yet — skipping revoke.', fn;
    END;
  END LOOP;
END;
$$;

-- ── 2. Recreate increment_balance with an in-function guard (defense in
--       depth for C1). Service role only; everyone else is rejected even if
--       execute privileges are ever re-granted. ─────────────────────────────
CREATE OR REPLACE FUNCTION increment_balance(user_uuid UUID, amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'increment_balance is service-role only.';
    END IF;

    UPDATE profiles SET
        wallet_balance    = wallet_balance    + amount,
        balance           = balance           + amount,
        available_balance = available_balance + amount
    WHERE id = user_uuid;
END;
$$;

-- ── 3. process_payment_webhook: service-role guard + INSERT-FIRST
--       idempotency (H5). The idempotency lock row is claimed BEFORE any
--       credit, so concurrent duplicate deliveries cannot double-credit. ────
CREATE OR REPLACE FUNCTION process_payment_webhook(
    p_reference  TEXT,
    p_email      TEXT,
    p_amount     NUMERIC,
    p_gateway    TEXT    DEFAULT 'unknown',
    p_description TEXT   DEFAULT 'Wallet Top-Up'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_profile_id UUID;
    v_tx_id      UUID;
    v_claimed    TEXT;
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'process_payment_webhook is service-role only.';
    END IF;

    IF p_reference IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid reference or amount.');
    END IF;

    -- Claim the idempotency lock FIRST. Only one caller can ever insert a
    -- given reference; every other concurrent delivery sees zero rows here.
    INSERT INTO processed_payments(reference, email, amount, gateway)
    VALUES (p_reference, lower(p_email), p_amount, p_gateway)
    ON CONFLICT (reference) DO NOTHING
    RETURNING reference INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    -- Resolve user by verified email only
    SELECT id INTO v_profile_id
    FROM profiles WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        -- The reference is now burned; the webhook will be answered with
        -- already_processed on retry. This is intentional: never credit twice.
        RETURN jsonb_build_object('status', 'error', 'message', 'User not found: ' || p_email);
    END IF;

    UPDATE profiles SET
        wallet_balance    = wallet_balance    + p_amount,
        balance           = balance           + p_amount,
        available_balance = available_balance + p_amount,
        last_funding_at   = now()
    WHERE id = v_profile_id;

    INSERT INTO transactions(user_id, type, amount, status, description, reference, gateway, created_at)
    VALUES(v_profile_id::text, 'funding', p_amount, 'completed', p_description, p_reference, p_gateway, now())
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('status', 'success', 'profile_id', v_profile_id,
                              'tx_id', v_tx_id, 'amount', p_amount);
END;
$$;

-- deduct_wallet_and_record keeps its row-lock semantics; add the same guard.
CREATE OR REPLACE FUNCTION deduct_wallet_and_record(
    p_user_id    UUID,
    p_amount     NUMERIC,
    p_reference  TEXT,
    p_description TEXT,
    p_type       TEXT  DEFAULT 'purchase',
    p_metadata   JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_current_balance NUMERIC;
    v_tx_id           UUID;
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'deduct_wallet_and_record is service-role only.';
    END IF;

    SELECT wallet_balance INTO v_current_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Profile not found');
    END IF;
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_funds',
                                  'balance', v_current_balance, 'required', p_amount);
    END IF;

    UPDATE profiles SET
        wallet_balance    = wallet_balance    - p_amount,
        balance           = balance           - p_amount,
        available_balance = GREATEST(available_balance - p_amount, 0)
    WHERE id = p_user_id;

    INSERT INTO transactions(user_id, type, amount, status, description, reference, metadata, created_at)
    VALUES(p_user_id::text, p_type, p_amount, 'completed', p_description, p_reference, p_metadata, now())
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('status', 'success', 'tx_id', v_tx_id,
                              'new_balance', v_current_balance - p_amount);
END;
$$;

-- ── 4. Credit-by-user-id webhook helper (used by the Flutterwave and
--       Mozosubz webhook handlers). Insert-first idempotency keyed on the
--       provider reference; service-role only. ──────────────────────────────
CREATE OR REPLACE FUNCTION process_webhook_credit_by_user(
    p_reference TEXT,
    p_user_uuid UUID,
    p_amount    NUMERIC,
    p_gateway   TEXT DEFAULT 'unknown'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_claimed TEXT;
    v_tx_id   UUID;
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'process_webhook_credit_by_user is service-role only.';
    END IF;

    IF p_reference IS NULL OR p_user_uuid IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid parameters.');
    END IF;

    INSERT INTO processed_payments(reference, email, amount, gateway)
    VALUES (p_reference, NULL, p_amount, p_gateway)
    ON CONFLICT (reference) DO NOTHING
    RETURNING reference INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    UPDATE profiles SET
        wallet_balance    = wallet_balance    + p_amount,
        balance           = balance           + p_amount,
        available_balance = available_balance + p_amount,
        last_funding_at   = now()
    WHERE id = p_user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Profile not found.');
    END IF;

    INSERT INTO transactions(user_id, type, amount, status, description, reference, gateway, created_at)
    VALUES(p_user_uuid::text, 'funding', p_amount, 'completed',
           'Wallet funding via ' || p_gateway || ' webhook (ref ' || p_reference || ')',
           p_reference, p_gateway, now())
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('status', 'success', 'tx_id', v_tx_id, 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION process_webhook_credit_by_user(TEXT, UUID, NUMERIC, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION process_webhook_credit_by_user(TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;

-- ── 5. Guard sensitive profile columns against client self-update (C2) ──────
-- RLS "profiles_own_write" lets a user update their own row; without this
-- trigger that includes wallet_balance/balance/available_balance. Balance and
-- role may only move through the guarded RPCs / service-role backend.
CREATE OR REPLACE FUNCTION guard_profile_balance_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Allow service-role sessions and the backend (no JWT claims attached).
    IF COALESCE(current_setting('role', true), '') IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) IN ('', '{}', NULL) THEN
        RETURN NEW;
    END IF;

    IF NEW.wallet_balance    IS DISTINCT FROM OLD.wallet_balance
       OR NEW.balance        IS DISTINCT FROM OLD.balance
       OR NEW.available_balance IS DISTINCT FROM OLD.available_balance
       OR NEW.role           IS DISTINCT FROM OLD.role
       OR NEW.referred_by    IS DISTINCT FROM OLD.referred_by THEN
        RAISE EXCEPTION 'Wallet balance and role columns can only be changed by the backend.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_balance ON profiles;
CREATE TRIGGER trg_guard_profile_balance
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION guard_profile_balance_columns();

-- ── 6. services_config: remove the authenticated-full-write policy (C9) ─────
DROP POLICY IF EXISTS "Allow full admin write access to services" ON services_config;

-- ── 7. Move provider API keys out of the publicly-readable services_config
--       table into a service-role-only table (C7). ───────────────────────────
CREATE TABLE IF NOT EXISTS provider_secrets (
    identifier  TEXT PRIMARY KEY,          -- e.g. 'mozosubz_api_key'
    secret      TEXT         NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE provider_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provider_secrets_service_only" ON provider_secrets;
CREATE POLICY "provider_secrets_service_only" ON provider_secrets
    FOR ALL USING (auth.role() = 'service_role');

-- Copy any key rows that currently live in services_config, then remove them.
INSERT INTO provider_secrets (identifier, secret)
SELECT bigisub_identifier_id, item_name
FROM services_config
WHERE bigisub_identifier_id IN ('mozosubz_api_key', 'bigisub_api_key', 'mozosubz_connect_key')
  AND item_name IS NOT NULL AND item_name <> ''
ON CONFLICT (identifier) DO UPDATE
SET secret = EXCLUDED.secret, updated_at = now();

DELETE FROM services_config
WHERE bigisub_identifier_id IN ('mozosubz_api_key', 'bigisub_api_key', 'mozosubz_connect_key');

-- ── DONE ────────────────────────────────────────────────────────────────────
-- Sanity checks:
--   SELECT count(*) FROM provider_secrets;             -- your keys moved here
--   SELECT count(*) FROM services_config
--     WHERE bigisub_identifier_id LIKE '%api_key%';    -- must be 0
--   Try from the browser anon client:
--     supabase.rpc('increment_balance', {user_uuid:'<uuid>', amount:1})
--     -> must now fail with a permission/function-privilege error.
-- ============================================================================
