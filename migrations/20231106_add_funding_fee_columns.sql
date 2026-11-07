-- 20231106_add_funding_fee_columns.sql
-- Add columns to store the fee breakdown for wallet funding
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS norodata_margin numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_charged numeric NOT NULL DEFAULT 0;

-- Users can view their own funding rows
CREATE POLICY "user can view own funding rows"
  ON public.wallet_transactions
  FOR SELECT
  USING (auth.uid() = user_id);
