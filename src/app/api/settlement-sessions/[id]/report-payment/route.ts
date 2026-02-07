import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticateRequest } from "@/lib/api/authenticate";

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================================
// POST /api/settlement-sessions/[id]/report-payment
// 送金完了を報告する（pending_payment 状態でのみ実行可能）
// =============================================================================
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  const { data: result, error } = await supabase.rpc(
    "report_settlement_payment",
    {
      p_session_id: id,
      p_user_id: user.id,
    }
  );

  if (error) {
    console.error("Failed to report payment:", error);
    return NextResponse.json(
      { error: "Failed to report payment" },
      { status: 500 }
    );
  }

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
      { error: "Session is not in pending_payment status" },
      { status: 400 }
    );
  }

  // group_id を取得してキャッシュ破棄
  const { data: sessionData } = await supabase
    .from("settlement_sessions")
    .select("group_id")
    .eq("id", id)
    .single();

  if (sessionData) {
    revalidatePath(`/groups/${sessionData.group_id}/settlement`);
  }

  return NextResponse.json({ success: true });
}
