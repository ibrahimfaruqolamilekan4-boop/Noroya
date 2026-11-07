-- ============================================================================
-- NORODATA MARKETPLACE MIGRATION
-- Adds digital marketplace tables for Foreign Phone Numbers & Social Accounts
-- ============================================================================

-- 1. CREATE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  type VARCHAR(20) NOT NULL, -- 'foreign_number' or 'social_account'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed Initial Categories if they don't exist
INSERT INTO public.marketplace_categories (name, description, icon, type)
VALUES
  ('US Phone Numbers', 'American phone numbers for verification and calls', '🇺🇸', 'foreign_number'),
  ('UK Phone Numbers', 'British phone numbers for verification and calls', '🇬🇧', 'foreign_number'),
  ('Canada Phone Numbers', 'Canadian phone numbers for verification and calls', '🇨🇦', 'foreign_number'),
  ('Instagram Accounts', 'Verified Instagram accounts with active followers', '📷', 'social_account'),
  ('TikTok Accounts', 'TikTok accounts with active followers and high engagement', '🎵', 'social_account'),
  ('Twitter/X Accounts', 'Twitter/X verified accounts and pages', '𝕏', 'social_account'),
  ('Snapchat Accounts', 'Snapchat accounts with high score and active contacts', '👻', 'social_account'),
  ('Facebook Accounts', 'Facebook pages, groups, and aged accounts', '👍', 'social_account')
ON CONFLICT (name) DO NOTHING;

-- 2. CREATE MARKETPLACE LISTINGS TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.marketplace_categories(id) NOT NULL,
  
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  
  -- What's being sold (e.g., { "number": "+1234567890", "followers": "50000" })
  product_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  
  status VARCHAR(20) DEFAULT 'available', -- available, sold, pending
  views INT DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT price_positive CHECK (price > 0)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON public.marketplace_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_category ON public.marketplace_listings(category_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON public.marketplace_listings(status);

-- 3. CREATE MARKETPLACE ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES public.marketplace_listings(id) NOT NULL,
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  price DECIMAL(15, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid, completed, refunded
  
  -- Payment tracking
  payment_reference VARCHAR(100),
  paid_at TIMESTAMP WITH TIME ZONE,
  
  -- Verification & completion
  verification_code VARCHAR(100),
  verified_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer ON public.marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_seller ON public.marketplace_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status ON public.marketplace_orders(status);

-- 4. CREATE MARKETPLACE CHAT TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.marketplace_orders(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  
  message_type VARCHAR(20) DEFAULT 'text', -- text, verification_code
  content TEXT NOT NULL,
  code_value VARCHAR(100), -- For verification codes
  
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketplace_messages_order ON public.marketplace_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_sender ON public.marketplace_messages(sender_id);

-- 5. UPDATE PROFILES TABLE (Add seller fields)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_marketplace_seller BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketplace_seller_rating DECIMAL(3, 2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS marketplace_seller_reviews INT DEFAULT 0;

-- 6. GRANT PRIVILEGES TO ALL ROLES (Prevents permission denied errors)
GRANT ALL ON TABLE public.marketplace_categories TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.marketplace_listings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.marketplace_orders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.marketplace_messages TO anon, authenticated, service_role;

-- 7. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.marketplace_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;

-- Categories: Public read
DROP POLICY IF EXISTS "Anyone can view marketplace categories" ON public.marketplace_categories;
CREATE POLICY "Anyone can view marketplace categories"
ON public.marketplace_categories FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role can manage categories" ON public.marketplace_categories;
CREATE POLICY "Service role can manage categories"
ON public.marketplace_categories FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- Listings: Anyone can view available, sellers manage their own
DROP POLICY IF EXISTS "Anyone can view available marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Anyone can view available marketplace listings"
ON public.marketplace_listings FOR SELECT
USING (status = 'available' OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Users can create marketplace listings" ON public.marketplace_listings;
CREATE POLICY "Users can create marketplace listings"
ON public.marketplace_listings FOR INSERT
WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Sellers can update their own listings" ON public.marketplace_listings;
CREATE POLICY "Sellers can update their own listings"
ON public.marketplace_listings FOR UPDATE
USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Service role full access on listings" ON public.marketplace_listings;
CREATE POLICY "Service role full access on listings"
ON public.marketplace_listings FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- Orders: Buyer and seller can view and update
DROP POLICY IF EXISTS "Users can view their marketplace orders" ON public.marketplace_orders;
CREATE POLICY "Users can view their marketplace orders"
ON public.marketplace_orders FOR SELECT
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Buyers can create marketplace orders" ON public.marketplace_orders;
CREATE POLICY "Buyers can create marketplace orders"
ON public.marketplace_orders FOR INSERT
WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Participants can update marketplace orders" ON public.marketplace_orders;
CREATE POLICY "Participants can update marketplace orders"
ON public.marketplace_orders FOR UPDATE
USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS "Service role full access on orders" ON public.marketplace_orders;
CREATE POLICY "Service role full access on orders"
ON public.marketplace_orders FOR ALL
TO service_role USING (true) WITH CHECK (true);

-- Messages: Chat participants only
DROP POLICY IF EXISTS "Chat participants can view messages" ON public.marketplace_messages;
CREATE POLICY "Chat participants can view messages"
ON public.marketplace_messages FOR SELECT
USING (
  auth.uid() = sender_id OR
  auth.uid() IN (
    SELECT seller_id FROM public.marketplace_orders WHERE id = order_id
    UNION
    SELECT buyer_id FROM public.marketplace_orders WHERE id = order_id
  )
);

DROP POLICY IF EXISTS "Chat participants can insert messages" ON public.marketplace_messages;
CREATE POLICY "Chat participants can insert messages"
ON public.marketplace_messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Service role full access on messages" ON public.marketplace_messages;
CREATE POLICY "Service role full access on messages"
ON public.marketplace_messages FOR ALL
TO service_role USING (true) WITH CHECK (true);
