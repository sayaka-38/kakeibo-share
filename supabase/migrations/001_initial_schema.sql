-- Kakeibo Share - Initial Schema
-- Based on docs/design.md

-- ============================================
-- 1. profiles (ユーザープロフィール)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT CHECK (char_length(display_name) <= 30),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. categories (カテゴリ)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) <= 50),
  icon TEXT,
  color TEXT,
  group_id UUID, -- NULL = デフォルトカテゴリ
  is_default BOOLEAN NOT NULL DEFAULT false
);

-- ============================================
-- 3. groups (グループ)
-- ============================================
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) <= 50),
  description TEXT CHECK (char_length(description) <= 200),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. group_members (グループメンバー)
-- ============================================
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- ============================================
-- 5. payments (支払い)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES profiles(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  description TEXT NOT NULL CHECK (char_length(description) <= 100),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL CHECK (payment_date <= CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 6. payment_splits (割り勘)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  UNIQUE(payment_id, user_id)
);

-- ============================================
-- 7. settlements (清算記録)
-- ============================================
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES profiles(id),
  to_user UUID NOT NULL REFERENCES profiles(id),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 8. demo_sessions (デモセッション)
-- ============================================
CREATE TABLE IF NOT EXISTS demo_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for demo session cleanup
CREATE INDEX IF NOT EXISTS idx_demo_sessions_expires_at ON demo_sessions(expires_at);

-- ============================================
-- Default Categories (デフォルトカテゴリ)
-- ============================================
INSERT INTO categories (name, icon, is_default) VALUES
  ('食費・日用品', '🛒', true),
  ('光熱費', '💡', true),
  ('家賃', '🏠', true),
  ('通信費', '📱', true),
  ('交通費', '🚃', true),
  ('娯楽費', '🎮', true),
  ('医療費', '🏥', true),
  ('その他', '📦', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- RLS (Row Level Security) - Enable
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies - profiles
-- ============================================
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- RLS Policies - groups
-- ============================================
CREATE POLICY "groups_select_member" ON groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "groups_insert_authenticated" ON groups
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "groups_update_owner" ON groups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'owner'
    )
  );

CREATE POLICY "groups_delete_owner" ON groups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = groups.id
      AND group_members.user_id = auth.uid()
      AND group_members.role = 'owner'
    )
  );

-- ============================================
-- RLS Policies - group_members
-- ============================================
CREATE POLICY "group_members_select_member" ON group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "group_members_insert_owner" ON group_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
    OR auth.uid() = user_id -- Allow self-insert for new groups
  );

CREATE POLICY "group_members_delete_owner_or_self" ON group_members
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
  );

-- ============================================
-- RLS Policies - payments
-- ============================================
CREATE POLICY "payments_select_member" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = payments.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_insert_member" ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = payments.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "payments_update_payer" ON payments
  FOR UPDATE USING (paid_by = auth.uid());

CREATE POLICY "payments_delete_payer" ON payments
  FOR DELETE USING (paid_by = auth.uid());

-- ============================================
-- RLS Policies - payment_splits
-- ============================================
CREATE POLICY "payment_splits_select_member" ON payment_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM payments
      JOIN group_members ON group_members.group_id = payments.group_id
      WHERE payments.id = payment_splits.payment_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_splits_insert_member" ON payment_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM payments
      JOIN group_members ON group_members.group_id = payments.group_id
      WHERE payments.id = payment_splits.payment_id
      AND group_members.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies - settlements
-- ============================================
CREATE POLICY "settlements_select_member" ON settlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = settlements.group_id
      AND group_members.user_id = auth.uid()
    )
  );

CREATE POLICY "settlements_insert_member" ON settlements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = settlements.group_id
      AND group_members.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies - demo_sessions
-- ============================================
CREATE POLICY "demo_sessions_select_own" ON demo_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "demo_sessions_insert_own" ON demo_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "demo_sessions_delete_own" ON demo_sessions
  FOR DELETE USING (user_id = auth.uid());
