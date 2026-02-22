import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { refreshSettlementEntries } from "@/lib/settlement/refresh-entries";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/settlement-sessions/[id]/refresh
 *
 * 清算ドラフトの内容をスマートマージで再計算する。
 * - filled / skipped エントリは保持
 * - pending ルールエントリは最新ルール設定で同期
 * - 新規支払いを追記
 * - 不要な pending エントリを削除
 *
 * 認可: グループメンバーであること（draft状態のみ）
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id: sessionId } = await params;

  // セッションを取得
  const { data: session, error: sessionError } = await supabase
    .from("settlement_sessions")
    .select("id, group_id, period_start, period_end, status")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "セッションが見つかりません" },
      { status: 404 }
    );
  }

  if (session.status !== "draft") {
    return NextResponse.json(
      { error: "ドラフト状態のセッションのみ更新できます" },
      { status: 409 }
    );
  }

  // スマートマージ実行
  const result = await refreshSettlementEntries(
    supabase,
    sessionId,
    session.group_id,
    session.period_start,
    session.period_end,
    user.id
  );

  if (result === -2) {
    return NextResponse.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 }
    );
  }

  if (result < 0) {
    return NextResponse.json(
      { error: "再計算に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ addedCount: result });
}
