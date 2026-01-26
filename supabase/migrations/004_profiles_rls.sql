-- ============================================
-- Phase 5-2: profiles テーブル RLS 設定
-- ============================================
-- 目的: API経由の不正アクセス（なりすまし・名簿抜き取り）をDB層で封鎖
-- ============================================

-- 1. RLS 有効化
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. SELECT ポリシー: 認証済み + (自分自身 OR 同一グループメンバー)
CREATE POLICY "profiles_select_policy" ON profiles
FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()
    OR id IN (
      SELECT gm2.user_id
      FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
    )
  )
);

-- 3. UPDATE ポリシー: 自分自身のみ
CREATE POLICY "profiles_update_policy" ON profiles
FOR UPDATE USING (
  id = auth.uid()
);

-- 4. INSERT ポリシー: 自分自身のみ
CREATE POLICY "profiles_insert_policy" ON profiles
FOR INSERT WITH CHECK (
  id = auth.uid()
);

-- 5. DELETE ポリシー: 誰も削除不可（明示的に拒否）
CREATE POLICY "profiles_delete_policy" ON profiles
FOR DELETE USING (false);
