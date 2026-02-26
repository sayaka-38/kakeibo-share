import { NextResponse } from "next/server";
import { translateRpcError } from "@/lib/api/translate-rpc-error";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { groupIdRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/groups/leave
 *
 * グループから退出する（RPC leave_group 経由）
 */
export const POST = withAuthHandler(async (request, { supabase }) => {
  const body = await request.json();
  const { groupId } = groupIdRequestSchema.parse(body);

  const { error } = await supabase.rpc("leave_group", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("[API /groups/leave] RPC error:", error);
    const { message, status } = translateRpcError("leave_group", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}, "POST /api/groups/leave");
