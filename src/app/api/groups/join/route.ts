import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// グループメンバー上限
const MAX_GROUP_MEMBERS = 20;

// 招待コードの最小長
const MIN_INVITE_CODE_LENGTH = 6;

/**
 * POST /api/groups/join
 *
 * 招待コードでグループに参加する
 * RLS が厳格なため、グループ検索は service role を使用
 */
export async function POST(request: Request) {
  try {
    // 1. リクエストボディをパース
    const body = await request.json();
    const { inviteCode } = body;

    // 2. バリデーション
    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json(
        { error: "招待コードが必要です" },
        { status: 400 }
      );
    }

    const trimmedCode = inviteCode.trim();
    if (trimmedCode.length < MIN_INVITE_CODE_LENGTH) {
      return NextResponse.json(
        { error: "招待コードの形式が不正です" },
        { status: 400 }
      );
    }

    // 3. ユーザー認証確認（通常クライアント）
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      );
    }

    // 4. 招待コードでグループを検索（admin クライアント = RLS バイパス）
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

    // 5. 既にメンバーかどうか確認（admin クライアント）
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

    // 6. メンバー数の上限確認（admin クライアント）
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

    // 7. グループに参加（通常クライアント = RLS 適用）
    // RLS は「自分自身の追加」を許可する設定
    const { error: insertError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "member",
    });

    if (insertError) {
      console.error("Failed to join group:", insertError);
      return NextResponse.json(
        { error: "グループへの参加に失敗しました" },
        { status: 500 }
      );
    }

    // 8. 成功（招待コードはレスポンスに含めない）
    return NextResponse.json({
      success: true,
      groupId: group.id,
      groupName: group.name,
    });
  } catch (error) {
    console.error("Join group error:", error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}
