import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authenticateRequest } from "@/lib/api/authenticate";
import { consolidateTransfers } from "@/lib/settlement/consolidate";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { rpcCodeToResponse } from "@/lib/api/translate-rpc-error";
import type { NetTransfer } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================================
// POST /api/settlement-sessions/[id]/confirm
// 清算セッションを確定し、payments に書き込む
// 既存の pending_payment セッションがあれば net_transfers を統合
// =============================================================================
export const POST = withErrorHandler<RouteContext>(async (_request, context) => {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await context.params;

  // セッション情報を事前に取得（group_id が必要）
  const { data: sessionBefore } = await supabase
    .from("settlement_sessions")
    .select("group_id")
    .eq("id", id)
    .single();

  if (!sessionBefore) {
    return NextResponse.json(
      { error: "セッションが見つかりません" },
      { status: 404 }
    );
  }

  // RPC で確定処理を実行
  const { data: result, error } = await supabase.rpc("confirm_settlement", {
    p_session_id: id,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Failed to confirm settlement:", error);
    return NextResponse.json(
      { error: "清算の確定に失敗しました" },
      { status: 500 }
    );
  }

  // エラーコードをチェック
  const rpcError = rpcCodeToResponse(result, {
    notFound: "セッションが見つかりません",
    wrongState: "セッションはドラフト状態ではありません",
    noEntries: "確定する入力済みエントリがありません",
  });
  if (rpcError) return rpcError;

  // 確定後のセッション情報を取得（net_transfers, status等）
  const { data: updatedSession } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("id", id)
    .single();

  // =========================================================================
  // 相殺統合: 既存の pending_payment セッションがあれば net_transfers を合算
  // =========================================================================
  if (updatedSession && updatedSession.status === "pending_payment") {
    const { data: pendingSessions } = await supabase
      .from("settlement_sessions")
      .select("id, net_transfers")
      .eq("group_id", sessionBefore.group_id)
      .eq("status", "pending_payment")
      .neq("id", id);

    if (pendingSessions && pendingSessions.length > 0) {
      // メンバー名マップを構築（既存の transfers から取得）
      const memberNames = new Map<string, string>();
      const allTransferSets: NetTransfer[][] = [];

      // 旧セッションの transfers を収集
      for (const pending of pendingSessions) {
        const transfers = (pending.net_transfers || []) as NetTransfer[];
        allTransferSets.push(transfers);
        for (const t of transfers) {
          memberNames.set(t.from_id, t.from_name);
          memberNames.set(t.to_id, t.to_name);
        }
      }

      // 新セッションの transfers を追加
      const newTransfers = (updatedSession.net_transfers || []) as NetTransfer[];
      allTransferSets.push(newTransfers);
      for (const t of newTransfers) {
        memberNames.set(t.from_id, t.from_name);
        memberNames.set(t.to_id, t.to_name);
      }

      // 統合計算
      const consolidated = consolidateTransfers(allTransferSets, memberNames);

      // 新セッションの net_transfers を統合結果で更新
      if (consolidated.isZero) {
        // 統合結果が0円 → 新セッションも即settled
        await supabase
          .from("settlement_sessions")
          .update({
            net_transfers: consolidated.transfers,
            is_zero_settlement: true,
            status: "settled",
            settled_at: new Date().toISOString(),
            settled_by: user.id,
          })
          .eq("id", id);

        updatedSession.net_transfers = consolidated.transfers;
        updatedSession.is_zero_settlement = true;
        updatedSession.status = "settled";
      } else {
        // 統合結果で net_transfers を更新
        await supabase
          .from("settlement_sessions")
          .update({ net_transfers: consolidated.transfers })
          .eq("id", id);

        updatedSession.net_transfers = consolidated.transfers;
      }

      // 旧 pending_payment セッションを settled に変更（統合済み）
      // SECURITY DEFINER RPC で RLS をバイパスして確実に更新
      const sessionIds = pendingSessions.map((p) => p.id);
      await supabase.rpc("settle_consolidated_sessions", {
        p_session_ids: sessionIds,
        p_user_id: user.id,
      });
    }
  }

  // キャッシュ破棄: 清算関連ページと親ページを再検証
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/settlement");
  revalidatePath(`/groups/${sessionBefore.group_id}`);
  revalidatePath(`/groups/${sessionBefore.group_id}/settlement`);

  return NextResponse.json({
    success: true,
    paymentsCreated: result,
    session: updatedSession,
  });
}, "POST /api/settlement-sessions/[id]/confirm");
