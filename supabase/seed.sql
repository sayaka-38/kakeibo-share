-- ==============================================
-- Kakeibo Share - Seed Data
-- ==============================================
-- テスト・E2E用の基盤データ。
-- auth.users INSERT → handle_new_user() トリガーで profiles 自動作成。
-- デフォルトカテゴリは migration 001 で挿入済み。

-- ============================================
-- 1. テストユーザー (auth.users)
-- ============================================
-- handle_new_user() トリガーが profiles を自動作成する

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'alice@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Alice"}',
  now(), now(), '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'bob@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Bob"}',
  now(), now(), '', '', '', ''
);

-- identities (Supabase Auth が要求)
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'email', 'alice@example.com'),
  'email', now(), now(), now()
), (
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  jsonb_build_object('sub', 'b2222222-2222-2222-2222-222222222222', 'email', 'bob@example.com'),
  'email', now(), now(), now()
);

-- ============================================
-- 2. テストグループ
-- ============================================
INSERT INTO groups (id, name, description, owner_id) VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'テスト共同生活',
  'Alice と Bob のテスト用グループ',
  'a1111111-1111-1111-1111-111111111111'
);

-- ============================================
-- 3. グループメンバー
-- ============================================
INSERT INTO group_members (group_id, user_id, role) VALUES
  ('c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'owner'),
  ('c3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222', 'member');

-- ============================================
-- 4. サンプル支払い + splits
-- ============================================
-- カテゴリ参照: デフォルトカテゴリは名前で検索
-- Alice: 食費 3000円 (折半 → 各1500円)
INSERT INTO payments (id, group_id, payer_id, amount, description, category_id, payment_date) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'c3333333-3333-3333-3333-333333333333',
  'a1111111-1111-1111-1111-111111111111',
  3000,
  'スーパーで買い物',
  (SELECT id FROM categories WHERE name = '食費・日用品' AND is_default = true LIMIT 1),
  CURRENT_DATE
);

INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
  ('d4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 1500),
  ('d4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 1500);

-- Bob: 光熱費 8000円 (折半 → 各4000円)
INSERT INTO payments (id, group_id, payer_id, amount, description, category_id, payment_date) VALUES (
  'e5555555-5555-5555-5555-555555555555',
  'c3333333-3333-3333-3333-333333333333',
  'b2222222-2222-2222-2222-222222222222',
  8000,
  '電気代 1月分',
  (SELECT id FROM categories WHERE name = '光熱費' AND is_default = true LIMIT 1),
  CURRENT_DATE
);

INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
  ('e5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 4000),
  ('e5555555-5555-5555-5555-555555555555', 'b2222222-2222-2222-2222-222222222222', 4000);

-- 清算結果:
-- Alice: 立替3000 - 負担(1500+4000) = -2500 (Alice が Bob に 2500円支払い)
-- Bob:   立替8000 - 負担(1500+4000) = +2500 (Bob が 2500円受け取り)
