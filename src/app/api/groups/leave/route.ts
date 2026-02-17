import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

/**
 * POST /api/groups/leave
 *
 * グループから退出する（RPC leave_group 経由）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId } = body;

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "グループIDが必要です" },
        { status: 400 }
      );
    }

    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { supabase } = auth;

    const { error } = await supabase.rpc("leave_group", {
      p_group_id: groupId,
    });

    if (error) {
      console.error("[API /groups/leave] RPC error:", error);

      if (error.message.includes("Must transfer ownership")) {
        return NextResponse.json(
          { error: "オーナー権限を他のメンバーに譲渡してから退出してください。" },
          { status: 409 }
        );
      }
      if (error.message.includes("Not a member")) {
        return NextResponse.json(
          { error: "このグループのメンバーではありません" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "退出に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /groups/leave] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
