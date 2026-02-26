import { NextResponse } from "next/server";
import { withAuthHandler } from "@/lib/api/with-error-handler";

/**
 * PUT /api/profile
 *
 * 自分のプロフィール（表示名）を更新する。
 * RLS: profiles_update_policy により id = auth.uid() のみ許可。
 */
export const PUT = withAuthHandler(async (request, { user, supabase }) => {

  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正です" },
      { status: 400 }
    );
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!displayName) {
    return NextResponse.json(
      { error: "表示名を入力してください" },
      { status: 400 }
    );
  }

  if (displayName.length > 30) {
    return NextResponse.json(
      { error: "表示名は30文字以内で入力してください" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);

  if (error) {
    console.error("[PUT /api/profile] Update error:", error);
    return NextResponse.json(
      { error: "プロフィールの更新に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}, "PUT /api/profile");
