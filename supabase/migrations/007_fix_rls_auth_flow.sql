-- ============================================
-- Migration 007: RLS 無限再帰 + 認証フロー修正
-- ============================================
--
-- 問題:
--   1. group_members SELECT ポリシーが同テーブルを自己参照 → PostgreSQL 無限再帰
--   2. groups SELECT が group_members を参照 → 上記の再帰に巻き込まれる
--   3. profiles SELECT (group_members 版) も同様に巻き込まれる
--   4. demo_sessions SELECT に expires_at > now() 制約 → 期限切れ参照不可
--
-- 根本原因 (migration 006):
--   group_members_select_member ポリシーが
--   EXISTS (SELECT 1 FROM group_members gm WHERE ...) と自テーブルを参照
--   → RLS が再帰的に適用され、PostgreSQL が無限再帰を検出してエラー
--
-- 修正戦略: SECURITY DEFINER ヘルパー関数
--   RLS をバイパスする関数で group_members を直接参照し、再帰チェーンを断ち切る
--
-- ============================================


-- ============================================
-- 0. SECURITY DEFINER ヘルパー関数
-- ============================================
--
-- これらの関数は postgres ロール権限で実行されるため、RLS をバイパスする。
-- ポリシー内から呼び出すことで、自己参照による無限再帰を回避する。
--
-- セキュリティ考慮:
--   - search_path を明示的に設定し、スキーマ汚染攻撃を防止
--   - STABLE: 同一トランザクション内で同じ入力に対し同じ結果を返す
--   - 関数は bool を返すのみで、データ漏洩リスクなし
--

-- is_group_member: 指定ユーザーが指定グループのメンバーかチェック
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = _group_id
    AND user_id = _user_id
  );
$$;

-- is_group_owner: 指定ユーザーが指定グループのオーナーかチェック
CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = _group_id
    AND owner_id = _user_id
  );
$$;


-- ============================================
-- 1. group_members テーブル: ポリシー再構築
-- ============================================

-- 既存ポリシーを全て削除（冪等）
DROP POLICY IF EXISTS "group_members_select_member" ON group_members;
DROP POLICY IF EXISTS "group_members_insert_owner" ON group_members;
DROP POLICY IF EXISTS "group_members_insert_policy" ON group_members;
DROP POLICY IF EXISTS "group_members_delete_owner_or_self" ON group_members;
DROP POLICY IF EXISTS "group_members_delete_policy" ON group_members;
-- schema.sql 由来の可能性がある名前も削除
DROP POLICY IF EXISTS "Members can view group members" ON group_members;
DROP POLICY IF EXISTS "Group owner can manage members" ON group_members;

-- SELECT: 同じグループのメンバーのみ
--
-- 修正前: EXISTS (SELECT 1 FROM group_members gm ...) ← 自テーブル = 無限再帰
-- 修正後: is_group_member() SECURITY DEFINER 関数 ← RLS バイパスで再帰回避
--
CREATE POLICY "group_members_select_member" ON group_members
FOR SELECT USING (
  is_group_member(group_id, auth.uid())
);

-- INSERT: オーナーによる追加 OR 自分自身の追加（招待参加）
--
-- user_id = auth.uid() で自分自身の追加を許可（新規グループ作成時・招待参加時）
-- is_group_owner() でオーナーが他メンバーを追加可能
--
CREATE POLICY "group_members_insert_policy" ON group_members
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR is_group_owner(group_id, auth.uid())
  )
);

-- DELETE: 本人による脱退 OR オーナーによる削除
CREATE POLICY "group_members_delete_policy" ON group_members
FOR DELETE USING (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR is_group_owner(group_id, auth.uid())
  )
);


-- ============================================
-- 2. groups テーブル: ポリシー再構築
-- ============================================

-- 既存ポリシーを全て削除（冪等）
DROP POLICY IF EXISTS "groups_select_member" ON groups;
DROP POLICY IF EXISTS "groups_insert_authenticated" ON groups;
DROP POLICY IF EXISTS "groups_update_owner" ON groups;
DROP POLICY IF EXISTS "groups_delete_owner" ON groups;
-- schema.sql 由来の可能性がある名前も削除
DROP POLICY IF EXISTS "Authenticated users can create groups" ON groups;
DROP POLICY IF EXISTS "Members can view their groups" ON groups;
DROP POLICY IF EXISTS "Group owner can update group" ON groups;
DROP POLICY IF EXISTS "Group owner can delete group" ON groups;

-- SELECT: オーナー OR メンバー
--
-- 修正前: EXISTS (SELECT 1 FROM group_members ...) ← group_members RLS で再帰
-- 修正後: owner_id = auth.uid() OR is_group_member() ← 再帰回避
--
-- owner_id チェックを先に評価することで:
-- - グループ作成直後（group_members INSERT 前）でもオーナーがグループを参照可能
-- - PostgreSQL の OR 短絡評価で、オーナーの場合は is_group_member() を呼ばない
--
CREATE POLICY "groups_select_member" ON groups
FOR SELECT USING (
  owner_id = auth.uid()
  OR is_group_member(id, auth.uid())
);

-- INSERT: 認証済みユーザーで owner_id が自分自身の場合のみ
CREATE POLICY "groups_insert_authenticated" ON groups
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND owner_id = auth.uid()
);

-- UPDATE: オーナーのみ
CREATE POLICY "groups_update_owner" ON groups
FOR UPDATE USING (
  owner_id = auth.uid()
);

-- DELETE: オーナーのみ
CREATE POLICY "groups_delete_owner" ON groups
FOR DELETE USING (
  owner_id = auth.uid()
);


-- ============================================
-- 3. profiles テーブル: ポリシー再構築
-- ============================================

-- 既存ポリシーを全て削除
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
-- 新ポリシー名も冪等に削除（再実行対応）
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_group_members" ON profiles;

-- SELECT (1/2): 自分自身のプロフィール
--
-- 認証フロー最重要パス。Protected Layout で毎回呼ばれる:
--   const { data: profile } = await supabase
--     .from("profiles").select("*").eq("id", user.id).single();
--
-- group_members に依存しない単純条件にすることで:
-- - cross-table RLS の影響を受けない
-- - グループ未参加の新規ユーザーでも必ず自分のプロフィールを取得できる
-- - 匿名認証（デモ）ユーザーも auth.uid() が設定されるため動作する
--
CREATE POLICY "profiles_select_own" ON profiles
FOR SELECT USING (
  id = auth.uid()
);

-- SELECT (2/2): 同一グループメンバーのプロフィール
--
-- 修正前: group_members を直接サブクエリ → group_members の RLS 再帰に巻き込まれる
-- 修正後: is_group_member() SECURITY DEFINER 関数 → 再帰回避
--
-- PostgreSQL は同一テーブル・同一操作の permissive ポリシーを OR で結合するため、
-- profiles_select_own とは独立して評価される。
--
CREATE POLICY "profiles_select_group_members" ON profiles
FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = profiles.id
    AND is_group_member(gm.group_id, auth.uid())
  )
);

-- INSERT: 自分自身のプロフィールのみ
CREATE POLICY "profiles_insert_policy" ON profiles
FOR INSERT WITH CHECK (
  id = auth.uid()
);

-- UPDATE: 自分自身のプロフィールのみ
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE USING (
  id = auth.uid()
);

-- DELETE: 誰も削除不可
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE USING (false);


-- ============================================
-- 4. demo_sessions テーブル: ポリシー再構築
-- ============================================

-- 既存ポリシーを全て削除
DROP POLICY IF EXISTS "demo_sessions_select_own" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_insert_own" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_delete_own" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_select_policy" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_insert_policy" ON demo_sessions;
DROP POLICY IF EXISTS "demo_sessions_delete_policy" ON demo_sessions;

-- SELECT: 自分のセッション（有効期限チェックなし）
CREATE POLICY "demo_sessions_select_policy" ON demo_sessions
FOR SELECT USING (
  user_id = auth.uid()
);

-- INSERT: 自分のセッションのみ
CREATE POLICY "demo_sessions_insert_policy" ON demo_sessions
FOR INSERT WITH CHECK (
  user_id = auth.uid()
);

-- DELETE: 自分のセッションのみ
CREATE POLICY "demo_sessions_delete_policy" ON demo_sessions
FOR DELETE USING (
  user_id = auth.uid()
);


-- ============================================
-- 5. handle_new_user トリガー（冪等に再作成）
-- ============================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. ヘルパー関数の確認:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc
--    WHERE proname IN ('is_group_member', 'is_group_owner');
--
--    期待: prosecdef = true (SECURITY DEFINER), provolatile = 's' (STABLE)
--
-- 2. ポリシー一覧:
--    SELECT tablename, policyname, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('group_members', 'groups', 'profiles', 'demo_sessions')
--    ORDER BY tablename, policyname;
--
-- 3. 無限再帰テスト:
--    SET ROLE authenticated;
--    SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000"}';
--    SELECT * FROM group_members LIMIT 1;  -- 再帰エラーが出なければ修正成功
--    RESET ROLE;
--
