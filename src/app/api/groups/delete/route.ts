import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/groups/delete
 *
 * グループを削除する（オーナーのみ）
 *
 * RLS ポリシー: owner_id = auth.uid() の場合のみ DELETE 可能
 * CASCADE: group_members, payments, payment_splits, settlements, demo_sessions は自動削除
 */
export async function POST(request: Request) {
  try {
    // 1. リクエストボディをパース
    const body = await request.json();
    const { groupId } = body;

    // 2. バリデーション
    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "グループIDが必要です" },
        { status: 400 }
      );
    }

    // 3. ユーザー認証確認
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    // 4. グループの存在確認とオーナー確認
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name, owner_id")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      console.log("[API /groups/delete] Group not found:", groupId);
      return NextResponse.json(
        { error: "グループが見つかりません" },
        { status: 404 }
      );
    }

    // 5. オーナー権限チェック
    if (group.owner_id !== user.id) {
      console.log("[API /groups/delete] Permission denied:", {
        groupId,
        userId: user.id,
        ownerId: group.owner_id,
      });
      return NextResponse.json(
        { error: "グループを削除する権限がありません" },
        { status: 403 }
      );
    }

    // 6. グループを削除（CASCADE により関連データも自動削除）
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

    console.log("[API /groups/delete] Group deleted:", {
      groupId,
      groupName: group.name,
      deletedBy: user.id,
    });

    // 7. 成功
    return NextResponse.json({
      success: true,
      deletedGroupId: groupId,
      deletedGroupName: group.name,
    });
  } catch (error) {
    console.error("[API /groups/delete] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
