-- ============================================
-- Migration 034: カテゴリカラー導入 + RLS 拡充
-- ============================================
-- 1. デフォルトカテゴリをカラー付きに置換（本番未使用のため安全）
-- 2. group_id に FK 制約追加
-- 3. INSERT / UPDATE / DELETE の RLS ポリシー追加
-- 4. create_demo_bot_partner RPC を新カテゴリ名に合わせて更新

-- ============================================
-- 1. デフォルトカテゴリ置換
-- ============================================
-- payments.category_id の FK は ON DELETE SET NULL なので、
-- 既存支払いの category_id は NULL になる（本番未使用のため影響なし）
DELETE FROM categories WHERE is_default = true;

INSERT INTO categories (name, icon, color, is_default) VALUES
  ('食費',   '🍔', '#C75000', true),
  ('光熱費', '💡', '#1A5276', true),
  ('日用品', '🧻', '#0E7C7B', true),
  ('家賃',   '🏠', '#1B2A4A', true),
  ('通信費', '📱', '#5B2C8A', true),
  ('交際費', '🍻', '#9B2335', true),
  ('その他', '📦', '#2F3E46', true);

-- ============================================
-- 2. group_id FK 制約追加
-- ============================================
ALTER TABLE categories
  ADD CONSTRAINT categories_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

-- ============================================
-- 3. RLS ポリシー（INSERT / UPDATE / DELETE）
-- ============================================
-- INSERT: カスタムカテゴリのみ（group_id 必須 + グループメンバーチェック）
CREATE POLICY "categories_insert_member" ON categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = categories.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- UPDATE: カスタムカテゴリのみ（is_default = false + グループメンバーチェック）
CREATE POLICY "categories_update_member" ON categories
  FOR UPDATE
  TO authenticated
  USING (
    is_default = false
    AND group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = categories.group_id
        AND group_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_default = false
    AND group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = categories.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- DELETE: カスタムカテゴリのみ（is_default = false + グループメンバーチェック）
CREATE POLICY "categories_delete_member" ON categories
  FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = categories.group_id
        AND group_members.user_id = auth.uid()
    )
  );

-- ============================================
-- 4. create_demo_bot_partner RPC 更新
-- ============================================
-- カテゴリ名変更: 食費・日用品 → 食費, 娯楽費 → 交際費, 交通費 → 日用品
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
  v_daily_cat_id UUID;
  v_socializing_cat_id UUID;
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
  FROM categories WHERE name = '食費' AND is_default = true LIMIT 1;

  SELECT id INTO v_utilities_cat_id
  FROM categories WHERE name = '光熱費' AND is_default = true LIMIT 1;

  SELECT id INTO v_daily_cat_id
  FROM categories WHERE name = '日用品' AND is_default = true LIMIT 1;

  SELECT id INTO v_socializing_cat_id
  FROM categories WHERE name = '交際費' AND is_default = true LIMIT 1;

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
  VALUES (p_group_id, v_bot_id, 1860, 'ドラッグストアで日用品', v_daily_cat_id, v_today - 2)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 930),
    (v_payment_id, p_demo_user_id, 930);

  -- Payment 4: カフェでランチ（昨日）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 3200, 'カフェでランチ 🍰', v_socializing_cat_id, v_today - 1)
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
