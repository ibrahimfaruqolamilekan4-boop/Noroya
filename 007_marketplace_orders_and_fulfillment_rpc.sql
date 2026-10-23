-- ============================================================================
-- NORODATA MARKETPLACE ORDERS, PERMANENT CHAT, & ATOMIC WALLET DEBIT RPC
-- Migration 007: Permanent chats, strict RLS, and atomic order fulfillment RPC
-- ============================================================================

-- 1. Create marketplace_orders table
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  listing_id TEXT NOT NULL,
  phone_number TEXT,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' or 'completed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer_id ON public.marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_listing_id ON public.marketplace_orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON public.marketplace_orders(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_created_at ON public.marketplace_orders(created_at DESC);

-- 2. Create marketplace_messages table
CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE CASCADE NOT NULL,
  sender_id TEXT NOT NULL,
  sender_role VARCHAR(20) NOT NULL, -- 'buyer', 'admin', 'operator'
  body TEXT NOT NULL,
  code_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_marketplace_messages_order_id ON public.marketplace_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_created_at ON public.marketplace_messages(created_at ASC);

-- 3. Ensure profiles table has 'role' with default 'user'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12, 2) DEFAULT 0.00;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies for marketplace_orders:
-- NO DELETE policy for anyone. Old chats stay readable forever.
DROP POLICY IF EXISTS "orders_select_policy" ON public.marketplace_orders;
CREATE POLICY "orders_select_policy" ON public.marketplace_orders
  FOR SELECT
  USING (
    auth.uid() = buyer_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'operator')
    )
  );

DROP POLICY IF EXISTS "orders_insert_policy" ON public.marketplace_orders;
CREATE POLICY "orders_insert_policy" ON public.marketplace_orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'operator')
    )
  );

DROP POLICY IF EXISTS "orders_update_policy" ON public.marketplace_orders;
CREATE POLICY "orders_update_policy" ON public.marketplace_orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'operator')
    )
  );

-- 6. Strict RLS Policies for marketplace_messages:
-- NO DELETE policy: Messages cannot be deleted from the app by anyone, including admins.
-- NO UPDATE policy: Messages cannot be edited or altered once sent.
DROP POLICY IF EXISTS "messages_select_policy" ON public.marketplace_messages;
CREATE POLICY "messages_select_policy" ON public.marketplace_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_orders o
      WHERE o.id = marketplace_messages.order_id
      AND (
        o.buyer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'operator')
        )
      )
    )
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.marketplace_messages;
CREATE POLICY "messages_insert_policy" ON public.marketplace_messages
  FOR INSERT
  WITH CHECK (
    auth.uid()::text = sender_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
    )
  );

-- 7. Strict RLS Policies for transactions:
-- NO DELETE policy
-- NO UPDATE policy
DROP POLICY IF EXISTS "transactions_select_policy" ON public.transactions;
CREATE POLICY "transactions_select_policy" ON public.transactions
  FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
    )
  );

DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
CREATE POLICY "transactions_insert_policy" ON public.transactions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'operator')
    )
  );

-- 8. Grant permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_orders TO authenticated, service_role, anon;
GRANT SELECT, INSERT ON TABLE public.marketplace_messages TO authenticated, service_role, anon;
GRANT SELECT, INSERT ON TABLE public.transactions TO authenticated, service_role, anon;

-- ============================================================================
-- 9. ATOMIC SERVER-SIDE STORED PROCEDURE / RPC: complete_marketplace_order
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_marketplace_order(
  p_order_id UUID,
  p_caller_id UUID,
  p_code_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_order RECORD;
  v_buyer_id UUID;
  v_buyer_email TEXT;
  v_buyer_balance NUMERIC;
  v_price NUMERIC;
  v_new_balance NUMERIC;
  v_tx_ref TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Confirm the caller is an admin or an allowed operator
  SELECT role INTO v_caller_role 
  FROM public.profiles 
  WHERE id = p_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'operator') THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Unauthorized: Admin or operator role required'
    );
  END IF;

  -- 2. Lock the order row to prevent parallel fulfillment
  SELECT * INTO v_order 
  FROM public.marketplace_orders 
  WHERE id = p_order_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Order not found'
    );
  END IF;

  -- 3. If the order is already Completed, stop and return "Already completed". This prevents double debit.
  IF v_order.status = 'completed' OR v_order.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Already completed'
    );
  END IF;

  v_price := COALESCE(v_order.price, 0);
  v_buyer_id := v_order.buyer_id;

  -- Lock the buyer's wallet row (SELECT ... FOR UPDATE) so two clicks cannot run at the same time
  SELECT email, COALESCE(wallet_balance, balance, 0)
  INTO v_buyer_email, v_buyer_balance
  FROM public.profiles
  WHERE id = v_buyer_id
  FOR UPDATE;

  IF v_buyer_balance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Buyer wallet profile not found'
    );
  END IF;

  -- 4. If the buyer's balance is less than the price, stop and return "Buyer balance too low" and do NOT send the code.
  IF v_buyer_balance < v_price THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Buyer balance too low',
      'balance', v_buyer_balance,
      'price', v_price,
      'short_by', (v_price - v_buyer_balance)
    );
  END IF;

  -- 5. Otherwise, in one atomic transaction:
  -- (a) Subtract the price from the buyer's wallet balance
  v_new_balance := v_buyer_balance - v_price;
  UPDATE public.profiles
  SET 
    wallet_balance = v_new_balance,
    balance = v_new_balance,
    available_balance = GREATEST(COALESCE(available_balance, 0) - v_price, 0),
    updated_at = v_now
  WHERE id = v_buyer_id;

  -- (b) Save the code as a message in the chat
  INSERT INTO public.marketplace_messages (
    order_id,
    sender_id,
    sender_role,
    body,
    code_value,
    created_at
  ) VALUES (
    p_order_id,
    p_caller_id::text,
    v_caller_role,
    'Here is your login verification code:',
    p_code_value,
    v_now
  );

  -- (c) Set the order status to Completed and save completed_at
  UPDATE public.marketplace_orders
  SET 
    status = 'completed',
    completed_at = v_now
  WHERE id = p_order_id;

  -- (d) Insert a debit record in the transactions table (amount, buyer, order id, number, timestamp)
  v_tx_ref := 'NUM-DEBIT-' || replace(p_order_id::text, '-', '')::text;
  INSERT INTO public.transactions (
    user_id,
    user_email,
    type,
    amount,
    status,
    description,
    reference,
    phone,
    gateway,
    created_at
  ) VALUES (
    v_buyer_id::text,
    v_buyer_email,
    'debit',
    v_price,
    'completed',
    'Foreign Number Purchase: ' || COALESCE(v_order.phone_number, 'Foreign Number'),
    v_tx_ref,
    v_order.phone_number,
    'wallet_auto_debit',
    v_now
  );

  -- 6. Return success result
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_balance', v_new_balance,
    'code_value', p_code_value,
    'completed_at', v_now,
    'reference', v_tx_ref
  );
END;
$$;

GRANT EXECUTE ON FUNCTION complete_marketplace_order(UUID, UUID, TEXT) TO authenticated, service_role, anon;
