import { NextResponse } from "next/server";
import { translateRpcError } from "@/lib/api/translate-rpc-error";
import { withAuthHandler } from "@/lib/api/with-error-handler";
import { transferOwnerRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/groups/transfer-owner
 *
 * オーナー権限を別メンバーに移譲する（RPC transfer_group_ownership 経由）
 */
export const POST = withAuthHandler(async (request, { supabase }) => {
  const body = await request.json();
  const { groupId, newOwnerId } = transferOwnerRequestSchema.parse(body);

  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });

  if (error) {
    console.error("[API /groups/transfer-owner] RPC error:", error);
    const { message, status } = translateRpcError("transfer_group_ownership", error.message);
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: true });
}, "POST /api/groups/transfer-owner");
