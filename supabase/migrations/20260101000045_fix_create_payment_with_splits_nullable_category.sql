-- Migration 045: create_payment_with_splits の p_category_id を末尾に移動し DEFAULT NULL を付与
-- 目的: PostgreSQL の制約（DEFAULT 引数の後に非 DEFAULT 引数不可）を回避しつつ、
--       TypeScript 生成型で p_category_id を optional にする。
--       Supabase JS クライアントは名前付き引数を使うため順序変更は安全。

-- 旧シグネチャ（p_category_id が 5 番目・非 DEFAULT）を DROP
DROP FUNCTION IF EXISTS public.create_payment_with_splits(UUID, UUID, INTEGER, TEXT, UUID, DATE, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_payment_with_splits(
  p_group_id     UUID,
  p_payer_id     UUID,
  p_amount       INTEGER,
  p_description  TEXT,
  p_payment_date DATE,
  p_split_type   TEXT,
  p_splits       JSONB,
  p_category_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_payer_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_split_type NOT IN ('equal', 'custom', 'proxy') THEN
    RAISE EXCEPTION 'invalid split_type: %', p_split_type;
  END IF;

  INSERT INTO payments (
    group_id, payer_id, amount, description, category_id, payment_date, split_type
  ) VALUES (
    p_group_id, p_payer_id, p_amount, p_description, p_category_id, p_payment_date, p_split_type
  )
  RETURNING id INTO v_payment_id;

  IF jsonb_array_length(p_splits) > 0 THEN
    INSERT INTO payment_splits (payment_id, user_id, amount)
    SELECT v_payment_id, (s->>'user_id')::UUID, (s->>'amount')::INTEGER
    FROM jsonb_array_elements(p_splits) AS s;
  END IF;

  RETURN v_payment_id;
END;
$$;

COMMENT ON FUNCTION public.create_payment_with_splits IS
  '支払いと内訳を原子的に作成する。p_category_id は末尾に移動し DEFAULT NULL（v45）';
