-- ============================================
-- Migration 010: payments DELETE ポリシー拡張
-- ============================================
--
-- 目標:
--   グループオーナーが任意のメンバーの支払いを削除できるようにする。
--   既存の「支払者本人のみ」ポリシーを「支払者本人 OR グループオーナー」に拡張。
--
-- 変更:
--   - payments_delete_payer → payments_delete_payer_or_owner に置換
--   - 条件: payer_id = auth.uid() OR is_group_owner(group_id, auth.uid())
--
-- 依存:
--   - Migration 007: is_group_owner() SECURITY DEFINER 関数
--   - Migration 008: 既存 payments_delete_payer ポリシー
--
-- セキュリティ考慮:
--   - is_group_owner() は SECURITY DEFINER で group_members RLS をバイパス
--   - アプリ層でも同一の認可チェックを実施（二重防御）
--   - payment_splits の DELETE は引き続き USING (false) + CASCADE のみ
--

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "payments_delete_payer" ON payments;
DROP POLICY IF EXISTS "payments_delete_payer_or_owner" ON payments;

-- 新ポリシー: 支払者本人 OR グループオーナー
--
-- is_group_owner() は Migration 007 で定義済みの SECURITY DEFINER 関数:
--   SELECT EXISTS (SELECT 1 FROM groups WHERE id = _group_id AND owner_id = _user_id)
--
-- PostgreSQL の OR 短絡評価により:
--   - 支払者本人の場合: payer_id チェックだけで通過（is_group_owner 不呼び出し）
--   - グループオーナーの場合: is_group_owner() で groups テーブルを参照
--
CREATE POLICY "payments_delete_payer_or_owner" ON payments
FOR DELETE USING (
  payer_id = auth.uid()
  OR is_group_owner(group_id, auth.uid())
);


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. ポリシー確認:
--    SELECT policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'payments' AND cmd = 'DELETE';
--
--    期待: payments_delete_payer_or_owner | DELETE | (payer_id = auth.uid() OR is_group_owner(...))
--
-- 2. 旧ポリシーが削除されていること:
--    SELECT count(*)
--    FROM pg_policies
--    WHERE tablename = 'payments' AND policyname = 'payments_delete_payer';
--
--    期待: 0
--
