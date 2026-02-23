


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."anonymize_user"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 0. 認可チェック: 自分自身のみ匿名化可（admin client は auth.uid() = NULL なのでスキップ）
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: can only anonymize your own account';
  END IF;

  -- 1. 対象ユーザーの存在確認
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN false;
  END IF;

  -- 2. プロフィールを匿名化（行は残す = FK 参照を維持）
  UPDATE profiles
  SET
    display_name = '退会済みユーザー',
    email = NULL,
    avatar_url = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  -- 3. グループオーナー権を委譲
  --    他メンバーがいるグループ: 最古参メンバーに委譲
  UPDATE groups
  SET owner_id = (
    SELECT gm.user_id
    FROM group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id != p_user_id
    ORDER BY gm.joined_at ASC
    LIMIT 1
  )
  WHERE owner_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id != p_user_id
    );

  -- ソログループ（他メンバーなし）: owner_id はそのまま保持
  -- profiles 行が残るため FK 制約は壊れない

  -- 4. 全グループから退去
  DELETE FROM group_members WHERE user_id = p_user_id;

  -- 5. 固定費ルールの割り勘テンプレートを削除（将来の生成に影響するため）
  DELETE FROM recurring_rule_splits WHERE user_id = p_user_id;

  -- 6. デモセッションを削除
  DELETE FROM demo_sessions WHERE user_id = p_user_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."anonymize_user"("p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."anonymize_user"("p_user_id" "uuid") IS 'ユーザー退会処理（匿名化）- v2: 認可チェック追加（自分自身のみ実行可）';



CREATE OR REPLACE FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payer_id UUID;
  v_settlement_id UUID;
BEGIN
  -- 1. 支払い存在確認
  SELECT payer_id, settlement_id INTO v_payer_id, v_settlement_id
  FROM payments WHERE id = p_payment_id;

  IF v_payer_id IS NULL THEN
    RAISE EXCEPTION 'archive_payment: not_found';
  END IF;

  IF v_settlement_id IS NOT NULL THEN
    RAISE EXCEPTION 'archive_payment: settled';
  END IF;

  IF v_payer_id != p_user_id THEN
    RAISE EXCEPTION 'archive_payment: not_payer';
  END IF;

  -- 2. archived_payments へコピー
  INSERT INTO archived_payments (id, group_id, payer_id, category_id, amount,
    description, payment_date, settlement_id, created_at, updated_at)
  SELECT id, group_id, payer_id, category_id, amount,
    description, payment_date, settlement_id, created_at, updated_at
  FROM payments WHERE id = p_payment_id;

  -- 3. archived_payment_splits へコピー
  INSERT INTO archived_payment_splits (id, payment_id, user_id, amount)
  SELECT id, payment_id, user_id, amount
  FROM payment_splits WHERE payment_id = p_payment_id;

  -- 4. payments 削除 (CASCADE で payment_splits も削除)
  DELETE FROM payments WHERE id = p_payment_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") IS '支払いをアーカイブ（論理削除）- v2: RAISE EXCEPTION 形式に統一';



CREATE OR REPLACE FUNCTION "public"."calculate_user_balance"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  total_paid DECIMAL;
  total_owed DECIMAL;
BEGIN
  -- Total amount paid by user (payer_id に更新)
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments
  WHERE group_id = p_group_id AND payer_id = p_user_id;

  -- Total amount user owes (from splits)
  SELECT COALESCE(SUM(ps.amount), 0) INTO total_owed
  FROM payment_splits ps
  JOIN payments p ON ps.payment_id = p.id
  WHERE p.group_id = p_group_id AND ps.user_id = p_user_id;

  RETURN total_paid - total_owed;
END;
$$;


ALTER FUNCTION "public"."calculate_user_balance"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") IS '清算を確定し、pending_payment / settled に遷移。net_transfers を計算・保存（v41: source_payment_id IS NOT NULL で冪等化）';



CREATE OR REPLACE FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

    -- 対象セッションを清算完了
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id
    WHERE id = p_session_id;

    -- 同グループの他の pending_payment セッションも一括で settled に更新
    -- net_transfers を空にして「統合済み」であることを示す
    -- （統合済みセッションのゾンビ化を防止）
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id,
        net_transfers = '[]'::JSONB
    WHERE group_id = v_session.group_id
      AND status = 'pending_payment'
      AND id != p_session_id;

    RETURN 1;
END;
$$;


ALTER FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") IS '受取確認で清算完了。同グループの全 pending_payment セッションも一括 settled（ゾンビ防止）';



CREATE OR REPLACE FUNCTION "public"."create_demo_bot_partner"("p_group_id" "uuid", "p_demo_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bot_id UUID := gen_random_uuid();
  v_instance_id UUID;
  v_today DATE := CURRENT_DATE;
  v_payment_id UUID;
  v_food_cat_id UUID;
  v_utilities_cat_id UUID;
  v_daily_cat_id UUID;
  v_socializing_cat_id UUID;
BEGIN
  -- Validate: caller must be the demo user
  IF auth.uid() IS DISTINCT FROM p_demo_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the demo user';
  END IF;

  -- Get instance_id from existing demo user
  SELECT instance_id INTO v_instance_id
  FROM auth.users WHERE id = p_demo_user_id;

  IF v_instance_id IS NULL THEN
    RAISE EXCEPTION 'Demo user not found in auth.users';
  END IF;

  -- 1. Create auth.users entry for bot (anonymous user)
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_anonymous
  ) VALUES (
    v_instance_id, v_bot_id, 'authenticated', 'authenticated',
    '', now(), now(), now(),
    '{"provider": "anonymous", "providers": ["anonymous"]}'::jsonb,
    '{}'::jsonb,
    true
  );

  -- 2. Update auto-created profile (trigger) or insert if needed
  UPDATE profiles
  SET display_name = 'さくら（パートナー）', is_demo = true
  WHERE id = v_bot_id;

  IF NOT FOUND THEN
    INSERT INTO profiles (id, display_name, is_demo)
    VALUES (v_bot_id, 'さくら（パートナー）', true);
  END IF;

  -- 3. Add bot to group as member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (p_group_id, v_bot_id, 'member');

  -- 4. Get default category IDs
  SELECT id INTO v_food_cat_id
  FROM categories WHERE name = '食費' AND is_default = true LIMIT 1;

  SELECT id INTO v_utilities_cat_id
  FROM categories WHERE name = '光熱費' AND is_default = true LIMIT 1;

  SELECT id INTO v_daily_cat_id
  FROM categories WHERE name = '日用品' AND is_default = true LIMIT 1;

  SELECT id INTO v_socializing_cat_id
  FROM categories WHERE name = '交際費' AND is_default = true LIMIT 1;

  -- 5. Create sample payments from bot

  -- Payment 1: 電気代（5日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 8500, '電気代 1月分', v_utilities_cat_id, v_today - 5)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 4250),
    (v_payment_id, p_demo_user_id, 4250);

  -- Payment 2: スーパーで買い物（3日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 2480, 'スーパーで買い物', v_food_cat_id, v_today - 3)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 1240),
    (v_payment_id, p_demo_user_id, 1240);

  -- Payment 3: ドラッグストア（2日前）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 1860, 'ドラッグストアで日用品', v_daily_cat_id, v_today - 2)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 930),
    (v_payment_id, p_demo_user_id, 930);

  -- Payment 4: カフェでランチ（昨日）
  INSERT INTO payments (group_id, payer_id, amount, description, category_id, payment_date)
  VALUES (p_group_id, v_bot_id, 3200, 'カフェでランチ 🍰', v_socializing_cat_id, v_today - 1)
  RETURNING id INTO v_payment_id;

  INSERT INTO payment_splits (payment_id, user_id, amount) VALUES
    (v_payment_id, v_bot_id, 1600),
    (v_payment_id, p_demo_user_id, 1600);

  RETURN jsonb_build_object(
    'bot_id', v_bot_id,
    'bot_name', 'さくら（パートナー）',
    'payments_created', 4
  );
END;
$$;


ALTER FUNCTION "public"."create_demo_bot_partner"("p_group_id" "uuid", "p_demo_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_expired_demo_data"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_user_ids  UUID[];
  v_group_ids UUID[];
  v_count     integer;
BEGIN
  -- 1. 期限切れセッションのユーザーID・グループIDを収集
  --    1時間のグレース期間を設けて誤削除を防ぐ
  SELECT
    array_agg(DISTINCT user_id),
    array_agg(DISTINCT group_id)
  INTO v_user_ids, v_group_ids
  FROM demo_sessions
  WHERE expires_at < now() - interval '1 hour';

  IF v_user_ids IS NULL THEN
    RETURN 0;
  END IF;

  v_count := array_length(v_user_ids, 1);

  -- 2. グループを削除（group_members / payments / payment_splits /
  --    settlement_sessions / settlement_entries / demo_sessions がカスケード削除される）
  DELETE FROM public.groups
  WHERE id = ANY(v_group_ids);

  -- 3. auth.users を削除（is_anonymous かつ is_demo プロフィールのみ対象）
  --    profiles は FK の ON DELETE CASCADE がないため手動削除が必要
  DELETE FROM auth.users
  WHERE id = ANY(v_user_ids)
    AND is_anonymous = true;

  -- 4. profiles を削除（auth.users 削除後に残ったレコードを安全に削除）
  DELETE FROM public.profiles
  WHERE id = ANY(v_user_ids)
    AND is_demo = true;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."delete_expired_demo_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_expired_demo_data"() IS '期限切れデモデータを一括削除する (pg_cron で 3 時間おきに実行)';



CREATE OR REPLACE FUNCTION "public"."delete_payment_splits_for_payer"("p_payment_id" "uuid", "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payer_id UUID;
  v_deleted_count INTEGER;
BEGIN
  -- 1. 支払者本人か検証
  SELECT payer_id INTO v_payer_id
  FROM payments
  WHERE id = p_payment_id;

  -- 支払いが存在しない or 支払者でない → -1 を返す
  IF v_payer_id IS NULL OR v_payer_id != p_user_id THEN
    RETURN -1;
  END IF;

  -- 2. payment_splits を全削除
  DELETE FROM payment_splits WHERE payment_id = p_payment_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$;


ALTER FUNCTION "public"."delete_payment_splits_for_payer"("p_payment_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid" DEFAULT NULL::"uuid", "p_payment_date" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT 'filled'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") IS 'rule_id IS NOT NULL のエントリ填記時に payments / payment_splits を即時作成。スキップ時は payment を削除（Phase 15B''）';



CREATE OR REPLACE FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") IS 'セッションにエントリを生成（ルールから + 未清算支払い取り込み）- v19: start_date/end_date 対応で遡り清算を可能に';



CREATE OR REPLACE FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    v_last_day INTEGER;
BEGIN
    v_last_day := get_last_day_of_month(p_year, p_month);
    RETURN LEAST(p_day_of_month, v_last_day);
END;
$$;


ALTER FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) IS 'day_of_month を実際の日付に変換（31日設定で2月なら28/29を返す）';



CREATE OR REPLACE FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer DEFAULT 6) RETURNS TABLE("description" "text", "category_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- グループメンバーのみアクセス可能
  IF NOT public.is_group_member(p_group_id, auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sub.description,
    sub.category_id
  FROM (
    SELECT
      p.description,
      p.category_id,
      COUNT(*)            AS use_count,
      MAX(p.payment_date) AS last_used
    FROM public.payments p
    WHERE p.group_id = p_group_id
    GROUP BY p.description, p.category_id
    ORDER BY use_count DESC, last_used DESC
    LIMIT p_limit
  ) sub;
END;
$$;


ALTER FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer) IS 'グループ内でよく使われる説明文とカテゴリIDのペアを頻度順に返す（スマートチップ機能用）';



CREATE OR REPLACE FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    RETURN EXTRACT(DAY FROM
        (DATE_TRUNC('month', MAKE_DATE(p_year, p_month, 1)) + INTERVAL '1 month - 1 day')::DATE
    )::INTEGER;
END;
$$;


ALTER FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) IS '指定年月の末日を返す';



CREATE OR REPLACE FUNCTION "public"."get_payment_group_id"("_payment_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT group_id FROM payments WHERE id = _payment_id;
$$;


ALTER FUNCTION "public"."get_payment_group_id"("_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("suggested_start" "date", "suggested_end" "date", "oldest_unsettled_date" "date", "last_confirmed_end" "date", "unsettled_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") IS '清算期間のスマート提案。開始日=未清算最古日 or 前回清算翌日、終了日=最新未清算日';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member"("_group_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = _group_id
    AND user_id = _user_id
  );
$$;


ALTER FUNCTION "public"."is_group_member"("_group_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_owner"("_group_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = _group_id
    AND owner_id = _user_id
  );
$$;


ALTER FUNCTION "public"."is_group_owner"("_group_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_payment_payer"("_payment_id" "uuid", "_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM payments WHERE id = _payment_id AND payer_id = _user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_payment_payer"("_payment_id" "uuid", "_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_group"("p_group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_member_count INT;
  v_owner_count INT;
BEGIN
  -- 呼出元ユーザーを取得
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- メンバーシップ確認
  SELECT role INTO v_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  -- グループの総メンバー数
  SELECT COUNT(*) INTO v_member_count
  FROM group_members
  WHERE group_id = p_group_id;

  IF v_role = 'owner' THEN
    -- オーナーの場合: 他にオーナーがいるかチェック
    SELECT COUNT(*) INTO v_owner_count
    FROM group_members
    WHERE group_id = p_group_id AND role = 'owner' AND user_id != v_user_id;

    IF v_member_count = 1 THEN
      -- 自分だけ → グループごと削除（CASCADE）
      DELETE FROM groups WHERE id = p_group_id;
      RETURN true;
    END IF;

    IF v_owner_count = 0 THEN
      -- 唯一のオーナーで他メンバーあり → 権限譲渡が必要
      RAISE EXCEPTION 'Must transfer ownership before leaving';
    END IF;
  END IF;

  -- 一般メンバー or 共同オーナー → 退出
  DELETE FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."leave_group"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_payment_splits"("p_payment_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payer_id UUID;
  v_deleted_count INTEGER;
  v_inserted_count INTEGER;
BEGIN
  -- 1. 支払い存在確認 + 支払者本人チェック
  SELECT payer_id INTO v_payer_id
  FROM payments
  WHERE id = p_payment_id;

  IF v_payer_id IS NULL THEN
    RETURN -1;  -- 支払いが存在しない
  END IF;

  IF v_payer_id != p_user_id THEN
    RETURN -2;  -- 支払者本人でない
  END IF;

  -- 2. 既存の payment_splits を全削除
  DELETE FROM payment_splits WHERE payment_id = p_payment_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 3. 新しい payment_splits を挿入
  INSERT INTO payment_splits (payment_id, user_id, amount)
  SELECT
    p_payment_id,
    (s->>'user_id')::UUID,
    (s->>'amount')::DECIMAL
  FROM jsonb_array_elements(p_splits) AS s;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN v_inserted_count;
END;
$$;


ALTER FUNCTION "public"."replace_payment_splits"("p_payment_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") IS 'エントリのカスタム分割を原子的に置換';



CREATE OR REPLACE FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") IS '送金完了を報告（pending_payment 状態でのみ実行可能）';



CREATE OR REPLACE FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE settlement_sessions
    SET
        status = 'settled',
        settled_at = now(),
        settled_by = p_user_id,
        net_transfers = '[]'::JSONB
    WHERE id = ANY(p_session_ids)
      AND status = 'pending_payment';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;


ALTER FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") IS '統合済みセッションを一括で settled に更新（SECURITY DEFINER で RLS バイパス）';



CREATE OR REPLACE FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 自分への譲渡は不可
  IF v_user_id = p_new_owner_id THEN
    RAISE EXCEPTION 'Cannot transfer ownership to yourself';
  END IF;

  -- 呼出元がオーナーか確認
  SELECT role INTO v_caller_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only the owner can transfer ownership';
  END IF;

  -- 新オーナーがメンバーか確認
  SELECT role INTO v_target_role
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_new_owner_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this group';
  END IF;

  -- groups.owner_id を更新
  UPDATE groups SET owner_id = p_new_owner_id WHERE id = p_group_id;

  -- 旧オーナー → member
  UPDATE group_members SET role = 'member'
  WHERE group_id = p_group_id AND user_id = v_user_id;

  -- 新オーナー → owner
  UPDATE group_members SET role = 'owner'
  WHERE group_id = p_group_id AND user_id = p_new_owner_id;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_recurring_rules_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_recurring_rules_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid" DEFAULT NULL::"uuid", "p_payment_date" "date" DEFAULT NULL::"date", "p_status" "text" DEFAULT 'filled'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") IS '個別エントリの金額を更新';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."archived_payment_splits" (
    "id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."archived_payment_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archived_payments" (
    "id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "amount" numeric(12,2) NOT NULL,
    "description" "text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "settlement_id" "uuid",
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "archived_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."archived_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "group_id" "uuid",
    "is_default" boolean DEFAULT false NOT NULL,
    CONSTRAINT "categories_name_check" CHECK (("char_length"("name") <= 50))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demo_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."demo_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invite_code" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(6), 'hex'::"text") NOT NULL,
    CONSTRAINT "groups_description_check" CHECK (("char_length"("description") <= 200)),
    CONSTRAINT "groups_name_check" CHECK (("char_length"("name") <= 50))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


COMMENT ON COLUMN "public"."groups"."owner_id" IS 'グループのオーナー（旧created_by）';



CREATE TABLE IF NOT EXISTS "public"."payment_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    CONSTRAINT "payment_splits_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."payment_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "description" "text" NOT NULL,
    "category_id" "uuid",
    "payment_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "settlement_id" "uuid",
    CONSTRAINT "payments_amount_check" CHECK ((("amount" > (0)::numeric) AND ("amount" <= (1000000)::numeric))),
    CONSTRAINT "payments_description_check" CHECK (("char_length"("description") <= 100))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."payments" IS '未来日付の支払いを許可（Phase 15B''）';



COMMENT ON COLUMN "public"."payments"."payer_id" IS '支払いを行ったユーザー（旧paid_by）';



COMMENT ON COLUMN "public"."payments"."settlement_id" IS '清算セッションへの紐付け（NULLなら未清算）';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "display_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_demo" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_display_name_check" CHECK (("char_length"("display_name") <= 30))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_demo" IS 'デモユーザーフラグ（true=デモ、false=本番）';



CREATE TABLE IF NOT EXISTS "public"."recurring_rule_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer,
    "percentage" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurring_rule_splits_amount_positive" CHECK ((("amount" IS NULL) OR ("amount" >= 0))),
    CONSTRAINT "recurring_rule_splits_one_type" CHECK (((("amount" IS NOT NULL) AND ("percentage" IS NULL)) OR (("amount" IS NULL) AND ("percentage" IS NOT NULL)))),
    CONSTRAINT "recurring_rule_splits_percentage_range" CHECK ((("percentage" IS NULL) OR (("percentage" >= (0)::numeric) AND ("percentage" <= (100)::numeric))))
);


ALTER TABLE "public"."recurring_rule_splits" OWNER TO "postgres";


COMMENT ON TABLE "public"."recurring_rule_splits" IS '固定費ルールのカスタム分割設定';



CREATE TABLE IF NOT EXISTS "public"."recurring_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "description" "text" NOT NULL,
    "default_amount" integer,
    "is_variable" boolean DEFAULT false NOT NULL,
    "day_of_month" integer NOT NULL,
    "default_payer_id" "uuid" NOT NULL,
    "split_type" "text" DEFAULT 'equal'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "interval_months" smallint DEFAULT 1 NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    CONSTRAINT "recurring_rules_amount_positive" CHECK ((("default_amount" IS NULL) OR ("default_amount" > 0))),
    CONSTRAINT "recurring_rules_day_of_month_range" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31))),
    CONSTRAINT "recurring_rules_description_length" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 100))),
    CONSTRAINT "recurring_rules_interval_months_valid" CHECK ((("interval_months" >= 1) AND ("interval_months" <= 12))),
    CONSTRAINT "recurring_rules_split_type_valid" CHECK (("split_type" = ANY (ARRAY['equal'::"text", 'custom'::"text"]))),
    CONSTRAINT "recurring_rules_variable_amount_consistency" CHECK (((("is_variable" = true) AND ("default_amount" IS NULL)) OR (("is_variable" = false) AND ("default_amount" IS NOT NULL))))
);


ALTER TABLE "public"."recurring_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."recurring_rules" IS '固定費ルール（雛形）- 毎月発生する固定費のテンプレート';



COMMENT ON COLUMN "public"."recurring_rules"."is_variable" IS 'true=変動費（毎回金額入力）、false=固定費';



COMMENT ON COLUMN "public"."recurring_rules"."day_of_month" IS '発生日（1-31）。31の場合は月末として扱う';



CREATE TABLE IF NOT EXISTS "public"."settlement_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "rule_id" "uuid",
    "payment_id" "uuid",
    "description" "text" NOT NULL,
    "category_id" "uuid",
    "expected_amount" integer,
    "actual_amount" integer,
    "payer_id" "uuid" NOT NULL,
    "payment_date" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "split_type" "text" DEFAULT 'equal'::"text" NOT NULL,
    "filled_by" "uuid",
    "filled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entry_type" "text" DEFAULT 'rule'::"text" NOT NULL,
    "source_payment_id" "uuid",
    CONSTRAINT "settlement_entries_amounts_positive" CHECK (((("expected_amount" IS NULL) OR ("expected_amount" > 0)) AND (("actual_amount" IS NULL) OR ("actual_amount" > 0)))),
    CONSTRAINT "settlement_entries_description_length" CHECK ((("char_length"("description") >= 1) AND ("char_length"("description") <= 100))),
    CONSTRAINT "settlement_entries_entry_type_valid" CHECK (("entry_type" = ANY (ARRAY['rule'::"text", 'manual'::"text", 'existing'::"text"]))),
    CONSTRAINT "settlement_entries_filled_fields" CHECK ((("status" <> 'filled'::"text") OR (("status" = 'filled'::"text") AND ("actual_amount" IS NOT NULL) AND ("filled_by" IS NOT NULL)))),
    CONSTRAINT "settlement_entries_split_type_valid" CHECK (("split_type" = ANY (ARRAY['equal'::"text", 'custom'::"text"]))),
    CONSTRAINT "settlement_entries_status_valid" CHECK (("status" = ANY (ARRAY['pending'::"text", 'filled'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."settlement_entries" OWNER TO "postgres";


COMMENT ON TABLE "public"."settlement_entries" IS '清算エントリ - 準備室のチェックリスト各項目';



COMMENT ON COLUMN "public"."settlement_entries"."entry_type" IS 'rule=ルールから生成、manual=手動追加、existing=既存支払い取り込み';



COMMENT ON COLUMN "public"."settlement_entries"."source_payment_id" IS '既存支払い取り込み時の元のpayment_id';



CREATE TABLE IF NOT EXISTS "public"."settlement_entry_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "settlement_entry_splits_amount_non_negative" CHECK (("amount" >= 0))
);


ALTER TABLE "public"."settlement_entry_splits" OWNER TO "postgres";


COMMENT ON TABLE "public"."settlement_entry_splits" IS '清算エントリのカスタム分割設定';



CREATE TABLE IF NOT EXISTS "public"."settlement_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "uuid",
    "net_transfers" "jsonb",
    "is_zero_settlement" boolean DEFAULT false NOT NULL,
    "payment_reported_at" timestamp with time zone,
    "payment_reported_by" "uuid",
    "settled_at" timestamp with time zone,
    "settled_by" "uuid",
    CONSTRAINT "settlement_sessions_period_valid" CHECK (("period_start" <= "period_end")),
    CONSTRAINT "settlement_sessions_state_fields" CHECK ((("status" = 'draft'::"text") OR (("status" = 'confirmed'::"text") AND ("confirmed_at" IS NOT NULL) AND ("confirmed_by" IS NOT NULL)) OR (("status" = 'pending_payment'::"text") AND ("confirmed_at" IS NOT NULL) AND ("confirmed_by" IS NOT NULL) AND ("net_transfers" IS NOT NULL)) OR (("status" = 'settled'::"text") AND ("confirmed_at" IS NOT NULL) AND ("confirmed_by" IS NOT NULL) AND ("settled_at" IS NOT NULL) AND ("settled_by" IS NOT NULL)))),
    CONSTRAINT "settlement_sessions_status_valid" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'pending_payment'::"text", 'settled'::"text"])))
);


ALTER TABLE "public"."settlement_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."settlement_sessions" IS '清算セッション（準備室）- 清算期間と状態を管理';



COMMENT ON COLUMN "public"."settlement_sessions"."net_transfers" IS '相殺計算結果（JSONB配列: [{from_id, from_name, to_id, to_name, amount}]）';



COMMENT ON COLUMN "public"."settlement_sessions"."is_zero_settlement" IS '全員差額0の0円清算フラグ';



COMMENT ON COLUMN "public"."settlement_sessions"."payment_reported_at" IS '送金完了報告の日時';



COMMENT ON COLUMN "public"."settlement_sessions"."payment_reported_by" IS '送金完了報告者';



COMMENT ON COLUMN "public"."settlement_sessions"."settled_at" IS '受取確認（清算完了）の日時';



COMMENT ON COLUMN "public"."settlement_sessions"."settled_by" IS '受取確認者';



CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "from_user" "uuid" NOT NULL,
    "to_user" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "settlements_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."settlements" OWNER TO "postgres";


ALTER TABLE ONLY "public"."archived_payment_splits"
    ADD CONSTRAINT "archived_payment_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archived_payments"
    ADD CONSTRAINT "archived_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_sessions"
    ADD CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_payment_id_user_id_key" UNIQUE ("payment_id", "user_id");



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_rule_splits"
    ADD CONSTRAINT "recurring_rule_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_rule_splits"
    ADD CONSTRAINT "recurring_rule_splits_unique" UNIQUE ("rule_id", "user_id");



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_entry_splits"
    ADD CONSTRAINT "settlement_entry_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_entry_splits"
    ADD CONSTRAINT "settlement_entry_splits_unique" UNIQUE ("entry_id", "user_id");



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_archived_payment_splits_payment_id" ON "public"."archived_payment_splits" USING "btree" ("payment_id");



CREATE INDEX "idx_archived_payments_group_id" ON "public"."archived_payments" USING "btree" ("group_id");



CREATE INDEX "idx_archived_payments_payer_id" ON "public"."archived_payments" USING "btree" ("payer_id");



CREATE INDEX "idx_demo_sessions_expires_at" ON "public"."demo_sessions" USING "btree" ("expires_at");



CREATE INDEX "idx_group_members_group_id" ON "public"."group_members" USING "btree" ("group_id");



CREATE INDEX "idx_group_members_user_id" ON "public"."group_members" USING "btree" ("user_id");



CREATE INDEX "idx_groups_invite_code" ON "public"."groups" USING "btree" ("invite_code");



CREATE INDEX "idx_groups_owner_id" ON "public"."groups" USING "btree" ("owner_id");



CREATE INDEX "idx_payment_splits_payment_id" ON "public"."payment_splits" USING "btree" ("payment_id");



CREATE INDEX "idx_payments_group_id" ON "public"."payments" USING "btree" ("group_id");



CREATE INDEX "idx_payments_payer_id" ON "public"."payments" USING "btree" ("payer_id");



CREATE INDEX "idx_payments_settlement_id" ON "public"."payments" USING "btree" ("settlement_id");



CREATE INDEX "idx_payments_unsettled" ON "public"."payments" USING "btree" ("group_id", "payment_date") WHERE ("settlement_id" IS NULL);



CREATE INDEX "idx_profiles_is_demo" ON "public"."profiles" USING "btree" ("is_demo") WHERE ("is_demo" = true);



CREATE INDEX "idx_recurring_rule_splits_rule_id" ON "public"."recurring_rule_splits" USING "btree" ("rule_id");



CREATE INDEX "idx_recurring_rules_active" ON "public"."recurring_rules" USING "btree" ("group_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_recurring_rules_group_id" ON "public"."recurring_rules" USING "btree" ("group_id");



CREATE INDEX "idx_settlement_entries_rule_id" ON "public"."settlement_entries" USING "btree" ("rule_id");



CREATE INDEX "idx_settlement_entries_session_id" ON "public"."settlement_entries" USING "btree" ("session_id");



CREATE INDEX "idx_settlement_entries_status" ON "public"."settlement_entries" USING "btree" ("session_id", "status");



CREATE INDEX "idx_settlement_entry_splits_entry_id" ON "public"."settlement_entry_splits" USING "btree" ("entry_id");



CREATE INDEX "idx_settlement_sessions_group_id" ON "public"."settlement_sessions" USING "btree" ("group_id");



CREATE INDEX "idx_settlement_sessions_status" ON "public"."settlement_sessions" USING "btree" ("group_id", "status");



CREATE OR REPLACE TRIGGER "trigger_recurring_rules_updated_at" BEFORE UPDATE ON "public"."recurring_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_recurring_rules_updated_at"();



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demo_sessions"
    ADD CONSTRAINT "demo_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."demo_sessions"
    ADD CONSTRAINT "demo_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_splits"
    ADD CONSTRAINT "payment_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_paid_by_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlement_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_rule_splits"
    ADD CONSTRAINT "recurring_rule_splits_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_rule_splits"
    ADD CONSTRAINT "recurring_rule_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_default_payer_id_fkey" FOREIGN KEY ("default_payer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."recurring_rules"
    ADD CONSTRAINT "recurring_rules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_filled_by_fkey" FOREIGN KEY ("filled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."settlement_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_entries"
    ADD CONSTRAINT "settlement_entries_source_payment_id_fkey" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settlement_entry_splits"
    ADD CONSTRAINT "settlement_entry_splits_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."settlement_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_entry_splits"
    ADD CONSTRAINT "settlement_entry_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_payment_reported_by_fkey" FOREIGN KEY ("payment_reported_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlement_sessions"
    ADD CONSTRAINT "settlement_sessions_settled_by_fkey" FOREIGN KEY ("settled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."archived_payment_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archived_payment_splits_select_member" ON "public"."archived_payment_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."archived_payments" "ap"
  WHERE (("ap"."id" = "archived_payment_splits"."payment_id") AND "public"."is_group_member"("ap"."group_id", "auth"."uid"())))));



ALTER TABLE "public"."archived_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archived_payments_select_member" ON "public"."archived_payments" FOR SELECT USING ("public"."is_group_member"("group_id", "auth"."uid"()));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete_member" ON "public"."categories" FOR DELETE TO "authenticated" USING ((("is_default" = false) AND ("group_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "categories"."group_id") AND ("group_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "categories_deny_anon" ON "public"."categories" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "categories_insert_member" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ((("group_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "categories"."group_id") AND ("group_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "categories_select_authenticated" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "categories_update_member" ON "public"."categories" FOR UPDATE TO "authenticated" USING ((("is_default" = false) AND ("group_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "categories"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))))) WITH CHECK ((("is_default" = false) AND ("group_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "categories"."group_id") AND ("group_members"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."demo_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demo_sessions_delete_policy" ON "public"."demo_sessions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "demo_sessions_deny_anon" ON "public"."demo_sessions" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "demo_sessions_insert_policy" ON "public"."demo_sessions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "demo_sessions_select_policy" ON "public"."demo_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_delete_policy" ON "public"."group_members" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND (("user_id" = "auth"."uid"()) OR "public"."is_group_owner"("group_id", "auth"."uid"()))));



CREATE POLICY "group_members_deny_anon" ON "public"."group_members" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "group_members_insert_owner_or_self_join" ON "public"."group_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "group_members"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'owner'::"text")))) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "group_members_insert_policy" ON "public"."group_members" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (("user_id" = "auth"."uid"()) OR "public"."is_group_owner"("group_id", "auth"."uid"()))));



CREATE POLICY "group_members_select_member" ON "public"."group_members" FOR SELECT USING ("public"."is_group_member"("group_id", "auth"."uid"()));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_delete_owner" ON "public"."groups" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "groups_deny_anon" ON "public"."groups" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "groups_insert_authenticated" ON "public"."groups" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("owner_id" = "auth"."uid"())));



CREATE POLICY "groups_select_by_invite_code" ON "public"."groups" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "groups_select_member" ON "public"."groups" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR "public"."is_group_member"("id", "auth"."uid"())));



CREATE POLICY "groups_update_owner" ON "public"."groups" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."payment_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_splits_delete_member" ON "public"."payment_splits" FOR DELETE USING ("public"."is_group_member"("public"."get_payment_group_id"("payment_id"), "auth"."uid"()));



CREATE POLICY "payment_splits_insert_member" ON "public"."payment_splits" FOR INSERT WITH CHECK ("public"."is_group_member"("public"."get_payment_group_id"("payment_id"), "auth"."uid"()));



CREATE POLICY "payment_splits_select_member" ON "public"."payment_splits" FOR SELECT USING ("public"."is_group_member"("public"."get_payment_group_id"("payment_id"), "auth"."uid"()));



CREATE POLICY "payment_splits_update_deny" ON "public"."payment_splits" FOR UPDATE USING (false);



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_delete_payer" ON "public"."payments" FOR DELETE USING (("payer_id" = "auth"."uid"()));



CREATE POLICY "payments_insert_member" ON "public"."payments" FOR INSERT WITH CHECK ((("payer_id" = "auth"."uid"()) AND "public"."is_group_member"("group_id", "auth"."uid"())));



CREATE POLICY "payments_select_member" ON "public"."payments" FOR SELECT USING ("public"."is_group_member"("group_id", "auth"."uid"()));



CREATE POLICY "payments_update_payer" ON "public"."payments" FOR UPDATE USING (("payer_id" = "auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_policy" ON "public"."profiles" FOR DELETE USING (false);



CREATE POLICY "profiles_deny_anon" ON "public"."profiles" AS RESTRICTIVE TO "anon" USING (false) WITH CHECK (false);



CREATE POLICY "profiles_insert_policy" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_group_members" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."user_id" = "profiles"."id") AND "public"."is_group_member"("gm"."group_id", "auth"."uid"()))))));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_policy" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."recurring_rule_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_rule_splits_delete" ON "public"."recurring_rule_splits" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."recurring_rules" "rr"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "rr"."group_id")))
  WHERE (("rr"."id" = "recurring_rule_splits"."rule_id") AND ("gm"."user_id" = "auth"."uid"())))));



CREATE POLICY "recurring_rule_splits_insert" ON "public"."recurring_rule_splits" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."recurring_rules" "rr"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "rr"."group_id")))
  WHERE (("rr"."id" = "recurring_rule_splits"."rule_id") AND ("gm"."user_id" = "auth"."uid"())))));



CREATE POLICY "recurring_rule_splits_select" ON "public"."recurring_rule_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."recurring_rules" "rr"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "rr"."group_id")))
  WHERE (("rr"."id" = "recurring_rule_splits"."rule_id") AND ("gm"."user_id" = "auth"."uid"())))));



CREATE POLICY "recurring_rule_splits_update" ON "public"."recurring_rule_splits" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."recurring_rules" "rr"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "rr"."group_id")))
  WHERE (("rr"."id" = "recurring_rule_splits"."rule_id") AND ("gm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."recurring_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recurring_rules_delete" ON "public"."recurring_rules" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."group_members" "gm"
     JOIN "public"."groups" "g" ON (("g"."id" = "gm"."group_id")))
  WHERE (("gm"."group_id" = "recurring_rules"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND (("gm"."role" = 'owner'::"text") OR ("g"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "recurring_rules_insert" ON "public"."recurring_rules" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "recurring_rules"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "recurring_rules_select" ON "public"."recurring_rules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "recurring_rules"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "recurring_rules_update" ON "public"."recurring_rules" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "recurring_rules"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."settlement_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_entries_delete" ON "public"."settlement_entries" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."settlement_sessions" "ss"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("ss"."id" = "settlement_entries"."session_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



CREATE POLICY "settlement_entries_insert" ON "public"."settlement_entries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."settlement_sessions" "ss"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("ss"."id" = "settlement_entries"."session_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



CREATE POLICY "settlement_entries_select" ON "public"."settlement_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."settlement_sessions" "ss"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("ss"."id" = "settlement_entries"."session_id") AND ("gm"."user_id" = "auth"."uid"())))));



CREATE POLICY "settlement_entries_update" ON "public"."settlement_entries" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."settlement_sessions" "ss"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("ss"."id" = "settlement_entries"."session_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



ALTER TABLE "public"."settlement_entry_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_entry_splits_delete" ON "public"."settlement_entry_splits" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."settlement_entries" "se"
     JOIN "public"."settlement_sessions" "ss" ON (("ss"."id" = "se"."session_id")))
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("se"."id" = "settlement_entry_splits"."entry_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



CREATE POLICY "settlement_entry_splits_insert" ON "public"."settlement_entry_splits" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."settlement_entries" "se"
     JOIN "public"."settlement_sessions" "ss" ON (("ss"."id" = "se"."session_id")))
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("se"."id" = "settlement_entry_splits"."entry_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



CREATE POLICY "settlement_entry_splits_select" ON "public"."settlement_entry_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."settlement_entries" "se"
     JOIN "public"."settlement_sessions" "ss" ON (("ss"."id" = "se"."session_id")))
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("se"."id" = "settlement_entry_splits"."entry_id") AND ("gm"."user_id" = "auth"."uid"())))));



CREATE POLICY "settlement_entry_splits_update" ON "public"."settlement_entry_splits" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."settlement_entries" "se"
     JOIN "public"."settlement_sessions" "ss" ON (("ss"."id" = "se"."session_id")))
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "ss"."group_id")))
  WHERE (("se"."id" = "settlement_entry_splits"."entry_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("ss"."status" = 'draft'::"text")))));



ALTER TABLE "public"."settlement_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_sessions_delete" ON "public"."settlement_sessions" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlement_sessions"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))) AND ("status" = 'draft'::"text") AND ("created_by" = "auth"."uid"())));



CREATE POLICY "settlement_sessions_insert" ON "public"."settlement_sessions" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlement_sessions"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))) AND ("created_by" = "auth"."uid"())));



CREATE POLICY "settlement_sessions_select" ON "public"."settlement_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlement_sessions"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "settlement_sessions_update" ON "public"."settlement_sessions" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlement_sessions"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))) AND ("status" = ANY (ARRAY['draft'::"text", 'pending_payment'::"text"]))));



ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlements_insert_member" ON "public"."settlements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlements"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "settlements_select_member" ON "public"."settlements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."group_members"
  WHERE (("group_members"."group_id" = "settlements"."group_id") AND ("group_members"."user_id" = "auth"."uid"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON FUNCTION "public"."anonymize_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_payment"("p_payment_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_user_balance"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_user_balance"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_user_balance"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_settlement"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_settlement_receipt"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_demo_bot_partner"("p_group_id" "uuid", "p_demo_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_demo_bot_partner"("p_group_id" "uuid", "p_demo_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_demo_bot_partner"("p_group_id" "uuid", "p_demo_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_expired_demo_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_expired_demo_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_expired_demo_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_payment_splits_for_payer"("p_payment_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_payment_splits_for_payer"("p_payment_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_payment_splits_for_payer"("p_payment_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fill_settlement_entry_with_payment"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_settlement_entries"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_actual_day_of_month"("p_day_of_month" integer, "p_year" integer, "p_month" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_frequent_payments"("p_group_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_last_day_of_month"("p_year" integer, "p_month" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_group_id"("_payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_group_id"("_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_group_id"("_payment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_settlement_period_suggestion"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member"("_group_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_owner"("_group_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_owner"("_group_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_owner"("_group_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_payment_payer"("_payment_id" "uuid", "_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_payment_payer"("_payment_id" "uuid", "_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_payment_payer"("_payment_id" "uuid", "_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_group"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_payment_splits"("p_payment_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_payment_splits"("p_payment_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_payment_splits"("p_payment_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_settlement_entry_splits"("p_entry_id" "uuid", "p_user_id" "uuid", "p_splits" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_settlement_payment"("p_session_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_consolidated_sessions"("p_session_ids" "uuid"[], "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_group_ownership"("p_group_id" "uuid", "p_new_owner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_recurring_rules_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_recurring_rules_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_recurring_rules_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_settlement_entry"("p_entry_id" "uuid", "p_user_id" "uuid", "p_actual_amount" integer, "p_payer_id" "uuid", "p_payment_date" "date", "p_status" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."archived_payment_splits" TO "anon";
GRANT ALL ON TABLE "public"."archived_payment_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_payment_splits" TO "service_role";



GRANT ALL ON TABLE "public"."archived_payments" TO "anon";
GRANT ALL ON TABLE "public"."archived_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."archived_payments" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."demo_sessions" TO "anon";
GRANT ALL ON TABLE "public"."demo_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON TABLE "public"."payment_splits" TO "anon";
GRANT ALL ON TABLE "public"."payment_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_splits" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_rule_splits" TO "anon";
GRANT ALL ON TABLE "public"."recurring_rule_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_rule_splits" TO "service_role";



GRANT ALL ON TABLE "public"."recurring_rules" TO "anon";
GRANT ALL ON TABLE "public"."recurring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_entries" TO "anon";
GRANT ALL ON TABLE "public"."settlement_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_entries" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_entry_splits" TO "anon";
GRANT ALL ON TABLE "public"."settlement_entry_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_entry_splits" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_sessions" TO "anon";
GRANT ALL ON TABLE "public"."settlement_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."settlements" TO "anon";
GRANT ALL ON TABLE "public"."settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."settlements" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































