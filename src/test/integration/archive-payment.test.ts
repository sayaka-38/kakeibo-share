/**
 * archive_payment RPC — 統合テスト（ローカル Supabase 実 DB）
 *
 * 検証項目:
 *   1. RPC 戻り値 (-1, -2, -3, 1)
 *   2. トランザクション整合性（payments → archived_payments 移動）
 *   3. 割り勘データの移動（payment_splits → archived_payment_splits）
 *   4. 清算ロジックへの影響（アーカイブ済みが payments に残らない）
 *
 * 前提: ローカル Supabase が起動済み（npm run db:start && npm run db:reset）
 *       未起動時はテストを自動スキップ。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, checkDbAvailable, SEED } from "./helpers";

// テスト専用 UUID（seed.sql と衝突しない 9999xxxx 系）
const PAY_SUCCESS = "99990001-0001-0001-0001-000000000001";
const PAY_NOT_PAYER = "99990002-0002-0002-0002-000000000002";
const PAY_SETTLED = "99990003-0003-0003-0003-000000000003";
const SESSION_ID = "99990004-0004-0004-0004-000000000004";

// -----------------------------------------------------------------------------

describe("archive_payment RPC — 統合テスト (ローカル DB)", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  // DB 接続チェック + テストデータ作成
  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // --- テストデータ作成 ---

    // 1. 正常系テスト用支払い（Alice が支払者、Alice+Bob で折半）
    await admin.from("payments").insert({
      id: PAY_SUCCESS,
      group_id: SEED.GROUP_ID,
      payer_id: SEED.ALICE_ID,
      amount: 1000,
      description: "アーカイブ正常系テスト",
      payment_date: "2026-01-15",
    });
    await admin.from("payment_splits").insert([
      { payment_id: PAY_SUCCESS, user_id: SEED.ALICE_ID, amount: 500 },
      { payment_id: PAY_SUCCESS, user_id: SEED.BOB_ID, amount: 500 },
    ]);

    // 2. 権限テスト用支払い（Alice の支払い → Bob がアーカイブ試行）
    await admin.from("payments").insert({
      id: PAY_NOT_PAYER,
      group_id: SEED.GROUP_ID,
      payer_id: SEED.ALICE_ID,
      amount: 2000,
      description: "権限テスト用",
      payment_date: "2026-01-16",
    });

    // 3. 清算済みテスト用（settlement_session + settlement_id 付き支払い）
    await admin.from("settlement_sessions").insert({
      id: SESSION_ID,
      group_id: SEED.GROUP_ID,
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      status: "draft",
      created_by: SEED.ALICE_ID,
    });
    await admin.from("payments").insert({
      id: PAY_SETTLED,
      group_id: SEED.GROUP_ID,
      payer_id: SEED.ALICE_ID,
      amount: 3000,
      description: "清算済みテスト用",
      payment_date: "2026-01-17",
      settlement_id: SESSION_ID,
    });
  });

  // テストデータ削除（archive テーブル含む）
  afterAll(async () => {
    if (!dbAvailable) return;

    // archived テーブルから削除（成功テスト後に存在する可能性）
    await admin
      .from("archived_payment_splits")
      .delete()
      .eq("payment_id", PAY_SUCCESS);
    await admin.from("archived_payments").delete().eq("id", PAY_SUCCESS);

    // payments テーブルから削除（失敗テストでは未アーカイブ）
    await admin
      .from("payment_splits")
      .delete()
      .in("payment_id", [PAY_SUCCESS, PAY_NOT_PAYER, PAY_SETTLED]);
    await admin
      .from("payments")
      .delete()
      .in("id", [PAY_SUCCESS, PAY_NOT_PAYER, PAY_SETTLED]);
    await admin.from("settlement_sessions").delete().eq("id", SESSION_ID);
  });

  // ===========================================================================
  // RPC エラー（RAISE EXCEPTION 形式）テスト
  // ===========================================================================

  describe("RPC エラー（RAISE EXCEPTION）", () => {
    it("not_found: 存在しない支払い ID で例外が発生する", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("archive_payment", {
        p_payment_id: "00000000-0000-0000-0000-000000000000",
        p_user_id: SEED.ALICE_ID,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/not_found/i);
    });

    it("not_payer: 支払者以外がアーカイブ試行すると例外が発生する", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("archive_payment", {
        p_payment_id: PAY_NOT_PAYER,
        p_user_id: SEED.BOB_ID,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/not_payer/i);

      // データが変更されていないことを確認
      const { data: payment } = await admin
        .from("payments")
        .select("id")
        .eq("id", PAY_NOT_PAYER)
        .single();
      expect(payment).not.toBeNull();
    });

    it("settled: 清算済み支払いのアーカイブ試行で例外が発生する", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin.rpc("archive_payment", {
        p_payment_id: PAY_SETTLED,
        p_user_id: SEED.ALICE_ID,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/settled/i);

      // データが変更されていないことを確認
      const { data: payment } = await admin
        .from("payments")
        .select("id")
        .eq("id", PAY_SETTLED)
        .single();
      expect(payment).not.toBeNull();
    });
  });

  // ===========================================================================
  // トランザクション整合性（実データ移動の検証）
  // ===========================================================================

  describe("トランザクション整合性", () => {
    let archiveResult: boolean | null = null;

    beforeAll(async () => {
      if (!dbAvailable) return;

      const { data } = await admin.rpc("archive_payment", {
        p_payment_id: PAY_SUCCESS,
        p_user_id: SEED.ALICE_ID,
      });
      archiveResult = data;
    });

    it("RPC が true（成功）を返す", (ctx) => {
      if (!dbAvailable) return ctx.skip();
      expect(archiveResult).toBe(true);
    });

    it("payments テーブルから削除されている", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payments")
        .select("id")
        .eq("id", PAY_SUCCESS);

      expect(data).toHaveLength(0);
    });

    it("archived_payments に archived_at 付きで移動している", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin
        .from("archived_payments")
        .select("*")
        .eq("id", PAY_SUCCESS)
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.amount).toBe(1000);
      expect(data!.description).toBe("アーカイブ正常系テスト");
      expect(data!.payer_id).toBe(SEED.ALICE_ID);
      expect(data!.group_id).toBe(SEED.GROUP_ID);
      expect(data!.archived_at).toBeTruthy();
      // archived_at は実行時刻に近い
      const archivedAt = new Date(data!.archived_at);
      const now = new Date();
      expect(now.getTime() - archivedAt.getTime()).toBeLessThan(60_000);
    });

    it("archived_payment_splits に割り勘データ 2 件が移動している", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data, error } = await admin
        .from("archived_payment_splits")
        .select("*")
        .eq("payment_id", PAY_SUCCESS)
        .order("amount", { ascending: true });

      expect(error).toBeNull();
      expect(data).toHaveLength(2);
      expect(data![0].amount).toBe(500);
      expect(data![1].amount).toBe(500);
      const userIds = data!.map((s) => s.user_id).sort();
      expect(userIds).toEqual([SEED.ALICE_ID, SEED.BOB_ID].sort());
      expect(data![0].archived_at).toBeTruthy();
      expect(data![1].archived_at).toBeTruthy();
    });

    it("payment_splits からも削除されている（CASCADE）", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payment_splits")
        .select("id")
        .eq("payment_id", PAY_SUCCESS);

      expect(data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 清算ロジックへの影響
  // ===========================================================================

  describe("清算ロジックへの影響", () => {
    it("アーカイブ済み支払いが payments クエリに含まれない", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payments")
        .select("id")
        .eq("group_id", SEED.GROUP_ID);

      const ids = (data || []).map((p) => p.id);
      expect(ids).not.toContain(PAY_SUCCESS);
    });

    it("アーカイブ済み支払いの splits が payment_splits に残らない", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin
        .from("payment_splits")
        .select("payment_id")
        .eq("payment_id", PAY_SUCCESS);

      expect(data).toHaveLength(0);
    });
  });
});
