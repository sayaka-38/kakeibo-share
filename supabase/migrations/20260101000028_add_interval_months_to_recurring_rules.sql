-- ============================================
-- Migration 028: recurring_rules に interval_months を追加
-- 隔月・四半期など柔軟な発生間隔をサポート
-- ============================================

ALTER TABLE recurring_rules
  ADD COLUMN interval_months SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE recurring_rules
  ADD CONSTRAINT recurring_rules_interval_months_valid
  CHECK (interval_months >= 1 AND interval_months <= 12);
