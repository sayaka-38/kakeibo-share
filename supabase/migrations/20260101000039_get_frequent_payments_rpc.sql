-- ============================================================================
-- Migration 039: スマートチップ用 RPC get_frequent_payments
-- グループ内でよく使われる「説明文＋カテゴリID」ペアを頻度順に返す
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_frequent_payments(
  p_group_id  UUID,
  p_limit     INT DEFAULT 6
)
RETURNS TABLE(description TEXT, category_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.get_frequent_payments IS
  'グループ内でよく使われる説明文とカテゴリIDのペアを頻度順に返す（スマートチップ機能用）';
