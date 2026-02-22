// @ts-nocheck — Deno runtime (not Node.js)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * create-demo Edge Function
 *
 * セキュアなデモセッション作成エンドポイント。
 * 1. Cloudflare Turnstile でボット検知
 * 2. 匿名ユーザー作成 (anon key)
 * 3. プロフィール・グループ・セッションを service_role でアトミックに生成
 * 4. セッション情報をクライアントに返却
 */
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const turnstileToken: string | null = body?.turnstileToken ?? null;

    // ── 1. Turnstile 検証 (TURNSTILE_SECRET_KEY が設定されている場合のみ) ──
    const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (TURNSTILE_SECRET_KEY) {
      if (!turnstileToken) {
        return jsonResponse(
          {
            success: false,
            error: { code: "CAPTCHA_FAILED", message: "CAPTCHA token is required" },
          },
          400
        );
      }
      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: TURNSTILE_SECRET_KEY,
            response: turnstileToken,
          }),
        }
      );
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        return jsonResponse(
          {
            success: false,
            error: { code: "CAPTCHA_FAILED", message: "CAPTCHA verification failed" },
          },
          400
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // ── 2. 匿名ユーザー作成 (anon key) ──
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } =
      await anonClient.auth.signInAnonymously();

    if (authError || !authData.user || !authData.session) {
      console.error("Demo auth error:", authError);
      return jsonResponse(
        {
          success: false,
          error: { code: "AUTH_FAILED", message: "Anonymous sign-in failed" },
        },
        500
      );
    }

    const userId = authData.user.id;

    // ── 3. service_role クライアントでデータ生成 (RLS バイパス) ──
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // プロフィール更新
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ display_name: "デモユーザー", is_demo: true })
      .eq("id", userId);

    if (profileError) {
      console.error("Demo profile error:", profileError);
      return jsonResponse(
        {
          success: false,
          error: {
            code: "PROFILE_CREATION_FAILED",
            message: "Profile update failed",
          },
        },
        500
      );
    }

    // デモグループ作成
    const { data: groupData, error: groupError } = await adminClient
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
      return jsonResponse(
        {
          success: false,
          error: {
            code: "GROUP_CREATION_FAILED",
            message: "Group creation failed",
          },
        },
        500
      );
    }

    // グループメンバー登録
    await adminClient.from("group_members").insert({
      group_id: groupData.id,
      user_id: userId,
      role: "owner",
    });

    // デモセッション記録
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { data: sessionData, error: sessionError } = await adminClient
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
      return jsonResponse(
        {
          success: false,
          error: {
            code: "SESSION_CREATION_FAILED",
            message: "Demo session creation failed",
          },
        },
        500
      );
    }

    // ── 4. Bot パートナー生成 (best effort) ──
    // create_demo_bot_partner は auth.uid() チェックがあるため
    // ユーザーの JWT を用いたクライアントで呼び出す
    try {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${authData.session.access_token}`,
          },
        },
      });
      const { error: botError } = await userClient.rpc(
        "create_demo_bot_partner",
        {
          p_group_id: groupData.id,
          p_demo_user_id: userId,
        }
      );
      if (botError) {
        console.warn("Demo bot creation skipped:", botError.message);
      }
    } catch {
      console.warn("Demo bot RPC not available, skipping");
    }

    // ── 5. セッション情報をクライアントに返却 ──
    return jsonResponse({
      success: true,
      session: authData.session,
      sessionId: sessionData.id,
      userId,
      groupId: groupData.id,
      expiresAt: sessionData.expires_at,
    });
  } catch (err) {
    console.error("create-demo unexpected error:", err);
    return jsonResponse(
      {
        success: false,
        error: { code: "NETWORK_ERROR", message: "Internal server error" },
      },
      500
    );
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
