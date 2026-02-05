-- ============================================================================
-- Phase 7: Settlement Engine - RPC Functions
-- ============================================================================
-- 清算準備室のエントリ生成、確定処理、スマート提案用の関数
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_last_day_of_month: 指定月の末日を取得
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_last_day_of_month(p_year INTEGER, p_month INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN EXTRACT(DAY FROM
        (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE
    )::INTEGER;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. get_actual_day_of_month: day_of_month を実際の日付に変換（末日対応）
-- ----------------------------------------------------------------------------
-- day_of_month = 31 で2月の場合は 28 or 29 を返す
CREATE OR REPLACE FUNCTION get_actual_day_of_month(
    p_day_of_month INTEGER,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_last_day INTEGER;
BEGIN
    v_last_day := get_last_day_of_month(p_year, p_month);
    RETURN LEAST(p_day_of_month, v_last_day);
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. get_settlement_period_suggestion: スマート提案
-- ----------------------------------------------------------------------------
-- 未清算データの最古日と最新日を取得し、デフォルト期間を提案
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
    v_last_confirmed_end DATE;
    v_unsettled_count INTEGER;
BEGIN
    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = p_group_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is not a member of this group';
    END IF;

    -- 未清算支払いの最古日と件数を取得
    SELECT MIN(payment_date), COUNT(*)
    INTO v_oldest_unsettled, v_unsettled_count
    FROM payments
    WHERE group_id = p_group_id
    AND settlement_id IS NULL;

    -- 前回確定済みセッションの終了日を取得
    SELECT period_end
    INTO v_last_confirmed_end
    FROM settlement_sessions
    WHERE group_id = p_group_id
    AND status = 'confirmed'
    ORDER BY period_end DESC
    LIMIT 1;

    RETURN QUERY SELECT
        -- suggested_start: 未清算の最古日 or 前回終了日+1 or 今月1日
        COALESCE(
            v_oldest_unsettled,
            v_last_confirmed_end + INTERVAL '1 day',
            DATE_TRUNC('month', CURRENT_DATE)::DATE
        )::DATE,
        -- suggested_end: 今日
        CURRENT_DATE,
        -- 参考情報
        v_oldest_unsettled,
        v_last_confirmed_end,
        COALESCE(v_unsettled_count, 0)::INTEGER;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. generate_settlement_entries: エントリ生成
-- ----------------------------------------------------------------------------
-- 期間内のルールからエントリを生成 + 未清算の既存支払いを取り込み
--
-- 戻り値:
--   >= 0: 生成されたエントリ数
--   -1: セッションが見つからない
--   -2: 権限なし
--   -3: セッションがdraft状態でない
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
    -- Part 1: 固定費ルールからエントリを生成
    -- =========================================================================
    FOR v_rule IN
        SELECT rr.*
        FROM recurring_rules rr
        WHERE rr.group_id = v_session.group_id
        AND rr.is_active = true
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

-- ----------------------------------------------------------------------------
-- 5. confirm_settlement: 清算確定処理
-- ----------------------------------------------------------------------------
-- filled状態のエントリを payments/payment_splits に変換し、セッションを確定
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

    -- filled エントリがあるか確認
    IF NOT EXISTS (
        SELECT 1 FROM settlement_entries
        WHERE session_id = p_session_id AND status = 'filled'
    ) THEN
        RETURN -4;  -- filled エントリがない
    END IF;

    -- グループメンバー一覧を取得
    SELECT ARRAY_AGG(user_id ORDER BY user_id)
    INTO v_members
    FROM group_members
    WHERE group_id = v_session.group_id;

    v_member_count := array_length(v_members, 1);

    -- =========================================================================
    -- filled エントリを処理
    -- =========================================================================
    FOR v_entry IN
        SELECT *
        FROM settlement_entries
        WHERE session_id = p_session_id
        AND status = 'filled'
    LOOP
        -- entry_type = 'existing' の場合は既存 payment を紐付けるだけ
        IF v_entry.entry_type = 'existing' AND v_entry.source_payment_id IS NOT NULL THEN
            -- 既存 payment に settlement_id を設定
            UPDATE payments
            SET settlement_id = p_session_id
            WHERE id = v_entry.source_payment_id;

            -- エントリに payment_id をリンク
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

        -- エントリに payment_id をリンク
        UPDATE settlement_entries
        SET payment_id = v_new_payment_id
        WHERE id = v_entry.id;

        -- payment_splits を作成
        IF v_entry.split_type = 'custom' THEN
            -- カスタム分割: settlement_entry_splits からコピー
            INSERT INTO payment_splits (payment_id, user_id, amount)
            SELECT v_new_payment_id, ses.user_id, ses.amount
            FROM settlement_entry_splits ses
            WHERE ses.entry_id = v_entry.id;
        ELSE
            -- 均等分割: 計算して生成
            v_per_person_amount := v_entry.actual_amount / v_member_count;
            v_remainder := v_entry.actual_amount - (v_per_person_amount * v_member_count);

            FOR v_i IN 1..v_member_count LOOP
                INSERT INTO payment_splits (payment_id, user_id, amount)
                VALUES (
                    v_new_payment_id,
                    v_members[v_i],
                    CASE
                        -- 支払者に端数を加算
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
    -- セッションを confirmed に更新
    -- =========================================================================
    UPDATE settlement_sessions
    SET
        status = 'confirmed',
        confirmed_at = now(),
        confirmed_by = p_user_id
    WHERE id = p_session_id;

    RETURN v_payment_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. update_settlement_entry: エントリ更新（金額入力）
-- ----------------------------------------------------------------------------
-- 個別エントリの金額を更新し、ステータスを filled に変更
--
-- 戻り値:
--   1: 成功
--   -1: エントリが見つからない
--   -2: 権限なし
--   -3: セッションがdraft状態でない
CREATE OR REPLACE FUNCTION update_settlement_entry(
    p_entry_id UUID,
    p_user_id UUID,
    p_actual_amount INTEGER,
    p_payer_id UUID DEFAULT NULL,
    p_payment_date DATE DEFAULT NULL,
    p_status TEXT DEFAULT 'filled'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry RECORD;
    v_session RECORD;
BEGIN
    -- エントリ情報を取得
    SELECT se.*, ss.group_id, ss.status as session_status
    INTO v_entry
    FROM settlement_entries se
    JOIN settlement_sessions ss ON ss.id = se.session_id
    WHERE se.id = p_entry_id;

    IF NOT FOUND THEN
        RETURN -1;  -- エントリが見つからない
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_entry.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;  -- 権限なし
    END IF;

    -- draft状態確認
    IF v_entry.session_status != 'draft' THEN
        RETURN -3;  -- draft状態でない
    END IF;

    -- エントリを更新
    UPDATE settlement_entries
    SET
        actual_amount = p_actual_amount,
        payer_id = COALESCE(p_payer_id, payer_id),
        payment_date = COALESCE(p_payment_date, payment_date),
        status = p_status,
        filled_by = CASE WHEN p_status = 'filled' THEN p_user_id ELSE filled_by END,
        filled_at = CASE WHEN p_status = 'filled' THEN now() ELSE filled_at END
    WHERE id = p_entry_id;

    RETURN 1;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. replace_settlement_entry_splits: エントリのカスタム分割を置換
-- ----------------------------------------------------------------------------
-- 既存の分割を削除し、新しい分割を挿入（原子的操作）
--
-- p_splits: JSONB配列 [{"user_id": "uuid", "amount": 1000}, ...]
--
-- 戻り値:
--   >= 0: 挿入された件数
--   -1: エントリが見つからない
--   -2: 権限なし
--   -3: セッションがdraft状態でない
CREATE OR REPLACE FUNCTION replace_settlement_entry_splits(
    p_entry_id UUID,
    p_user_id UUID,
    p_splits JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry RECORD;
    v_split JSONB;
    v_count INTEGER := 0;
BEGIN
    -- エントリ情報を取得
    SELECT se.*, ss.group_id, ss.status as session_status
    INTO v_entry
    FROM settlement_entries se
    JOIN settlement_sessions ss ON ss.id = se.session_id
    WHERE se.id = p_entry_id;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    -- メンバーシップ確認
    IF NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = v_entry.group_id AND user_id = p_user_id
    ) THEN
        RETURN -2;
    END IF;

    -- draft状態確認
    IF v_entry.session_status != 'draft' THEN
        RETURN -3;
    END IF;

    -- 既存の splits を削除
    DELETE FROM settlement_entry_splits WHERE entry_id = p_entry_id;

    -- 新しい splits を挿入
    FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
    LOOP
        INSERT INTO settlement_entry_splits (entry_id, user_id, amount)
        VALUES (
            p_entry_id,
            (v_split->>'user_id')::UUID,
            (v_split->>'amount')::INTEGER
        );
        v_count := v_count + 1;
    END LOOP;

    -- split_type を custom に更新
    UPDATE settlement_entries
    SET split_type = 'custom'
    WHERE id = p_entry_id;

    RETURN v_count;
END;
$$;

-- コメント
COMMENT ON FUNCTION get_last_day_of_month IS '指定年月の末日を返す';
COMMENT ON FUNCTION get_actual_day_of_month IS 'day_of_month を実際の日付に変換（31日設定で2月なら28/29を返す）';
COMMENT ON FUNCTION get_settlement_period_suggestion IS '清算期間のスマート提案を返す';
COMMENT ON FUNCTION generate_settlement_entries IS 'セッションにエントリを生成（ルールから + 未清算支払い取り込み）';
COMMENT ON FUNCTION confirm_settlement IS '清算を確定し、payments/payment_splits に書き込む';
COMMENT ON FUNCTION update_settlement_entry IS '個別エントリの金額を更新';
COMMENT ON FUNCTION replace_settlement_entry_splits IS 'エントリのカスタム分割を原子的に置換';
