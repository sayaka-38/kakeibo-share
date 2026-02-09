-- ============================================
-- Migration 027: anonymize_user RPC（退会機能）
-- ============================================
--
-- 目標:
--   ユーザー退会時にプロフィールを匿名化し、関連データを整理する。
--   支払い記録（payments, payment_splits）は清算の整合性のため保持する。
--
-- 設計:
--   - profiles 行は削除しない（payments.payer_id 等の FK 参照が壊れるため）
--   - display_name を「退会済みユーザー」に、email/avatar_url を NULL に更新
--   - グループオーナーは別メンバーに委譲（ソロの場合はそのまま保持）
--   - group_members から退去（グループ一覧に表示されなくなる）
--   - recurring_rule_splits, demo_sessions は不要なので削除
--   - auth.users の削除は API 層で admin client 経由で行う
--
-- SECURITY DEFINER:
--   group_members, recurring_rule_splits の RLS をバイパスするために必要
--

CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 0. 対象ユーザーの存在確認
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN false;
  END IF;

  -- 1. プロフィールを匿名化（行は残す = FK 参照を維持）
  UPDATE profiles
  SET
    display_name = '退会済みユーザー',
    email = NULL,
    avatar_url = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  -- 2. グループオーナー権を委譲
  --    他メンバーがいるグループ: 最古参メンバーに委譲
  UPDATE groups
  SET owner_id = (
    SELECT gm.user_id
    FROM group_members gm
    WHERE gm.group_id = groups.id
      AND gm.user_id != p_user_id
    ORDER BY gm.created_at ASC
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

  -- 3. 全グループから退去
  DELETE FROM group_members WHERE user_id = p_user_id;

  -- 4. 固定費ルールの割り勘テンプレートを削除（将来の生成に影響するため）
  DELETE FROM recurring_rule_splits WHERE user_id = p_user_id;

  -- 5. デモセッションを削除
  DELETE FROM demo_sessions WHERE user_id = p_user_id;

  RETURN true;
END;
$$;
