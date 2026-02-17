import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

/**
 * GET /api/groups/leave/preflight?groupId=xxx
 *
 * 退出可否と破壊的警告の判定
 * Returns: { canLeave, willDeleteGroup, reason? }
 */
export async function GET(request: NextRequest) {
  try {
    const groupId = request.nextUrl.searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json(
        { error: "グループIDが必要です" },
        { status: 400 }
      );
    }

    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { user, supabase } = auth;

    // メンバーシップ確認
    const { data: membership } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { canLeave: false, willDeleteGroup: false, reason: "Not a member" },
        { status: 200 }
      );
    }

    // メンバー数カウント
    const { count: memberCount } = await supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId);

    if (membership.role === "owner") {
      if (memberCount === 1) {
        // 唯一のメンバー = 退出するとグループ削除
        return NextResponse.json({
          canLeave: true,
          willDeleteGroup: true,
        });
      }

      // 他にオーナーがいるかチェック
      const { count: otherOwnerCount } = await supabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("role", "owner")
        .neq("user_id", user.id);

      if (otherOwnerCount === 0) {
        // 唯一のオーナーで他メンバーあり
        return NextResponse.json({
          canLeave: false,
          willDeleteGroup: false,
          reason: "Must transfer ownership before leaving",
        });
      }
    }

    // 一般メンバー or 共同オーナー
    return NextResponse.json({
      canLeave: true,
      willDeleteGroup: false,
    });
  } catch (error) {
    console.error("[API /groups/leave/preflight] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
