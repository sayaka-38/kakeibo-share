import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

// =============================================================================
// GET /api/settlement-sessions/suggest?groupId=xxx
// 清算期間のスマート提案を取得
// =============================================================================
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json(
      { error: "groupId is required" },
      { status: 400 }
    );
  }

  // RPC でスマート提案を取得
  const { data, error } = await supabase.rpc("get_settlement_period_suggestion", {
    p_group_id: groupId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Failed to get settlement period suggestion:", error);

    // メンバーシップエラーの場合
    if (error.message?.includes("not a member")) {
      return NextResponse.json(
        { error: "You are not a member of this group" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get settlement period suggestion" },
      { status: 500 }
    );
  }

  // RPC は配列を返すので最初の要素を取得
  const suggestion = Array.isArray(data) ? data[0] : data;

  return NextResponse.json({
    suggestedStart: suggestion?.suggested_start ?? null,
    suggestedEnd: suggestion?.suggested_end ?? null,
    oldestUnsettledDate: suggestion?.oldest_unsettled_date ?? null,
    lastConfirmedEnd: suggestion?.last_confirmed_end ?? null,
    unsettledCount: suggestion?.unsettled_count ?? 0,
  });
}
