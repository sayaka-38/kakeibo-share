-- =============================================================================
-- Migration 029: Archive payments (soft-delete via table move)
--
-- 支払い削除時に物理削除ではなく archived_payments / archived_payment_splits
-- テーブルへ移動することで、データ整合性を永続的に保証する。
-- =============================================================================

-- 1a. テーブル作成
-- archived_payments: payments と同一構造 + archived_at
CREATE TABLE archived_payments (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL,
  payer_id UUID NOT NULL,
  category_id UUID,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT NOT NULL,
  payment_date DATE NOT NULL,
  settlement_id UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- archived_payment_splits: payment_splits と同一構造 + archived_at
CREATE TABLE archived_payment_splits (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  user_id UUID NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1b. インデックス
CREATE INDEX idx_archived_payments_group_id ON archived_payments(group_id);
CREATE INDEX idx_archived_payments_payer_id ON archived_payments(payer_id);
CREATE INDEX idx_archived_payment_splits_payment_id ON archived_payment_splits(payment_id);

-- 1c. RLS
ALTER TABLE archived_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_payment_splits ENABLE ROW LEVEL SECURITY;

-- SELECT のみ（グループメンバー）。INSERT/UPDATE/DELETE は RPC のみ
CREATE POLICY "archived_payments_select_member" ON archived_payments
FOR SELECT USING (is_group_member(group_id, auth.uid()));

CREATE POLICY "archived_payment_splits_select_member" ON archived_payment_splits
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM archived_payments ap
    WHERE ap.id = archived_payment_splits.payment_id
    AND is_group_member(ap.group_id, auth.uid())
  )
);

-- 1d. RPC: archive_payment
-- Return codes: 1 = success, -1 = not found, -2 = not payer, -3 = settled
CREATE OR REPLACE FUNCTION public.archive_payment(
  p_payment_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
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

  IF v_payer_id IS NULL THEN RETURN -1; END IF;       -- not found
  IF v_settlement_id IS NOT NULL THEN RETURN -3; END IF; -- settled
  IF v_payer_id != p_user_id THEN RETURN -2; END IF;  -- not payer

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

  RETURN 1; -- success
END;
$$;
