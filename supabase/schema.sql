-- =============================================
-- Kakeibo Share - Database Schema
-- =============================================
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- =============================================
-- Stores user profile information (synced with auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- GROUPS TABLE
-- =============================================
-- Stores household/share groups
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- =============================================
-- GROUP MEMBERS TABLE
-- =============================================
-- Stores group membership
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(group_id, user_id)
);

-- Enable RLS
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Policies for groups (users can only see groups they belong to)
CREATE POLICY "Users can view their groups" ON groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group owners can update their groups" ON groups
  FOR UPDATE USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Group owners can delete their groups" ON groups
  FOR DELETE USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Policies for group_members
CREATE POLICY "Users can view members of their groups" ON group_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Group owners can add members" ON group_members
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid() AND role = 'owner')
    OR (user_id = auth.uid() AND role = 'owner') -- Allow user to add themselves as owner when creating group
  );

CREATE POLICY "Group owners can remove members" ON group_members
  FOR DELETE USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid() AND role = 'owner')
    OR user_id = auth.uid() -- Users can leave groups
  );

-- =============================================
-- CATEGORIES TABLE
-- =============================================
-- Stores payment categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false NOT NULL
);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policies for categories
CREATE POLICY "Users can view default and group categories" ON categories
  FOR SELECT USING (
    is_default = true
    OR group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Group members can create categories" ON categories
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Insert default categories
INSERT INTO categories (name, icon, is_default) VALUES
  ('Food & Groceries', 'shopping-cart', true),
  ('Utilities', 'zap', true),
  ('Rent', 'home', true),
  ('Internet & Phone', 'wifi', true),
  ('Transportation', 'car', true),
  ('Entertainment', 'tv', true),
  ('Healthcare', 'heart', true),
  ('Other', 'more-horizontal', true);

-- =============================================
-- PAYMENTS TABLE
-- =============================================
-- Stores payment records
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  paid_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policies for payments
CREATE POLICY "Users can view payments in their groups" ON payments
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Group members can create payments" ON payments
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update their own payments" ON payments
  FOR UPDATE USING (paid_by = auth.uid());

CREATE POLICY "Users can delete their own payments" ON payments
  FOR DELETE USING (paid_by = auth.uid());

-- =============================================
-- PAYMENT SPLITS TABLE
-- =============================================
-- Stores how payments are split among members
CREATE TABLE payment_splits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
  UNIQUE(payment_id, user_id)
);

-- Enable RLS
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;

-- Policies for payment_splits
CREATE POLICY "Users can view splits in their groups" ON payment_splits
  FOR SELECT USING (
    payment_id IN (
      SELECT id FROM payments WHERE group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Payment creators can manage splits" ON payment_splits
  FOR ALL USING (
    payment_id IN (SELECT id FROM payments WHERE paid_by = auth.uid())
  );

-- =============================================
-- SETTLEMENTS TABLE
-- =============================================
-- Stores settlement records
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
  from_user UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  to_user UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- Policies for settlements
CREATE POLICY "Users can view settlements in their groups" ON settlements
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Group members can create settlements" ON settlements
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Involved users can update settlements" ON settlements
  FOR UPDATE USING (from_user = auth.uid() OR to_user = auth.uid());

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Function to calculate balance for a user in a group
CREATE OR REPLACE FUNCTION calculate_user_balance(p_group_id UUID, p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_paid DECIMAL;
  total_owed DECIMAL;
BEGIN
  -- Total amount paid by user
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments
  WHERE group_id = p_group_id AND paid_by = p_user_id;

  -- Total amount user owes (from splits)
  SELECT COALESCE(SUM(ps.amount), 0) INTO total_owed
  FROM payment_splits ps
  JOIN payments p ON ps.payment_id = p.id
  WHERE p.group_id = p_group_id AND ps.user_id = p_user_id;

  RETURN total_paid - total_owed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
