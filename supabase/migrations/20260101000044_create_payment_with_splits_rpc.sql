-- ============================================================================
-- Migration 044: create_payment_with_splits RPC（原子的支払い作成）
-- ============================================================================
-- 目的:
--   payments INSERT と payment_splits INSERT を単一トランザクションで実行し、
--   部分保存によるデータ不整合（splits なし支払い）を物理的に防止する。
--
--   従来: クライアントが payments → payment_splits の 2 ステップで保存
--         → splits の INSERT 失敗がサイレントフェイルになる脆弱性
--   改善: SECURITY DEFINER RPC で一括実行 → トランザクション保証
--
-- 認可:
--   p_payer_id がグループメンバーかを DB 側でチェック。非メンバーは NULL を返す。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_payment_with_splits(
  p_group_id     UUID,
  p_payer_id     UUID,
  p_amount       INTEGER,
  p_description  TEXT,
  p_category_id  UUID,          -- NULL 可
  p_payment_date DATE,
  p_split_type   TEXT,          -- 'equal' | 'custom' | 'proxy'
  p_splits       JSONB          -- [{"user_id": "uuid", "amount": 123}, ...]
)
RETURNS UUID  -- 新規 payment の id。メンバー外は NULL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
BEGIN
  -- メンバーシップ確認（認可ゲート）
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_payer_id
  ) THEN
    RETURN NULL;
  END IF;

  -- split_type バリデーション
  IF p_split_type NOT IN ('equal', 'custom', 'proxy') THEN
    RAISE EXCEPTION 'invalid split_type: %', p_split_type;
  END IF;

  -- payments 挿入
  INSERT INTO payments (
    group_id,
    payer_id,
    amount,
    description,
    category_id,
    payment_date,
    split_type
  ) VALUES (
    p_group_id,
    p_payer_id,
    p_amount,
    p_description,
    p_category_id,
    p_payment_date,
    p_split_type
  )
  RETURNING id INTO v_payment_id;

  -- payment_splits 挿入（splits が空でなければ）
  IF jsonb_array_length(p_splits) > 0 THEN
    INSERT INTO payment_splits (payment_id, user_id, amount)
    SELECT
      v_payment_id,
      (s->>'user_id')::UUID,
      (s->>'amount')::INTEGER
    FROM jsonb_array_elements(p_splits) AS s;
  END IF;

  RETURN v_payment_id;
END;
$$;

COMMENT ON FUNCTION public.create_payment_with_splits IS
  '支払いと内訳を原子的に作成する。SECURITY DEFINER でメンバーシップを検証し、'
  'payments + payment_splits を単一トランザクションで INSERT する（v44）';
