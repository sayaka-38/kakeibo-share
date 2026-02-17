import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

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

      if (error.message.includes("Cannot transfer ownership to yourself")) {
        return NextResponse.json(
          { error: "自分自身には移譲できません" },
          { status: 400 }
        );
      }
      if (error.message.includes("Only the owner")) {
        return NextResponse.json(
          { error: "オーナーのみが権限を移譲できます" },
          { status: 403 }
        );
      }
      if (error.message.includes("not a member")) {
        return NextResponse.json(
          { error: "対象ユーザーはこのグループのメンバーではありません" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "移譲に失敗しました" },
        { status: 500 }
      );
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
