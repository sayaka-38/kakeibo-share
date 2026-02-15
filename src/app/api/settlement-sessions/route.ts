import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { generateSettlementEntries } from "@/lib/settlement/generate-entries";

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
      { error: "グループIDが必要です" },
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
      { error: "このグループのメンバーではありません" },
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
      { error: "セッションの取得に失敗しました" },
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
      { error: "リクエストボディが不正です" },
      { status: 400 }
    );
  }

  const { groupId, periodStart, periodEnd } = body;

  // バリデーション
  if (!groupId || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "グループID・開始日・終了日は必須です" },
      { status: 400 }
    );
  }

  // 日付バリデーション
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "日付の形式が不正です" },
      { status: 400 }
    );
  }
  if (start > end) {
    return NextResponse.json(
      { error: "開始日は終了日以前に指定してください" },
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
      { error: "このグループのメンバーではありません" },
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
      { error: "このグループには作成中のセッションが既にあります", existingSessionId: existingDraft.id },
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
      { error: "セッションの作成に失敗しました" },
      { status: 500 }
    );
  }

  // エントリを自動生成（TS関数）
  let entryCount: number;
  try {
    entryCount = await generateSettlementEntries(
      supabase,
      session.id,
      groupId,
      periodStart,
      periodEnd,
      user.id
    );
  } catch (err) {
    console.error("Failed to generate settlement entries:", err);
    return NextResponse.json(
      {
        session,
        entriesGenerated: 0,
        error: "エントリの生成に失敗しました",
      },
      { status: 201 }
    );
  }

  // 負の戻り値はエラーコード
  if (entryCount < 0) {
    const errorMessages: Record<number, string> = {
      [-1]: "セッションが見つかりません",
      [-2]: "権限がありません",
      [-3]: "セッションはドラフト状態ではありません",
    };
    console.error("generateSettlementEntries returned error code:", entryCount, errorMessages[entryCount]);
    return NextResponse.json(
      {
        session,
        entriesGenerated: 0,
        errorCode: entryCount,
        errorMessage: errorMessages[entryCount] || "Unknown error",
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      session,
      entriesGenerated: entryCount,
    },
    { status: 201 }
  );
}
