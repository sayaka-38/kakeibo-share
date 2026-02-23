-- ============================================================================
-- Phase 15B': 填記即時登録 RPC + confirm_settlement 冪等化
-- ============================================================================

-- ============================================================================
-- 新規 RPC: fill_settlement_entry_with_payment
-- rule_id IS NOT NULL のエントリ填記時に payments / payment_splits を即時作成
-- ============================================================================
CREATE OR REPLACE FUNCTION fill_settlement_entry_with_payment(
  p_entry_id      UUID,
  p_user_id       UUID,
  p_actual_amount INTEGER,      -- NULL 可（スキップ時）
  p_payer_id      UUID DEFAULT NULL,
  p_payment_date  DATE DEFAULT NULL,
  p_status        TEXT DEFAULT 'filled'
)
RETURNS INTEGER  -- 1=filled, 2=skipped(payment deleted), -1=not found, -2=not member, -3=not draft
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry        RECORD;
  v_members      UUID[];
  v_member_count INTEGER;
  v_new_payment_id UUID;
  v_per_amount   INTEGER;
  v_remainder    INTEGER;
  v_i            INTEGER;
BEGIN
  -- エントリ + セッション取得
  SELECT se.*, ss.group_id, ss.status AS session_status
    INTO v_entry
    FROM settlement_entries se
    JOIN settlement_sessions ss ON ss.id = se.session_id
   WHERE se.id = p_entry_id;

  IF NOT FOUND THEN RETURN -1; END IF;
  IF NOT EXISTS (SELECT 1 FROM group_members WHERE group_id = v_entry.group_id AND user_id = p_user_id) THEN RETURN -2; END IF;
  IF v_entry.session_status != 'draft' THEN RETURN -3; END IF;

  -- settlement_entry を更新
  UPDATE settlement_entries
     SET actual_amount = CASE WHEN p_status = 'skipped' THEN NULL ELSE p_actual_amount END,
         payer_id      = COALESCE(p_payer_id, payer_id),
         payment_date  = COALESCE(p_payment_date, payment_date),
         status        = p_status,
         filled_by     = CASE WHEN p_status = 'filled' THEN p_user_id ELSE filled_by END,
         filled_at     = CASE WHEN p_status = 'filled' THEN now() ELSE filled_at END
   WHERE id = p_entry_id;

  -- rule エントリのみ payment を同期
  IF v_entry.rule_id IS NOT NULL THEN
    IF p_status = 'skipped' AND v_entry.source_payment_id IS NOT NULL THEN
      -- スキップ → 既存 payment を削除
      DELETE FROM payment_splits WHERE payment_id = v_entry.source_payment_id;
      DELETE FROM payments WHERE id = v_entry.source_payment_id;
      UPDATE settlement_entries SET source_payment_id = NULL WHERE id = p_entry_id;
      RETURN 2;

    ELSIF p_status = 'filled' THEN
      -- グループメンバー取得
      SELECT ARRAY_AGG(user_id ORDER BY user_id) INTO v_members
        FROM group_members WHERE group_id = v_entry.group_id;
      v_member_count := array_length(v_members, 1);
      v_per_amount   := p_actual_amount / v_member_count;
      v_remainder    := p_actual_amount - v_per_amount * v_member_count;

      IF v_entry.source_payment_id IS NULL THEN
        -- 新規 payment 作成
        INSERT INTO payments (group_id, payer_id, category_id, amount, description, payment_date)
          VALUES (
            v_entry.group_id,
            COALESCE(p_payer_id, v_entry.payer_id),
            v_entry.category_id,
            p_actual_amount,
            v_entry.description,
            COALESCE(p_payment_date, v_entry.payment_date)
          )
        RETURNING id INTO v_new_payment_id;

        -- 均等分割（remainder は payer に付与）
        FOR v_i IN 1..v_member_count LOOP
          INSERT INTO payment_splits (payment_id, user_id, amount)
            VALUES (
              v_new_payment_id,
              v_members[v_i],
              v_per_amount + CASE WHEN v_members[v_i] = COALESCE(p_payer_id, v_entry.payer_id) THEN v_remainder ELSE 0 END
            );
        END LOOP;

        UPDATE settlement_entries SET source_payment_id = v_new_payment_id WHERE id = p_entry_id;

      ELSE
        -- 既存 payment を更新
        UPDATE payments
           SET amount       = p_actual_amount,
               payer_id     = COALESCE(p_payer_id, payer_id),
               payment_date = COALESCE(p_payment_date, payment_date)
         WHERE id = v_entry.source_payment_id;

        -- 均等分割を再計算
        DELETE FROM payment_splits WHERE payment_id = v_entry.source_payment_id;
        FOR v_i IN 1..v_member_count LOOP
          INSERT INTO payment_splits (payment_id, user_id, amount)
            VALUES (
              v_entry.source_payment_id,
              v_members[v_i],
              v_per_amount + CASE WHEN v_members[v_i] = COALESCE(p_payer_id, v_entry.payer_id) THEN v_remainder ELSE 0 END
            );
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION fill_settlement_entry_with_payment IS 'rule_id IS NOT NULL のエントリ填記時に payments / payment_splits を即時作成。スキップ時は payment を削除（Phase 15B''）';

-- ============================================================================
-- confirm_settlement 冪等化（source_payment_id IS NOT NULL → 既存 payment をリンク）
-- entry_type チェックを削除し source_payment_id の有無で判定
-- ============================================================================
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

    -- メンバー名マップを構築
    FOR v_i IN 1..v_member_count LOOP
        v_member_names := v_member_names || jsonb_build_object(
            v_members[v_i]::TEXT,
            (SELECT COALESCE(p.display_name, p.email, 'Unknown') FROM profiles p WHERE p.id = v_members[v_i])
        );
    END LOOP;

    -- paid/owed マップを初期化
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

        -- source_payment_id IS NOT NULL の場合は既存 payment を紐付けるだけ（冪等）
        IF v_entry.source_payment_id IS NOT NULL THEN
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
    FOR v_i IN 1..v_member_count LOOP
        v_member_id := v_members[v_i];
        v_balance := (v_member_paid->>v_member_id::TEXT)::INTEGER
                   - (v_member_owed->>v_member_id::TEXT)::INTEGER;

        IF v_balance < 0 THEN
            v_debtors := v_debtors || jsonb_build_object(
                'id', v_member_id,
                'name', v_member_names->>v_member_id::TEXT,
                'amount', -v_balance
            );
            v_is_zero := false;
        ELSIF v_balance > 0 THEN
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

        v_d_amount := v_d_amount - v_settle_amount;
        v_c_amount := v_c_amount - v_settle_amount;

        v_debtors := jsonb_set(v_debtors, ARRAY[v_d_idx::TEXT, 'amount'], to_jsonb(v_d_amount));
        v_creditors := jsonb_set(v_creditors, ARRAY[v_c_idx::TEXT, 'amount'], to_jsonb(v_c_amount));

        IF v_d_amount <= 0 THEN v_d_idx := v_d_idx + 1; END IF;
        IF v_c_amount <= 0 THEN v_c_idx := v_c_idx + 1; END IF;
    END LOOP;

    -- =========================================================================
    -- セッションを更新
    -- =========================================================================
    IF v_is_zero THEN
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

COMMENT ON FUNCTION confirm_settlement IS '清算を確定し、pending_payment / settled に遷移。net_transfers を計算・保存（v41: source_payment_id IS NOT NULL で冪等化）';
