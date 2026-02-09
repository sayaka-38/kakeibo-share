-- ============================================
-- Migration 026: payments DELETE ポリシーを支払者本人のみに制限
-- ============================================
--
-- 目標:
--   他者の支払いデータ保護を強化する。
--   グループオーナーによる他メンバーの支払い削除を禁止し、
--   支払者本人のみが自分の記録を削除できるようにする。
--
-- 変更:
--   - payments_delete_payer_or_owner → payments_delete_payer に置換
--   - 条件: payer_id = auth.uid() のみ（グループオーナー例外を除去）
--
-- 理由:
--   - デモ Bot（さくらさん）を含む他ユーザーの支払い記録を保護
--   - 支払い記録は作成者本人のみが管理すべきデータ
--   - 清算の整合性を維持するため、他者による削除を防止
--

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "payments_delete_payer_or_owner" ON payments;
DROP POLICY IF EXISTS "payments_delete_payer" ON payments;

-- 新ポリシー: 支払者本人のみ削除可
CREATE POLICY "payments_delete_payer" ON payments
FOR DELETE USING (
  payer_id = auth.uid()
);
