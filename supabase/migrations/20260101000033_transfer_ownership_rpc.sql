-- ============================================
-- Migration 033: transfer_group_ownership RPC
-- ============================================
--
-- オーナー権限を別メンバーに移譲する。
--   1. 呼出元がオーナーでなければ例外
--   2. 新オーナーがメンバーでなければ例外
--   3. 自分への譲渡は例外
--   4. groups.owner_id 更新 + group_members.role 交換
--
-- SECURITY DEFINER:
--   group_members, groups の RLS をバイパスするために必要
--

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
  p_group_id UUID,
  p_new_owner_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
