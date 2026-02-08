import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================================
// GET /api/recurring-rules/[id]
// 個別の固定費ルールを取得
// =============================================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // ルールを取得（関連データも含む）
  const { data: rule, error } = await supabase
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
    .eq("id", id)
    .single();

  if (error || !rule) {
    return NextResponse.json(
      { error: "ルールが見つかりません" },
      { status: 404 }
    );
  }

  // メンバーシップ確認（RLSでも保護されているが、明示的にチェック）
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", rule.group_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 }
    );
  }

  return NextResponse.json({ rule });
}

// =============================================================================
// PUT /api/recurring-rules/[id]
// 固定費ルールを更新
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

  // 既存ルールを取得
  const { data: existingRule, error: fetchError } = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existingRule) {
    return NextResponse.json(
      { error: "ルールが見つかりません" },
      { status: 404 }
    );
  }

  // メンバーシップ確認
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", existingRule.group_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 }
    );
  }

  const {
    categoryId,
    description,
    defaultAmount,
    isVariable,
    dayOfMonth,
    defaultPayerId,
    splitType,
    isActive,
    splits,
  } = body;

  // バリデーション
  if (description !== undefined && (description.length < 1 || description.length > 100)) {
    return NextResponse.json(
      { error: "項目名は1〜100文字で入力してください" },
      { status: 400 }
    );
  }

  if (dayOfMonth !== undefined && (dayOfMonth < 1 || dayOfMonth > 31)) {
    return NextResponse.json(
      { error: "発生日は1〜31の範囲で指定してください" },
      { status: 400 }
    );
  }

  // is_variable と default_amount の整合性チェック
  const newIsVariable = isVariable !== undefined ? isVariable : existingRule.is_variable;
  const newDefaultAmount = defaultAmount !== undefined ? defaultAmount : existingRule.default_amount;

  if (newIsVariable && newDefaultAmount !== null) {
    return NextResponse.json(
      { error: "変動ルールにはデフォルト金額を設定できません" },
      { status: 400 }
    );
  }
  if (!newIsVariable && (newDefaultAmount === null || newDefaultAmount <= 0)) {
    return NextResponse.json(
      { error: "固定ルールには正の金額が必要です" },
      { status: 400 }
    );
  }

  // 更新データを構築
  const updateData: Record<string, unknown> = {};
  if (categoryId !== undefined) updateData.category_id = categoryId;
  if (description !== undefined) updateData.description = description;
  if (isVariable !== undefined) {
    updateData.is_variable = isVariable;
    updateData.default_amount = isVariable ? null : (defaultAmount ?? existingRule.default_amount);
  } else if (defaultAmount !== undefined) {
    updateData.default_amount = defaultAmount;
  }
  if (dayOfMonth !== undefined) updateData.day_of_month = dayOfMonth;
  if (defaultPayerId !== undefined) updateData.default_payer_id = defaultPayerId;
  if (splitType !== undefined) updateData.split_type = splitType;
  if (isActive !== undefined) updateData.is_active = isActive;

  // ルールを更新
  const { data: rule, error } = await supabase
    .from("recurring_rules")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update recurring rule:", error);
    return NextResponse.json(
      { error: "ルールの更新に失敗しました" },
      { status: 500 }
    );
  }

  // カスタム分割の更新（splitsが提供された場合）
  if (splits !== undefined && Array.isArray(splits)) {
    // 既存のsplitsを削除
    await supabase
      .from("recurring_rule_splits")
      .delete()
      .eq("rule_id", id);

    // 新しいsplitsを挿入
    if (splits.length > 0) {
      const splitsToInsert = splits.map((s: { userId: string; amount?: number; percentage?: number }) => ({
        rule_id: id,
        user_id: s.userId,
        amount: s.amount ?? null,
        percentage: s.percentage ?? null,
      }));

      const { error: splitsError } = await supabase
        .from("recurring_rule_splits")
        .insert(splitsToInsert);

      if (splitsError) {
        console.error("Failed to update recurring rule splits:", splitsError);
      }
    }
  }

  return NextResponse.json({ rule });
}

// =============================================================================
// DELETE /api/recurring-rules/[id]
// 固定費ルールを削除（オーナーのみ）
// =============================================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  const { id } = await params;

  // 既存ルールを取得
  const { data: existingRule, error: fetchError } = await supabase
    .from("recurring_rules")
    .select("*, group:groups(owner_id)")
    .eq("id", id)
    .single();

  if (fetchError || !existingRule) {
    return NextResponse.json(
      { error: "ルールが見つかりません" },
      { status: 404 }
    );
  }

  // オーナー確認
  const group = existingRule.group as { owner_id: string } | null;
  if (!group || group.owner_id !== user.id) {
    return NextResponse.json(
      { error: "ルールを削除できるのはグループオーナーのみです" },
      { status: 403 }
    );
  }

  // ルールを削除（CASCADEでsplitsも削除される）
  const { error } = await supabase
    .from("recurring_rules")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete recurring rule:", error);
    return NextResponse.json(
      { error: "ルールの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
