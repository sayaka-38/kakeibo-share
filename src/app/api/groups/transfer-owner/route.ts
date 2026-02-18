import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { translateRpcError } from "@/lib/api/translate-rpc-error";

/**
 * POST /api/groups/transfer-owner
 *
 * オーナー権限を別メンバーに移譲する（RPC transfer_group_ownership 経由）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { groupId, newOwnerId } = body;

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "グループIDが必要です" },
        { status: 400 }
      );
    }
    if (!newOwnerId || typeof newOwnerId !== "string") {
      return NextResponse.json(
        { error: "新しいオーナーのIDが必要です" },
        { status: 400 }
      );
    }

    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { supabase } = auth;

    const { error } = await supabase.rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_id: newOwnerId,
    });

    if (error) {
      console.error("[API /groups/transfer-owner] RPC error:", error);
      const { message, status } = translateRpcError("transfer_group_ownership", error.message);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /groups/transfer-owner] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
