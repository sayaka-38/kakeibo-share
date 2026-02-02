import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

// UUID v4 フォーマット検証
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/payments/[id]
 *
 * 支払いを削除する。
 *
 * 認可:
 *   - 支払者本人 (payer_id === user.id)
 *   - グループオーナー (groups.owner_id === user.id)
 *
 * groupId はクライアントから受け取らず、DB から導出（改ざん防止）。
 * payment_splits は ON DELETE CASCADE で自動削除される。
 */
export async function DELETE(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. パスパラメータ取得 + UUID バリデーション
    const { id } = await context.params;

    if (!id || !UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: "不正な支払いIDです" },
        { status: 400 }
      );
    }

    // 2. 認証
    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { user, supabase } = auth;

    // 3. 支払い情報を取得（groups を結合して owner_id も取得）
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, payer_id, group_id, groups (owner_id)")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("[DELETE /api/payments/[id]] Fetch error:", fetchError);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました" },
        { status: 500 }
      );
    }

    if (!payment) {
      return NextResponse.json(
        { error: "支払いが見つかりません" },
        { status: 404 }
      );
    }

    // 4. 認可チェック: 支払者本人 OR グループオーナー
    const payerMatch = payment.payer_id === user.id;
    const ownerMatch =
      (payment.groups as unknown as { owner_id: string })?.owner_id ===
      user.id;

    if (!payerMatch && !ownerMatch) {
      return NextResponse.json(
        { error: "この支払いを削除する権限がありません" },
        { status: 403 }
      );
    }

    // 5. 削除実行（payment_splits は CASCADE で自動削除）
    const { error: deleteError } = await supabase
      .from("payments")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[DELETE /api/payments/[id]] Delete error:", deleteError);
      return NextResponse.json(
        { error: "削除に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/payments/[id]] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
