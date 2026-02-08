import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

// =============================================================================
// POST /api/settlement-entries
// 手動で清算エントリを追加
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

  const {
    sessionId,
    description,
    categoryId,
    expectedAmount,
    actualAmount,
    payerId,
    paymentDate,
    splitType,
    splits,
  } = body;

  // バリデーション
  if (!sessionId || !description || !payerId || !paymentDate) {
    return NextResponse.json(
      { error: "セッションID・説明・支払者・日付は必須です" },
      { status: 400 }
    );
  }

  if (description.length < 1 || description.length > 100) {
    return NextResponse.json(
      { error: "説明は1〜100文字で入力してください" },
      { status: 400 }
    );
  }

  // セッションを取得して権限確認
  const { data: session, error: sessionError } = await supabase
    .from("settlement_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "セッションが見つかりません" },
      { status: 404 }
    );
  }

  // メンバーシップ確認
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
      { error: "確定済みセッションにはエントリを追加できません" },
      { status: 400 }
    );
  }

  // ステータスを決定
  const status = actualAmount !== undefined && actualAmount !== null ? "filled" : "pending";

  // エントリを作成
  const { data: entry, error } = await supabase
    .from("settlement_entries")
    .insert({
      session_id: sessionId,
      rule_id: null, // 手動追加なのでルールなし
      description,
      category_id: categoryId || null,
      expected_amount: expectedAmount || null,
      actual_amount: actualAmount || null,
      payer_id: payerId,
      payment_date: paymentDate,
      status,
      split_type: splitType || "equal",
      entry_type: "manual",
      filled_by: status === "filled" ? user.id : null,
      filled_at: status === "filled" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create settlement entry:", error);
    return NextResponse.json(
      { error: "エントリの作成に失敗しました" },
      { status: 500 }
    );
  }

  // カスタム分割の場合はsplitsも登録
  if (splitType === "custom" && splits && Array.isArray(splits) && splits.length > 0) {
    const splitsToInsert = splits.map((s: { userId: string; amount: number }) => ({
      entry_id: entry.id,
      user_id: s.userId,
      amount: s.amount,
    }));

    const { error: splitsError } = await supabase
      .from("settlement_entry_splits")
      .insert(splitsToInsert);

    if (splitsError) {
      console.error("Failed to create settlement entry splits:", splitsError);
    }
  }

  return NextResponse.json({ entry }, { status: 201 });
}
