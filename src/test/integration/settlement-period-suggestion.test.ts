/**
 * get_settlement_period_suggestion RPC — 統合テスト
 *
 * 検証項目:
 *   1. 未清算支払いの件数カウント
 *   2. 日付計算ロジック（oldest, suggested_start/end）
 *   3. 非メンバーエラー
 *   4. 前回清算なし時の last_confirmed_end
 *
 * UUID 範囲: なし（seed データのみ使用）
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, checkDbAvailable, SEED } from "./helpers";

describe("get_settlement_period_suggestion RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
  });

  it("未清算支払いの unsettled_count が正しい", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const { data, error } = await admin.rpc("get_settlement_period_suggestion", {
      p_group_id: SEED.GROUP_ID,
      p_user_id: SEED.ALICE_ID,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row).not.toBeNull();
    // seed data には GROUP_ID に 2 件の未清算支払い（d4444..., e5555...）
    expect(row!.unsettled_count).toBeGreaterThanOrEqual(2);
  });

  it("oldest_unsettled_date が設定されている", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const { data } = await admin.rpc("get_settlement_period_suggestion", {
      p_group_id: SEED.GROUP_ID,
      p_user_id: SEED.ALICE_ID,
    });

    const row = Array.isArray(data) ? data[0] : data;
    expect(row).not.toBeNull();
    expect(row!.oldest_unsettled_date).toBeTruthy();
  });

  it("suggested_start ≤ suggested_end", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const { data } = await admin.rpc("get_settlement_period_suggestion", {
      p_group_id: SEED.GROUP_ID,
      p_user_id: SEED.ALICE_ID,
    });

    const row = Array.isArray(data) ? data[0] : data;
    expect(row).not.toBeNull();
    const start = new Date(row!.suggested_start);
    const end = new Date(row!.suggested_end);
    expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it("非メンバーはエラー", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    const NON_MEMBER = "00000000-0000-0000-0000-ffffffffffff";
    const { error } = await admin.rpc("get_settlement_period_suggestion", {
      p_group_id: SEED.GROUP_ID,
      p_user_id: NON_MEMBER,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain("not a member");
  });

  it("前回清算なしでは last_confirmed_end = null", async (ctx) => {
    if (!dbAvailable) return ctx.skip();

    // GROUP2（趣味サークル）は清算セッションなし
    const { data } = await admin.rpc("get_settlement_period_suggestion", {
      p_group_id: SEED.GROUP2_ID,
      p_user_id: SEED.ALICE_ID,
    });

    const row = Array.isArray(data) ? data[0] : data;
    expect(row).not.toBeNull();
    expect(row!.last_confirmed_end).toBeNull();
  });
});
