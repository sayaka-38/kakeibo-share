import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================================
// PUT /api/settlement-entries/[id]
// 清算エントリを更新（金額入力など）
// =============================================================================
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正です" },
      { status: 400 }
    );
  }

  const { actualAmount, payerId, paymentDate, status, splits } = body;

  // バリデーション
  if (status === "filled" && (actualAmount === undefined || actualAmount === null)) {
    return NextResponse.json(
      { error: "入力済みステータスには金額が必要です" },
      { status: 400 }
    );
  }

  if (actualAmount !== undefined && actualAmount !== null && actualAmount < 0) {
    return NextResponse.json(
      { error: "金額は0以上で入力してください" },
      { status: 400 }
    );
  }

  // スキップ時は actual_amount を null にして DB constraint (> 0) を回避
  const resolvedAmount = status === "skipped" ? null : (actualAmount ?? null);

  // RPC でエントリを更新
  const { data: result, error } = await supabase.rpc("update_settlement_entry", {
    p_entry_id: id,
    p_user_id: user.id,
    p_actual_amount: resolvedAmount,
    p_payer_id: payerId || null,
    p_payment_date: paymentDate || null,
    p_status: status || "filled",
  });

  if (error) {
    console.error("Failed to update settlement entry:", error);
    return NextResponse.json(
      { error: "エントリの更新に失敗しました" },
      { status: 500 }
    );
  }

  // エラーコードをチェック
  if (result === -1) {
    return NextResponse.json(
      { error: "エントリが見つかりません" },
      { status: 404 }
    );
  }
  if (result === -2) {
    return NextResponse.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 }
    );
  }
  if (result === -3) {
    return NextResponse.json(
      { error: "セッションはドラフト状態ではありません" },
      { status: 400 }
    );
  }

  // カスタム分割の更新（splitsが提供された場合）
  if (splits !== undefined && Array.isArray(splits)) {
    const splitsJson = splits.map((s: { userId: string; amount: number }) => ({
      user_id: s.userId,
      amount: s.amount,
    }));

    const { data: splitsResult, error: splitsError } = await supabase.rpc(
      "replace_settlement_entry_splits",
      {
        p_entry_id: id,
        p_user_id: user.id,
        p_splits: splitsJson,
      }
    );

    if (splitsError) {
      console.error("Failed to update settlement entry splits:", splitsError);
    }

    // エラーコードをチェック
    if (splitsResult && splitsResult < 0) {
      console.error("replace_settlement_entry_splits returned error code:", splitsResult);
    }
  }

  return NextResponse.json({ success: true });
}

// =============================================================================
// DELETE /api/settlement-entries/[id]
// 清算エントリを削除（手動追加のみ、draftセッションのみ）
// =============================================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

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
    if (session.status !== "draft") {
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
}
