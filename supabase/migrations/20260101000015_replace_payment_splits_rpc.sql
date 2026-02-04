-- ============================================
-- Migration 015: payment_splits 原子的置換 RPC 関数
-- ============================================
--
-- 問題:
--   PUT /api/payments/[id] ハンドラで payment_splits を
--   「全削除→再作成」する際、RLS の DELETE ポリシーが
--   PostgREST のセッションコンテキストで auth.uid() を
--   正しく解決できず、DELETE がサイレントに 0 件になるバグ。
--
--   Migration 011→014 で DELETE ポリシーを修正してきたが、
--   根本原因は PostgREST の DELETE 操作における auth.uid() の
--   コンテキスト問題であり、RLS ポリシーの修正では解決しない。
--
-- 解決:
--   SECURITY DEFINER の RPC 関数で DELETE + INSERT を
--   単一トランザクション内で原子的に実行する。
--   これにより:
--     1. RLS を完全にバイパス（SECURITY DEFINER）
--     2. DELETE と INSERT の間に他のリクエストが介入しない（原子性）
--     3. auth.uid() に依存しない（user_id はパラメータで受け取る）
--
-- セキュリティ:
--   - 関数内部で payer_id === p_user_id を検証（二重防御）
--   - アプリ層（PUT step 8）でも payer_id === user.id を検証済み
--   - 戻り値は INTEGER（挿入件数）のみ、データ漏洩リスクなし
--
-- 依存:
--   - payments テーブル（payer_id カラム）
--   - payment_splits テーブル（payment_id, user_id, amount カラム）
--

-- ============================================
-- 1. RPC 関数: replace_payment_splits
-- ============================================

CREATE OR REPLACE FUNCTION public.replace_payment_splits(
  p_payment_id UUID,
  p_user_id UUID,
  p_splits JSONB  -- [{"user_id": "uuid", "amount": 123}, ...]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. 関数の確認:
--    SELECT proname, prolang, prosecdef, proconfig
--    FROM pg_proc p
--    JOIN pg_language l ON p.prolang = l.oid
--    WHERE proname = 'replace_payment_splits';
--
--    期待: prolang = plpgsql の OID, prosecdef = true
--
-- 2. RPC 呼び出しテスト:
--    SELECT replace_payment_splits(
--      '<payment-id>',
--      '<payer-user-id>',
--      '[{"user_id": "<user-1>", "amount": 500}, {"user_id": "<user-2>", "amount": 500}]'::JSONB
--    );
--    期待: 2（挿入件数）
--
