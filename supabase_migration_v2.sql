-- ============================================================================
-- Noroya: Firebase → Supabase Migration
-- Converts all Firestore collections to Postgres tables
-- ============================================================================

-- 1. PROFILES TABLE (already exists from frontend auth, adding missing cols)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_count INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_bonus NUMERIC(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS transaction_pin TEXT DEFAULT '1234';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS available_balance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_funding_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_bonus_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Unique index on email (safe to run on existing table)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique ON profiles (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique ON profiles (referral_code) WHERE referral_code IS NOT NULL;

-- 2. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    type TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    status TEXT DEFAULT 'pending',
    description TEXT,
    reference TEXT,
    phone TEXT,
    network TEXT,
    plan TEXT,
    gateway TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gateway TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_reference_idx ON transactions(reference);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at DESC);

-- 3. PROCESSED PAYMENTS TABLE (idempotency for webhooks)
CREATE TABLE IF NOT EXISTS processed_payments (
    reference TEXT PRIMARY KEY,
    email TEXT,
    amount NUMERIC(12,2),
    gateway TEXT,
    processed_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS POLICIES
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users see own transactions" ON transactions
    FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'service_role');
CREATE POLICY IF NOT EXISTS "Service role full access transactions" ON transactions
    FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE processed_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role only processed_payments" ON processed_payments
    FOR ALL USING (auth.role() = 'service_role');

-- 5. AUTO-UPDATE updated_at ON PROFILES AND TRANSACTIONS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. ATOMIC PAYMENT WEBHOOK PROCESSOR (replaces db.runTransaction in Paystack/Flutterwave webhooks)
CREATE OR REPLACE FUNCTION process_payment_webhook(
    p_reference TEXT,
    p_email TEXT,
    p_amount NUMERIC,
    p_gateway TEXT DEFAULT 'unknown',
    p_description TEXT DEFAULT 'Wallet Top-Up'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_profile_id UUID;
    v_tx_id UUID;
    v_already_processed BOOLEAN := FALSE;
BEGIN
    -- Idempotency check: reject if already processed
    IF EXISTS (SELECT 1 FROM processed_payments WHERE reference = p_reference) THEN
        RETURN jsonb_build_object('status', 'already_processed', 'reference', p_reference);
    END IF;

    -- Find user by email (case-insensitive)
    SELECT id INTO v_profile_id FROM profiles WHERE lower(email) = lower(p_email) LIMIT 1;
    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'User not found for email: ' || p_email);
    END IF;

    -- Atomically credit wallet
    UPDATE profiles SET
        wallet_balance = wallet_balance + p_amount,
        balance = balance + p_amount,
        available_balance = available_balance + p_amount,
        last_funding_at = now()
    WHERE id = v_profile_id;

    -- Record transaction
    INSERT INTO transactions(user_id, type, amount, status, description, reference, gateway, created_at)
    VALUES(v_profile_id::text, 'funding', p_amount, 'completed', p_description, p_reference, p_gateway, now())
    RETURNING id INTO v_tx_id;

    -- Mark payment as processed (idempotency lock)
    INSERT INTO processed_payments(reference, email, amount, gateway)
    VALUES(p_reference, lower(p_email), p_amount, p_gateway);

    RETURN jsonb_build_object('status', 'success', 'profile_id', v_profile_id, 'tx_id', v_tx_id, 'amount', p_amount);
END;
$$;

-- 7. ATOMIC WALLET DEDUCT + RECORD TRANSACTION (replaces balance-deduct Firebase transactions)
CREATE OR REPLACE FUNCTION deduct_wallet_and_record(
    p_user_id UUID,
    p_amount NUMERIC,
    p_reference TEXT,
    p_description TEXT,
    p_type TEXT DEFAULT 'purchase',
    p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_current_balance NUMERIC;
    v_tx_id UUID;
BEGIN
    -- Lock the row and check balance
    SELECT wallet_balance INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Profile not found');
    END IF;
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object('status', 'insufficient_funds', 'balance', v_current_balance, 'required', p_amount);
    END IF;

    -- Deduct balance
    UPDATE profiles SET
        wallet_balance = wallet_balance - p_amount,
        balance = balance - p_amount,
        available_balance = GREATEST(available_balance - p_amount, 0)
    WHERE id = p_user_id;

    -- Record transaction
    INSERT INTO transactions(user_id, type, amount, status, description, reference, metadata, created_at)
    VALUES(p_user_id::text, p_type, p_amount, 'completed', p_description, p_reference, p_metadata, now())
    RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('status', 'success', 'tx_id', v_tx_id, 'new_balance', v_current_balance - p_amount);
END;
$$;

-- 8. INCREMENT BALANCE RPC (used by Mozosubs webhook)
CREATE OR REPLACE FUNCTION increment_balance(user_uuid UUID, amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE profiles SET
        wallet_balance = wallet_balance + amount,
        balance = balance + amount,
        available_balance = available_balance + amount
    WHERE id = user_uuid;
END;
$$;

-- Grant service role access to all RPCs
GRANT EXECUTE ON FUNCTION process_payment_webhook TO service_role;
GRANT EXECUTE ON FUNCTION deduct_wallet_and_record TO service_role;
GRANT EXECUTE ON FUNCTION increment_balance TO service_role;

