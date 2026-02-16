-- ============================================
-- Migration 031: RPC カラム参照バグ修正
-- ============================================
-- 1. anonymize_user: gm.created_at → gm.joined_at
--    group_members に created_at は存在しない
-- 2. create_demo_bot_partner: is_paid カラム削除
--    payment_splits に is_paid は存在しない

-- 1. anonymize_user 修正
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 0. 対象ユーザーの存在確認
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN false;
  END IF;

  -- 1. プロフィールを匿名化（行は残す = FK 参照を維持）
  UPDATE profiles
  SET
    display_name = '退会済みユーザー',
    email = NULL,
    avatar_url = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  -- 2. グループオーナー権を委譲
  --    他メンバーがいるグループ: 最古参メンバーに委譲
  UPDATE groups
  SET owner_id = (
    SELECT gm.user_id
    FROM group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id != p_user_id
    ORDER BY gm.joined_at ASC
    LIMIT 1
  )
  WHERE owner_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id != p_user_id
    );

  -- 3. 全グループから退去
  DELETE FROM group_members WHERE user_id = p_user_id;

  -- 4. 固定費ルールの割り勘テンプレートを削除
  DELETE FROM recurring_rule_splits WHERE user_id = p_user_id;

  -- 5. デモセッションを削除
  DELETE FROM demo_sessions WHERE user_id = p_user_id;

  RETURN true;
END;
$$;

-- 2. create_demo_bot_partner 修正 (is_paid 参照を削除)
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

  -- 5. Create sample payments from bot

  -- Payment 1: 電気代（5日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 8500, '電気代 1月分', v_utilities_cat_id, v_today - 5)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 4250),
    (v_payment_id, p_demo_user_id, 4250);

  -- Payment 2: スーパーで買い物（3日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 2480, 'スーパーで買い物', v_food_cat_id, v_today - 3)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 1240),
    (v_payment_id, p_demo_user_id, 1240);

  -- Payment 3: ドラッグストア（2日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 1860, 'ドラッグストアで日用品', v_food_cat_id, v_today - 2)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 930),
    (v_payment_id, p_demo_user_id, 930);

  -- Payment 4: カフェでランチ（昨日）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 3200, 'カフェでランチ 🍰', v_entertainment_cat_id, v_today - 1)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 1600),
    (v_payment_id, p_demo_user_id, 1600);

  RETURN jsonb_build_object(
    'bot_id', v_bot_id,
    'bot_name', 'さくら（パートナー）',
    'payments_created', 4
  );
END;
$$;
