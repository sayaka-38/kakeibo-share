-- ============================================
-- Migration 013: payment_splits 削除用 RPC 関数
-- ============================================
--
-- 問題:
--   RLS ポリシー payment_splits_delete_payer は
--   auth.uid() を使用して支払者を判定するが、
--   Next.js API Route（サーバーサイド）から Supabase を呼び出す場合、
--   PostgREST のセッションコンテキストで auth.uid() が
--   NULL を返すケースがある。
--
--   結果: 支払者本人の payment_splits DELETE が
--   サイレントに 0 件になり、編集操作が失敗する。
--
-- 解決:
--   SECURITY DEFINER の RPC 関数を新設し、
--   user_id を明示的なパラメータとして受け取る。
--   auth.uid() に依存せず、アプリ層から渡された
--   user_id で支払者を検証してから削除を実行する。
--
-- 呼び出し元:
--   PUT /api/payments/[id] ハンドラ
--   （authenticateRequest() で認証済みの user.id を渡す）
--
-- セキュリティ:
--   - SECURITY DEFINER: payment_splits / payments の RLS をバイパス
--   - 関数内部で payer_id === user_id を検証（二重防御）
--   - 戻り値は INTEGER（削除件数）のみ、データ漏洩リスクなし
--
-- 依存:
--   - payments テーブル（payer_id カラム）
--   - payment_splits テーブル（payment_id カラム）
--


-- ============================================
-- 1. RPC 関数: delete_payment_splits_for_payer
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_payment_splits_for_payer(
  p_payment_id UUID,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- ============================================
-- 実行後の検証クエリ
-- ============================================
--
-- 1. 関数の確認:
--    SELECT proname, prolang, prosecdef
--    FROM pg_proc p
--    JOIN pg_language l ON p.prolang = l.oid
--    WHERE proname = 'delete_payment_splits_for_payer';
--
--    期待: prolang = plpgsql の OID, prosecdef = true
--
-- 2. RPC 呼び出しテスト:
--    SELECT delete_payment_splits_for_payer('<payment-id>', '<payer-user-id>');
--    期待: 削除件数（>= 0）
--
--    SELECT delete_payment_splits_for_payer('<payment-id>', '<other-user-id>');
--    期待: -1（権限なし）
--
