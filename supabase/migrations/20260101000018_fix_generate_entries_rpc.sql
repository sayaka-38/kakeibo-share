-- ============================================================================
-- Fix: generate_settlement_entries RPC - Duplicate column name issue
-- ============================================================================
-- v_session に group_id が重複して含まれる問題を修正
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
    v_group_id UUID;  -- 明示的に group_id を保持
BEGIN
    -- セッション情報を取得（group_id を明示的に取得）
    SELECT ss.id, ss.period_start, ss.period_end, ss.status, ss.group_id
    INTO v_session
    FROM settlement_sessions ss
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RAISE NOTICE '[generate_settlement_entries] Session not found: %', p_session_id;
        RETURN -1;  -- セッションが見つからない
    END IF;

    v_group_id := v_session.group_id;
    RAISE NOTICE '[generate_settlement_entries] Session found: id=%, group_id=%, period_start=%, period_end=%',
        v_session.id, v_group_id, v_session.period_start, v_session.period_end;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_group_id AND user_id = p_user_id
    ) THEN
        RAISE NOTICE '[generate_settlement_entries] User % is not a member of group %', p_user_id, v_group_id;
        RETURN -2;  -- 権限なし
    END IF;

    -- draft状態確認
    IF v_session.status != 'draft' THEN
        RAISE NOTICE '[generate_settlement_entries] Session is not draft: %', v_session.status;
        RETURN -3;  -- draft状態でない
    END IF;

    -- 既存のエントリを削除（再生成のため）
    DELETE FROM settlement_entries WHERE session_id = p_session_id;
    RAISE NOTICE '[generate_settlement_entries] Deleted existing entries for session %', p_session_id;

    -- =========================================================================
    -- Part 1: 固定費ルールからエントリを生成
    -- =========================================================================
    FOR v_rule IN
        SELECT rr.*
        FROM recurring_rules rr
        WHERE rr.group_id = v_group_id
        AND rr.is_active = true
    LOOP
        RAISE NOTICE '[generate_settlement_entries] Processing rule: %', v_rule.description;

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
                    v_rule.default_amount,
                    v_rule.default_payer_id,
                    v_current_date,
                    'pending',
                    v_rule.split_type,
                    'rule'
                )
                RETURNING id INTO v_new_entry_id;

                v_entry_count := v_entry_count + 1;
                RAISE NOTICE '[generate_settlement_entries] Created rule entry: % for date %', v_rule.description, v_current_date;

                -- カスタム分割設定をコピー（split_type = 'custom' の場合）
                IF v_rule.split_type = 'custom' THEN
                    INSERT INTO settlement_entry_splits (entry_id, user_id, amount)
                    SELECT
                        v_new_entry_id,
                        rrs.user_id,
                        COALESCE(
                            rrs.amount,
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
    RAISE NOTICE '[generate_settlement_entries] Looking for unsettled payments in group % with date <= %',
        v_group_id, v_session.period_end;

    FOR v_payment IN
        SELECT p.*
        FROM payments p
        WHERE p.group_id = v_group_id
        AND p.settlement_id IS NULL
        AND p.payment_date <= v_session.period_end
    LOOP
        RAISE NOTICE '[generate_settlement_entries] Processing payment: id=%, desc=%, date=%',
            v_payment.id, v_payment.description, v_payment.payment_date;

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
            NULL,
            v_payment.description,
            v_payment.category_id,
            v_payment.amount,
            v_payment.amount,
            v_payment.payer_id,
            v_payment.payment_date,
            'filled',
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM payment_splits ps
                    WHERE ps.payment_id = v_payment.id
                ) THEN 'custom'
                ELSE 'equal'
            END,
            'existing',
            v_payment.id,
            v_payment.payer_id,
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

    RAISE NOTICE '[generate_settlement_entries] Total entries created: %', v_entry_count;
    RETURN v_entry_count;
END;
$$;

COMMENT ON FUNCTION generate_settlement_entries IS 'セッションにエントリを生成（ルールから + 未清算支払い取り込み）- v18: デバッグログ追加';
