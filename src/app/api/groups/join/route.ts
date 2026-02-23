import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateRequest } from "@/lib/api/authenticate";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { joinGroupRequestSchema } from "@/lib/validation/schemas";

// グループメンバー上限
const MAX_GROUP_MEMBERS = 20;

/**
 * POST /api/groups/join
 *
 * 招待コードでグループに参加する
 * RLS が厳格なため、グループ検索は service role を使用
 */
export const POST = withErrorHandler(async (request: Request) => {
  const body = await request.json();
  const { inviteCode } = joinGroupRequestSchema.parse(body);
  const trimmedCode = inviteCode.trim();

  const auth = await authenticateRequest();
  if (!auth.success) return auth.response;
  const { user } = auth;

  // 招待コードでグループを検索（admin クライアント = RLS バイパス）
  const adminClient = createAdminClient();
  const { data: group, error: groupError } = await adminClient
    .from("groups")
    .select("id, name")
    .eq("invite_code", trimmedCode)
    .single();

  if (groupError || !group) {
    return NextResponse.json(
      { error: "この招待リンクは無効です" },
      { status: 404 }
    );
  }

  // 既にメンバーかどうか確認（admin クライアント）
  const { data: existingMember } = await adminClient
    .from("group_members")
    .select("id")
    .eq("group_id", group.id)
    .eq("user_id", user.id)
    .single();

  if (existingMember) {
    return NextResponse.json(
      { error: "既にこのグループに参加しています" },
      { status: 409 }
    );
  }

  // メンバー数の上限確認（admin クライアント）
  const { data: members } = await adminClient
    .from("group_members")
    .select("id")
    .eq("group_id", group.id);

  if (members && members.length >= MAX_GROUP_MEMBERS) {
    return NextResponse.json(
      { error: "このグループはメンバー数の上限に達しています" },
      { status: 403 }
    );
  }

  // グループに参加（admin クライアント = RLS バイパス）
  const { error: insertError } = await adminClient.from("group_members").insert({
    group_id: group.id,
    user_id: user.id,
    role: "member",
  });

  if (insertError) {
    console.error("[API /groups/join] Failed to join group:", insertError);
    return NextResponse.json(
      { error: "グループへの参加に失敗しました" },
      { status: 500 }
    );
  }

  // 成功（招待コードはレスポンスに含めない）
  return NextResponse.json({
    success: true,
    groupId: group.id,
    groupName: group.name,
  });
}, "POST /api/groups/join");
