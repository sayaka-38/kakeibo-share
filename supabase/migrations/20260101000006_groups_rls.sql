-- Phase 5-4: groups + group_members テーブル RLS 強化
--
-- 変更点:
-- 1. groups: owner_id を使用した直接的なオーナー判定
-- 2. group_members: 招待参加（自分自身の追加）を明確に許可
-- 3. セキュリティ強化: メンバー以外のグループ情報を完全に隠蔽
--
-- 注意: 招待コードでのグループ検索は API Route で service role を使用
--       RLS はメンバーのみに厳格に制限

-- ============================================
-- groups テーブル RLS ポリシー
-- ============================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "groups_select_member" ON groups;
DROP POLICY IF EXISTS "groups_insert_authenticated" ON groups;
DROP POLICY IF EXISTS "groups_update_owner" ON groups;
DROP POLICY IF EXISTS "groups_delete_owner" ON groups;

-- SELECT: グループメンバーのみ
-- 招待コード検索は API Route で service role を使用するため、ここでは厳格に制限
CREATE POLICY "groups_select_member" ON groups
FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = groups.id
    AND group_members.user_id = auth.uid()
  )
);

-- INSERT: 認証済みユーザーで owner_id が自分自身の場合のみ
CREATE POLICY "groups_insert_authenticated" ON groups
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND owner_id = auth.uid()
);

-- UPDATE: オーナーのみ（owner_id で直接判定）
CREATE POLICY "groups_update_owner" ON groups
FOR UPDATE USING (
  owner_id = auth.uid()
);

-- DELETE: オーナーのみ（owner_id で直接判定）
CREATE POLICY "groups_delete_owner" ON groups
FOR DELETE USING (
  owner_id = auth.uid()
);

-- ============================================
-- group_members テーブル RLS ポリシー
-- ============================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "group_members_select_member" ON group_members;
DROP POLICY IF EXISTS "group_members_insert_owner" ON group_members;
DROP POLICY IF EXISTS "group_members_delete_owner_or_self" ON group_members;

-- SELECT: 同じグループのメンバーのみ
CREATE POLICY "group_members_select_member" ON group_members
FOR SELECT USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id
    AND gm.user_id = auth.uid()
  )
);

-- INSERT: オーナーによる追加 OR 自分自身の追加（招待参加）
-- 招待参加: API Route で招待コードを検証後、自分自身を追加
CREATE POLICY "group_members_insert_policy" ON group_members
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    -- オーナーが他のメンバーを追加
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.owner_id = auth.uid()
    )
    -- 自分自身を追加（新規グループ作成時 or 招待参加時）
    OR user_id = auth.uid()
  )
);

-- DELETE: オーナーによる削除 OR 本人による脱退
CREATE POLICY "group_members_delete_policy" ON group_members
FOR DELETE USING (
  auth.uid() IS NOT NULL
  AND (
    -- 本人による脱退
    user_id = auth.uid()
    -- オーナーによる削除
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = group_members.group_id
      AND groups.owner_id = auth.uid()
    )
  )
);

-- ============================================
-- インデックス（パフォーマンス最適化）
-- ============================================

-- group_members の検索を高速化
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);

-- groups の owner_id 検索を高速化
CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id);
