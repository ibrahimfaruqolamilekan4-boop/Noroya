-- ============================================================================
-- Migration 009: Fintech, Phone Transfer, and Push Notification Hardening
-- File: migrations/009_fintech_and_push_hardening.sql
-- ============================================================================

-- 1. Ensure columns exist on `transactions` for fee breakdown and idempotency
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS norodata_fee NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS gateway_fee NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS total_charged NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transfer_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_transfer_key_idx 
    ON public.transactions(transfer_key) 
    WHERE transfer_key IS NOT NULL;

-- 2. Ensure columns exist on `profiles`
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS legacy_phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ;

-- 3. Resolve phone number duplicates safely without losing existing data
-- Step 3a: Preserve any raw existing phone number in legacy_phone_number
UPDATE public.profiles
SET legacy_phone_number = phone_number
WHERE legacy_phone_number IS NULL AND phone_number IS NOT NULL;

-- Step 3b: Normalize Nigerian phone formats where possible
UPDATE public.profiles
SET phone_number = '234' || SUBSTRING(REGEXP_REPLACE(phone_number, '\D', '', 'g') FROM 2)
WHERE phone_number IS NOT NULL 
  AND REGEXP_REPLACE(phone_number, '\D', '', 'g') ~ '^0[789][01]\d{8}$';

UPDATE public.profiles
SET phone_number = REGEXP_REPLACE(phone_number, '\D', '', 'g')
WHERE phone_number IS NOT NULL 
  AND REGEXP_REPLACE(phone_number, '\D', '', 'g') ~ '^234[789][01]\d{8}$';

-- Step 3c: Resolve duplicates by keeping the earliest profile and setting duplicates to NULL (preserved in legacy_phone_number)
WITH duplicate_phones AS (
    SELECT id,
           phone_number,
           ROW_NUMBER() OVER (
               PARTITION BY phone_number 
               ORDER BY created_at ASC NULLS LAST, id ASC
           ) as row_num
    FROM public.profiles
    WHERE phone_number IS NOT NULL AND phone_number <> ''
)
UPDATE public.profiles p
SET phone_number = NULL
FROM duplicate_phones d
WHERE p.id = d.id AND d.row_num > 1;

-- Step 3d: Add UNIQUE constraint on profiles.phone_number
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique_idx 
    ON public.profiles(phone_number) 
    WHERE phone_number IS NOT NULL;

-- 4. Create push_subscriptions table with RLS
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions" 
    ON public.push_subscriptions 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" 
    ON public.push_subscriptions 
    FOR DELETE 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can select all push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Service role can select all push subscriptions" 
    ON public.push_subscriptions 
    FOR SELECT 
    USING (auth.role() = 'service_role');

-- 5. Immutability protection for ledger rows in `transactions`
--    Ledger rows must never be deleted or edited.
CREATE OR REPLACE FUNCTION public.prevent_transaction_ledger_tampering()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Ledger transaction rows cannot be deleted.';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Allow updating only pending transaction status to completed or failed
        IF OLD.status = 'completed' THEN
            RAISE EXCEPTION 'Completed ledger transaction rows cannot be edited.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_transactions_ledger ON public.transactions;
CREATE TRIGGER trg_protect_transactions_ledger
    BEFORE UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_transaction_ledger_tampering();

-- 6. Atomic, Idempotent Transfer RPC Function
CREATE OR REPLACE FUNCTION public.execute_wallet_transfer_v2(
    p_sender_id UUID,
    p_recipient_id UUID,
    p_amount NUMERIC,
    p_transfer_key TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sender_balance NUMERIC;
    v_recipient_balance NUMERIC;
    v_sender_name TEXT;
    v_recipient_name TEXT;
    v_sender_email TEXT;
    v_recipient_email TEXT;
    v_fee NUMERIC := 10.00;
    v_total_debit NUMERIC;
    v_ref TEXT;
    v_existing_tx RECORD;
BEGIN
    -- Validation: minimum transfer ₦100
    IF p_amount IS NULL OR p_amount < 100 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'Minimum transfer amount is ₦100.');
    END IF;

    -- Validation: prevent self-transfer
    IF p_sender_id = p_recipient_id THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'You cannot transfer money to yourself.');
    END IF;

    IF p_transfer_key IS NULL OR TRIM(p_transfer_key) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'A unique transfer key is required for idempotency.');
    END IF;

    -- Idempotency check: repeated key returns original result and does not debit again
    SELECT reference, amount, created_at, status INTO v_existing_tx
    FROM public.transactions
    WHERE transfer_key = p_transfer_key
    LIMIT 1;

    IF v_existing_tx.reference IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status', 'success',
            'amount', p_amount,
            'fee', v_fee,
            'total_debited', p_amount + v_fee,
            'reference', v_existing_tx.reference,
            'idempotent_replay', true,
            'message', 'Transfer already processed.'
        );
    END IF;

    v_total_debit := p_amount + v_fee;

    -- Deadlock prevention: Lock wallet rows strictly in ascending order of UUID
    IF p_sender_id < p_recipient_id THEN
        SELECT wallet_balance, full_name, name, email INTO v_sender_balance, v_sender_name, v_sender_name, v_sender_email
        FROM public.profiles WHERE id = p_sender_id FOR UPDATE;

        SELECT wallet_balance, full_name, name, email INTO v_recipient_balance, v_recipient_name, v_recipient_name, v_recipient_email
        FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;
    ELSE
        SELECT wallet_balance, full_name, name, email INTO v_recipient_balance, v_recipient_name, v_recipient_name, v_recipient_email
        FROM public.profiles WHERE id = p_recipient_id FOR UPDATE;

        SELECT wallet_balance, full_name, name, email INTO v_sender_balance, v_sender_name, v_sender_name, v_sender_email
        FROM public.profiles WHERE id = p_sender_id FOR UPDATE;
    END IF;

    IF v_sender_balance IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'Sender wallet not found.');
    END IF;

    IF v_recipient_balance IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'Recipient wallet not found.');
    END IF;

    -- Check sender has enough for amount + fee
    IF v_sender_balance < v_total_debit THEN
        RETURN jsonb_build_object(
            'status', 'insufficient_funds',
            'error', 'Insufficient balance. You need ₦' || v_total_debit || ' (including ₦10 transfer fee) but your balance is ₦' || v_sender_balance || '.',
            'available_balance', v_sender_balance,
            'required_amount', v_total_debit
        );
    END IF;

    -- ITEM 4 COMMENT:
    -- Withdrawal fee will be added later. Do not hardcode withdrawal fees here.

    -- Debit sender: amount + ₦10 fee
    UPDATE public.profiles
    SET wallet_balance = wallet_balance - v_total_debit,
        balance = balance - v_total_debit,
        available_balance = available_balance - v_total_debit,
        updated_at = now()
    WHERE id = p_sender_id;

    -- Credit recipient: amount only
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + p_amount,
        balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        updated_at = now()
    WHERE id = p_recipient_id;

    v_ref := 'TXF-' || TO_CHAR(now(), 'YYYYMMDDHH24MISS') || '-' || SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6);
    v_sender_name := COALESCE(v_sender_name, 'NORODATA User');
    v_recipient_name := COALESCE(v_recipient_name, 'NORODATA User');

    -- Insert two ledger rows in transactions with the same transfer reference
    -- Sender ledger row (debit)
    INSERT INTO public.transactions (
        user_id,
        user_email,
        type,
        amount,
        norodata_fee,
        total_charged,
        status,
        reference,
        transfer_key,
        description,
        gateway,
        platform,
        created_at
    ) VALUES (
        p_sender_id::text,
        v_sender_email,
        'transfer_out',
        p_amount,
        v_fee,
        v_total_debit,
        'completed',
        v_ref,
        p_transfer_key,
        'Transfer to ' || v_recipient_name || ' (Fee: ₦' || v_fee || ')' || CASE WHEN p_note IS NOT NULL AND p_note <> '' THEN ' - ' || p_note ELSE '' END,
        'wallet_transfer',
        'wallet_transfer',
        now()
    );

    -- Recipient ledger row (credit)
    INSERT INTO public.transactions (
        user_id,
        user_email,
        type,
        amount,
        norodata_fee,
        total_charged,
        status,
        reference,
        transfer_key,
        description,
        gateway,
        platform,
        created_at
    ) VALUES (
        p_recipient_id::text,
        v_recipient_email,
        'transfer_in',
        p_amount,
        0,
        p_amount,
        'completed',
        v_ref,
        p_transfer_key || '-IN',
        'You received ₦' || p_amount || ' from ' || v_sender_name || CASE WHEN p_note IS NOT NULL AND p_note <> '' THEN ' - ' || p_note ELSE '' END,
        'wallet_transfer',
        'wallet_transfer',
        now()
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'amount', p_amount,
        'fee', v_fee,
        'total_debited', v_total_debit,
        'reference', v_ref,
        'recipient_name', v_recipient_name,
        'new_balance', v_sender_balance - v_total_debit
    );
END;
$$;
