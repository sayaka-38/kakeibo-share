-- ============================================================================
-- Phase 7.5: Recurring Rules Personalization
-- ============================================================================
-- 変更点:
--   - generate_settlement_entries: 固定費ルールを作成者（default_payer_id）でフィルタ
--     → 各ユーザーは自分が支払う固定費のみエントリ生成される
--     → 他メンバーの支払いは既存 payments (Part 2) で取り込まれる
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_settlement_entries(
    p_session_id UUID,
    p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
    v_rule RECORD;
    v_payment RECORD;
    v_current_date DATE;
    v_actual_day INTEGER;
    v_entry_count INTEGER := 0;
    v_year INTEGER;
    v_month INTEGER;
    v_new_entry_id UUID;
BEGIN
    -- セッション情報を取得
    SELECT ss.*, g.id as group_id
    INTO v_session
    FROM settlement_sessions ss
    JOIN groups g ON g.id = ss.group_id
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RETURN -1;  -- セッションが見つからない
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_session.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;  -- 権限なし
    END IF;

    -- draft状態確認
    IF v_session.status != 'draft' THEN
        RETURN -3;  -- draft状態でない
    END IF;

    -- 既存のエントリを削除（再生成のため）
    DELETE FROM settlement_entries WHERE session_id = p_session_id;

    -- =========================================================================
    -- Part 1: 固定費ルールからエントリを生成（自分が支払うルールのみ）
    -- =========================================================================
    FOR v_rule IN
        SELECT rr.*
        FROM recurring_rules rr
        WHERE rr.group_id = v_session.group_id
        AND rr.is_active = true
        AND rr.default_payer_id = p_user_id  -- 自分が支払者のルールのみ
    LOOP
        -- 期間内の各月をループ
        v_current_date := DATE_TRUNC('month', v_session.period_start)::DATE;

        WHILE v_current_date <= v_session.period_end LOOP
            v_year := EXTRACT(YEAR FROM v_current_date)::INTEGER;
            v_month := EXTRACT(MONTH FROM v_current_date)::INTEGER;

            -- 末日対応: day_of_month を実際の日に変換
            v_actual_day := get_actual_day_of_month(v_rule.day_of_month, v_year, v_month);

            -- その月の発生日
            v_current_date := MAKE_DATE(v_year, v_month, v_actual_day);

            -- 期間内かチェック
            IF v_current_date >= v_session.period_start
               AND v_current_date <= v_session.period_end THEN

                -- エントリを挿入
                INSERT INTO settlement_entries (
                    session_id,
                    rule_id,
                    description,
                    category_id,
                    expected_amount,
                    payer_id,
                    payment_date,
                    status,
                    split_type,
                    entry_type
                ) VALUES (
                    p_session_id,
                    v_rule.id,
                    v_rule.description,
                    v_rule.category_id,
                    v_rule.default_amount,  -- is_variable の場合は NULL
                    v_rule.default_payer_id,
                    v_current_date,
                    'pending',
                    v_rule.split_type,
                    'rule'
                )
                RETURNING id INTO v_new_entry_id;

                v_entry_count := v_entry_count + 1;

                -- カスタム分割設定をコピー（split_type = 'custom' の場合）
                IF v_rule.split_type = 'custom' THEN
                    INSERT INTO settlement_entry_splits (entry_id, user_id, amount)
                    SELECT
                        v_new_entry_id,
                        rrs.user_id,
                        COALESCE(
                            rrs.amount,
                            -- percentage指定の場合は期待金額から計算（期待金額がない場合は0）
                            FLOOR(COALESCE(v_rule.default_amount, 0) * rrs.percentage / 100)::INTEGER
                        )
                    FROM recurring_rule_splits rrs
                    WHERE rrs.rule_id = v_rule.id;
                END IF;
            END IF;

            -- 次の月へ
            v_current_date := (DATE_TRUNC('month', v_current_date) + INTERVAL '1 month')::DATE;
        END LOOP;
    END LOOP;

    -- =========================================================================
    -- Part 2: 未清算の既存支払いを取り込み（後出しレシート対応）
    -- =========================================================================
    FOR v_payment IN
        SELECT p.*
        FROM payments p
        WHERE p.group_id = v_session.group_id
        AND p.settlement_id IS NULL
        -- 期間終了日以前のすべての未清算支払いを対象
        AND p.payment_date <= v_session.period_end
    LOOP
        -- エントリを挿入（既存支払いとして）
        INSERT INTO settlement_entries (
            session_id,
            rule_id,
            description,
            category_id,
            expected_amount,
            actual_amount,
            payer_id,
            payment_date,
            status,
            split_type,
            entry_type,
            source_payment_id,
            filled_by,
            filled_at
        ) VALUES (
            p_session_id,
            NULL,  -- ルールなし
            v_payment.description,
            v_payment.category_id,
            v_payment.amount,  -- 既存なので金額確定
            v_payment.amount,
            v_payment.payer_id,
            v_payment.payment_date,
            'filled',  -- 既に入力済み
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM payment_splits ps
                    WHERE ps.payment_id = v_payment.id
                ) THEN 'custom'
                ELSE 'equal'
            END,
            'existing',
            v_payment.id,  -- 元の payment_id
            v_payment.payer_id,  -- 元の支払者が入力者
            v_payment.created_at
        )
        RETURNING id INTO v_new_entry_id;

        v_entry_count := v_entry_count + 1;

        -- 既存の payment_splits をコピー
        INSERT INTO settlement_entry_splits (entry_id, user_id, amount)
        SELECT
            v_new_entry_id,
            ps.user_id,
            ps.amount
        FROM payment_splits ps
        WHERE ps.payment_id = v_payment.id;
    END LOOP;

    RETURN v_entry_count;
END;
$$;

COMMENT ON FUNCTION generate_settlement_entries IS 'セッションにエントリを生成（自分の固定費ルール + 全未清算支払い取り込み）';
