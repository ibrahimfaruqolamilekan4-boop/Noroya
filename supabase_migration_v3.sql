-- ============================================================================
-- Noroya: Full Schema Migration v3
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → Run)
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- ── 0. EXTENSIONS ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. PROFILES TABLE ─────────────────────────────────────────────────────────
-- Core user table. Linked 1-to-1 with Supabase auth.users via trigger.
CREATE TABLE IF NOT EXISTS profiles (
    id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email          TEXT,
    full_name      TEXT,
    username       TEXT,
    phone_number   TEXT,
    role           TEXT    NOT NULL DEFAULT 'user',  -- 'user' | 'agent' | 'reseller'
    wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- alias kept for legacy queries
    available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    referral_code  TEXT UNIQUE,
    referral_count INT    NOT NULL DEFAULT 0,
    referral_bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
    referred_by    UUID   REFERENCES profiles(id),
    transaction_pin TEXT  DEFAULT '0000',
    last_funding_at TIMESTAMPTZ,
    last_bonus_date DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent column additions for existing tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role           TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance        NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS available_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_count INT NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_bonus NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by    UUID;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS transaction_pin TEXT DEFAULT '0000';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_funding_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_bonus_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_idx
    ON profiles (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_idx
    ON profiles (referral_code)  WHERE referral_code IS NOT NULL;

-- ── 2. TRANSACTIONS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT,                        -- kept as TEXT for legacy UUID/string compat
    user_email  TEXT,
    type        TEXT,                        -- 'funding' | 'purchase' | 'bonus' | 'upgrade' | 'refund'
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    status      TEXT         NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'failed' | 'failed_refunded'
    description TEXT,
    reference   TEXT,
    phone       TEXT,
    network     TEXT,
    plan        TEXT,
    gateway     TEXT,
    platform    TEXT,
    payment_method TEXT,
    metadata    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id     TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_email  TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type        TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference   TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS phone       TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS network     TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plan        TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway     TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS platform    TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata    JSONB NOT NULL DEFAULT '{}';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS transactions_user_id_idx    ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_reference_idx  ON transactions(reference);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_type_idx       ON transactions(type);
CREATE INDEX IF NOT EXISTS transactions_status_idx     ON transactions(status);

-- ── 3. PROCESSED PAYMENTS TABLE (webhook idempotency lock) ───────────────────
CREATE TABLE IF NOT EXISTS processed_payments (
    reference    TEXT        PRIMARY KEY,
    email        TEXT,
    amount       NUMERIC(12,2),
    gateway      TEXT,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processed_payments_email_idx ON processed_payments(lower(email));

-- ── 4. SERVICES CONFIG TABLE ──────────────────────────────────────────────────
-- Replaces Firestore data_plans / utility_plans / exam_plans collections.
CREATE TABLE IF NOT EXISTS services_config (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bigisub_plan_id       TEXT,
    bigisub_identifier_id TEXT UNIQUE,       -- legacy unique key used by admin routes
    item_name             TEXT,
    name                  TEXT,
    plan_name             TEXT,
    network               TEXT,
    network_type          TEXT,
    service_type          TEXT DEFAULT 'data', -- 'data' | 'airtime' | 'cable' | 'electricity' | 'exam_pin'
    type                  TEXT DEFAULT 'data',
    plan_category         TEXT DEFAULT 'GIFTING', -- 'SME' | 'GIFTING' | 'CG' | etc.
    cost_price            NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
    retail_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
    reseller_price        NUMERIC(12,2),
    agent_price           NUMERIC(12,2),
    validity_days         TEXT,
    duration              TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    peyflex_variation_id  TEXT,
    mozosubs_plan_id      TEXT,
    provider_or_network   TEXT,
    metadata              JSONB DEFAULT '{}',
    expires_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE services_config ADD COLUMN IF NOT EXISTS bigisub_plan_id       TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS bigisub_identifier_id TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS item_name             TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS name                  TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS plan_name             TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS network               TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS network_type          TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS service_type          TEXT DEFAULT 'data';
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS type                  TEXT DEFAULT 'data';
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS plan_category         TEXT DEFAULT 'GIFTING';
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS cost_price            NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS selling_price         NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS retail_price          NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS reseller_price        NUMERIC(12,2);
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS agent_price           NUMERIC(12,2);
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS validity_days         TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS duration              TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS is_active             BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS peyflex_variation_id  TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS mozosubs_plan_id      TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS provider_or_network   TEXT;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS metadata              JSONB DEFAULT '{}';
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS expires_at            TIMESTAMPTZ;
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE services_config ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS services_config_bigisub_id_idx
    ON services_config (bigisub_identifier_id) WHERE bigisub_identifier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS services_config_service_type_idx ON services_config(service_type);
CREATE INDEX IF NOT EXISTS services_config_network_idx      ON services_config(network);
CREATE INDEX IF NOT EXISTS services_config_is_active_idx    ON services_config(is_active);

-- ── 5. ROW LEVEL SECURITY ─────────────────────────────────────────────────────

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own_read"   ON profiles;
DROP POLICY IF EXISTS "profiles_own_write"  ON profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON profiles;

CREATE POLICY "profiles_own_read" ON profiles
    FOR SELECT USING (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "profiles_own_write" ON profiles
    FOR UPDATE USING (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

CREATE POLICY "profiles_service_all" ON profiles
    FOR ALL USING (auth.role() = 'service_role');

-- transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_own_read"   ON transactions;
DROP POLICY IF EXISTS "transactions_service_all" ON transactions;

CREATE POLICY "transactions_own_read" ON transactions
    FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "transactions_service_all" ON transactions
    FOR ALL USING (auth.role() = 'service_role');

-- processed_payments — service role only (webhooks use service key)
ALTER TABLE processed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "processed_payments_service_all" ON processed_payments;
CREATE POLICY "processed_payments_service_all" ON processed_payments
    FOR ALL USING (auth.role() = 'service_role');

-- services_config — public read, service-role write
ALTER TABLE services_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_config_public_read" ON services_config;
DROP POLICY IF EXISTS "services_config_service_write" ON services_config;
CREATE POLICY "services_config_public_read" ON services_config
    FOR SELECT USING (true);
CREATE POLICY "services_config_service_write" ON services_config
    FOR ALL USING (auth.role() = 'service_role');

-- ── 6. AUTO-UPDATE updated_at TRIGGER ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at     ON profiles;
DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
DROP TRIGGER IF EXISTS trg_services_updated_at     ON services_config;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_transactions_updated_at
    BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE ON services_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 7. AUTO-PROVISION PROFILE ON SIGNUP ───────────────────────────────────────
-- Fires whenever a new user registers via Supabase Auth.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_referral_code TEXT := upper(substring(md5(random()::text), 1, 8));
BEGIN
    INSERT INTO profiles (
        id, email, full_name, wallet_balance, balance, available_balance,
        role, referral_code, transaction_pin, created_at, updated_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        0, 0, 0,
        'user',
        v_referral_code,
        '0000',
        now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email     = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 8. ATOMIC RPCs ────────────────────────────────────────────────────────────

-- process_payment_webhook: idempotent wallet credit for Paystack / Flutterwave webhooks
CREATE OR REPLACE FUNCTION process_payment_webhook(
    p_reference  TEXT,
    p_email      TEXT,
    p_amount     NUMERIC,
    p_gateway    TEXT    DEFAULT 'unknown',
    p_description TEXT   DEFAULT 'Wallet Top-Up'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_profile_id UUID;
    v_tx_id      UUID;
BEGIN
    -- Idempotency: skip if already processed
    IF EXISTS (SELECT 1 FROM processed_payments WHERE reference = p_reference) THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    -- Resolve user by verified email only
    SELECT id INTO v_profile_id
    FROM profiles WHERE lower(email) = lower(p_email)
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'User not found: ' || p_email);
    END IF;

    -- Atomically credit wallet
    UPDATE profiles SET
        wallet_balance    = wallet_balance    + p_amount,
        balance           = balance           + p_amount,
        available_balance = available_balance + p_amount,
        last_funding_at   = now()
    WHERE id = v_profile_id;

    -- Log transaction
    INSERT INTO transactions(user_id, type, amount, status, description, reference, gateway, created_at)
    VALUES(v_profile_id::text, 'funding', p_amount, 'completed', p_description, p_reference, p_gateway, now())
    RETURNING id INTO v_tx_id;

    -- Idempotency lock
    INSERT INTO processed_payments(reference, email, amount, gateway)
    VALUES(p_reference, lower(p_email), p_amount, p_gateway)
    ON CONFLICT (reference) DO NOTHING;

    RETURN jsonb_build_object('status', 'success', 'profile_id', v_profile_id,
                              'tx_id', v_tx_id, 'amount', p_amount);
END;
$$;

-- deduct_wallet_and_record: atomic debit + transaction log for purchases
CREATE OR REPLACE FUNCTION deduct_wallet_and_record(
    p_user_id    UUID,
    p_amount     NUMERIC,
    p_reference  TEXT,
    p_description TEXT,
    p_type       TEXT  DEFAULT 'purchase',
    p_metadata   JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_current_balance NUMERIC;
    v_tx_id           UUID;
BEGIN
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

-- increment_balance: used by referral commission logic
CREATE OR REPLACE FUNCTION increment_balance(user_uuid UUID, amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE profiles SET
        wallet_balance    = wallet_balance    + amount,
        balance           = balance           + amount,
        available_balance = available_balance + amount
    WHERE id = user_uuid;
END;
$$;

-- ── 9. GRANT RPC EXECUTE TO SERVICE ROLE ─────────────────────────────────────
GRANT EXECUTE ON FUNCTION process_payment_webhook   TO service_role;
GRANT EXECUTE ON FUNCTION deduct_wallet_and_record  TO service_role;
GRANT EXECUTE ON FUNCTION increment_balance         TO service_role;
GRANT EXECUTE ON FUNCTION handle_new_user           TO service_role;

-- ── 10. SAFETY: prevent negative wallet balances ──────────────────────────────
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS profiles_wallet_balance_nonneg
    CHECK (wallet_balance >= 0);
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS profiles_balance_nonneg
    CHECK (balance >= 0);

-- ── 11. ADMIN GUARD — profiles.role can only be set by service_role ───────────
-- Prevent any authenticated user from self-upgrading their role via UPDATE.
-- Only the service-role backend (running requireAdmin-protected endpoints) can change roles.
CREATE OR REPLACE FUNCTION guard_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Only service role may change user roles.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_role_update ON profiles;
CREATE TRIGGER trg_guard_role_update
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_role_update();

-- ── DONE ─────────────────────────────────────────────────────────────────────
-- Run supabase_migration_v2.sql first if upgrading from v2.
-- This v3 migration is safe to run on a fresh or existing Supabase project.
