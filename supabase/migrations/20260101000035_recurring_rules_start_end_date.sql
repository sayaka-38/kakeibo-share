-- ============================================================================
-- Fix: recurring_rules に start_date / end_date を追加して遡り清算を可能にする
-- Migration 035
-- ============================================================================
-- start_date: ルールの適用開始月（この月から発生判定を行う）
-- end_date:   ルールの適用終了月（NULL = 無期限）
-- ============================================================================

-- 1. start_date カラム追加（まず nullable で追加してバックフィル後に NOT NULL 化）
ALTER TABLE recurring_rules
  ADD COLUMN IF NOT EXISTS start_date DATE;

-- 2. 既存データのバックフィル（created_at の月初を start_date に設定）
UPDATE recurring_rules
SET start_date = DATE_TRUNC('month', created_at)::DATE
WHERE start_date IS NULL;

-- 3. NOT NULL 制約を付与
ALTER TABLE recurring_rules
  ALTER COLUMN start_date SET NOT NULL;

-- 4. end_date カラム追加（nullable = 無期限）
ALTER TABLE recurring_rules
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- ============================================================================
-- 5. generate_settlement_entries RPC を更新
--    start_date / end_date に基づくルール絞り込みを追加
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
    v_month_start DATE;
    v_actual_day INTEGER;
    v_entry_count INTEGER := 0;
    v_year INTEGER;
    v_month INTEGER;
    v_new_entry_id UUID;
    v_group_id UUID;
BEGIN
    -- セッション情報を取得
    SELECT ss.id, ss.period_start, ss.period_end, ss.status, ss.group_id
    INTO v_session
    FROM settlement_sessions ss
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RAISE NOTICE '[generate_settlement_entries] Session not found: %', p_session_id;
        RETURN -1;
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
        RETURN -2;
    END IF;

    -- draft状態確認
    IF v_session.status != 'draft' THEN
        RAISE NOTICE '[generate_settlement_entries] Session is not draft: %', v_session.status;
        RETURN -3;
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
        -- start_date が清算期間の終月以前（ルールが期間内に開始する）
        AND DATE_TRUNC('month', rr.start_date)::DATE <= DATE_TRUNC('month', v_session.period_end)::DATE
        -- end_date が清算期間の開始月以降、または無期限
        AND (rr.end_date IS NULL OR DATE_TRUNC('month', rr.end_date)::DATE >= DATE_TRUNC('month', v_session.period_start)::DATE)
    LOOP
        RAISE NOTICE '[generate_settlement_entries] Processing rule: %', v_rule.description;

        -- 期間内の各月をループ
        v_current_date := DATE_TRUNC('month', v_session.period_start)::DATE;

        WHILE v_current_date <= v_session.period_end LOOP
            v_year := EXTRACT(YEAR FROM v_current_date)::INTEGER;
            v_month := EXTRACT(MONTH FROM v_current_date)::INTEGER;
            v_month_start := MAKE_DATE(v_year, v_month, 1);

            -- start_date / end_date による月レベルフィルタ
            -- ルールの start_date より前の月はスキップ
            IF DATE_TRUNC('month', v_rule.start_date)::DATE > v_month_start THEN
                v_current_date := (v_month_start + INTERVAL '1 month')::DATE;
                CONTINUE;
            END IF;
            -- ルールの end_date より後の月はスキップ
            IF v_rule.end_date IS NOT NULL AND v_month_start > DATE_TRUNC('month', v_rule.end_date)::DATE THEN
                v_current_date := (v_month_start + INTERVAL '1 month')::DATE;
                CONTINUE;
            END IF;

            -- 末日対応: day_of_month を実際の日に変換
            v_actual_day := get_actual_day_of_month(v_rule.day_of_month, v_year, v_month);

            -- その月の発生日
            v_current_date := MAKE_DATE(v_year, v_month, v_actual_day);

            -- 期間内かチェック（日付のみ比較）
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

COMMENT ON FUNCTION generate_settlement_entries IS 'セッションにエントリを生成（ルールから + 未清算支払い取り込み）- v19: start_date/end_date 対応で遡り清算を可能に';
