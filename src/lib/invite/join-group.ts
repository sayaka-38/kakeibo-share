import { SupabaseClient } from "@supabase/supabase-js";

// エラーコード定義
export type JoinGroupErrorCode =
  | "NOT_AUTHENTICATED"
  | "INVALID_INVITE_CODE"
  | "ALREADY_MEMBER"
  | "GROUP_FULL"
  | "JOIN_FAILED"
  | "NETWORK_ERROR";

// エラー型
export type JoinGroupError = {
  code: JoinGroupErrorCode;
  message: string;
};

// 成功時のデータ型
export type JoinGroupData = {
  groupId: string;
  groupName: string;
};

// 結果型
export type JoinGroupResult =
  | { success: true; data: JoinGroupData; error?: undefined }
  | { success: false; data?: undefined; error: JoinGroupError };

// グループメンバー上限
const MAX_GROUP_MEMBERS = 20;

/**
 * 招待コードでグループに参加する
 */
export async function joinGroupByInviteCode(
  supabase: SupabaseClient,
  inviteCode: string
): Promise<JoinGroupResult> {
  try {
    // 1. 招待コードのバリデーション
    if (!inviteCode || inviteCode.trim() === "") {
      return {
        success: false,
        error: {
          code: "INVALID_INVITE_CODE",
          message: "この招待リンクは無効です。リンクを確認してください",
        },
      };
    }

    // 2. ユーザー認証確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: {
          code: "NOT_AUTHENTICATED",
          message: "グループに参加するにはログインが必要です",
        },
      };
    }

    // 3. 招待コードでグループを検索
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name")
      .eq("invite_code", inviteCode)
      .single();

    if (groupError || !group) {
      return {
        success: false,
        error: {
          code: "INVALID_INVITE_CODE",
          message: "この招待リンクは無効です。リンクを確認してください",
        },
      };
    }

    // 4. 既にメンバーかどうか確認
    const { data: existingMember } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      return {
        success: false,
        error: {
          code: "ALREADY_MEMBER",
          message: "既にこのグループに参加しています",
        },
      };
    }

    // 5. メンバー数の上限確認
    const { data: members } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", group.id);

    if (members && members.length >= MAX_GROUP_MEMBERS) {
      return {
        success: false,
        error: {
          code: "GROUP_FULL",
          message: "このグループはメンバー数の上限に達しています",
        },
      };
    }

    // 6. グループに参加（roleはmember固定）
    const { error: insertError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "member",
    });

    if (insertError) {
      return {
        success: false,
        error: {
          code: "JOIN_FAILED",
          message:
            "グループへの参加に失敗しました。しばらく経ってからお試しください",
        },
      };
    }

    // 7. 成功
    return {
      success: true,
      data: {
        groupId: group.id,
        groupName: group.name,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "ネットワークエラーが発生しました。接続を確認してください",
      },
    };
  }
}
