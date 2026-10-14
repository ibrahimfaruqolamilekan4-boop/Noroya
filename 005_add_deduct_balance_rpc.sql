-- Missing deduct_balance RPC migration
CREATE OR REPLACE FUNCTION deduct_balance(user_uuid UUID, amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    SELECT wallet_balance INTO v_current_balance 
    FROM profiles 
    WHERE id = user_uuid 
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_current_balance >= amount THEN
        UPDATE profiles SET 
            wallet_balance = wallet_balance - amount,
            balance = balance - amount,
            available_balance = GREATEST(available_balance - amount, 0)
        WHERE id = user_uuid;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION deduct_balance TO service_role;
