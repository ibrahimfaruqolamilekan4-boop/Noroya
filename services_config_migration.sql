-- ============================================================================
-- SQL Migration Script: Supabase 'services_config' Table & Pre-populations
-- Migration from Peyflex VTU API Gateway to Bigisub Dynamic API
-- ============================================================================

-- Step 1: Create the 'services_config' table
CREATE TABLE IF NOT EXISTS services_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('data', 'airtime', 'cable', 'electricity', 'exam_pin')),
    network_or_provider VARCHAR(100) NOT NULL, -- e.g., 'MTN', 'AIRTEL', 'GLO', '9MOBILE', 'DSTV', 'IKEDC', 'WAEC'
    item_name VARCHAR(255) NOT NULL,           -- e.g., '1GB SME', '₦500 Top-Up', 'WAEC PIN'
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    bigisub_identifier_id VARCHAR(255) NOT NULL UNIQUE, -- Unique API identifier string for Bigisub
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Step 2: Set up RLS (Row Level Security) and Policies
-- Enable Row Level Security on the new table
ALTER TABLE services_config ENABLE ROW LEVEL SECURITY;

-- Allow anonymous or authenticated read access (so any customer/user can view prices and plans)
CREATE POLICY "Allow public read access to active services" 
ON services_config 
FOR SELECT 
TO public 
USING (true);

-- Allow full administrative operations (Insert/Update/Delete) for service configs
-- In Supabase, service_role bypasses RLS, but we can explicitly allow it for authenticated admin users
CREATE POLICY "Allow full admin write access to services" 
ON services_config 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Step 3: Trigger to automatically update the 'updated_at' column
CREATE OR REPLACE FUNCTION update_services_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_services_config_timestamp
    BEFORE UPDATE ON services_config
    FOR EACH ROW
    EXECUTE FUNCTION update_services_config_updated_at();

-- Step 4: Pre-populate the table with Nigerian major networks and utility options
-- (Empty slots and layout references so they instantly register in the Admin Panel)
INSERT INTO services_config (service_type, network_or_provider, item_name, cost_price, selling_price, bigisub_identifier_id, is_active)
VALUES
    -- DATA BUNDLES (MTN)
    ('data', 'MTN', 'MTN SME 1GB', 240.00, 260.00, 'mtn_sme_1gb', true),
    ('data', 'MTN', 'MTN SME 2GB', 480.00, 520.00, 'mtn_sme_2gb', true),
    ('data', 'MTN', 'MTN SME 5GB', 1200.00, 1300.00, 'mtn_sme_5gb', true),
    ('data', 'MTN', 'MTN SME 10GB', 2400.00, 2600.00, 'mtn_sme_10gb', true),
    ('data', 'MTN', 'MTN CG (Corporate Gifting) 1GB', 265.00, 285.00, 'mtn_cg_1gb', true),
    ('data', 'MTN', 'MTN CG (Corporate Gifting) 5GB', 1325.00, 1425.00, 'mtn_cg_5gb', true),

    -- DATA BUNDLES (AIRTEL)
    ('data', 'AIRTEL', 'Airtel SME 1GB', 245.00, 270.00, 'airtel_sme_1gb', true),
    ('data', 'AIRTEL', 'Airtel SME 5GB', 1225.00, 1350.00, 'airtel_sme_5gb', true),
    ('data', 'AIRTEL', 'Airtel Gifting 1.5GB', 480.00, 520.00, 'airtel_gifting_1.5gb', true),
    ('data', 'AIRTEL', 'Airtel CG 1.5GB', 410.00, 450.00, 'airtel_cg_1.5gb', true),

    -- DATA BUNDLES (GLO)
    ('data', 'GLO', 'Glo Gifting 1.35GB', 460.00, 500.00, 'glo_gifting_1.35gb', true),
    ('data', 'GLO', 'Glo CG 1GB', 250.00, 280.00, 'glo_cg_1gb', true),
    ('data', 'GLO', 'Glo Gifting 20GB', 5400.00, 5800.00, 'glo_gifting_20gb', true),

    -- DATA BUNDLES (9MOBILE)
    ('data', '9MOBILE', '9mobile Gifting 1GB', 450.00, 500.00, '9mobile_gifting_1gb', true),
    ('data', '9MOBILE', '9mobile CG 1.5GB', 400.00, 450.00, '9mobile_cg_1.5gb', true),

    -- AIRTIME VTU (MTN, AIRTEL, GLO, 9MOBILE)
    ('airtime', 'MTN', 'MTN VTU Airtime', 97.00, 100.00, 'mtn_airtime_vtu', true),
    ('airtime', 'AIRTEL', 'Airtel VTU Airtime', 97.00, 100.00, 'airtel_airtime_vtu', true),
    ('airtime', 'GLO', 'Glo VTU Airtime', 95.00, 100.00, 'glo_airtime_vtu', true),
    ('airtime', '9MOBILE', '9mobile VTU Airtime', 94.00, 100.00, '9mobile_airtime_vtu', true),

    -- CABLE TV (DSTV, GOTV, STARTIMES)
    ('cable', 'DSTV', 'DSTV Padi Package', 2950.00, 3100.00, 'dstv_padi', true),
    ('cable', 'DSTV', 'DSTV Yanga Package', 4200.00, 4400.00, 'dstv_yanga', true),
    ('cable', 'GOTV', 'GOTV Lite', 1100.00, 1200.00, 'gotv_lite', true),
    ('cable', 'GOTV', 'GOTV Jolli', 3300.00, 3500.00, 'gotv_jolli', true),
    ('cable', 'GOTV', 'GOTV Max', 4850.00, 5100.00, 'gotv_max', true),
    ('cable', 'STARTIMES', 'StarTimes Nova', 1500.00, 1650.00, 'startimes_nova', true),
    ('cable', 'STARTIMES', 'StarTimes Smart', 3500.00, 3800.00, 'startimes_smart', true),

    -- ELECTRICITY PREPAID (IKEDC, EKEDC, AEDC, IBEDC)
    ('electricity', 'IKEDC', 'Ikeja Electricity Prepaid (IKEDC)', 100.00, 100.00, 'ikedc_prepaid', true),
    ('electricity', 'EKEDC', 'Eko Electricity Prepaid (EKEDC)', 100.00, 100.00, 'ekedc_prepaid', true),
    ('electricity', 'AEDC', 'Abuja Electricity Prepaid (AEDC)', 100.00, 100.00, 'aedc_prepaid', true),
    ('electricity', 'IBEDC', 'Ibadan Electricity Prepaid (IBEDC)', 100.00, 100.00, 'ibedc_prepaid', true),

    -- EXAM PINS (WAEC, NECO, JAMB)
    ('exam_pin', 'WAEC', 'WAEC Registration PIN', 3150.00, 3300.00, 'waec_pin', true),
    ('exam_pin', 'NECO', 'NECO Result Token PIN', 1100.00, 1250.00, 'neco_pin', true),
    ('exam_pin', 'JAMB', 'JAMB UTME Registration PIN', 4700.00, 4900.00, 'jamb_pin', true)

ON CONFLICT (bigisub_identifier_id) DO UPDATE SET
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    item_name = EXCLUDED.item_name,
    is_active = EXCLUDED.is_active;

-- End of Script
