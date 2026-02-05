-- ============================================================================
-- Phase 7: Settlement Engine - Tables & RLS
-- ============================================================================
-- 固定費ルール（雛形）と清算準備室のテーブル定義
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. recurring_rules: 固定費ルール（雛形）
-- ----------------------------------------------------------------------------
CREATE TABLE recurring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    default_amount INTEGER,
    is_variable BOOLEAN NOT NULL DEFAULT false,
    day_of_month INTEGER NOT NULL,
    default_payer_id UUID NOT NULL REFERENCES profiles(id),
    split_type TEXT NOT NULL DEFAULT 'equal',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT recurring_rules_description_length CHECK (
        char_length(description) >= 1 AND char_length(description) <= 100
    ),
    CONSTRAINT recurring_rules_amount_positive CHECK (
        default_amount IS NULL OR default_amount > 0
    ),
    CONSTRAINT recurring_rules_day_of_month_range CHECK (
        day_of_month >= 1 AND day_of_month <= 31
    ),
    CONSTRAINT recurring_rules_split_type_valid CHECK (
        split_type IN ('equal', 'custom')
    ),
    -- is_variable = true の場合は default_amount は NULL でなければならない
    -- is_variable = false の場合は default_amount は NOT NULL でなければならない
    CONSTRAINT recurring_rules_variable_amount_consistency CHECK (
        (is_variable = true AND default_amount IS NULL) OR
        (is_variable = false AND default_amount IS NOT NULL)
    )
);

-- インデックス
CREATE INDEX idx_recurring_rules_group_id ON recurring_rules(group_id);
CREATE INDEX idx_recurring_rules_active ON recurring_rules(group_id, is_active) WHERE is_active = true;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_recurring_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_recurring_rules_updated_at
    BEFORE UPDATE ON recurring_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_recurring_rules_updated_at();

-- ----------------------------------------------------------------------------
-- 2. recurring_rule_splits: ルールのカスタム分割設定
-- ----------------------------------------------------------------------------
CREATE TABLE recurring_rule_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    amount INTEGER,
    percentage NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT recurring_rule_splits_unique UNIQUE (rule_id, user_id),
    CONSTRAINT recurring_rule_splits_amount_positive CHECK (
        amount IS NULL OR amount >= 0
    ),
    CONSTRAINT recurring_rule_splits_percentage_range CHECK (
        percentage IS NULL OR (percentage >= 0 AND percentage <= 100)
    ),
    -- amount か percentage のどちらか一方のみ設定
    CONSTRAINT recurring_rule_splits_one_type CHECK (
        (amount IS NOT NULL AND percentage IS NULL) OR
        (amount IS NULL AND percentage IS NOT NULL)
    )
);

CREATE INDEX idx_recurring_rule_splits_rule_id ON recurring_rule_splits(rule_id);

-- ----------------------------------------------------------------------------
-- 3. settlement_sessions: 清算セッション（準備室）
-- ----------------------------------------------------------------------------
CREATE TABLE settlement_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    confirmed_by UUID REFERENCES profiles(id),

    CONSTRAINT settlement_sessions_period_valid CHECK (
        period_start <= period_end
    ),
    CONSTRAINT settlement_sessions_status_valid CHECK (
        status IN ('draft', 'confirmed')
    ),
    -- confirmed 状態の場合は confirmed_at と confirmed_by が必須
    CONSTRAINT settlement_sessions_confirmed_fields CHECK (
        (status = 'draft') OR
        (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
    )
);

CREATE INDEX idx_settlement_sessions_group_id ON settlement_sessions(group_id);
CREATE INDEX idx_settlement_sessions_status ON settlement_sessions(group_id, status);

-- ----------------------------------------------------------------------------
-- 4. settlement_entries: 清算エントリ（チェックリストの各項目）
-- ----------------------------------------------------------------------------
CREATE TABLE settlement_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES settlement_sessions(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES recurring_rules(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    expected_amount INTEGER,
    actual_amount INTEGER,
    payer_id UUID NOT NULL REFERENCES profiles(id),
    payment_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    split_type TEXT NOT NULL DEFAULT 'equal',
    filled_by UUID REFERENCES profiles(id),
    filled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- entry_type: ルールから生成 / 手動追加 / 既存支払い取り込み
    entry_type TEXT NOT NULL DEFAULT 'rule',
    -- 既存支払い取り込み時の元の payment_id（確定前）
    source_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

    CONSTRAINT settlement_entries_description_length CHECK (
        char_length(description) >= 1 AND char_length(description) <= 100
    ),
    CONSTRAINT settlement_entries_amounts_positive CHECK (
        (expected_amount IS NULL OR expected_amount > 0) AND
        (actual_amount IS NULL OR actual_amount > 0)
    ),
    CONSTRAINT settlement_entries_status_valid CHECK (
        status IN ('pending', 'filled', 'skipped')
    ),
    CONSTRAINT settlement_entries_split_type_valid CHECK (
        split_type IN ('equal', 'custom')
    ),
    CONSTRAINT settlement_entries_entry_type_valid CHECK (
        entry_type IN ('rule', 'manual', 'existing')
    ),
    -- filled 状態の場合は actual_amount と filled_by が必須
    CONSTRAINT settlement_entries_filled_fields CHECK (
        (status != 'filled') OR
        (status = 'filled' AND actual_amount IS NOT NULL AND filled_by IS NOT NULL)
    )
);

CREATE INDEX idx_settlement_entries_session_id ON settlement_entries(session_id);
CREATE INDEX idx_settlement_entries_status ON settlement_entries(session_id, status);
CREATE INDEX idx_settlement_entries_rule_id ON settlement_entries(rule_id);

-- ----------------------------------------------------------------------------
-- 5. settlement_entry_splits: エントリのカスタム分割設定
-- ----------------------------------------------------------------------------
-- ルールから継承、または手動設定されたカスタム分割
CREATE TABLE settlement_entry_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES settlement_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT settlement_entry_splits_unique UNIQUE (entry_id, user_id),
    CONSTRAINT settlement_entry_splits_amount_non_negative CHECK (amount >= 0)
);

CREATE INDEX idx_settlement_entry_splits_entry_id ON settlement_entry_splits(entry_id);

-- ----------------------------------------------------------------------------
-- 6. payments テーブル拡張: settlement_id カラム追加
-- ----------------------------------------------------------------------------
ALTER TABLE payments
ADD COLUMN settlement_id UUID REFERENCES settlement_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_settlement_id ON payments(settlement_id);
CREATE INDEX idx_payments_unsettled ON payments(group_id, payment_date)
    WHERE settlement_id IS NULL;

-- ----------------------------------------------------------------------------
-- 7. RLS ポリシー
-- ----------------------------------------------------------------------------

-- recurring_rules
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_rules_select ON recurring_rules
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = recurring_rules.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rules_insert ON recurring_rules
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = recurring_rules.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rules_update ON recurring_rules
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = recurring_rules.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rules_delete ON recurring_rules
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM group_members gm
            JOIN groups g ON g.id = gm.group_id
            WHERE gm.group_id = recurring_rules.group_id
            AND gm.user_id = auth.uid()
            AND (gm.role = 'owner' OR g.owner_id = auth.uid())
        )
    );

-- recurring_rule_splits
ALTER TABLE recurring_rule_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_rule_splits_select ON recurring_rule_splits
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM recurring_rules rr
            JOIN group_members gm ON gm.group_id = rr.group_id
            WHERE rr.id = recurring_rule_splits.rule_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rule_splits_insert ON recurring_rule_splits
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM recurring_rules rr
            JOIN group_members gm ON gm.group_id = rr.group_id
            WHERE rr.id = recurring_rule_splits.rule_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rule_splits_update ON recurring_rule_splits
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM recurring_rules rr
            JOIN group_members gm ON gm.group_id = rr.group_id
            WHERE rr.id = recurring_rule_splits.rule_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY recurring_rule_splits_delete ON recurring_rule_splits
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM recurring_rules rr
            JOIN group_members gm ON gm.group_id = rr.group_id
            WHERE rr.id = recurring_rule_splits.rule_id
            AND gm.user_id = auth.uid()
        )
    );

-- settlement_sessions
ALTER TABLE settlement_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_sessions_select ON settlement_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = settlement_sessions.group_id
            AND group_members.user_id = auth.uid()
        )
    );

CREATE POLICY settlement_sessions_insert ON settlement_sessions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = settlement_sessions.group_id
            AND group_members.user_id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY settlement_sessions_update ON settlement_sessions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = settlement_sessions.group_id
            AND group_members.user_id = auth.uid()
        )
        AND status = 'draft'  -- draft状態のみ更新可能
    );

CREATE POLICY settlement_sessions_delete ON settlement_sessions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM group_members
            WHERE group_members.group_id = settlement_sessions.group_id
            AND group_members.user_id = auth.uid()
        )
        AND status = 'draft'  -- draft状態のみ削除可能
        AND created_by = auth.uid()  -- 作成者のみ削除可能
    );

-- settlement_entries
ALTER TABLE settlement_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_entries_select ON settlement_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM settlement_sessions ss
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE ss.id = settlement_entries.session_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY settlement_entries_insert ON settlement_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM settlement_sessions ss
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE ss.id = settlement_entries.session_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

CREATE POLICY settlement_entries_update ON settlement_entries
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM settlement_sessions ss
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE ss.id = settlement_entries.session_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

CREATE POLICY settlement_entries_delete ON settlement_entries
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM settlement_sessions ss
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE ss.id = settlement_entries.session_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

-- settlement_entry_splits
ALTER TABLE settlement_entry_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_entry_splits_select ON settlement_entry_splits
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM settlement_entries se
            JOIN settlement_sessions ss ON ss.id = se.session_id
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE se.id = settlement_entry_splits.entry_id
            AND gm.user_id = auth.uid()
        )
    );

CREATE POLICY settlement_entry_splits_insert ON settlement_entry_splits
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM settlement_entries se
            JOIN settlement_sessions ss ON ss.id = se.session_id
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE se.id = settlement_entry_splits.entry_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

CREATE POLICY settlement_entry_splits_update ON settlement_entry_splits
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM settlement_entries se
            JOIN settlement_sessions ss ON ss.id = se.session_id
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE se.id = settlement_entry_splits.entry_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

CREATE POLICY settlement_entry_splits_delete ON settlement_entry_splits
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM settlement_entries se
            JOIN settlement_sessions ss ON ss.id = se.session_id
            JOIN group_members gm ON gm.group_id = ss.group_id
            WHERE se.id = settlement_entry_splits.entry_id
            AND gm.user_id = auth.uid()
            AND ss.status = 'draft'
        )
    );

-- コメント
COMMENT ON TABLE recurring_rules IS '固定費ルール（雛形）- 毎月発生する固定費のテンプレート';
COMMENT ON TABLE recurring_rule_splits IS '固定費ルールのカスタム分割設定';
COMMENT ON TABLE settlement_sessions IS '清算セッション（準備室）- 清算期間と状態を管理';
COMMENT ON TABLE settlement_entries IS '清算エントリ - 準備室のチェックリスト各項目';
COMMENT ON TABLE settlement_entry_splits IS '清算エントリのカスタム分割設定';
COMMENT ON COLUMN recurring_rules.day_of_month IS '発生日（1-31）。31の場合は月末として扱う';
COMMENT ON COLUMN recurring_rules.is_variable IS 'true=変動費（毎回金額入力）、false=固定費';
COMMENT ON COLUMN settlement_entries.entry_type IS 'rule=ルールから生成、manual=手動追加、existing=既存支払い取り込み';
COMMENT ON COLUMN settlement_entries.source_payment_id IS '既存支払い取り込み時の元のpayment_id';
COMMENT ON COLUMN payments.settlement_id IS '清算セッションへの紐付け（NULLなら未清算）';
