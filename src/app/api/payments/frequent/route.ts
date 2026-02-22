import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";

/**
 * GET /api/payments/frequent?groupId=xxx&limit=6
 *
 * グループ内で頻出する支払い説明文とカテゴリIDのペアを返す。
 * スマートチップ機能で使用。
 *
 * RPC: get_frequent_payments — グループメンバーのみ結果を受け取る (SECURITY DEFINER)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "6", 10),
      20
    );

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json(
        { error: "groupId is required" },
        { status: 400 }
      );
    }

    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { supabase } = auth;

    const { data, error } = await supabase.rpc("get_frequent_payments", {
      p_group_id: groupId,
      p_limit: limit,
    });

    if (error) {
      console.error("[API /payments/frequent] RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suggestions: data ?? [] });
  } catch (error) {
    console.error("[API /payments/frequent] Unexpected error:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
