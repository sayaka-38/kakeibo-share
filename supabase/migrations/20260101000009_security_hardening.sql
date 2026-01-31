-- ============================================
-- Migration 009: Security Hardening
-- ============================================
-- Supabase Security Advisor の 7 つの警告を解消する
--
-- 修正内容:
--   1. handle_new_user() に SET search_path = public を追加
--   2. categories テーブルに RLS を有効化 + ポリシー追加
--   3. 5 テーブルに anon ロール拒否の RESTRICTIVE ポリシーを追加
--      (categories, profiles, groups, group_members, demo_sessions)
--
-- 注意:
--   - デモユーザーは signUpAnonymously() で authenticated ロールを
--     取得するため、anon 拒否の影響を受けない
--   - payments, payment_splits, settlements は Migration 008 で
--     is_group_member() 経由の auth.uid() チェックが入っており
--     Security Advisor の警告対象外
-- ============================================


-- ============================================
-- 1. handle_new_user(): search_path 修正
-- ============================================
-- SECURITY DEFINER 関数は search_path を固定しないと
-- 悪意あるスキーマを挿入するスキーマ汚染攻撃のリスクがある
--
-- 修正前: $$ LANGUAGE plpgsql SECURITY DEFINER;
-- 修正後: $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- 2. categories テーブル: RLS 有効化 + ポリシー
-- ============================================
-- categories は Migration 001 で作成されたが、
-- ALTER TABLE categories ENABLE ROW LEVEL SECURITY が漏れていた。
-- これにより全ロール（anon 含む）がフルアクセス可能な状態だった。

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーはカテゴリを参照可能（デフォルト + グループ用）
CREATE POLICY "categories_select_authenticated" ON categories
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT / UPDATE / DELETE は明示的ポリシーなし = 暗黙拒否
-- カテゴリの追加・変更はマイグレーション経由のみ


-- ============================================
-- 3. anon ロール RESTRICTIVE 拒否ポリシー
-- ============================================
-- Supabase の anon ロールは未認証リクエストに使用される。
-- RESTRICTIVE ポリシーは PERMISSIVE ポリシーとの AND 評価になるため、
-- 将来 PERMISSIVE ポリシーが誤って追加されても anon は拒否される。
--
-- 参考: PostgreSQL の RLS 評価ルール
--   最終判定 = (いずれかの PERMISSIVE が true) AND (すべての RESTRICTIVE が true)
--   RESTRICTIVE が false → 常に拒否

-- 3-1. categories
CREATE POLICY "categories_deny_anon" ON categories
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3-2. profiles
CREATE POLICY "profiles_deny_anon" ON profiles
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3-3. groups
CREATE POLICY "groups_deny_anon" ON groups
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3-4. group_members
CREATE POLICY "group_members_deny_anon" ON group_members
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3-5. demo_sessions
CREATE POLICY "demo_sessions_deny_anon" ON demo_sessions
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);


-- ============================================
-- 適用後の検証クエリ
-- ============================================
--
-- 1. handle_new_user の search_path 確認:
--    SELECT proname, proconfig
--    FROM pg_proc
--    WHERE proname = 'handle_new_user';
--    -- 期待: proconfig = '{search_path=public}'
--
-- 2. categories の RLS 有効確認:
--    SELECT relname, relrowsecurity
--    FROM pg_class
--    WHERE relname = 'categories';
--    -- 期待: relrowsecurity = true
--
-- 3. RESTRICTIVE ポリシー一覧:
--    SELECT tablename, policyname, permissive, roles, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND policyname LIKE '%deny_anon%'
--    ORDER BY tablename;
--    -- 期待: 5 行、すべて permissive = 'RESTRICTIVE', roles = '{anon}'
--
-- 4. 全ポリシー一覧（最終確認）:
--    SELECT tablename, policyname, permissive, roles, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
