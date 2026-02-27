import { NextResponse } from "next/server";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { rpcCodeToResponse } from "@/lib/api/translate-rpc-error";
import { settlementEntryUpdateSchema } from "@/lib/validation/schemas";
import { SESSION_STATUS, ENTRY_STATUS, ENTRY_SPLIT_TYPE } from "@/lib/domain/constants";

// =============================================================================
// PUT /api/settlement-entries/[id]
// 清算エントリを更新（金額入力など）
// =============================================================================
export const PUT = withAuthHandler<Promise<{ id: string }>>(async (request, { params, user, supabase }) => {
  const { id } = await params;

  const raw = await request.json().catch(() => null);
  const body = settlementEntryUpdateSchema.parse(raw);

  const { actualAmount, payerId, paymentDate, status, splitType, splits } = body;

  // スキップ時は actual_amount を null にして DB constraint (> 0) を回避
  const resolvedAmount = status === ENTRY_STATUS.SKIPPED ? null : (actualAmount ?? null);

  // rule_id を取得（固定費エントリか判定するため）
  const { data: entry, error: entryError } = await supabase
    .from("settlement_entries")
    .select("rule_id")
    .eq("id", id)
    .single();

  if (entryError || !entry) {
    return NextResponse.json(
      { error: "エントリが見つかりません" },
      { status: 404 }
    );
  }

  // rule_id IS NOT NULL → 填記即時登録 RPC を使用
  // rule_id IS NULL → 既存の update_settlement_entry を使用
  const rpcName = entry.rule_id
    ? "fill_settlement_entry_with_payment"
    : "update_settlement_entry";

  const { data: result, error } = await supabase.rpc(rpcName, {
    p_entry_id: id,
    p_user_id: user.id,
    // 生成型は number だが PG 関数は null も受け付ける（skip 時に actual_amount を null にする）
    p_actual_amount: resolvedAmount as number,
    p_payer_id: payerId ?? undefined,
    p_payment_date: paymentDate ?? undefined,
    p_status: status || "filled",
  });

  if (error) {
    console.error(`Failed to update settlement entry (${rpcName}):`, error);
    return NextResponse.json(
      { error: "エントリの更新に失敗しました" },
      { status: 500 }
    );
  }

  // エラーコードをチェック
  const rpcError = rpcCodeToResponse(result, {
    notFound: "エントリが見つかりません",
    wrongState: "セッションはドラフト状態ではありません",
  });
  if (rpcError) return rpcError;

  // split_type と splits の更新（提供された場合）
  if (splitType !== undefined || (splits !== undefined && Array.isArray(splits))) {
    // split_type を DB に反映
    if (splitType === ENTRY_SPLIT_TYPE.CUSTOM || splitType === ENTRY_SPLIT_TYPE.EQUAL) {
      await supabase
        .from("settlement_entries")
        .update({ split_type: splitType })
        .eq("id", id);
    }

    // splits を置き換え（空配列の場合は全削除して equal 扱い）
    if (splits !== undefined && Array.isArray(splits)) {
      const splitsJson = splits.map((s: { userId: string; amount: number }) => ({
        user_id: s.userId,
        amount: s.amount,
      }));

      await supabase.rpc("replace_settlement_entry_splits", {
        p_entry_id: id,
        p_user_id: user.id,
        p_splits: splitsJson,
      });
    }
  }

  return NextResponse.json({ success: true });
}, "PUT /api/settlement-entries/[id]");

// =============================================================================
// DELETE /api/settlement-entries/[id]
// 清算エントリを削除（手動追加のみ、draftセッションのみ）
// =============================================================================
export const DELETE = withAuthHandler<Promise<{ id: string }>>(async (request, { params, user, supabase }) => {
  const { id } = await params;

  // エントリを取得
  const { data: entry, error: fetchError } = await supabase
    .from("settlement_entries")
    .select(`
      *,
      session:settlement_sessions(id, group_id, status)
    `)
    .eq("id", id)
    .single();

  if (fetchError || !entry) {
    return NextResponse.json(
      { error: "エントリが見つかりません" },
      { status: 404 }
    );
  }

  const session = entry.session as { id: string; group_id: string; status: string } | null;

  // メンバーシップ確認
  if (session) {
    const { data: membership } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", session.group_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "このグループのメンバーではありません" },
        { status: 403 }
      );
    }

    // draft状態確認
    if (session.status !== SESSION_STATUS.DRAFT) {
      return NextResponse.json(
        { error: "確定済みセッションのエントリは削除できません" },
        { status: 400 }
      );
    }
  }

  // 手動追加エントリのみ削除可能
  if (entry.entry_type !== "manual") {
    return NextResponse.json(
      { error: "削除できるのは手動追加エントリのみです" },
      { status: 400 }
    );
  }

  // エントリを削除（CASCADEでsplitsも削除される）
  const { error } = await supabase
    .from("settlement_entries")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete settlement entry:", error);
    return NextResponse.json(
      { error: "エントリの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}, "DELETE /api/settlement-entries/[id]");
