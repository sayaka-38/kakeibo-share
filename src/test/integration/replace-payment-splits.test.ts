/**
 * replace_payment_splits RPC — 統合テスト
 *
 * 検証項目:
 *   1. エラーコード (-1, -2)
 *   2. 原子的置換（DELETE + INSERT）
 *   3. 金額変更・splits 数変更
 *   4. エッジケース（空配列、再置換）
 *
 * 注: payment_splits に UNIQUE(payment_id, user_id) 制約あり
 * UUID 範囲: 99990100-01xx
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, checkDbAvailable, SEED } from "./helpers";

const PAY_ID = "99990100-0100-0100-0100-000000000001";

describe("replace_payment_splits RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // テスト用支払い（Alice が支払者、Alice+Bob で折半）
    await admin.from("payments").insert({
      id: PAY_ID,
      group_id: SEED.GROUP_ID,
      payer_id: SEED.ALICE_ID,
      amount: 1000,
      description: "splits 置換テスト",
      payment_date: "2026-02-01",
    });
    await admin.from("payment_splits").insert([
      { payment_id: PAY_ID, user_id: SEED.ALICE_ID, amount: 500 },
      { payment_id: PAY_ID, user_id: SEED.BOB_ID, amount: 500 },
    ]);
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await admin.from("payment_splits").delete().eq("payment_id", PAY_ID);
    await admin.from("payments").delete().eq("id", PAY_ID);
  });

  // ===========================================================================
  // エラーケース
  // ===========================================================================

  describe("エラーケース", () => {
    it("-1: 存在しない支払い ID", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("replace_payment_splits", {
        p_payment_id: "00000000-0000-0000-0000-000000000000",
        p_user_id: SEED.ALICE_ID,
        p_splits: [
          { user_id: SEED.ALICE_ID, amount: 500 },
        ],
      });

      expect(error).toBeNull();
      expect(data).toBe(-1);
    });

    it("-2: 支払者以外（Bob が Alice の支払いを置換試行）", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("replace_payment_splits", {
        p_payment_id: PAY_ID,
        p_user_id: SEED.BOB_ID,
        p_splits: [
          { user_id: SEED.ALICE_ID, amount: 500 },
        ],
      });

      expect(error).toBeNull();
      expect(data).toBe(-2);

      // 元の splits が変更されていない
      const { data: splits } = await admin
        .from("payment_splits")
        .select("*")
        .eq("payment_id", PAY_ID);
      expect(splits).toHaveLength(2);
    });
  });

  // ===========================================================================
  // 正常置換
  // ===========================================================================

  describe("正常置換", () => {
    it("カスタム金額（非均等）での置換", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data: count, error } = await admin.rpc(
        "replace_payment_splits",
        {
          p_payment_id: PAY_ID,
          p_user_id: SEED.ALICE_ID,
          p_splits: [
            { user_id: SEED.ALICE_ID, amount: 700 },
            { user_id: SEED.BOB_ID, amount: 300 },
          ],
        }
      );

      expect(error).toBeNull();
      expect(count).toBe(2);

      const { data: splits } = await admin
        .from("payment_splits")
        .select("user_id, amount")
        .eq("payment_id", PAY_ID)
        .order("amount", { ascending: false });

      expect(splits![0]).toMatchObject({
        user_id: SEED.ALICE_ID,
        amount: 700,
      });
      expect(splits![1]).toMatchObject({
        user_id: SEED.BOB_ID,
        amount: 300,
      });
    });

    it("1 split への縮小", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data: count, error } = await admin.rpc(
        "replace_payment_splits",
        {
          p_payment_id: PAY_ID,
          p_user_id: SEED.ALICE_ID,
          p_splits: [
            { user_id: SEED.ALICE_ID, amount: 1000 },
          ],
        }
      );

      expect(error).toBeNull();
      expect(count).toBe(1);

      const { data: splits } = await admin
        .from("payment_splits")
        .select("*")
        .eq("payment_id", PAY_ID);
      expect(splits).toHaveLength(1);
      expect(splits![0].user_id).toBe(SEED.ALICE_ID);
    });

    it("1→2 への拡張", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data: count, error } = await admin.rpc(
        "replace_payment_splits",
        {
          p_payment_id: PAY_ID,
          p_user_id: SEED.ALICE_ID,
          p_splits: [
            { user_id: SEED.ALICE_ID, amount: 500 },
            { user_id: SEED.BOB_ID, amount: 500 },
          ],
        }
      );

      expect(error).toBeNull();
      expect(count).toBe(2);

      const { data: splits } = await admin
        .from("payment_splits")
        .select("*")
        .eq("payment_id", PAY_ID);
      expect(splits).toHaveLength(2);
    });

    it("再置換（連続実行）で正しく上書きされる", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      // 2→2 金額変更
      const { data: count, error } = await admin.rpc(
        "replace_payment_splits",
        {
          p_payment_id: PAY_ID,
          p_user_id: SEED.ALICE_ID,
          p_splits: [
            { user_id: SEED.ALICE_ID, amount: 600 },
            { user_id: SEED.BOB_ID, amount: 400 },
          ],
        }
      );

      expect(error).toBeNull();
      expect(count).toBe(2);

      const { data: splits } = await admin
        .from("payment_splits")
        .select("user_id, amount")
        .eq("payment_id", PAY_ID)
        .order("amount", { ascending: false });

      expect(splits![0].amount).toBe(600);
      expect(splits![1].amount).toBe(400);
    });
  });

  // ===========================================================================
  // エッジケース
  // ===========================================================================

  describe("エッジケース", () => {
    it("UNIQUE 制約違反（同一 user_id 重複）はエラー", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { error } = await admin.rpc("replace_payment_splits", {
        p_payment_id: PAY_ID,
        p_user_id: SEED.ALICE_ID,
        p_splits: [
          { user_id: SEED.ALICE_ID, amount: 300 },
          { user_id: SEED.ALICE_ID, amount: 700 },
        ],
      });

      // UNIQUE 制約違反でエラー（トランザクション全体がロールバック）
      expect(error).not.toBeNull();

      // 元の splits が変更されていない
      const { data: splits } = await admin
        .from("payment_splits")
        .select("*")
        .eq("payment_id", PAY_ID);
      expect(splits).toHaveLength(2);
    });
  });
});
