/**
 * create_demo_bot_partner RPC — 統合テスト
 *
 * 検証項目:
 *   1. 認証エラー（auth.uid() !== p_demo_user_id）
 *   2. 正常系: Bot 作成 + JSONB 構造
 *   3. Bot がグループメンバーに追加される
 *
 * UUID 範囲: 99990500-05xx
 * 注: この RPC は auth.uid() を要求するため anon client + signIn が必要
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  createAdminClient,
  createAnonClient,
  checkDbAvailable,
  SEED,
} from "./helpers";

const TEST_GROUP = "99990500-0500-0500-0500-000000000001";

describe("create_demo_bot_partner RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let authed: SupabaseClient<Database>;
  let dbAvailable = false;
  let botId: string | null = null;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // テスト用グループ作成
    await admin.from("groups").insert({
      id: TEST_GROUP,
      name: "Bot テスト用グループ",
      owner_id: SEED.ALICE_ID,
    });
    await admin.from("group_members").insert({
      group_id: TEST_GROUP,
      user_id: SEED.ALICE_ID,
      role: "owner",
    });

    // Alice として認証
    authed = createAnonClient();
    await authed.auth.signInWithPassword({
      email: "alice@example.com",
      password: "password123",
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    if (botId) {
      // Bot の支払いデータを削除
      const { data: payments } = await admin
        .from("payments")
        .select("id")
        .eq("group_id", TEST_GROUP);
      if (payments && payments.length > 0) {
        const payIds = payments.map((p) => p.id);
        await admin
          .from("payment_splits")
          .delete()
          .in("payment_id", payIds);
        await admin.from("payments").delete().in("id", payIds);
      }
      await admin
        .from("group_members")
        .delete()
        .eq("user_id", botId);
      await admin.from("profiles").delete().eq("id", botId);
      await admin.auth.admin.deleteUser(botId);
    }

    await admin
      .from("group_members")
      .delete()
      .eq("group_id", TEST_GROUP);
    await admin.from("groups").delete().eq("id", TEST_GROUP);
  });

  it("admin client（auth.uid() = null）では認証エラー", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const { error } = await admin.rpc("create_demo_bot_partner", {
      p_group_id: TEST_GROUP,
      p_demo_user_id: SEED.ALICE_ID,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("Unauthorized");
  });

  it("認証済みユーザーで Bot 作成: payments_created = 4", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const { data, error } = await authed.rpc("create_demo_bot_partner", {
      p_group_id: TEST_GROUP,
      p_demo_user_id: SEED.ALICE_ID,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    const result = data as { bot_id: string; bot_name: string; payments_created: number };
    expect(result.bot_id).toBeTruthy();
    expect(result.bot_name).toBe("さくら（パートナー）");
    expect(result.payments_created).toBe(4);

    botId = result.bot_id;
  });

  it("Bot がグループメンバーに追加されている", async (ctx) => {
    if (!dbAvailable || !botId) return ctx.skip();

    const { data } = await admin
      .from("group_members")
      .select("role")
      .eq("group_id", TEST_GROUP)
      .eq("user_id", botId)
      .single();

    expect(data).not.toBeNull();
    expect(data!.role).toBe("member");
  });
});
