-- ============================================================================
-- Migration 038: デモデータ自動クリーンアップ (pg_cron)
-- Privacy by Design — 不要なデモデータを定期削除
-- ============================================================================
--
-- 関数: delete_expired_demo_data()
--   期限切れ (expires_at < now()) の demo_sessions に紐づく全データを削除し、
--   auth.users からも匿名ユーザーを削除する。
--
-- スケジュール: 3時間おき (pg_cron)
-- ============================================================================

-- pg_cron 拡張を有効化
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- cron スキーマの使用権限を postgres に付与
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================================
-- 関数: delete_expired_demo_data
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_expired_demo_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

COMMENT ON FUNCTION public.delete_expired_demo_data IS
  '期限切れデモデータを一括削除する (pg_cron で 3 時間おきに実行)';

-- ============================================================================
-- pg_cron スケジュール登録
-- ============================================================================
-- 既存のジョブが存在する場合は削除してから再登録
SELECT cron.unschedule('cleanup-expired-demo-data')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-demo-data'
);

SELECT cron.schedule(
  'cleanup-expired-demo-data',   -- ジョブ名
  '0 */3 * * *',                 -- 毎3時間の正時に実行
  'SELECT public.delete_expired_demo_data()'
);
