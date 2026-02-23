-- ============================================================================
-- Phase 15B': payments 日付制約の撤廃
-- 未来日付の支払いを許可（固定費の先行入力ニーズに対応）
-- ============================================================================
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_date_check;

COMMENT ON TABLE payments IS '未来日付の支払いを許可（Phase 15B''）';
