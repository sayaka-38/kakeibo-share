import { NextResponse } from "next/server";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { z } from "zod";

/**
 * GET /api/payments/frequent?groupId=xxx&limit=6
 *
 * グループ内で頻出する支払い説明文とカテゴリIDのペアを返す。
 * スマートチップ機能で使用。
 *
 * RPC: get_frequent_payments — グループメンバーのみ結果を受け取る (SECURITY DEFINER)
 */

// クエリパラメータを Zod で安全にパース（parseInt NaN リスクを排除）
const frequentQuerySchema = z.object({
  groupId: z.string().uuid(),
  limit: z.coerce.number().int().positive().default(6).catch(6),
});

export const GET = withAuthHandler(async (request, { supabase }) => {
  const { searchParams } = new URL(request.url);

  const parsed = frequentQuerySchema.safeParse({
    groupId: searchParams.get("groupId"),
    limit: searchParams.get("limit"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "groupId (UUID) が必要です" },
      { status: 400 }
    );
  }

  const { groupId, limit } = parsed.data;
  const safeLimit = Math.min(limit, 20);

  const { data, error } = await supabase.rpc("get_frequent_payments", {
    p_group_id: groupId,
    p_limit: safeLimit,
  });

  if (error) {
    console.error("[API /payments/frequent] RPC error:", error);
    return NextResponse.json(
      { error: "頻出支払いの取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ suggestions: data ?? [] });
}, "GET /api/payments/frequent");
