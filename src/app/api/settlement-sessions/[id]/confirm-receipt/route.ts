import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { rpcCodeToResponse } from "@/lib/api/translate-rpc-error";

// =============================================================================
// POST /api/settlement-sessions/[id]/confirm-receipt
// 受取確認で清算完了（pending_payment → settled）
// =============================================================================
export const POST = withAuthHandler<Promise<{ id: string }>>(async (_request, { params, user, supabase }) => {
  const { id } = await params;

  const { data: result, error } = await supabase.rpc(
    "confirm_settlement_receipt",
    {
      p_session_id: id,
      p_user_id: user.id,
    }
  );

  if (error) {
    console.error("Failed to confirm receipt:", error);
    return NextResponse.json(
      { error: "受取確認に失敗しました" },
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
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/settlement");
    revalidatePath(`/groups/${sessionData.group_id}`);
    revalidatePath(`/groups/${sessionData.group_id}/settlement`);
  }

  return NextResponse.json({ success: true });
}, "POST /api/settlement-sessions/[id]/confirm-receipt");
