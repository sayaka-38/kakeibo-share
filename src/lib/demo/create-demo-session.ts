/**
 * デモセッション作成機能
 *
 * 匿名認証を使用してデモユーザーを作成し、
 * サンプルグループとデータをセットアップする
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type DemoSessionErrorCode =
  | "AUTH_FAILED"
  | "PROFILE_CREATION_FAILED"
  | "GROUP_CREATION_FAILED"
  | "SESSION_CREATION_FAILED"
  | "NETWORK_ERROR";

export interface DemoSessionError {
  code: DemoSessionErrorCode;
  message: string;
}

export interface DemoSessionData {
  sessionId: string;
  userId: string;
  groupId: string;
  expiresAt: Date;
}

export interface CreateDemoSessionResult {
  success: boolean;
  data?: DemoSessionData;
  error?: DemoSessionError;
}

/**
 * デモセッションを作成する
 *
 * 1. 匿名認証でユーザーを作成
 * 2. プロフィールを作成
 * 3. デモ用グループを作成
 * 4. グループメンバーとして登録
 * 5. demo_sessions テーブルに記録
 *
 * @param supabase - Supabase クライアント
 * @returns 作成結果
 */
export async function createDemoSession(
  supabase: SupabaseClient
): Promise<CreateDemoSessionResult> {
  try {
    // 1. 匿名認証
    const { data: authData, error: authError } =
      await supabase.auth.signInAnonymously();

    if (authError || !authData.user) {
      console.error("Demo auth error:", authError);
      return {
        success: false,
        error: {
          code: "AUTH_FAILED",
          message:
            "デモセッションの開始に失敗しました。しばらく経ってからお試しください。",
        },
      };
    }

    const userId = authData.user.id;

    // 2. プロフィール取得（トリガーで自動作成済み）& 表示名とデモフラグを更新
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: "デモユーザー", is_demo: true })
      .eq("id", userId)
      .select()
      .single();

    if (profileError || !profileData) {
      console.error("Demo profile error:", profileError);
      return {
        success: false,
        error: {
          code: "PROFILE_CREATION_FAILED",
          message: "デモユーザーの作成に失敗しました。",
        },
      };
    }

    // 3. デモ用グループ作成
    const { data: groupData, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: "デモ用シェアハウス",
        description: "デモ体験用のサンプルグループです",
        owner_id: userId,
      })
      .select()
      .single();

    if (groupError || !groupData) {
      console.error("Demo group error:", groupError);
      return {
        success: false,
        error: {
          code: "GROUP_CREATION_FAILED",
          message: "デモグループの作成に失敗しました。",
        },
      };
    }

    // 4. グループメンバーとして登録
    await supabase.from("group_members").insert({
      group_id: groupData.id,
      user_id: userId,
      role: "owner",
    });

    // 5. demo_sessions テーブルに記録
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

    const { data: sessionData, error: sessionError } = await supabase
      .from("demo_sessions")
      .insert({
        user_id: userId,
        group_id: groupData.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (sessionError || !sessionData) {
      console.error("Demo session error:", sessionError);
      return {
        success: false,
        error: {
          code: "SESSION_CREATION_FAILED",
          message: "デモセッションの記録に失敗しました。",
        },
      };
    }

    // 6. Bot パートナーとサンプル支払いを生成（失敗しても続行）
    try {
      const { error: botError } = await supabase.rpc(
        "create_demo_bot_partner",
        { p_group_id: groupData.id, p_demo_user_id: userId }
      );
      if (botError) {
        console.warn("Demo bot creation skipped:", botError.message);
      }
    } catch {
      // RPC が未デプロイの場合は無視して続行
      console.warn("Demo bot RPC not available, skipping");
    }

    return {
      success: true,
      data: {
        sessionId: sessionData.id,
        userId: userId,
        groupId: groupData.id,
        expiresAt: new Date(sessionData.expires_at),
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "ネットワークエラーが発生しました。接続を確認してください。",
      },
    };
  }
}
