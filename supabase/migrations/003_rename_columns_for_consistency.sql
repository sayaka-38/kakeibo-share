-- ============================================
-- スキーマ整合性マイグレーション
--
-- 注意: owner_id, payer_id は既にDBに存在するため
-- カラムリネームはスキップし、追加項目のみ実行
-- ============================================

-- カラム名変更は既に適用済みのためスキップ
-- ALTER TABLE groups RENAME COLUMN created_by TO owner_id;
-- ALTER TABLE payments RENAME COLUMN paid_by TO payer_id;

-- ============================================
-- 3. profiles テーブル: is_demo カラム追加
-- デモユーザーを識別するためのフラグ
-- ============================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- is_demoフラグのインデックス（デモデータのクリーンアップに使用）
CREATE INDEX IF NOT EXISTS idx_profiles_is_demo ON profiles(is_demo) WHERE is_demo = true;

-- ============================================
-- 4. calculate_user_balance 関数の更新
-- paid_by → payer_id に対応
-- ============================================
CREATE OR REPLACE FUNCTION calculate_user_balance(p_group_id UUID, p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_paid DECIMAL;
  total_owed DECIMAL;
BEGIN
  -- Total amount paid by user (payer_id に更新)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments
  WHERE group_id = p_group_id AND payer_id = p_user_id;

  -- Total amount user owes (from splits)
  SELECT COALESCE(SUM(ps.amount), 0) INTO total_owed
  FROM payment_splits ps
  JOIN payments p ON ps.payment_id = p.id
  WHERE p.group_id = p_group_id AND ps.user_id = p_user_id;

  RETURN total_paid - total_owed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. demo_sessions RLSポリシー（既存確認）
-- ============================================
-- 既存のポリシーは維持（変更なし）

-- ============================================
-- コメント: 変更のサマリ
-- ============================================
COMMENT ON COLUMN groups.owner_id IS 'グループのオーナー（旧created_by）';
COMMENT ON COLUMN payments.payer_id IS '支払いを行ったユーザー（旧paid_by）';
COMMENT ON COLUMN profiles.is_demo IS 'デモユーザーフラグ（true=デモ、false=本番）';
