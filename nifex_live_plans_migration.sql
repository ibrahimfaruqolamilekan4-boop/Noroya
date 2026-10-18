-- ============================================================================
-- NIFEX DATA LIVE PLANS MIGRATION SCRIPT
-- Generated from live Nifex Data API (https://nifexdataapp.com.ng/api/data/)
-- Total Live Plans: 89
-- Run this directly in the Supabase SQL Editor
-- ============================================================================

-- Ensure services_config table and columns exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services_config' AND column_name='provider') THEN
    ALTER TABLE public.services_config ADD COLUMN provider VARCHAR(100) DEFAULT 'nifex';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services_config' AND column_name='plan_category') THEN
    ALTER TABLE public.services_config ADD COLUMN plan_category VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services_config' AND column_name='validity_days') THEN
    ALTER TABLE public.services_config ADD COLUMN validity_days VARCHAR(100);
  END IF;
END $$;

-- Remove previous hardcoded plans from one AI to keep database clean
DELETE FROM public.services_config WHERE provider = 'nifex' OR bigisub_identifier_id LIKE 'nifex_%';

-- Insert all 89 live Nifex Data plans
INSERT INTO public.services_config (
    service_type,
    network_or_provider,
    provider_or_network,
    item_name,
    cost_price,
    selling_price,
    retail_price,
    agent_price,
    reseller_price,
    bigisub_identifier_id,
    bigisub_plan_id,
    mozosubz_plan_id,
    mozosubs_plan_id,
    mozosubz_service,
    provider,
    plan_category,
    validity_days,
    is_active,
    updated_at
) VALUES  ('data', 'MTN', 'MTN', 'MTN 500MB SME (2 Days)', 215, 237, 237, 226, 222, 'nifex_mtn_226', '226', '226', '226', 'mtn_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 500MB SME (14 Days)', 315, 347, 347, 331, 325, 'nifex_mtn_227', '227', '227', '227', 'mtn_sme', 'nifex', 'SME', '14 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1GB SME (3 Days)', 390, 430, 430, 410, 402, 'nifex_mtn_228', '228', '228', '228', 'mtn_sme', 'nifex', 'SME', '3 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1GB SME (30 Days)', 420, 463, 463, 441, 433, 'nifex_mtn_229', '229', '229', '229', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 2GB SME (7 Days)', 733, 807, 807, 770, 755, 'nifex_mtn_230', '230', '230', '230', 'mtn_sme', 'nifex', 'SME', '7 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 3GB SME (30 Days)', 1250, 1375, 1375, 1313, 1288, 'nifex_mtn_231', '231', '231', '231', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 5.5GB SME (2 Days)', 1475, 1623, 1623, 1549, 1520, 'nifex_mtn_232', '232', '232', '232', 'mtn_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 5GB SME (30 Days)', 1550, 1706, 1706, 1628, 1597, 'nifex_mtn_233', '233', '233', '233', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 10GB SME (30 Days)', 3850, 4235, 4235, 4043, 3966, 'nifex_mtn_234', '234', '234', '234', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 500MB GIFTING (30 Days)', 320, 352, 352, 336, 330, 'nifex_mtn_236', '236', '236', '236', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1GB GIFTING (14 Days)', 390, 430, 430, 410, 402, 'nifex_mtn_237', '237', '237', '237', 'mtn_gifting', 'nifex', 'GIFTING', '14 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1GB(POS USERS) GIFTING (30 Days)', 440, 485, 485, 462, 454, 'nifex_mtn_238', '238', '238', '238', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1.5GB GIFTING (2 Days)', 587, 646, 646, 617, 605, 'nifex_mtn_239', '239', '239', '239', 'mtn_gifting', 'nifex', 'GIFTING', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 2GB GIFTING (30 Days)', 1200, 1320, 1320, 1260, 1236, 'nifex_mtn_240', '240', '240', '240', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 2.5GB GIFTING (1 Days)', 740, 815, 815, 777, 763, 'nifex_mtn_241', '241', '241', '241', 'mtn_gifting', 'nifex', 'GIFTING', '1 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 2.5GB GIFTING (2 Days)', 890, 980, 980, 935, 917, 'nifex_mtn_242', '242', '242', '242', 'mtn_gifting', 'nifex', 'GIFTING', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 3.2GB GIFTING (2 Days)', 980, 1078, 1078, 1029, 1010, 'nifex_mtn_243', '243', '243', '243', 'mtn_gifting', 'nifex', 'GIFTING', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 3.5GB GIFTING (14 Days)', 1500, 1651, 1651, 1575, 1545, 'nifex_mtn_244', '244', '244', '244', 'mtn_gifting', 'nifex', 'GIFTING', '14 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 5GB GIFTING (14 Days)', 1160, 1276, 1276, 1218, 1195, 'nifex_mtn_245', '245', '245', '245', 'mtn_gifting', 'nifex', 'GIFTING', '14 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 7GB GIFTING (30 Days)', 3420, 3763, 3763, 3591, 3523, 'nifex_mtn_246', '246', '246', '246', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 10GB GIFTING (30 Days)', 3850, 4235, 4235, 4043, 3966, 'nifex_mtn_247', '247', '247', '247', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 11GB GIFTING (7 Days)', 3397, 3737, 3737, 3567, 3499, 'nifex_mtn_248', '248', '248', '248', 'mtn_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 12.5GB SME (30 Days)', 5328, 5861, 5861, 5595, 5488, 'nifex_mtn_249', '249', '249', '249', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 12.5GB GIFTING (14 Days)', 4349, 4784, 4784, 4567, 4480, 'nifex_mtn_250', '250', '250', '250', 'mtn_gifting', 'nifex', 'GIFTING', '14 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 16.5GB GIFTING (30 Days)', 6329, 6962, 6962, 6646, 6519, 'nifex_mtn_251', '251', '251', '251', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 20GB GIFTING (30 Days)', 7300, 8031, 8031, 7665, 7519, 'nifex_mtn_252', '252', '252', '252', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 25GB GIFTING (30 Days)', 8710, 9581, 9581, 9146, 8972, 'nifex_mtn_253', '253', '253', '253', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 34GB GIFTING (30 Days)', 9700, 10670, 10670, 10185, 9991, 'nifex_mtn_254', '254', '254', '254', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 36GB GIFTING (30 Days)', 10650, 11716, 11716, 11183, 10970, 'nifex_mtn_255', '255', '255', '255', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 65GB GIFTING (30 Days)', 15600, 17160, 17160, 16380, 16068, 'nifex_mtn_256', '256', '256', '256', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 75GB GIFTING (30 Days)', 17500, 19250, 19250, 18375, 18025, 'nifex_mtn_257', '257', '257', '257', 'mtn_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 90GB GIFTING (60 Days)', 24325, 26758, 26758, 25542, 25055, 'nifex_mtn_258', '258', '258', '258', 'mtn_gifting', 'nifex', 'GIFTING', '60 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 150GB GIFTING (60 Days)', 38850, 42735, 42735, 40793, 40016, 'nifex_mtn_259', '259', '259', '259', 'mtn_gifting', 'nifex', 'GIFTING', '60 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 480GB GIFTING (90 Days)', 87000, 95701, 95701, 91350, 89610, 'nifex_mtn_260', '260', '260', '260', 'mtn_gifting', 'nifex', 'GIFTING', '90 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 40GB CORPORATE (30 Days)', 9800, 10780, 10780, 10290, 10094, 'nifex_mtn_285', '285', '285', '285', 'mtn_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 2.5GB SME (2 Days)', 800, 881, 881, 840, 824, 'nifex_mtn_316', '316', '316', '316', 'mtn_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 15GB SME (30 Days)', 4650, 5115, 5115, 4883, 4790, 'nifex_mtn_317', '317', '317', '317', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 20GB SME (30 Days)', 6880, 7569, 7569, 7224, 7087, 'nifex_mtn_318', '318', '318', '318', 'mtn_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'MTN', 'MTN', 'MTN 1GB SME (2 Days)', 235, 259, 259, 247, 243, 'nifex_mtn_319', '319', '319', '319', 'mtn_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 750MB SME (1 Days)', 206, 227, 227, 217, 213, 'nifex_glo_261', '261', '261', '261', 'glo_sme', 'nifex', 'SME', '1 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 1.5GB SME (1 Days)', 300, 330, 330, 315, 309, 'nifex_glo_262', '262', '262', '262', 'glo_sme', 'nifex', 'SME', '1 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 2.5GB SME (2 Days)', 490, 539, 539, 515, 505, 'nifex_glo_263', '263', '263', '263', 'glo_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 3GB SME (3 Days)', 880, 969, 969, 924, 907, 'nifex_glo_264', '264', '264', '264', 'glo_sme', 'nifex', 'SME', '3 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 5GB SME (3 Days)', 1680, 1849, 1849, 1764, 1731, 'nifex_glo_265', '265', '265', '265', 'glo_sme', 'nifex', 'SME', '3 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 5GB SME (7 Days)', 1730, 1904, 1904, 1817, 1782, 'nifex_glo_266', '266', '266', '266', 'glo_sme', 'nifex', 'SME', '7 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 500MB GIFTING (1 Days)', 106, 117, 117, 112, 110, 'nifex_glo_267', '267', '267', '267', 'glo_gifting', 'nifex', 'GIFTING', '1 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 1GB GIFTING (3 Days)', 305, 336, 336, 321, 315, 'nifex_glo_268', '268', '268', '268', 'glo_gifting', 'nifex', 'GIFTING', '3 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 1GB GIFTING (7 Days)', 330, 364, 364, 347, 340, 'nifex_glo_269', '269', '269', '269', 'glo_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 2GB GIFTING (30 Days)', 840, 925, 925, 882, 866, 'nifex_glo_270', '270', '270', '270', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 3GB GIFTING (7 Days)', 1070, 1177, 1177, 1124, 1103, 'nifex_glo_271', '271', '271', '271', 'glo_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 3GB GIFTING (30 Days)', 1220, 1342, 1342, 1281, 1257, 'nifex_glo_272', '272', '272', '272', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 5GB GIFTING (30 Days)', 1900, 2090, 2090, 1995, 1957, 'nifex_glo_273', '273', '273', '273', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 10.5GB GIFTING (30 Days)', 3200, 3521, 3521, 3360, 3296, 'nifex_glo_274', '274', '274', '274', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 29GB GIFTING (30 Days)', 7860, 8646, 8646, 8253, 8096, 'nifex_glo_275', '275', '275', '275', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 1GB CORPORATE (30 Days)', 420, 463, 463, 441, 433, 'nifex_glo_276', '276', '276', '276', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 2GB CORPORATE (30 Days)', 885, 974, 974, 930, 912, 'nifex_glo_277', '277', '277', '277', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 2.6GB CORPORATE (30 Days)', 985, 1084, 1084, 1035, 1015, 'nifex_glo_278', '278', '278', '278', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 5GB CORPORATE (30 Days)', 2050, 2255, 2255, 2153, 2112, 'nifex_glo_279', '279', '279', '279', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 7.5GB CORPORATE (30 Days)', 2900, 3191, 3191, 3045, 2987, 'nifex_glo_280', '280', '280', '280', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 10GB(8gb + 2gb night) SME (30 Days)', 2840, 3125, 3125, 2982, 2926, 'nifex_glo_282', '282', '282', '282', 'glo_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 14GB CORPORATE (30 Days)', 4000, 4400, 4400, 4200, 4120, 'nifex_glo_283', '283', '283', '283', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 29GB CORPORATE (30 Days)', 7900, 8690, 8690, 8295, 8137, 'nifex_glo_284', '284', '284', '284', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 107GB(105gb day+2gb night) GIFTING (30 Days)', 18850, 20735, 20735, 19793, 19416, 'nifex_glo_286', '286', '286', '286', 'glo_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 64GB(62gb day +2gb night) CORPORATE (30 Days)', 14150, 15566, 15566, 14858, 14575, 'nifex_glo_287', '287', '287', '287', 'glo_corporate', 'nifex', 'CG', '30 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 310GB CORPORATE (60 Days)', 47500, 52251, 52251, 49875, 48925, 'nifex_glo_288', '288', '288', '288', 'glo_corporate', 'nifex', 'CG', '60 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 355GB CORPORATE (90 Days)', 56800, 62481, 62481, 59640, 58504, 'nifex_glo_289', '289', '289', '289', 'glo_corporate', 'nifex', 'CG', '90 Days', true, NOW()),
  ('data', 'GLO', 'GLO', 'GLO 1TB CORPORATE (365 Days)', 142000, 156200, 156200, 149100, 146260, 'nifex_glo_290', '290', '290', '290', 'glo_corporate', 'nifex', 'CG', '365 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 600MB SME (2 Days)', 225, 248, 248, 237, 232, 'nifex_airtel_291', '291', '291', '291', 'airtel_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 1.5GB SME (1 Days)', 430, 474, 474, 452, 443, 'nifex_airtel_292', '292', '292', '292', 'airtel_sme', 'nifex', 'SME', '1 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 2GB SME (2 Days)', 592, 652, 652, 622, 610, 'nifex_airtel_293', '293', '293', '293', 'airtel_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 3GB SME (2 Days)', 735, 809, 809, 772, 758, 'nifex_airtel_294', '294', '294', '294', 'airtel_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 4GB SME (7 Days)', 1486, 1635, 1635, 1561, 1531, 'nifex_airtel_295', '295', '295', '295', 'airtel_sme', 'nifex', 'SME', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 6GB SME (2 Days)', 1475, 1623, 1623, 1549, 1520, 'nifex_airtel_296', '296', '296', '296', 'airtel_sme', 'nifex', 'SME', '2 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 8GB SME (7 Days)', 2460, 2706, 2706, 2583, 2534, 'nifex_airtel_297', '297', '297', '297', 'airtel_sme', 'nifex', 'SME', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 10GB SME (7 Days)', 2971, 3269, 3269, 3120, 3061, 'nifex_airtel_298', '298', '298', '298', 'airtel_sme', 'nifex', 'SME', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 10GB SME (30 Days)', 3400, 3741, 3741, 3570, 3502, 'nifex_airtel_299', '299', '299', '299', 'airtel_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 1GB GIFTING (7 Days)', 785, 864, 864, 825, 809, 'nifex_airtel_300', '300', '300', '300', 'airtel_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 2GB GIFTING (30 Days)', 1487, 1636, 1636, 1562, 1532, 'nifex_airtel_301', '301', '301', '301', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 3GB GIFTING (30 Days)', 1974, 2172, 2172, 2073, 2034, 'nifex_airtel_302', '302', '302', '302', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 4GB GIFTING (7 Days)', 1486, 1635, 1635, 1561, 1531, 'nifex_airtel_303', '303', '303', '303', 'airtel_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 6GB GIFTING (7 Days)', 1965, 2162, 2162, 2064, 2024, 'nifex_airtel_304', '304', '304', '304', 'airtel_gifting', 'nifex', 'GIFTING', '7 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 13GB SME (30 Days)', 4900, 5390, 5390, 5145, 5047, 'nifex_airtel_305', '305', '305', '305', 'airtel_sme', 'nifex', 'SME', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 18GB GIFTING (30 Days)', 5880, 6469, 6469, 6174, 6057, 'nifex_airtel_306', '306', '306', '306', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 25GB GIFTING (30 Days)', 7868, 8655, 8655, 8262, 8105, 'nifex_airtel_307', '307', '307', '307', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 35GB GIFTING (30 Days)', 9800, 10780, 10780, 10290, 10094, 'nifex_airtel_308', '308', '308', '308', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 60GB GIFTING (30 Days)', 14720, 16193, 16193, 15456, 15162, 'nifex_airtel_309', '309', '309', '309', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 160GB GIFTING (30 Days)', 29300, 32231, 32231, 30765, 30179, 'nifex_airtel_310', '310', '310', '310', 'airtel_gifting', 'nifex', 'GIFTING', '30 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 300GB GIFTING (90 Days)', 48850, 53736, 53736, 51293, 50316, 'nifex_airtel_311', '311', '311', '311', 'airtel_gifting', 'nifex', 'GIFTING', '90 Days', true, NOW()),
  ('data', 'AIRTEL', 'AIRTEL', 'AIRTEL 350GB GIFTING (120 Days)', 58900, 64791, 64791, 61845, 60667, 'nifex_airtel_312', '312', '312', '312', 'airtel_gifting', 'nifex', 'GIFTING', '120 Days', true, NOW())
ON CONFLICT (bigisub_identifier_id) DO UPDATE SET
    item_name = EXCLUDED.item_name,
    cost_price = EXCLUDED.cost_price,
    selling_price = EXCLUDED.selling_price,
    retail_price = EXCLUDED.retail_price,
    agent_price = EXCLUDED.agent_price,
    reseller_price = EXCLUDED.reseller_price,
    mozosubz_plan_id = EXCLUDED.mozosubz_plan_id,
    mozosubs_plan_id = EXCLUDED.mozosubs_plan_id,
    mozosubz_service = EXCLUDED.mozosubz_service,
    provider = EXCLUDED.provider,
    plan_category = EXCLUDED.plan_category,
    validity_days = EXCLUDED.validity_days,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();