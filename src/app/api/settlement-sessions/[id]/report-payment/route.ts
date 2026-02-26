import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { rpcCodeToResponse } from "@/lib/api/translate-rpc-error";

// =============================================================================
// POST /api/settlement-sessions/[id]/report-payment
// 送金完了を報告する（pending_payment 状態でのみ実行可能）
// =============================================================================
export const POST = withAuthHandler<Promise<{ id: string }>>(async (_request, { params, user, supabase }) => {
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
      { error: "送金報告に失敗しました" },
      { status: 500 }
    );
  }

  const rpcError = rpcCodeToResponse(result, {
    notFound: "セッションが見つかりません",
    wrongState: "セッションは送金待ち状態ではありません",
  });
  if (rpcError) return rpcError;

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
}, "POST /api/settlement-sessions/[id]/report-payment");
