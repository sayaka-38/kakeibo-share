-- =============================================================================
-- Migration 023: get_settlement_period_suggestion 開始日修正
-- =============================================================================
-- 問題: 前回清算後に過去日付の支払いが追加された場合、
--        suggested_start が v_last_confirmed_end + 1 day になり、
--        実際の oldest_unsettled_date より後になる
-- 修正: v_start が v_oldest_unsettled より後なら v_oldest_unsettled を使う

CREATE OR REPLACE FUNCTION get_settlement_period_suggestion(
    p_group_id UUID,
    p_user_id UUID
)
RETURNS TABLE (
    suggested_start DATE,
    suggested_end DATE,
    oldest_unsettled_date DATE,
    last_confirmed_end DATE,
    unsettled_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_oldest_unsettled DATE;
    v_newest_unsettled DATE;
    v_last_confirmed_end DATE;
    v_unsettled_count INTEGER;
    v_start DATE;
    v_end DATE;
    v_has_unsettled_on_last_confirmed BOOLEAN;
BEGIN
    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is not a member of this group';
    END IF;

    -- 未清算支払いの最古日・最新日・件数を取得
    SELECT MIN(payment_date), MAX(payment_date), COUNT(*)
    INTO v_oldest_unsettled, v_newest_unsettled, v_unsettled_count
    FROM payments
    WHERE group_id = p_group_id
    AND settlement_id IS NULL;

    -- 前回確定済みセッションの終了日を取得（confirmed + settled を参照）
    SELECT period_end
    INTO v_last_confirmed_end
    FROM settlement_sessions
    WHERE group_id = p_group_id
    AND status IN ('confirmed', 'pending_payment', 'settled')
    ORDER BY period_end DESC
    LIMIT 1;

    -- 終了日: 未清算データの最新日付。データがなければ今日
    v_end := COALESCE(v_newest_unsettled, CURRENT_DATE);

    -- 開始日を計算
    IF v_last_confirmed_end IS NOT NULL THEN
        -- 前回清算日当日に未清算データがあるかチェック
        SELECT EXISTS (
            SELECT 1 FROM payments
            WHERE group_id = p_group_id
            AND settlement_id IS NULL
            AND payment_date = v_last_confirmed_end
        ) INTO v_has_unsettled_on_last_confirmed;

        IF v_has_unsettled_on_last_confirmed THEN
            -- 前回清算日当日に未清算データがある → その日を含む
            v_start := v_last_confirmed_end;
        ELSE
            -- 通常: 前回清算日の翌日
            v_start := v_last_confirmed_end + INTERVAL '1 day';
        END IF;
    ELSE
        -- 前回清算なし: 未清算の最古日 or 今月1日
        v_start := COALESCE(
            v_oldest_unsettled,
            DATE_TRUNC('month', CURRENT_DATE)::DATE
        );
    END IF;

    -- 安全装置: 未清算の最古日が開始日より前なら最古日を使う
    -- （前回清算後に過去日付の支払いが追加された場合）
    IF v_oldest_unsettled IS NOT NULL AND v_start > v_oldest_unsettled THEN
        v_start := v_oldest_unsettled;
    END IF;

    -- 安全装置: 開始日 ≦ 終了日
    IF v_start > v_end THEN
        v_start := v_end;
    END IF;

    RETURN QUERY SELECT
        v_start,
        v_end,
        v_oldest_unsettled,
        v_last_confirmed_end,
        COALESCE(v_unsettled_count, 0)::INTEGER;
END;
$$;

COMMENT ON FUNCTION get_settlement_period_suggestion IS '清算期間のスマート提案。開始日=未清算最古日 or 前回清算翌日、終了日=最新未清算日';
