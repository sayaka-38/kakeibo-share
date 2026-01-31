import { NextResponse } from "next/server";
import { deletePayment } from "@/lib/demo";
import { authenticateRequest } from "@/lib/api/authenticate";

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

    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { user, supabase } = auth;

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
