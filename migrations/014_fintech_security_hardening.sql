-- ============================================================================
-- MIGRATION 014: FINTECH SECURITY HARDENING & RPC ACCESS CONTROL
-- NORODATA Production Database Migration
-- Safe to run directly in Supabase SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN ATOMIC BALANCE RPCs (deduct_balance & increment_balance)
-- Revoke public & authenticated access so only backend server (service_role)
-- can directly credit or debit raw balances outside formal business flows.
-- ----------------------------------------------------------------------------

-- Re-create deduct_balance with strict service_role validation
CREATE OR REPLACE FUNCTION public.deduct_balance(user_uuid UUID, amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    -- Security guard: Restrict execution strictly to backend service_role
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: deduct_balance is restricted to service_role only.';
    END IF;

    IF amount <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Row-level locking to prevent race conditions & double-spending
    SELECT COALESCE(wallet_balance, balance, 0) INTO v_current_balance 
    FROM public.profiles 
    WHERE id = user_uuid 
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_current_balance >= amount THEN
        UPDATE public.profiles SET 
            wallet_balance = GREATEST(COALESCE(wallet_balance, 0) - amount, 0),
            balance = GREATEST(COALESCE(balance, 0) - amount, 0),
            available_balance = GREATEST(COALESCE(available_balance, 0) - amount, 0),
            updated_at = timezone('utc'::text, now())
        WHERE id = user_uuid;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- Re-create increment_balance with strict service_role validation
CREATE OR REPLACE FUNCTION public.increment_balance(user_uuid UUID, amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Security guard: Restrict execution strictly to backend service_role
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: increment_balance is restricted to service_role only.';
    END IF;

    IF amount <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles SET 
        wallet_balance = COALESCE(wallet_balance, 0) + amount,
        balance = COALESCE(balance, 0) + amount,
        available_balance = COALESCE(available_balance, 0) + amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = user_uuid;

    RETURN TRUE;
END;
$$;

-- Explicitly revoke execute privileges from PUBLIC, anon, and authenticated roles
REVOKE EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) FROM authenticated;

-- Grant execution exclusively to service_role
GRANT EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. HARDEN WALLET-TO-WALLET TRANSFER RPC (execute_wallet_transfer_v2)
-- Enforces that callers can only transfer funds from their OWN wallet (auth.uid() = p_sender_id)
-- or via service_role backend. Blocks PostgREST sender spoofing.
-- ----------------------------------------------------------------------------

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
    -- Security guard: Sender verification to prevent PostgREST sender spoofing
    IF auth.role() <> 'service_role' AND auth.uid() <> p_sender_id THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'Unauthorized: You can only transfer funds from your own wallet.');
    END IF;

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

    -- Idempotency check: repeated transfer key returns original result and does not debit again
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

    -- Check sender has enough balance for amount + fee
    IF v_sender_balance < v_total_debit THEN
        RETURN jsonb_build_object(
            'status', 'insufficient_funds',
            'error', 'Insufficient balance. You need ₦' || v_total_debit || ' (including ₦10 transfer fee) but your balance is ₦' || v_sender_balance || '.',
            'available_balance', v_sender_balance,
            'required_amount', v_total_debit
        );
    END IF;

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

    -- Insert sender ledger row (debit)
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
        'Transfer to ' || v_recipient_name || ' (Fee: ₦' || v_fee || ')' || CASE WHEN p_note IS NOT NULL AND TRIM(p_note) <> '' THEN ' - ' || p_note ELSE '' END,
        'wallet_transfer',
        'wallet_transfer',
        now()
    );

    -- Insert recipient ledger row (credit)
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
        'You received ₦' || p_amount || ' from ' || v_sender_name || CASE WHEN p_note IS NOT NULL AND TRIM(p_note) <> '' THEN ' - ' || p_note ELSE '' END,
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

-- Revoke execute from unauthenticated callers (anon and PUBLIC)
REVOKE EXECUTE ON FUNCTION public.execute_wallet_transfer_v2(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_wallet_transfer_v2(UUID, UUID, NUMERIC, TEXT, TEXT) FROM anon;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.execute_wallet_transfer_v2(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_wallet_transfer_v2(UUID, UUID, NUMERIC, TEXT, TEXT) TO service_role;
