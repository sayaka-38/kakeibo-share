import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { validateCategory } from "@/lib/validation/category";
import { t } from "@/lib/i18n";

// =============================================================================
// POST /api/categories — カスタムカテゴリ作成
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
      { error: t("categories.api.invalidBody") },
      { status: 400 }
    );
  }

  const { groupId, name, icon, color } = body;

  if (!groupId) {
    return NextResponse.json(
      { error: t("categories.api.groupIdRequired") },
      { status: 400 }
    );
  }

  // バリデーション
  const validation = validateCategory({ name: name || "", icon, color });
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
      { error: t("categories.api.notMember") },
      { status: 403 }
    );
  }

  // カテゴリ作成
  const { data: category, error } = await supabase
    .from("categories")
    .insert({
      name: name.trim(),
      icon: icon || null,
      color: color || null,
      group_id: groupId,
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create category:", error);
    return NextResponse.json(
      { error: t("categories.api.createFailed") },
      { status: 500 }
    );
  }

  return NextResponse.json({ category }, { status: 201 });
}
