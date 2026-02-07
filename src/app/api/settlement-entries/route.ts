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
      { error: "Invalid JSON body" },
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
      { error: "sessionId, description, payerId, and paymentDate are required" },
      { status: 400 }
    );
  }

  if (description.length < 1 || description.length > 100) {
    return NextResponse.json(
      { error: "Description must be between 1 and 100 characters" },
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
      { error: "Settlement session not found" },
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
      { error: "You are not a member of this group" },
      { status: 403 }
    );
  }

  // draft状態確認
  if (session.status !== "draft") {
    return NextResponse.json(
      { error: "Cannot add entries to confirmed sessions" },
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
      { error: "Failed to create settlement entry" },
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
