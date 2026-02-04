-- ============================================
-- Migration 011: payment_splits DELETE ポリシー拡張（編集機能用）
-- ============================================
--
-- 目標:
--   支払い編集時に payment_splits を全削除→再作成するため、
--   支払者本人が自分の支払いの splits を削除できるようにする。
--
-- 変更:
--   - payment_splits_delete_deny（全拒否）→ payment_splits_delete_payer に置換
--   - 条件: is_payment_payer(payment_id, auth.uid())
--
-- 依存:
--   - Migration 008: payment_splits RLS ポリシー、get_payment_group_id() 関数
--
-- セキュリティ考慮:
--   - is_payment_payer() は SECURITY DEFINER で payments RLS をバイパス
--     （get_payment_group_id() と同じパターン）
--   - 戻り値は BOOLEAN のみでデータ漏洩リスクなし
--   - 支払者以外は自分の支払いの splits しか削除できない
--   - FK CASCADE による削除は引き続き有効（RLS をバイパス）
--


-- ============================================
-- 0. SECURITY DEFINER ヘルパー関数
-- ============================================
--
-- is_payment_payer: payment_id と user_id から「支払者本人か」を判定
--
-- payment_splits テーブルには payer_id カラムが無いため、
-- payments テーブル経由で payer_id を参照する必要がある。
-- payments にも RLS が適用されるため、SECURITY DEFINER で
-- RLS 依存チェーンを断ち切る（get_payment_group_id と同パターン）。
--

CREATE OR REPLACE FUNCTION public.is_payment_payer(_payment_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payments WHERE id = _payment_id AND payer_id = _user_id
  );
$$;


-- ============================================
-- 1. payment_splits DELETE ポリシー置換
-- ============================================

-- 既存の全拒否ポリシーを削除
DROP POLICY IF EXISTS "payment_splits_delete_deny" ON payment_splits;
DROP POLICY IF EXISTS "payment_splits_delete_payer" ON payment_splits;

-- 新ポリシー: 支払者本人のみ splits を削除可能
--
-- is_payment_payer() は SECURITY DEFINER で payments RLS をバイパスし、
-- payment_id から payer_id を取得して auth.uid() と比較する。
--
-- ユースケース:
--   1. 支払い編集時: PUT /api/payments/[id] で既存 splits を全削除→再作成
--   2. FK CASCADE: payments 削除時は RLS をバイパスして自動削除（変更なし）
--
CREATE POLICY "payment_splits_delete_payer" ON payment_splits
FOR DELETE USING (
  is_payment_payer(payment_id, auth.uid())
);


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. ヘルパー関数の確認:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc
--    WHERE proname = 'is_payment_payer';
--
--    期待: prosecdef = true (SECURITY DEFINER), provolatile = 's' (STABLE)
--
-- 2. ポリシー確認:
--    SELECT policyname, cmd
--    FROM pg_policies
--    WHERE tablename = 'payment_splits' AND cmd = 'DELETE';
--
--    期待: payment_splits_delete_payer | DELETE
--
-- 3. 旧ポリシーが削除されていること:
--    SELECT count(*)
--    FROM pg_policies
--    WHERE tablename = 'payment_splits' AND policyname = 'payment_splits_delete_deny';
--
--    期待: 0
--
