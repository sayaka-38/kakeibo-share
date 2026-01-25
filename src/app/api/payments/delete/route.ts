import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deletePayment } from "@/lib/demo";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paymentId, groupId } = body;

    if (!paymentId || !groupId) {
      return NextResponse.json(
        { error: "必要なパラメータが不足しています" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが認証されていません" },
        { status: 401 }
      );
    }

    const result = await deletePayment(supabase, {
      paymentId,
      groupId,
      requestedBy: user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message || "削除に失敗しました" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/payments/delete]", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
