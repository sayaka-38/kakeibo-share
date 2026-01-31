-- ============================================
-- groups テーブルに invite_code カラムを追加
-- ============================================

-- invite_code カラムを追加（ユニーク制約付き）
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- 既存のグループに招待コードを生成
UPDATE groups SET invite_code = encode(gen_random_bytes(6), 'hex')
WHERE invite_code IS NULL;

-- invite_code を NOT NULL に変更
ALTER TABLE groups ALTER COLUMN invite_code SET NOT NULL;

-- デフォルト値を設定（新規グループ作成時に自動生成）
ALTER TABLE groups ALTER COLUMN invite_code SET DEFAULT encode(gen_random_bytes(6), 'hex');

-- インデックスを追加（招待コード検索の高速化）
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);

-- ============================================
-- RLS ポリシーの更新
-- 招待コードでグループ情報を取得できるように
-- ============================================

-- 招待コードでのグループ情報取得を許可するポリシー
-- （認証済みユーザーなら招待コードでグループを参照可能）
CREATE POLICY "groups_select_by_invite_code" ON groups
  FOR SELECT USING (
    auth.uid() IS NOT NULL
  );

-- group_members の INSERT ポリシーを更新
-- 招待コード経由での自己参加を許可
DROP POLICY IF EXISTS "group_members_insert_owner" ON group_members;

CREATE POLICY "group_members_insert_owner_or_self_join" ON group_members
  FOR INSERT WITH CHECK (
    -- オーナーによるメンバー追加
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'owner'
    )
    -- 自分自身をメンバーとして追加（新規グループ作成時 & 招待リンク経由）
    OR auth.uid() = user_id
  );
