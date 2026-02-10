import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { validatePayment } from "@/lib/validation/payment";
import type { Json } from "@/types/database.generated";

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
 *   - 支払者本人のみ (payer_id === user.id)
 *
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

    // 3. 支払い情報を取得
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, payer_id, settlement_id")
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

    // 4. 清算済み支払いの削除を禁止
    if (payment.settlement_id) {
      return NextResponse.json(
        { error: "清算済みの支払いは削除できません" },
        { status: 403 }
      );
    }

    // 5. 認可チェック: 支払者本人のみ
    if (payment.payer_id !== user.id) {
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

/**
 * PUT /api/payments/[id]
 *
 * 支払いを編集する。
 *
 * 認可:
 *   - 支払者本人のみ (payer_id === user.id)
 *   - グループオーナーは編集不可（DELETE とは異なる）
 *
 * データ更新戦略:
 *   - payments テーブル: UPDATE（通常の RLS 経由）
 *   - payment_splits: RPC replace_payment_splits で原子的に置換
 *     SECURITY DEFINER により RLS をバイパスし、DELETE + INSERT を
 *     単一トランザクション内で実行する（Migration 015）
 *
 * groupId / payer_id はクライアントから受け取らず、DB から導出（改ざん防止）。
 */
export async function PUT(
  request: Request,
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

    // 3. リクエストボディのパース
    let body: {
      amount?: unknown;
      description?: unknown;
      categoryId?: unknown;
      paymentDate?: unknown;
      splits?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "リクエストボディが不正です" },
        { status: 400 }
      );
    }

    // 4. 基本型チェック
    const amount =
      typeof body.amount === "number" ? body.amount : NaN;
    const description =
      typeof body.description === "string" ? body.description : "";
    const categoryId =
      typeof body.categoryId === "string" ? body.categoryId : null;
    const paymentDateStr =
      typeof body.paymentDate === "string" ? body.paymentDate : "";
    const splits = Array.isArray(body.splits) ? body.splits : [];

    // 5. 共通バリデーション（新規作成と同じルール）
    const paymentDate = new Date(paymentDateStr);
    const validation = validatePayment({
      amount,
      description,
      paymentDate,
    });

    if (!validation.success) {
      const firstError = Object.values(validation.errors).find(Boolean);
      return NextResponse.json(
        { error: firstError || "入力内容に誤りがあります" },
        { status: 400 }
      );
    }

    // 6. splits バリデーション
    if (splits.length === 0) {
      return NextResponse.json(
        { error: "割り勘の内訳が必要です" },
        { status: 400 }
      );
    }

    const parsedSplits: { userId: string; amount: number }[] = [];
    for (const split of splits) {
      if (
        typeof split !== "object" ||
        split === null ||
        typeof split.userId !== "string" ||
        typeof split.amount !== "number" ||
        !UUID_REGEX.test(split.userId)
      ) {
        return NextResponse.json(
          { error: "割り勘の内訳が不正です" },
          { status: 400 }
        );
      }
      parsedSplits.push({ userId: split.userId, amount: split.amount });
    }

    // splits 合計 === amount の検証
    const splitsTotal = parsedSplits.reduce((sum, s) => sum + s.amount, 0);
    if (splitsTotal !== amount) {
      return NextResponse.json(
        { error: "内訳の合計が支払い金額と一致しません" },
        { status: 400 }
      );
    }

    // 7. 支払い情報を取得（認可チェック用）
    const { data: payment, error: fetchError } = await supabase
      .from("payments")
      .select("id, payer_id, group_id, settlement_id")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("[PUT /api/payments/[id]] Fetch error:", fetchError);
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

    // 8. 清算済み支払いの編集を禁止
    if (payment.settlement_id) {
      return NextResponse.json(
        { error: "清算済みの支払いは編集できません" },
        { status: 403 }
      );
    }

    // 9. 認可チェック: 支払者本人のみ
    if (payment.payer_id !== user.id) {
      return NextResponse.json(
        { error: "この支払いを編集する権限がありません" },
        { status: 403 }
      );
    }

    // 9. payments テーブルを UPDATE
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        amount,
        description: description.trim(),
        category_id: categoryId || null,
        payment_date: paymentDateStr,
      })
      .eq("id", id);

    if (updateError) {
      console.error("[PUT /api/payments/[id]] Update error:", updateError);
      return NextResponse.json(
        { error: "更新に失敗しました（支払い情報の更新に失敗）" },
        { status: 500 }
      );
    }

    // 10. payment_splits を原子的に置換（RPC: SECURITY DEFINER）
    //
    //     RLS の DELETE ポリシーが PostgREST セッションで auth.uid() を
    //     正しく解決できない問題を回避するため、SECURITY DEFINER RPC で
    //     DELETE + INSERT を単一トランザクション内で実行する。
    //
    //     RPC 内部で payer_id === user.id を再検証（二重防御）。
    //     戻り値: >= 0 = 挿入件数, -1 = 支払い不在, -2 = 権限なし
    //
    //     プロパティ名変換:
    //       API body は camelCase（userId）、RPC の JSONB は snake_case（user_id）
    //       parsedSplits.userId → splitsForRpc.user_id で変換
    //
    const splitsForRpc = parsedSplits.map((s) => ({
      user_id: s.userId,
      amount: s.amount,
    }));

    const { data: insertedCount, error: rpcError } = await supabase
      .rpc("replace_payment_splits", {
        p_payment_id: id,
        p_user_id: user.id,
        p_splits: splitsForRpc as unknown as Json,
      });

    if (rpcError) {
      console.error("[PUT /api/payments/[id]] RPC replace_payment_splits error:", rpcError);
      return NextResponse.json(
        { error: "更新に失敗しました（内訳の更新に失敗）" },
        { status: 500 }
      );
    }

    if (insertedCount === -1) {
      console.error(
        `[PUT /api/payments/[id]] RPC: payment ${id} not found (returned -1)`
      );
      return NextResponse.json(
        { error: "支払いが見つかりません" },
        { status: 404 }
      );
    }

    if (insertedCount === -2) {
      console.error(
        `[PUT /api/payments/[id]] RPC: user ${user.id} is not payer of payment ${id} (returned -2)`
      );
      return NextResponse.json(
        { error: "この支払いを編集する権限がありません" },
        { status: 403 }
      );
    }

    if (insertedCount !== null && insertedCount < 0) {
      console.error(
        `[PUT /api/payments/[id]] RPC: unexpected return value ${insertedCount} for payment ${id}`
      );
      return NextResponse.json(
        { error: "更新に失敗しました（予期しないエラー）" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PUT /api/payments/[id]] Unexpected error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
