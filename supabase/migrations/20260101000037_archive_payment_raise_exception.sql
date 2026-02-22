-- ============================================================================
-- Migration 037: archive_payment RPC を RAISE EXCEPTION 形式に統一
-- ============================================================================
--
-- 変更点:
--   - 戻り値を INTEGER（1/-1/-2/-3）から BOOLEAN に変更
--   - エラー時は RAISE EXCEPTION を使用（translate-rpc-error.ts で処理）
--   - 成功時は true を返す
--
-- エラーパターン（translate-rpc-error.ts の ARCHIVE_PAYMENT_ERRORS にマッチ）:
--   'archive_payment: not_found'  → 404
--   'archive_payment: settled'    → 403
--   'archive_payment: not_payer'  → 403
--
-- NOTE: PostgreSQL では RETURNS 型の変更に CREATE OR REPLACE は使えないため
--       まず DROP して再作成する。
-- ============================================================================

-- 戻り値型変更のため DROP → CREATE
DROP FUNCTION IF EXISTS public.archive_payment(UUID, UUID);

CREATE FUNCTION public.archive_payment(
  p_payment_id UUID,
  p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payer_id UUID;
  v_settlement_id UUID;
BEGIN
  -- 1. 支払い存在確認
  SELECT payer_id, settlement_id INTO v_payer_id, v_settlement_id
  FROM payments WHERE id = p_payment_id;

  IF v_payer_id IS NULL THEN
    RAISE EXCEPTION 'archive_payment: not_found';
  END IF;

  IF v_settlement_id IS NOT NULL THEN
    RAISE EXCEPTION 'archive_payment: settled';
  END IF;

  IF v_payer_id != p_user_id THEN
    RAISE EXCEPTION 'archive_payment: not_payer';
  END IF;

  -- 2. archived_payments へコピー
  INSERT INTO archived_payments (id, group_id, payer_id, category_id, amount,
    description, payment_date, settlement_id, created_at, updated_at)
  SELECT id, group_id, payer_id, category_id, amount,
    description, payment_date, settlement_id, created_at, updated_at
  FROM payments WHERE id = p_payment_id;

  -- 3. archived_payment_splits へコピー
  INSERT INTO archived_payment_splits (id, payment_id, user_id, amount)
  SELECT id, payment_id, user_id, amount
  FROM payment_splits WHERE payment_id = p_payment_id;

  -- 4. payments 削除 (CASCADE で payment_splits も削除)
  DELETE FROM payments WHERE id = p_payment_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.archive_payment IS '支払いをアーカイブ（論理削除）- v2: RAISE EXCEPTION 形式に統一';
