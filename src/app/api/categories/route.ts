import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { createCategoryRequestSchema } from "@/lib/validation/schemas";
import { t } from "@/lib/i18n";

// =============================================================================
// POST /api/categories — カスタムカテゴリ作成
// =============================================================================
export const POST = withErrorHandler(async (request: Request) => {
  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user, supabase } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("categories.api.invalidBody") },
      { status: 400 }
    );
  }

  // Zod でバリデーション（ZodError は withErrorHandler が 400 で捕捉）
  const { groupId, name, icon, color } = createCategoryRequestSchema.parse(body);

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
}, "POST /api/categories");
