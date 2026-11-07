-- 20231106_create_push_subscriptions.sql
-- Table for storing Web‑Push subscriptions (VAPID)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  endpoint text NOT NULL,
  keys jsonb NOT NULL,               -- {"p256dh": "...", "auth": "..."}
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL
);

-- Enable Row‑Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can insert and delete their own subscriptions
CREATE POLICY "user can manage own subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (or admins) can read all subscriptions
CREATE POLICY "service can read all subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (true);
