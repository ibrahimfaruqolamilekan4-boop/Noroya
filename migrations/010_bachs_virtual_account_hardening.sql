-- ============================================================================
-- Noroya: Bachs.io Virtual Account Hardening & Unmatched Payments Migration
-- File: migrations/010_bachs_virtual_account_hardening.sql
-- Idempotent: safe to run multiple times without data loss.
-- ============================================================================

-- 1. Ensure `profiles` table has `virtual_account_number` column for dedicated accounts
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS virtual_account_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_virtual_account_number_uniq_idx 
    ON public.profiles(virtual_account_number) 
    WHERE virtual_account_number IS NOT NULL AND virtual_account_number != '';

-- 2. Create `virtual_account_payments` table for 100% idempotent ledger of virtual account deposits
CREATE TABLE IF NOT EXISTS public.virtual_account_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE,
    event_id TEXT,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    user_email TEXT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    account_number TEXT,
    sender_name TEXT,
    sender_bank TEXT,
    sender_account_number TEXT,
    narration TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS va_payments_ref_idx ON public.virtual_account_payments(reference);
CREATE INDEX IF NOT EXISTS va_payments_user_id_idx ON public.virtual_account_payments(user_id);
CREATE INDEX IF NOT EXISTS va_payments_created_at_idx ON public.virtual_account_payments(created_at DESC);

-- Enable RLS on `virtual_account_payments`
ALTER TABLE public.virtual_account_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "va_payments_service_role" ON public.virtual_account_payments;
CREATE POLICY "va_payments_service_role" ON public.virtual_account_payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "va_payments_user_read" ON public.virtual_account_payments;
CREATE POLICY "va_payments_user_read" ON public.virtual_account_payments
    FOR SELECT USING (auth.uid() = user_id);

-- 3. Create `unmatched_payments` table (Never silently drop money!)
CREATE TABLE IF NOT EXISTS public.unmatched_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE,
    event_id TEXT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    account_number TEXT,
    sender_name TEXT,
    sender_bank TEXT,
    sender_account_number TEXT,
    narration TEXT,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'rejected', 'ignored_status')),
    candidate_user_id UUID REFERENCES public.profiles(id),
    candidate_reason TEXT,
    resolved_user_id UUID REFERENCES public.profiles(id),
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unmatched_payments_ref_idx ON public.unmatched_payments(reference);
CREATE INDEX IF NOT EXISTS unmatched_payments_status_idx ON public.unmatched_payments(status);
CREATE INDEX IF NOT EXISTS unmatched_payments_created_at_idx ON public.unmatched_payments(created_at DESC);

-- Enable RLS on `unmatched_payments`
ALTER TABLE public.unmatched_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unmatched_payments_service_role" ON public.unmatched_payments;
CREATE POLICY "unmatched_payments_service_role" ON public.unmatched_payments
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "unmatched_payments_admin_read" ON public.unmatched_payments;
CREATE POLICY "unmatched_payments_admin_read" ON public.unmatched_payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 4. Atomic RPC: `credit_virtual_account_deposit`
--    Executes idempotency check, payment row insertion, wallet credit, and ledger recording in ONE transaction.
CREATE OR REPLACE FUNCTION public.credit_virtual_account_deposit(
    p_reference             TEXT,
    p_event_id              TEXT,
    p_user_id               UUID,
    p_amount                NUMERIC,
    p_account_number        TEXT DEFAULT NULL,
    p_sender_name           TEXT DEFAULT NULL,
    p_sender_bank           TEXT DEFAULT NULL,
    p_sender_account_number TEXT DEFAULT NULL,
    p_narration             TEXT DEFAULT NULL,
    p_raw_payload           JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_claimed    TEXT;
    v_user_email TEXT;
    v_tx_id      UUID;
    v_va_id      UUID;
    v_desc       TEXT;
BEGIN
    IF COALESCE(current_setting('role', true), '') NOT IN ('service_role', 'postgres')
       OR current_setting('request.jwt.claims', true) NOT IN ('', '{}', NULL) THEN
        RAISE EXCEPTION 'credit_virtual_account_deposit is service-role only.';
    END IF;

    IF p_reference IS NULL OR trim(p_reference) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Payment reference is required.');
    END IF;

    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Target user_id is required.');
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Amount must be greater than zero.');
    END IF;

    -- 1. Check if user exists
    SELECT email INTO v_user_email
    FROM public.profiles
    WHERE id = p_user_id
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'User profile not found for id ' || p_user_id::text);
    END IF;

    -- 2. Claim idempotency lock atomically via processed_payments
    INSERT INTO public.processed_payments(reference, email, amount, gateway)
    VALUES (trim(p_reference), lower(COALESCE(v_user_email, '')), p_amount, 'bachs_va')
    ON CONFLICT (reference) DO NOTHING
    RETURNING reference INTO v_claimed;

    IF v_claimed IS NULL THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    -- 3. Insert into virtual_account_payments
    INSERT INTO public.virtual_account_payments(
        reference, event_id, user_id, user_email, amount,
        account_number, sender_name, sender_bank, sender_account_number,
        narration, status, raw_payload
    ) VALUES (
        trim(p_reference), p_event_id, p_user_id, lower(COALESCE(v_user_email, '')), p_amount,
        p_account_number, p_sender_name, p_sender_bank, p_sender_account_number,
        p_narration, 'completed', COALESCE(p_raw_payload, '{}'::jsonb)
    ) RETURNING id INTO v_va_id;

    -- 4. Credit user wallet atomically
    UPDATE public.profiles SET
        wallet_balance    = COALESCE(wallet_balance, 0)    + p_amount,
        balance           = COALESCE(balance, 0)           + p_amount,
        available_balance = COALESCE(available_balance, 0) + p_amount,
        last_funding_at   = now(),
        updated_at        = now()
    WHERE id = p_user_id;

    -- 5. Record funding transaction
    v_desc := 'Virtual Account Top-Up via Bachs.io' || 
              CASE WHEN p_sender_name IS NOT NULL AND trim(p_sender_name) != '' 
                   THEN ' (' || trim(p_sender_name) || ')' 
                   ELSE '' END;

    INSERT INTO public.transactions(
        user_id, user_email, type, amount, status, description,
        reference, gateway, platform, payment_method, metadata, created_at
    ) VALUES (
        p_user_id::text, lower(COALESCE(v_user_email, '')), 'funding', p_amount, 'completed', v_desc,
        trim(p_reference), 'bachs', 'bachs', 'bachs_virtual_account',
        jsonb_build_object(
            'virtual_account_payment_id', v_va_id,
            'event_id', p_event_id,
            'account_number', p_account_number,
            'sender_name', p_sender_name,
            'sender_bank', p_sender_bank,
            'sender_account_number', p_sender_account_number,
            'narration', p_narration
        ),
        now()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'reference', p_reference,
        'user_id', p_user_id,
        'va_payment_id', v_va_id,
        'tx_id', v_tx_id,
        'amount', p_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_virtual_account_deposit(TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_virtual_account_deposit(TEXT, TEXT, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 5. Admin RPC: `resolve_unmatched_payment`
--    Allows Super Admins to manually attribute and credit an unmatched deposit to the verified user.
CREATE OR REPLACE FUNCTION public.resolve_unmatched_payment(
    p_unmatched_id   UUID,
    p_target_user_id UUID,
    p_admin_user_id  UUID,
    p_notes          TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_unmatched   public.unmatched_payments%ROWTYPE;
    v_admin_role  TEXT;
    v_user_email  TEXT;
    v_tx_id       UUID;
    v_va_id       UUID;
BEGIN
    -- Verify admin permissions
    SELECT role INTO v_admin_role
    FROM public.profiles
    WHERE id = p_admin_user_id;

    IF v_admin_role != 'admin' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized: Super Admin access required.');
    END IF;

    -- Lock and fetch unmatched payment
    SELECT * INTO v_unmatched
    FROM public.unmatched_payments
    WHERE id = p_unmatched_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Unmatched payment record not found.');
    END IF;

    IF v_unmatched.status = 'credited' THEN
        RETURN jsonb_build_object('status', 'already_credited', 'message', 'This payment has already been credited.');
    END IF;

    -- Verify target user
    SELECT email INTO v_user_email
    FROM public.profiles
    WHERE id = p_target_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Target user profile not found.');
    END IF;

    -- Prevent double crediting if already in virtual_account_payments
    IF EXISTS (SELECT 1 FROM public.virtual_account_payments WHERE reference = v_unmatched.reference) THEN
        UPDATE public.unmatched_payments SET
            status           = 'credited',
            resolved_user_id = p_target_user_id,
            resolved_by      = p_admin_user_id,
            resolved_at      = now(),
            notes            = COALESCE(p_notes, 'Already credited in virtual_account_payments')
        WHERE id = p_unmatched_id;

        RETURN jsonb_build_object('status', 'already_credited', 'message', 'Payment reference already credited.');
    END IF;

    -- Insert into virtual_account_payments
    INSERT INTO public.virtual_account_payments(
        reference, event_id, user_id, user_email, amount,
        account_number, sender_name, sender_bank, sender_account_number,
        narration, status, raw_payload
    ) VALUES (
        v_unmatched.reference, v_unmatched.event_id, p_target_user_id, lower(v_user_email), v_unmatched.amount,
        v_unmatched.account_number, v_unmatched.sender_name, v_unmatched.sender_bank, v_unmatched.sender_account_number,
        v_unmatched.narration, 'completed', v_unmatched.raw_payload
    ) RETURNING id INTO v_va_id;

    INSERT INTO public.processed_payments(reference, email, amount, gateway)
    VALUES (v_unmatched.reference, lower(v_user_email), v_unmatched.amount, 'bachs_va_manual')
    ON CONFLICT (reference) DO NOTHING;

    -- Credit user wallet atomically
    UPDATE public.profiles SET
        wallet_balance    = COALESCE(wallet_balance, 0)    + v_unmatched.amount,
        balance           = COALESCE(balance, 0)           + v_unmatched.amount,
        available_balance = COALESCE(available_balance, 0) + v_unmatched.amount,
        last_funding_at   = now(),
        updated_at        = now()
    WHERE id = p_target_user_id;

    -- Record funding transaction
    INSERT INTO public.transactions(
        user_id, user_email, type, amount, status, description,
        reference, gateway, platform, payment_method, metadata, created_at
    ) VALUES (
        p_target_user_id::text, lower(v_user_email), 'funding', v_unmatched.amount, 'completed',
        'Virtual Account Deposit (Manual Attribution by Admin) - Ref ' || v_unmatched.reference,
        v_unmatched.reference, 'bachs', 'bachs', 'bachs_virtual_account',
        jsonb_build_object(
            'resolved_from_unmatched_id', v_unmatched.id,
            'resolved_by', p_admin_user_id,
            'admin_notes', p_notes
        ),
        now()
    ) RETURNING id INTO v_tx_id;

    -- Mark unmatched payment as credited
    UPDATE public.unmatched_payments SET
        status           = 'credited',
        resolved_user_id = p_target_user_id,
        resolved_by      = p_admin_user_id,
        resolved_at      = now(),
        notes            = p_notes
    WHERE id = p_unmatched_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'message', 'Payment credited successfully.',
        'reference', v_unmatched.reference,
        'user_id', p_target_user_id,
        'amount', v_unmatched.amount,
        'va_payment_id', v_va_id,
        'tx_id', v_tx_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_unmatched_payment(UUID, UUID, UUID, TEXT) TO service_role, authenticated;
