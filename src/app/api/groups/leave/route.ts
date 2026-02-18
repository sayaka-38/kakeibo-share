import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { translateRpcError } from "@/lib/api/translate-rpc-error";

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
      const { message, status } = translateRpcError("leave_group", error.message);
      return NextResponse.json({ error: message }, { status });
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
