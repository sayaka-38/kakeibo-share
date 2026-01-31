-- ============================================
-- Migration 008: payments + payment_splits RLS 強化
-- ============================================
--
-- 目標:
--   自分が所属していないグループの支払い明細や割り勘情報は、
--   たとえ ID を知っていても絶対に覗き見ることができない状態を
--   DB レベル（RLS）で保証する。
--
-- 設計:
--   - payments: group_id を直接持つ → is_group_member(group_id, auth.uid())
--   - payment_splits: group_id を持たない → get_payment_group_id(payment_id)
--     SECURITY DEFINER で payments RLS をバイパスし group_id を取得
--   - 無限再帰回避: Migration 007 の is_group_member() を再利用
--
-- 依存:
--   - Migration 007: is_group_member() SECURITY DEFINER 関数
--


-- ============================================
-- 0. SECURITY DEFINER ヘルパー関数
-- ============================================
--
-- get_payment_group_id: payment_id から group_id を取得する lookup 関数
--
-- payment_splits テーブルには group_id カラムが無いため、
-- payments テーブル経由で group_id を取得する必要がある。
-- しかし payments にも RLS が適用されるため、通常のクエリでは
-- cross-table RLS 依存チェーンが発生する。
--
-- SECURITY DEFINER により postgres ロール権限で直接 payments を参照し、
-- RLS 依存チェーンを断ち切る。
--
-- セキュリティ考慮:
--   - search_path = public: スキーマ汚染攻撃を防止
--   - STABLE: 同一トランザクション内で同じ入力に対し同じ結果を返す
--   - 戻り値は UUID のみ（group_id）で、データ漏洩リスクは最小限
--   - 存在しない payment_id の場合 NULL を返す
--     → is_group_member(NULL, uid) は false → 安全側にフェイル
--

CREATE OR REPLACE FUNCTION public.get_payment_group_id(_payment_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id FROM payments WHERE id = _payment_id;
$$;


-- ============================================
-- 1. payments テーブル: RLS ポリシー
-- ============================================

-- RLS 有効化（冪等）
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを全て削除（冪等）
DROP POLICY IF EXISTS "payments_select_member" ON payments;
DROP POLICY IF EXISTS "payments_insert_member" ON payments;
DROP POLICY IF EXISTS "payments_update_payer" ON payments;
DROP POLICY IF EXISTS "payments_delete_payer" ON payments;
-- schema.sql 由来の可能性がある名前も削除
DROP POLICY IF EXISTS "Members can view group payments" ON payments;
DROP POLICY IF EXISTS "Members can create payments" ON payments;
DROP POLICY IF EXISTS "Payer can update own payments" ON payments;
DROP POLICY IF EXISTS "Payer can delete own payments" ON payments;

-- SELECT: グループメンバーのみ閲覧可
--
-- is_group_member() は SECURITY DEFINER で group_members を直接参照するため、
-- group_members RLS による無限再帰は発生しない。
--
CREATE POLICY "payments_select_member" ON payments
FOR SELECT USING (
  is_group_member(group_id, auth.uid())
);

-- INSERT: メンバーかつ payer_id が自分自身の場合のみ
--
-- payer_id = auth.uid() によるなりすまし防止:
--   他人の payer_id を設定して支払いを登録することを DB レベルで防ぐ。
--   既存コード（GroupPaymentForm, FullPaymentForm）は全て
--   payer_id: currentUserId を設定しており互換性あり。
--
CREATE POLICY "payments_insert_member" ON payments
FOR INSERT WITH CHECK (
  payer_id = auth.uid()
  AND is_group_member(group_id, auth.uid())
);

-- UPDATE: 支払者本人のみ
CREATE POLICY "payments_update_payer" ON payments
FOR UPDATE USING (
  payer_id = auth.uid()
);

-- DELETE: 支払者本人のみ
CREATE POLICY "payments_delete_payer" ON payments
FOR DELETE USING (
  payer_id = auth.uid()
);


-- ============================================
-- 2. payment_splits テーブル: RLS ポリシー
-- ============================================

-- RLS 有効化（冪等）
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを全て削除（冪等）
DROP POLICY IF EXISTS "payment_splits_select_member" ON payment_splits;
DROP POLICY IF EXISTS "payment_splits_insert_member" ON payment_splits;
DROP POLICY IF EXISTS "payment_splits_update_deny" ON payment_splits;
DROP POLICY IF EXISTS "payment_splits_delete_deny" ON payment_splits;
-- schema.sql 由来の可能性がある名前も削除
DROP POLICY IF EXISTS "Members can view payment splits" ON payment_splits;
DROP POLICY IF EXISTS "Members can create payment splits" ON payment_splits;
DROP POLICY IF EXISTS "Members can update payment splits" ON payment_splits;

-- SELECT: グループメンバーのみ閲覧可
--
-- payment_splits には group_id がないため、get_payment_group_id() で
-- payments テーブルから group_id を取得する。
--
-- チェーン:
--   get_payment_group_id(payment_id) [SECURITY DEFINER] → group_id
--   → is_group_member(group_id, auth.uid()) [SECURITY DEFINER] → bool
--   → 2 段階の SECURITY DEFINER で全ての RLS 依存を切断
--
CREATE POLICY "payment_splits_select_member" ON payment_splits
FOR SELECT USING (
  is_group_member(get_payment_group_id(payment_id), auth.uid())
);

-- INSERT: グループメンバーのみ作成可
CREATE POLICY "payment_splits_insert_member" ON payment_splits
FOR INSERT WITH CHECK (
  is_group_member(get_payment_group_id(payment_id), auth.uid())
);

-- UPDATE: 全拒否
--
-- payment_splits の個別更新は仕様上存在しない。
-- 割り勘の変更は payment 削除 → 再作成で行う。
--
CREATE POLICY "payment_splits_update_deny" ON payment_splits
FOR UPDATE USING (false);

-- DELETE: 全拒否
--
-- payment_splits の直接削除は禁止。
-- 支払い（payments）削除時に ON DELETE CASCADE で自動削除される。
-- PostgreSQL の FK CASCADE は RLS をバイパスするため、
-- USING (false) と共存可能。
--
CREATE POLICY "payment_splits_delete_deny" ON payment_splits
FOR DELETE USING (false);


-- ============================================
-- 3. パフォーマンスインデックス
-- ============================================

-- payments テーブル: RLS で使用されるカラムのインデックス
CREATE INDEX IF NOT EXISTS idx_payments_group_id ON payments(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer_id ON payments(payer_id);

-- payment_splits テーブル: RLS で使用されるカラムのインデックス
CREATE INDEX IF NOT EXISTS idx_payment_splits_payment_id ON payment_splits(payment_id);


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. ヘルパー関数の確認:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc
--    WHERE proname = 'get_payment_group_id';
--
--    期待: prosecdef = true (SECURITY DEFINER), provolatile = 's' (STABLE)
--
-- 2. ポリシー一覧:
--    SELECT tablename, policyname, cmd
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('payments', 'payment_splits')
--    ORDER BY tablename, policyname;
--
--    期待:
--      payments          | payments_delete_payer          | DELETE
--      payments          | payments_insert_member         | INSERT
--      payments          | payments_select_member         | SELECT
--      payments          | payments_update_payer          | UPDATE
--      payment_splits    | payment_splits_delete_deny     | DELETE
--      payment_splits    | payment_splits_insert_member   | INSERT
--      payment_splits    | payment_splits_select_member   | SELECT
--      payment_splits    | payment_splits_update_deny     | UPDATE
--
-- 3. 非メンバーアクセステスト:
--    SET ROLE authenticated;
--    SET request.jwt.claims = '{"sub": "non-member-uuid"}';
--    SELECT * FROM payments LIMIT 1;          -- 空結果
--    SELECT * FROM payment_splits LIMIT 1;    -- 空結果
--    RESET ROLE;
--
