import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================================
// POST /api/settlement-sessions/[id]/confirm
// 清算セッションを確定し、payments に書き込む
// =============================================================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // RPC で確定処理を実行
  const { data: result, error } = await supabase.rpc("confirm_settlement", {
    p_session_id: id,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Failed to confirm settlement:", error);
    return NextResponse.json(
      { error: "Failed to confirm settlement" },
      { status: 500 }
    );
  }

  // エラーコードをチェック
  if (result === -1) {
    return NextResponse.json(
      { error: "Settlement session not found" },
      { status: 404 }
    );
  }
  if (result === -2) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }
  if (result === -3) {
    return NextResponse.json(
      { error: "Session is not in draft status" },
      { status: 400 }
    );
  }
  if (result === -4) {
    return NextResponse.json(
      { error: "No filled entries to confirm" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    paymentsCreated: result,
  });
}
