-- ============================================================================
-- Noroya: Bachs.io Payment Gateway Migration (006_bachs_payment_gateway.sql)
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> Run).
-- Idempotent: safe to run multiple times without losing existing data.
-- ============================================================================

-- 1. Ensure `provider_secrets` table exists for dynamic, non-hardcoded API keys
--    Stores `bachs_secret_key` (sk_live_... / sk_sandbox_...) and
--    `bachs_webhook_secret` (whsec_...) accessible only by the service_role backend.
CREATE TABLE IF NOT EXISTS public.provider_secrets (
    identifier  TEXT PRIMARY KEY,
    secret      TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_secrets_service_only" ON public.provider_secrets;
CREATE POLICY "provider_secrets_service_only" ON public.provider_secrets
    FOR ALL USING (auth.role() = 'service_role');

-- 2. Ensure `processed_payments` idempotency lock table has all required columns
CREATE TABLE IF NOT EXISTS public.processed_payments (
    reference    TEXT PRIMARY KEY,
    email        TEXT,
    amount       NUMERIC(12,2),
    gateway      TEXT DEFAULT 'bachs',
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_payments ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.processed_payments ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE public.processed_payments ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'bachs';
ALTER TABLE public.processed_payments ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS processed_payments_email_idx ON public.processed_payments(lower(email));
CREATE INDEX IF NOT EXISTS processed_payments_gateway_idx ON public.processed_payments(gateway);

ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "processed_payments_service_all" ON public.processed_payments;
CREATE POLICY "processed_payments_service_all" ON public.processed_payments
    FOR ALL USING (auth.role() = 'service_role');

-- 3. Ensure `transactions` table supports Bachs.io gateway metadata & columns
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'bachs';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'bachs';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'bachs';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS transactions_gateway_idx ON public.transactions(gateway);
CREATE INDEX IF NOT EXISTS transactions_reference_idx ON public.transactions(reference);

-- 4. Remove any legacy payment gateway keys from `services_config` and `provider_secrets`
DELETE FROM public.services_config
WHERE bigisub_identifier_id IN (
    'flutterwave_secret_key',
    'flutterwave_public_key',
    'paystack_secret_key',
    'paystack_public_key',
    'monnify_api_key',
    'monnify_secret_key'
);

DELETE FROM public.provider_secrets
WHERE identifier IN (
    'flutterwave_secret_key',
    'flutterwave_public_key',
    'paystack_secret_key',
    'paystack_public_key',
    'monnify_api_key',
    'monnify_secret_key'
);

-- 5. Atomic & Idempotent RPCs for Bachs.io Webhooks & Checkout Verification
--    5a. `process_payment_webhook`: credits user wallet by verified email with INSERT-FIRST idempotency
CREATE OR REPLACE FUNCTION public.process_payment_webhook(
    p_reference   TEXT,
    p_email       TEXT,
    p_amount      NUMERIC,
    p_gateway     TEXT DEFAULT 'bachs',
    p_description TEXT DEFAULT 'Wallet Top-Up via Bachs.io'
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

    -- Resolve user by email first so unmatched emails do not burn the reference lock
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE lower(email) = lower(trim(p_email))
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'User not found: ' || COALESCE(p_email, 'unknown'));
    END IF;

    -- Claim idempotency lock atomically
    INSERT INTO public.processed_payments(reference, email, amount, gateway)
    VALUES (p_reference, lower(trim(p_email)), p_amount, COALESCE(p_gateway, 'bachs'))
    ON CONFLICT (reference) DO NOTHING
    RETURNING reference INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference, 'profile_id', v_profile_id);
    END IF;

    -- Credit user wallet
    UPDATE public.profiles SET
        wallet_balance    = COALESCE(wallet_balance, 0)    + p_amount,
        balance           = COALESCE(balance, 0)           + p_amount,
        available_balance = COALESCE(available_balance, 0) + p_amount,
        last_funding_at   = now(),
        updated_at        = now()
    WHERE id = v_profile_id;

    -- Record funding transaction
    INSERT INTO public.transactions(
        user_id, user_email, type, amount, status, description, reference, gateway, platform, payment_method, created_at
    ) VALUES (
        v_profile_id::text, lower(trim(p_email)), 'funding', p_amount, 'completed',
        p_description, p_reference, COALESCE(p_gateway, 'bachs'), COALESCE(p_gateway, 'bachs'), COALESCE(p_gateway, 'bachs'), now()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'profile_id', v_profile_id,
        'tx_id', v_tx_id,
        'amount', p_amount
    );
END;
$$;

--    5b. `process_webhook_credit_by_user`: credits user wallet by UUID with INSERT-FIRST idempotency
CREATE OR REPLACE FUNCTION public.process_webhook_credit_by_user(
    p_reference TEXT,
    p_user_uuid UUID,
    p_amount    NUMERIC,
    p_gateway   TEXT DEFAULT 'bachs'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_claimed TEXT;
    v_email   TEXT;
    v_tx_id   UUID;
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'process_webhook_credit_by_user is service-role only.';
    END IF;

    IF p_reference IS NULL OR p_user_uuid IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Invalid parameters.');
    END IF;

    SELECT email INTO v_email FROM public.profiles WHERE id = p_user_uuid LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Profile not found.');
    END IF;

    INSERT INTO public.processed_payments(reference, email, amount, gateway)
    VALUES (p_reference, lower(v_email), p_amount, COALESCE(p_gateway, 'bachs'))
    ON CONFLICT (reference) DO NOTHING
    RETURNING reference INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    UPDATE public.profiles SET
        wallet_balance    = COALESCE(wallet_balance, 0)    + p_amount,
        balance           = COALESCE(balance, 0)           + p_amount,
        available_balance = COALESCE(available_balance, 0) + p_amount,
        last_funding_at   = now(),
        updated_at        = now()
    WHERE id = p_user_uuid;

    INSERT INTO public.transactions(
        user_id, user_email, type, amount, status, description, reference, gateway, platform, payment_method, created_at
    ) VALUES (
        p_user_uuid::text, lower(COALESCE(v_email, '')), 'funding', p_amount, 'completed',
        'Wallet Top-Up via ' || COALESCE(p_gateway, 'bachs') || ' (ref ' || p_reference || ')',
        p_reference, COALESCE(p_gateway, 'bachs'), COALESCE(p_gateway, 'bachs'), COALESCE(p_gateway, 'bachs'), now()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('status', 'success', 'tx_id', v_tx_id, 'amount', p_amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_payment_webhook(TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook(TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.process_webhook_credit_by_user(TEXT, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_webhook_credit_by_user(TEXT, UUID, NUMERIC, TEXT) TO service_role;
