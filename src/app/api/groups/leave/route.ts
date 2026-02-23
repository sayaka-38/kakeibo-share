import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api/authenticate";
import { translateRpcError } from "@/lib/api/translate-rpc-error";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { groupIdRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/groups/leave
 *
 * グループから退出する（RPC leave_group 経由）
 */
export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { groupId } = groupIdRequestSchema.parse(body);

  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { supabase } = auth;

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
