-- ============================================
-- Migration 025: Demo Bot Partner RPC
-- デモ体験用のBotパートナーを作成し、サンプル支払いを生成する
-- ============================================

CREATE OR REPLACE FUNCTION create_demo_bot_partner(
  p_group_id UUID,
  p_demo_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bot_id UUID := gen_random_uuid();
  v_instance_id UUID;
  v_today DATE := CURRENT_DATE;
  v_payment_id UUID;
  v_food_cat_id UUID;
  v_utilities_cat_id UUID;
  v_transport_cat_id UUID;
  v_entertainment_cat_id UUID;
BEGIN
  -- Validate: caller must be the demo user
  IF auth.uid() IS DISTINCT FROM p_demo_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the demo user';
  END IF;

  -- Get instance_id from existing demo user
  SELECT instance_id INTO v_instance_id
  FROM auth.users WHERE id = p_demo_user_id;

  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION 'Demo user not found in auth.users';
  END IF;

  -- 1. Create auth.users entry for bot (anonymous user)
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_anonymous
  ) VALUES (
    v_instance_id, v_bot_id, 'authenticated', 'authenticated',
    '', now(), now(), now(),
    '{"provider": "anonymous", "providers": ["anonymous"]}'::jsonb,
    '{}'::jsonb,
    true
  );

  -- 2. Update auto-created profile (trigger) or insert if needed
  UPDATE profiles
  SET display_name = 'さくら（パートナー）', is_demo = true
  WHERE id = v_bot_id;

  IF NOT FOUND THEN
    INSERT INTO profiles (id, display_name, is_demo)
    VALUES (v_bot_id, 'さくら（パートナー）', true);
  END IF;

  -- 3. Add bot to group as member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (p_group_id, v_bot_id, 'member');

  -- 4. Get default category IDs
  SELECT id INTO v_food_cat_id
  FROM categories WHERE name = '食費・日用品' AND is_default = true LIMIT 1;

  SELECT id INTO v_utilities_cat_id
  FROM categories WHERE name = '光熱費' AND is_default = true LIMIT 1;

  SELECT id INTO v_transport_cat_id
  FROM categories WHERE name = '交通費' AND is_default = true LIMIT 1;

  SELECT id INTO v_entertainment_cat_id
  FROM categories WHERE name = '娯楽費' AND is_default = true LIMIT 1;

  -- 5. Create sample payments from bot (tells a story of shared living)

  -- Payment 1: 電気代（5日前）— 固定費の立替
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 8500, '電気代 1月分', v_utilities_cat_id, v_today - 5)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount, is_paid) VALUES
    (v_payment_id, v_bot_id, 4250, true),
    (v_payment_id, p_demo_user_id, 4250, false);

  -- Payment 2: スーパーで買い物（3日前）— 日常の買い物
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 2480, 'スーパーで買い物', v_food_cat_id, v_today - 3)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount, is_paid) VALUES
    (v_payment_id, v_bot_id, 1240, true),
    (v_payment_id, p_demo_user_id, 1240, false);

  -- Payment 3: ドラッグストア（2日前）— 日用品
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 1860, 'ドラッグストアで日用品', v_food_cat_id, v_today - 2)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount, is_paid) VALUES
    (v_payment_id, v_bot_id, 930, true),
    (v_payment_id, p_demo_user_id, 930, false);

  -- Payment 4: カフェでランチ（昨日）— 一緒にお出かけ
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 3200, 'カフェでランチ 🍰', v_entertainment_cat_id, v_today - 1)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount, is_paid) VALUES
    (v_payment_id, v_bot_id, 1600, true),
    (v_payment_id, p_demo_user_id, 1600, false);

  -- Total: Bot paid ¥16,040, Demo user owes ¥8,020
  -- This creates an immediate reason to explore settlement!

  RETURN jsonb_build_object(
    'bot_id', v_bot_id,
    'bot_name', 'さくら（パートナー）',
    'payments_created', 4
  );
END;
$$;
