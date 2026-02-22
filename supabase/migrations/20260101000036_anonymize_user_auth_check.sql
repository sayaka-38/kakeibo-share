-- ============================================================================
-- Migration 036: anonymize_user RPC に呼び出し者認可チェックを追加
-- ============================================================================
--
-- SECURITY DEFINER 関数は RLS をバイパスするため、
-- 呼び出し元のユーザーが自分自身のみ匿名化できるよう内部で検証する。
--
-- PostgreSQL の挙動:
--   - 通常ユーザー呼び出し: auth.uid() = JWT ユーザー ID
--   - サービスロール呼び出し: auth.uid() IS NULL（= 管理者として常に許可）
--   - NULL != any_uuid → NULL（= FALSE として評価）→ 例外は発生しない
--
-- つまり admin client からの呼び出しは引き続き許可され、
-- ユーザー A が ユーザー B を匿名化しようとした場合のみ例外を発生させる。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.anonymize_user IS 'ユーザー退会処理（匿名化）- v2: 認可チェック追加（自分自身のみ実行可）';
