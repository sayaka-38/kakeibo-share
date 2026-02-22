import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { validateRecurringRule } from "@/lib/validation/recurring-rule";

// =============================================================================
// GET /api/recurring-rules?groupId=xxx
// グループの固定費ルール一覧を取得
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

  // メンバーシップ確認（RLSでも保護されているが、明示的にチェック）
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

  // ルール一覧を取得（関連データも含む）
  const { data: rules, error } = await supabase
    .from("recurring_rules")
    .select(`
      *,
      category:categories(id, name, icon, color),
      default_payer:profiles!recurring_rules_default_payer_id_fkey(id, display_name, email),
      splits:recurring_rule_splits(
        id,
        user_id,
        amount,
        percentage,
        user:profiles(id, display_name, email)
      )
    `)
    .eq("group_id", groupId)
    .order("day_of_month", { ascending: true })
    .order("description", { ascending: true });

  if (error) {
    console.error("Failed to fetch recurring rules:", error);
    return NextResponse.json(
      { error: "ルールの取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ rules });
}

// =============================================================================
// POST /api/recurring-rules
// 新規固定費ルールを作成
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
    groupId,
    categoryId,
    description,
    defaultAmount,
    isVariable,
    dayOfMonth,
    defaultPayerId,
    splitType,
    splits,
    intervalMonths,
    startDate,
    endDate,
  } = body;

  if (!groupId) {
    return NextResponse.json(
      { error: "グループIDが必要です" },
      { status: 400 }
    );
  }

  const day = Number(dayOfMonth);
  const interval = Number(intervalMonths ?? 1);
  const isVar = isVariable === true;

  // 共通バリデーション
  const validation = validateRecurringRule({
    description: description ?? "",
    dayOfMonth: day,
    defaultPayerId: defaultPayerId ?? "",
    isVariable: isVar,
    defaultAmount: isVar ? (defaultAmount ?? undefined) : defaultAmount,
    intervalMonths: interval,
    splitType: splitType || "equal",
  });

  if (!validation.success) {
    const firstError = Object.values(validation.errors)[0];
    return NextResponse.json({ error: firstError }, { status: 400 });
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

  // start_date のデフォルト: 現在の月の1日
  const resolvedStartDate = startDate || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  // ルールを作成
  const { data: rule, error } = await supabase
    .from("recurring_rules")
    .insert({
      group_id: groupId,
      category_id: categoryId || null,
      description,
      default_amount: isVar ? null : defaultAmount,
      is_variable: isVar,
      day_of_month: day,
      default_payer_id: defaultPayerId,
      split_type: splitType || "equal",
      is_active: true,
      interval_months: interval,
      start_date: resolvedStartDate,
      end_date: endDate || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create recurring rule:", error.message, error.details, error.hint);
    return NextResponse.json(
      { error: "ルールの作成に失敗しました", details: error.message },
      { status: 500 }
    );
  }

  // カスタム分割の場合はsplitsも登録
  if (splitType === "custom" && splits && Array.isArray(splits) && splits.length > 0) {
    const splitsToInsert = splits.map((s: { userId: string; amount?: number; percentage?: number }) => ({
      rule_id: rule.id,
      user_id: s.userId,
      amount: s.amount ?? null,
      percentage: s.percentage ?? null,
    }));

    const { error: splitsError } = await supabase
      .from("recurring_rule_splits")
      .insert(splitsToInsert);

    if (splitsError) {
      console.error("Failed to create recurring rule splits:", splitsError);
      // ルールは作成済みなのでロールバックしない（後で修正可能）
    }
  }

  return NextResponse.json({ rule }, { status: 201 });
}
