-- ============================================================================
-- Phase 7.5: Settlement Pending Payment Flow — RPC Functions
-- ============================================================================
-- 1. confirm_settlement 修正: status→pending_payment + net_transfers 計算
-- 2. report_settlement_payment: 送金完了報告
-- 3. confirm_settlement_receipt: 受取確認→清算完了
-- 4. get_settlement_period_suggestion 修正: 期間計算ロジック再定義
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. confirm_settlement: 修正版（pending_payment フロー対応）
-- ----------------------------------------------------------------------------
-- 変更点:
--   - status を 'confirmed' → 'pending_payment' に（0円清算は即 'settled'）
--   - net_transfers を JSONB で計算・保存
--   - is_zero_settlement フラグを設定
--
-- 戻り値:
--   >= 0: 作成された payment の数
--   -1: セッションが見つからない
--   -2: 権限なし
--   -3: セッションがdraft状態でない
--   -4: filled エントリがない
CREATE OR REPLACE FUNCTION confirm_settlement(
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
    v_entry RECORD;
    v_split RECORD;
    v_new_payment_id UUID;
    v_payment_count INTEGER := 0;
    v_member_count INTEGER;
    v_per_person_amount INTEGER;
    v_remainder INTEGER;
    v_members UUID[];
    v_i INTEGER;
    -- net_transfers 計算用
    v_member_paid JSONB := '{}'::JSONB;
    v_member_owed JSONB := '{}'::JSONB;
    v_member_names JSONB := '{}'::JSONB;
    v_member_id UUID;
    v_balance INTEGER;
    v_debtors JSONB := '[]'::JSONB;
    v_creditors JSONB := '[]'::JSONB;
    v_transfers JSONB := '[]'::JSONB;
    v_is_zero BOOLEAN := true;
    v_debtor JSONB;
    v_creditor JSONB;
    v_d_amount INTEGER;
    v_c_amount INTEGER;
    v_settle_amount INTEGER;
    v_d_idx INTEGER;
    v_c_idx INTEGER;
BEGIN
    -- セッション情報を取得
    SELECT ss.*, g.id as group_id
    INTO v_session
    FROM settlement_sessions ss
    JOIN groups g ON g.id = ss.group_id
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_session.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;
    END IF;

    -- draft状態確認
    IF v_session.status != 'draft' THEN
        RETURN -3;
    END IF;

    -- filled エントリがあるか確認
    IF NOT EXISTS (
        SELECT 1 FROM settlement_entries
        WHERE session_id = p_session_id AND status = 'filled'
    ) THEN
        RETURN -4;
    END IF;

    -- グループメンバー一覧を取得
    SELECT ARRAY_AGG(gm.user_id ORDER BY gm.user_id)
    INTO v_members
    FROM group_members gm
    WHERE gm.group_id = v_session.group_id;

    v_member_count := array_length(v_members, 1);

    -- メンバー名を取得してマップに格納
    FOR v_i IN 1..v_member_count LOOP
        v_member_paid := v_member_paid || jsonb_build_object(v_members[v_i]::TEXT, 0);
        v_member_owed := v_member_owed || jsonb_build_object(v_members[v_i]::TEXT, 0);

        SELECT COALESCE(p.display_name, p.email, 'Unknown')
        INTO v_balance  -- reuse variable temporarily for name lookup
        FROM profiles p WHERE p.id = v_members[v_i];
        -- v_balance is integer, can't hold string; use v_member_names separately
    END LOOP;

    -- メンバー名マップを構築（別途）
    v_member_names := '{}'::JSONB;
    FOR v_i IN 1..v_member_count LOOP
        v_member_names := v_member_names || jsonb_build_object(
            v_members[v_i]::TEXT,
            (SELECT COALESCE(p.display_name, p.email, 'Unknown') FROM profiles p WHERE p.id = v_members[v_i])
        );
    END LOOP;

    -- paid/owed マップを初期化
    v_member_paid := '{}'::JSONB;
    v_member_owed := '{}'::JSONB;
    FOR v_i IN 1..v_member_count LOOP
        v_member_paid := v_member_paid || jsonb_build_object(v_members[v_i]::TEXT, 0);
        v_member_owed := v_member_owed || jsonb_build_object(v_members[v_i]::TEXT, 0);
    END LOOP;

    -- =========================================================================
    -- filled エントリを処理 + paid/owed を計算
    -- =========================================================================
    FOR v_entry IN
        SELECT *
        FROM settlement_entries
        WHERE session_id = p_session_id
        AND status = 'filled'
    LOOP
        -- paid を加算
        v_member_paid := jsonb_set(
            v_member_paid,
            ARRAY[v_entry.payer_id::TEXT],
            to_jsonb((v_member_paid->>v_entry.payer_id::TEXT)::INTEGER + v_entry.actual_amount)
        );

        -- owed を計算
        IF v_entry.split_type = 'custom' THEN
            -- カスタム分割: entry_splits から
            FOR v_split IN
                SELECT ses.user_id, ses.amount
                FROM settlement_entry_splits ses
                WHERE ses.entry_id = v_entry.id
            LOOP
                v_member_owed := jsonb_set(
                    v_member_owed,
                    ARRAY[v_split.user_id::TEXT],
                    to_jsonb((v_member_owed->>v_split.user_id::TEXT)::INTEGER + v_split.amount)
                );
            END LOOP;
        ELSE
            -- 均等分割
            v_per_person_amount := v_entry.actual_amount / v_member_count;
            v_remainder := v_entry.actual_amount - (v_per_person_amount * v_member_count);

            FOR v_i IN 1..v_member_count LOOP
                v_member_owed := jsonb_set(
                    v_member_owed,
                    ARRAY[v_members[v_i]::TEXT],
                    to_jsonb(
                        (v_member_owed->>v_members[v_i]::TEXT)::INTEGER
                        + v_per_person_amount
                        + CASE WHEN v_members[v_i] = v_entry.payer_id THEN v_remainder ELSE 0 END
                    )
                );
            END LOOP;
        END IF;

        -- entry_type = 'existing' の場合は既存 payment を紐付けるだけ
        IF v_entry.entry_type = 'existing' AND v_entry.source_payment_id IS NOT NULL THEN
            UPDATE payments
            SET settlement_id = p_session_id
            WHERE id = v_entry.source_payment_id;

            UPDATE settlement_entries
            SET payment_id = v_entry.source_payment_id
            WHERE id = v_entry.id;

            v_payment_count := v_payment_count + 1;
            CONTINUE;
        END IF;

        -- 新規 payment を作成
        INSERT INTO payments (
            group_id,
            payer_id,
            category_id,
            amount,
            description,
            payment_date,
            settlement_id
        ) VALUES (
            v_session.group_id,
            v_entry.payer_id,
            v_entry.category_id,
            v_entry.actual_amount,
            v_entry.description,
            v_entry.payment_date,
            p_session_id
        )
        RETURNING id INTO v_new_payment_id;

        UPDATE settlement_entries
        SET payment_id = v_new_payment_id
        WHERE id = v_entry.id;

        -- payment_splits を作成
        IF v_entry.split_type = 'custom' THEN
            INSERT INTO payment_splits (payment_id, user_id, amount)
            SELECT v_new_payment_id, ses.user_id, ses.amount
            FROM settlement_entry_splits ses
            WHERE ses.entry_id = v_entry.id;
        ELSE
            v_per_person_amount := v_entry.actual_amount / v_member_count;
            v_remainder := v_entry.actual_amount - (v_per_person_amount * v_member_count);

            FOR v_i IN 1..v_member_count LOOP
                INSERT INTO payment_splits (payment_id, user_id, amount)
                VALUES (
                    v_new_payment_id,
                    v_members[v_i],
                    CASE
                        WHEN v_members[v_i] = v_entry.payer_id
                        THEN v_per_person_amount + v_remainder
                        ELSE v_per_person_amount
                    END
                );
            END LOOP;
        END IF;

        v_payment_count := v_payment_count + 1;
    END LOOP;

    -- =========================================================================
    -- net_transfers 計算（相殺アルゴリズム）
    -- =========================================================================
    -- 各メンバーの balance を計算し、債務者/債権者に分類
    FOR v_i IN 1..v_member_count LOOP
        v_member_id := v_members[v_i];
        v_balance := (v_member_paid->>v_member_id::TEXT)::INTEGER
                   - (v_member_owed->>v_member_id::TEXT)::INTEGER;

        IF v_balance < 0 THEN
            -- 債務者（支払う側）
            v_debtors := v_debtors || jsonb_build_object(
                'id', v_member_id,
                'name', v_member_names->>v_member_id::TEXT,
                'amount', -v_balance  -- 正の値
            );
            v_is_zero := false;
        ELSIF v_balance > 0 THEN
            -- 債権者（もらう側）
            v_creditors := v_creditors || jsonb_build_object(
                'id', v_member_id,
                'name', v_member_names->>v_member_id::TEXT,
                'amount', v_balance
            );
            v_is_zero := false;
        END IF;
    END LOOP;

    -- マッチングで清算指示を生成
    v_d_idx := 0;
    v_c_idx := 0;

    WHILE v_d_idx < jsonb_array_length(v_debtors) AND v_c_idx < jsonb_array_length(v_creditors) LOOP
        v_debtor := v_debtors->v_d_idx;
        v_creditor := v_creditors->v_c_idx;

        v_d_amount := (v_debtor->>'amount')::INTEGER;
        v_c_amount := (v_creditor->>'amount')::INTEGER;

        v_settle_amount := LEAST(v_d_amount, v_c_amount);

        IF v_settle_amount > 0 THEN
            v_transfers := v_transfers || jsonb_build_object(
                'from_id', v_debtor->>'id',
                'from_name', v_debtor->>'name',
                'to_id', v_creditor->>'id',
                'to_name', v_creditor->>'name',
                'amount', v_settle_amount
            );
        END IF;

        -- 残高更新
        v_d_amount := v_d_amount - v_settle_amount;
        v_c_amount := v_c_amount - v_settle_amount;

        -- JSONB配列を直接更新
        v_debtors := jsonb_set(v_debtors, ARRAY[v_d_idx::TEXT, 'amount'], to_jsonb(v_d_amount));
        v_creditors := jsonb_set(v_creditors, ARRAY[v_c_idx::TEXT, 'amount'], to_jsonb(v_c_amount));

        IF v_d_amount <= 0 THEN v_d_idx := v_d_idx + 1; END IF;
        IF v_c_amount <= 0 THEN v_c_idx := v_c_idx + 1; END IF;
    END LOOP;

    -- =========================================================================
    -- セッションを更新
    -- =========================================================================
    IF v_is_zero THEN
        -- 0円清算: 即 settled
        UPDATE settlement_sessions
        SET
            status = 'settled',
            confirmed_at = now(),
            confirmed_by = p_user_id,
            net_transfers = v_transfers,
            is_zero_settlement = true,
            settled_at = now(),
            settled_by = p_user_id
        WHERE id = p_session_id;
    ELSE
        -- 通常: pending_payment へ
        UPDATE settlement_sessions
        SET
            status = 'pending_payment',
            confirmed_at = now(),
            confirmed_by = p_user_id,
            net_transfers = v_transfers,
            is_zero_settlement = false
        WHERE id = p_session_id;
    END IF;

    RETURN v_payment_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. report_settlement_payment: 送金完了報告
-- ----------------------------------------------------------------------------
-- 支払い側が「送金しました」を報告する
--
-- 戻り値:
--   1: 成功
--   -1: セッションが見つからない
--   -2: 権限なし（グループメンバーでない）
--   -3: pending_payment 状態でない
CREATE OR REPLACE FUNCTION report_settlement_payment(
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
BEGIN
    -- セッション情報を取得
    SELECT ss.*
    INTO v_session
    FROM settlement_sessions ss
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_session.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;
    END IF;

    -- pending_payment 状態確認
    IF v_session.status != 'pending_payment' THEN
        RETURN -3;
    END IF;

    -- 送金完了報告を記録
    UPDATE settlement_sessions
    SET
        payment_reported_at = now(),
        payment_reported_by = p_user_id
    WHERE id = p_session_id;

    RETURN 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. confirm_settlement_receipt: 受取確認→清算完了
-- ----------------------------------------------------------------------------
-- 受取側が「受け取りました」を確認し、清算を完了する
--
-- 戻り値:
--   1: 成功
--   -1: セッションが見つからない
--   -2: 権限なし（グループメンバーでない）
--   -3: pending_payment 状態でない
CREATE OR REPLACE FUNCTION confirm_settlement_receipt(
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
BEGIN
    -- セッション情報を取得
    SELECT ss.*
    INTO v_session
    FROM settlement_sessions ss
    WHERE ss.id = p_session_id;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_session.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;
    END IF;

    -- pending_payment 状態確認
    IF v_session.status != 'pending_payment' THEN
        RETURN -3;
    END IF;

    -- 清算完了
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id
    WHERE id = p_session_id;

    RETURN 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. get_settlement_period_suggestion: 期間計算ロジック再定義
-- ----------------------------------------------------------------------------
-- 変更点:
--   - 終了日: DB内の未清算データの最新日付。当日データがあれば当日を含む
--   - 開始日: 前回清算日の翌日。前回清算日当日に未清算データがあればその日を含む
--   - 安全装置: 常に開始日 ≦ 終了日
--   - settled ステータスも「前回確定」として参照
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

-- ----------------------------------------------------------------------------
-- 5. コメント
-- ----------------------------------------------------------------------------
COMMENT ON FUNCTION confirm_settlement IS '清算を確定し、pending_payment / settled に遷移。net_transfers を計算・保存';
COMMENT ON FUNCTION report_settlement_payment IS '送金完了を報告（pending_payment 状態でのみ実行可能）';
COMMENT ON FUNCTION confirm_settlement_receipt IS '受取確認で清算完了（pending_payment → settled）';
COMMENT ON FUNCTION get_settlement_period_suggestion IS '清算期間のスマート提案。終了日=最新未清算日、開始日=前回清算翌日';
