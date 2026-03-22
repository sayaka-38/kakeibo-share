-- ============================================================================
-- Fix: fill_settlement_entry_with_payment が split_type='custom' でも
--      常に均等分割で payment_splits を作成していたバグを修正。
--      custom の場合は settlement_entry_splits の金額をそのままコピーする。
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
  v_entry          RECORD;
  v_members        UUID[];
  v_member_count   INTEGER;
  v_new_payment_id UUID;
  v_per_amount     INTEGER;
  v_remainder      INTEGER;
  v_i              INTEGER;
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
      -- equal 分割用の計算（custom の場合は使わないが事前計算しておく）
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

        -- split_type に応じて payment_splits を作成
        IF v_entry.split_type = 'custom' THEN
          -- カスタム分割: settlement_entry_splits の金額をコピー
          INSERT INTO payment_splits (payment_id, user_id, amount)
          SELECT v_new_payment_id, ses.user_id, ses.amount
            FROM settlement_entry_splits ses
           WHERE ses.entry_id = p_entry_id;
        ELSE
          -- 均等分割（remainder は payer に付与）
          FOR v_i IN 1..v_member_count LOOP
            INSERT INTO payment_splits (payment_id, user_id, amount)
              VALUES (
                v_new_payment_id,
                v_members[v_i],
                v_per_amount + CASE WHEN v_members[v_i] = COALESCE(p_payer_id, v_entry.payer_id) THEN v_remainder ELSE 0 END
              );
          END LOOP;
        END IF;

        UPDATE settlement_entries SET source_payment_id = v_new_payment_id WHERE id = p_entry_id;

      ELSE
        -- 既存 payment を更新
        UPDATE payments
           SET amount       = p_actual_amount,
               payer_id     = COALESCE(p_payer_id, payer_id),
               payment_date = COALESCE(p_payment_date, payment_date)
         WHERE id = v_entry.source_payment_id;

        -- payment_splits を再作成
        DELETE FROM payment_splits WHERE payment_id = v_entry.source_payment_id;

        IF v_entry.split_type = 'custom' THEN
          -- カスタム分割: settlement_entry_splits の金額をコピー
          INSERT INTO payment_splits (payment_id, user_id, amount)
          SELECT v_entry.source_payment_id, ses.user_id, ses.amount
            FROM settlement_entry_splits ses
           WHERE ses.entry_id = p_entry_id;
        ELSE
          -- 均等分割を再計算
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
  END IF;

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION fill_settlement_entry_with_payment IS
  'rule_id IS NOT NULL のエントリ填記時に payments / payment_splits を即時作成。'
  'split_type=custom の場合は settlement_entry_splits の金額をコピー（均等分割しない）。'
  'スキップ時は payment を削除（v42: custom split 対応）';
