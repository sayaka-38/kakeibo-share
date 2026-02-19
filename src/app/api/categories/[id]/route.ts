import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { validateCategory } from "@/lib/validation/category";
import { t } from "@/lib/i18n";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// =============================================================================
// PUT /api/categories/[id] — カスタムカテゴリ更新
// =============================================================================
export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { supabase } = auth;

  const { id } = await context.params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("categories.api.invalidBody") },
      { status: 400 }
    );
  }

  const { name, icon, color } = body;

  // バリデーション（部分更新: name は必須ではないが、指定された場合はチェック）
  if (name !== undefined) {
    const validation = validateCategory({ name, icon, color });
    if (!validation.success) {
      const firstError = Object.values(validation.errors)[0];
      return NextResponse.json({ error: firstError }, { status: 400 });
    }
  }

  // カテゴリ取得 + is_default ガード
  const { data: existing } = await supabase
    .from("categories")
    .select("id, is_default, group_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: t("categories.api.notFound") },
      { status: 404 }
    );
  }

  if (existing.is_default) {
    return NextResponse.json(
      { error: t("categories.api.defaultNotEditable") },
      { status: 403 }
    );
  }

  // 更新フィールド組み立て
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name.trim();
  if (icon !== undefined) update.icon = icon || null;
  if (color !== undefined) update.color = color || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: t("categories.api.noFieldsToUpdate") },
      { status: 400 }
    );
  }

  // RLS が group_members チェックを担保する
  const { data: category, error } = await supabase
    .from("categories")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update category:", error);
    return NextResponse.json(
      { error: t("categories.api.updateFailed") },
      { status: 500 }
    );
  }

  return NextResponse.json({ category });
}

// =============================================================================
// DELETE /api/categories/[id] — カスタムカテゴリ削除
// =============================================================================
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { supabase } = auth;

  const { id } = await context.params;

  // カテゴリ取得 + is_default ガード
  const { data: existing } = await supabase
    .from("categories")
    .select("id, is_default")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: t("categories.api.notFound") },
      { status: 404 }
    );
  }

  if (existing.is_default) {
    return NextResponse.json(
      { error: t("categories.api.defaultNotDeletable") },
      { status: 403 }
    );
  }

  // RLS が group_members チェックを担保する
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete category:", error);
    return NextResponse.json(
      { error: t("categories.api.deleteFailed") },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
