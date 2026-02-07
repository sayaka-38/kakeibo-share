-- ============================================================================
-- Phase 7.5: Settlement Pending Payment Flow — Schema Changes
-- ============================================================================
-- settlement_sessions に pending_payment/settled ステータスと関連カラムを追加
-- フロー: draft → pending_payment → settled（0円清算は draft → settled）
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. status CHECK 制約を拡張（draft, confirmed, pending_payment, settled）
-- ----------------------------------------------------------------------------
-- 既存の制約を削除
ALTER TABLE settlement_sessions
DROP CONSTRAINT settlement_sessions_status_valid;

-- 新しい制約を追加（後方互換: confirmed は既存データ用に残す）
ALTER TABLE settlement_sessions
ADD CONSTRAINT settlement_sessions_status_valid CHECK (
    status IN ('draft', 'confirmed', 'pending_payment', 'settled')
);

-- ----------------------------------------------------------------------------
-- 2. 新規カラム追加
-- ----------------------------------------------------------------------------
-- net_transfers: 相殺計算結果（JSONB配列）
-- [{"from_id": "uuid", "from_name": "Alice", "to_id": "uuid", "to_name": "Bob", "amount": 500}]
ALTER TABLE settlement_sessions
ADD COLUMN net_transfers JSONB;

-- is_zero_settlement: 全員差額0で支払いが不要なケース
ALTER TABLE settlement_sessions
ADD COLUMN is_zero_settlement BOOLEAN NOT NULL DEFAULT false;

-- payment_reported_at/by: 送金側が「送金完了」を報告した日時・ユーザー
ALTER TABLE settlement_sessions
ADD COLUMN payment_reported_at TIMESTAMPTZ;

ALTER TABLE settlement_sessions
ADD COLUMN payment_reported_by UUID REFERENCES profiles(id);

-- settled_at/by: 受取側が「受取確認」をして清算完了にした日時・ユーザー
ALTER TABLE settlement_sessions
ADD COLUMN settled_at TIMESTAMPTZ;

ALTER TABLE settlement_sessions
ADD COLUMN settled_by UUID REFERENCES profiles(id);

-- ----------------------------------------------------------------------------
-- 3. confirmed_fields 制約を拡張
-- ----------------------------------------------------------------------------
-- 既存の制約を削除
ALTER TABLE settlement_sessions
DROP CONSTRAINT settlement_sessions_confirmed_fields;

-- 新しい制約: 各状態で必須のフィールドを定義
ALTER TABLE settlement_sessions
ADD CONSTRAINT settlement_sessions_state_fields CHECK (
    -- draft: 確定関連フィールドは不要
    (status = 'draft') OR
    -- confirmed: 後方互換（既存データ用）
    (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL) OR
    -- pending_payment: 確定情報 + net_transfers が必須
    (status = 'pending_payment' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND net_transfers IS NOT NULL) OR
    -- settled: 確定情報 + settled_at/by が必須
    (status = 'settled' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND settled_at IS NOT NULL AND settled_by IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- 4. RLS ポリシー更新: settlement_sessions の UPDATE を全ステータスで許可
-- ----------------------------------------------------------------------------
-- 既存の UPDATE ポリシーは draft のみ更新可能だが、
-- pending_payment → settled への遷移も必要
DROP POLICY IF EXISTS settlement_sessions_update ON settlement_sessions;

CREATE POLICY settlement_sessions_update ON settlement_sessions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = settlement_sessions.group_id
            AND group_members.user_id = auth.uid()
        )
        -- draft, pending_payment 状態のみ更新可能（settled は最終状態）
        AND status IN ('draft', 'pending_payment')
    );

-- ----------------------------------------------------------------------------
-- 5. コメント
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN settlement_sessions.net_transfers IS '相殺計算結果（JSONB配列: [{from_id, from_name, to_id, to_name, amount}]）';
COMMENT ON COLUMN settlement_sessions.is_zero_settlement IS '全員差額0の0円清算フラグ';
COMMENT ON COLUMN settlement_sessions.payment_reported_at IS '送金完了報告の日時';
COMMENT ON COLUMN settlement_sessions.payment_reported_by IS '送金完了報告者';
COMMENT ON COLUMN settlement_sessions.settled_at IS '受取確認（清算完了）の日時';
COMMENT ON COLUMN settlement_sessions.settled_by IS '受取確認者';
