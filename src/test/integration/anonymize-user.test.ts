/**
 * anonymize_user RPC — 統合テスト
 *
 * 検証項目:
 *   1. プロフィール匿名化（display_name, email, avatar_url）
 *   2. グループメンバーからの削除
 *   3. グループオーナー権の委譲
 *   4. 支払い記録の保持（FK 参照維持）
 *   5. エラーケース（存在しないユーザー、冪等性）
 *
 * UUID 範囲: 99990200-02xx
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, checkDbAvailable, SEED } from "./helpers";

// テスト用 UUID
const TEST_USER = "99990200-0200-0200-0200-000000000001";
const TEST_USER_SOLO = "99990200-0200-0200-0200-000000000002";
const TEST_GROUP_OWNED = "99990200-0200-0200-0200-000000000010";
const TEST_GROUP_SOLO = "99990200-0200-0200-0200-000000000011";
const TEST_PAYMENT = "99990200-0200-0200-0200-000000000020";

describe("anonymize_user RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // テストユーザー作成
    await admin.auth.admin.createUser({
      user_metadata: { display_name: "テスト太郎" },
      email: "test-anonymize@example.com",
      password: "password123",
      email_confirm: true,
      id: TEST_USER,
    });
    // プロフィール補完（トリガーで作成されるが display_name を確実に設定）
    await admin
      .from("profiles")
      .update({
        display_name: "テスト太郎",
        email: "test-anonymize@example.com",
        avatar_url: "https://example.com/avatar.png",
      })
      .eq("id", TEST_USER);

    // ソロテスト用ユーザー
    await admin.auth.admin.createUser({
      user_metadata: { display_name: "ソロ太郎" },
      email: "test-solo@example.com",
      password: "password123",
      email_confirm: true,
      id: TEST_USER_SOLO,
    });
    await admin
      .from("profiles")
      .update({ display_name: "ソロ太郎" })
      .eq("id", TEST_USER_SOLO);

    // テストユーザーがオーナーのグループ（Alice もメンバー → 委譲先）
    await admin.from("groups").insert({
      id: TEST_GROUP_OWNED,
      name: "匿名化テスト用グループ",
      owner_id: TEST_USER,
    });
    await admin.from("group_members").insert([
      { group_id: TEST_GROUP_OWNED, user_id: TEST_USER, role: "owner" },
      { group_id: TEST_GROUP_OWNED, user_id: SEED.ALICE_ID, role: "member" },
    ]);

    // ソログループ（他メンバーなし）
    await admin.from("groups").insert({
      id: TEST_GROUP_SOLO,
      name: "ソロテスト用グループ",
      owner_id: TEST_USER_SOLO,
    });
    await admin.from("group_members").insert({
      group_id: TEST_GROUP_SOLO,
      user_id: TEST_USER_SOLO,
      role: "owner",
    });

    // テスト用支払い（匿名化後も残るべき）
    await admin.from("payments").insert({
      id: TEST_PAYMENT,
      group_id: TEST_GROUP_OWNED,
      payer_id: TEST_USER,
      amount: 5000,
      description: "匿名化テスト支払い",
      payment_date: "2026-02-01",
    });
    await admin.from("payment_splits").insert([
      { payment_id: TEST_PAYMENT, user_id: TEST_USER, amount: 2500 },
      { payment_id: TEST_PAYMENT, user_id: SEED.ALICE_ID, amount: 2500 },
    ]);
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // 支払いデータ削除
    await admin
      .from("payment_splits")
      .delete()
      .eq("payment_id", TEST_PAYMENT);
    await admin.from("payments").delete().eq("id", TEST_PAYMENT);

    // グループメンバー削除（anonymize で消えているはずだが念のため）
    await admin
      .from("group_members")
      .delete()
      .in("group_id", [TEST_GROUP_OWNED, TEST_GROUP_SOLO]);

    // グループ削除
    await admin
      .from("groups")
      .delete()
      .in("id", [TEST_GROUP_OWNED, TEST_GROUP_SOLO]);

    // プロフィール・authユーザー削除
    await admin.from("profiles").delete().eq("id", TEST_USER);
    await admin.from("profiles").delete().eq("id", TEST_USER_SOLO);
    await admin.auth.admin.deleteUser(TEST_USER);
    await admin.auth.admin.deleteUser(TEST_USER_SOLO);
  });

  // ===========================================================================
  // オーナー委譲
  // ===========================================================================

  describe("オーナー委譲", () => {
    it("他メンバーがいるグループではオーナー権が委譲される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("anonymize_user", {
        p_user_id: TEST_USER,
      });

      expect(error).toBeNull();
      expect(data).toBe(true);

      const { data: group } = await admin
        .from("groups")
        .select("owner_id")
        .eq("id", TEST_GROUP_OWNED)
        .single();

      expect(group!.owner_id).toBe(SEED.ALICE_ID);
    });

    it("ソログループではオーナーがそのまま保持される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      await admin.rpc("anonymize_user", { p_user_id: TEST_USER_SOLO });

      const { data: group } = await admin
        .from("groups")
        .select("owner_id")
        .eq("id", TEST_GROUP_SOLO)
        .single();

      expect(group!.owner_id).toBe(TEST_USER_SOLO);
    });
  });

  // ===========================================================================
  // プロフィール匿名化
  // ===========================================================================

  describe("プロフィール匿名化", () => {
    it("display_name が「退会済みユーザー」に変更される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", TEST_USER)
        .single();

      expect(data!.display_name).toBe("退会済みユーザー");
    });

    it("email が null になる", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("profiles")
        .select("email")
        .eq("id", TEST_USER)
        .single();

      expect(data!.email).toBeNull();
    });

    it("avatar_url が null になる", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("profiles")
        .select("avatar_url")
        .eq("id", TEST_USER)
        .single();

      expect(data!.avatar_url).toBeNull();
    });
  });

  // ===========================================================================
  // グループメンバーシップ
  // ===========================================================================

  describe("グループメンバーシップ", () => {
    it("全グループから退去している", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("group_members")
        .select("id")
        .eq("user_id", TEST_USER);

      expect(data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // FK 参照維持
  // ===========================================================================

  describe("FK 参照維持", () => {
    it("支払い記録は保持される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payments")
        .select("id, payer_id")
        .eq("id", TEST_PAYMENT)
        .single();

      expect(data).not.toBeNull();
      expect(data!.payer_id).toBe(TEST_USER);
    });

    it("支払い割り勘データも保持される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payment_splits")
        .select("*")
        .eq("payment_id", TEST_PAYMENT);

      expect(data).toHaveLength(2);
    });
  });

  // ===========================================================================
  // エラーケース
  // ===========================================================================

  describe("エラーケース", () => {
    it("存在しないユーザー → false", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("anonymize_user", {
        p_user_id: "00000000-0000-0000-0000-000000000000",
      });

      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("既に匿名化済みユーザーでも true（冪等）", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("anonymize_user", {
        p_user_id: TEST_USER,
      });

      expect(error).toBeNull();
      expect(data).toBe(true);
    });
  });
});
