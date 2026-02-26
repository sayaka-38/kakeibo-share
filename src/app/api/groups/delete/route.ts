import { NextResponse } from "next/server";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { groupIdRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/groups/delete
 *
 * グループを削除する（オーナーのみ）
 *
 * RLS ポリシー: owner_id = auth.uid() の場合のみ DELETE 可能
 * CASCADE: group_members, payments, payment_splits, settlements, demo_sessions は自動削除
 */
export const POST = withAuthHandler(async (request, { user, supabase }) => {
  const body = await request.json();
  const { groupId } = groupIdRequestSchema.parse(body);

  // グループの存在確認とオーナー確認
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id, name, owner_id")
    .eq("id", groupId)
    .single();

  if (groupError || !group) {
    return NextResponse.json(
      { error: "グループが見つかりません" },
      { status: 404 }
    );
  }

  // オーナー権限チェック
  if (group.owner_id !== user.id) {
    return NextResponse.json(
      { error: "グループを削除する権限がありません" },
      { status: 403 }
    );
  }

  // グループを削除（CASCADE により関連データも自動削除）
  const { error: deleteError } = await supabase
    .from("groups")
    .delete()
    .eq("id", groupId);

  if (deleteError) {
    console.error("[API /groups/delete] Delete failed:", deleteError);
    return NextResponse.json(
      { error: "グループの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    deletedGroupId: groupId,
    deletedGroupName: group.name,
  });
}, "POST /api/groups/delete");
