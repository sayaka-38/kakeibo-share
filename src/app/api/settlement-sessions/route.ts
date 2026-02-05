import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

// =============================================================================
// GET /api/settlement-sessions?groupId=xxx
// グループの清算セッション一覧を取得
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

  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }

  // セッション一覧を取得
  const { data: sessions, error } = await supabase
    .from("settlement_sessions")
    .select(`
      *,
      created_by_user:profiles!settlement_sessions_created_by_fkey(id, display_name, email),
      confirmed_by_user:profiles!settlement_sessions_confirmed_by_fkey(id, display_name, email)
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch settlement sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch settlement sessions" },
      { status: 500 }
    );
  }

  return NextResponse.json({ sessions });
}

// =============================================================================
// POST /api/settlement-sessions
// 新規清算セッションを作成し、エントリを自動生成
// =============================================================================
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { groupId, periodStart, periodEnd } = body;

  // バリデーション
  if (!groupId || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "groupId, periodStart, and periodEnd are required" },
      { status: 400 }
    );
  }

  // 日付バリデーション
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "Invalid date format" },
      { status: 400 }
    );
  }
  if (start > end) {
    return NextResponse.json(
      { error: "periodStart must be before or equal to periodEnd" },
      { status: 400 }
    );
  }

  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }

  // 既存のdraftセッションがないか確認
  const { data: existingDraft } = await supabase
    .from("settlement_sessions")
    .select("id")
    .eq("group_id", groupId)
    .eq("status", "draft")
    .single();

  if (existingDraft) {
    return NextResponse.json(
      { error: "A draft session already exists for this group", existingSessionId: existingDraft.id },
      { status: 409 }
    );
  }

  // セッションを作成
  const { data: session, error } = await supabase
    .from("settlement_sessions")
    .insert({
      group_id: groupId,
      period_start: periodStart,
      period_end: periodEnd,
      status: "draft",
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create settlement session:", error);
    return NextResponse.json(
      { error: "Failed to create settlement session" },
      { status: 500 }
    );
  }

  // エントリを自動生成（RPC呼び出し）
  const { data: entryCount, error: rpcError } = await supabase
    .rpc("generate_settlement_entries", {
      p_session_id: session.id,
      p_user_id: user.id,
    });

  console.log("[generate_settlement_entries] session_id:", session.id, "user_id:", user.id);
  console.log("[generate_settlement_entries] result:", entryCount, "error:", rpcError);

  if (rpcError) {
    console.error("Failed to generate settlement entries:", rpcError);
    // セッションは作成済みなので続行（エラー情報をレスポンスに含める）
    return NextResponse.json(
      {
        session,
        entriesGenerated: 0,
        rpcError: rpcError.message,
      },
      { status: 201 }
    );
  }

  // RPCの戻り値が負の場合はエラーコード
  if (typeof entryCount === "number" && entryCount < 0) {
    const errorMessages: Record<number, string> = {
      [-1]: "Session not found",
      [-2]: "Permission denied",
      [-3]: "Session is not in draft status",
    };
    console.error("RPC returned error code:", entryCount, errorMessages[entryCount]);
    return NextResponse.json(
      {
        session,
        entriesGenerated: 0,
        rpcErrorCode: entryCount,
        rpcErrorMessage: errorMessages[entryCount] || "Unknown error",
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      session,
      entriesGenerated: entryCount ?? 0,
    },
    { status: 201 }
  );
}
