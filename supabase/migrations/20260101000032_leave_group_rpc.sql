-- ============================================
-- Migration 032: leave_group RPC（グループ退出）
-- ============================================
--
-- ケース:
--   1. 非メンバー → 例外
--   2. 唯一のオーナー + 他メンバーあり → 例外（先に権限譲渡が必要）
--   3. オーナー + 自分だけ → グループ DELETE（CASCADE で全関連データ削除）
--   4. 一般メンバー → group_members から自分を DELETE
--
-- SECURITY DEFINER:
--   group_members の RLS をバイパスするために必要
--

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
