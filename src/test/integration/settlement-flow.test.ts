/**
 * 清算フロー RPC — 統合テスト
 *
 * generate_settlement_entries → confirm_settlement → confirm_settlement_receipt
 * + settle_consolidated_sessions
 *
 * 検証項目:
 *   1. 各 RPC のエラーコード
 *   2. フルフロー: draft → pending_payment → settled
 *   3. ゼロ清算: 全員同額 → is_zero_settlement → 即 settled
 *   4. net_transfers 計算
 *   5. 統合セッション一括更新
 *
 * UUID 範囲: 99990300-03xx
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, checkDbAvailable, SEED } from "./helpers";

// テスト専用 UUID
const GROUP_FLOW = "99990300-0300-0300-0300-000000000001";
const SESSION_MAIN = "99990300-0300-0300-0300-000000000010";
const SESSION_ZERO = "99990300-0300-0300-0300-000000000011";
const SESSION_CONSOL1 = "99990300-0300-0300-0300-000000000012";
const SESSION_CONSOL2 = "99990300-0300-0300-0300-000000000013";
const PAY_A = "99990300-0300-0300-0300-000000000020"; // Alice 3000
const PAY_B = "99990300-0300-0300-0300-000000000021"; // Bob 1000
const PAY_ZERO1 = "99990300-0300-0300-0300-000000000022"; // Alice 2000 (for zero settlement)
const PAY_ZERO2 = "99990300-0300-0300-0300-000000000023"; // Bob 2000 (for zero settlement)

const NON_MEMBER = "00000000-0000-0000-0000-ffffffffffff";

describe("清算フロー RPC — 統合テスト", () => {
  let admin: SupabaseClient<Database>;
  let dbAvailable = false;

  beforeAll(async () => {
    admin = createAdminClient();
    dbAvailable = await checkDbAvailable(admin);
    if (!dbAvailable) return;

    // テスト用グループ + メンバー
    await admin.from("groups").insert({
      id: GROUP_FLOW,
      name: "清算フローテスト",
      owner_id: SEED.ALICE_ID,
    });
    await admin.from("group_members").insert([
      { group_id: GROUP_FLOW, user_id: SEED.ALICE_ID, role: "owner" },
      { group_id: GROUP_FLOW, user_id: SEED.BOB_ID, role: "member" },
    ]);

    // テスト支払い: Alice 3000円（折半）
    await admin.from("payments").insert({
      id: PAY_A,
      group_id: GROUP_FLOW,
      payer_id: SEED.ALICE_ID,
      amount: 3000,
      description: "Alice の支払い",
      payment_date: "2026-01-15",
    });
    await admin.from("payment_splits").insert([
      { payment_id: PAY_A, user_id: SEED.ALICE_ID, amount: 1500 },
      { payment_id: PAY_A, user_id: SEED.BOB_ID, amount: 1500 },
    ]);

    // テスト支払い: Bob 1000円（折半）
    await admin.from("payments").insert({
      id: PAY_B,
      group_id: GROUP_FLOW,
      payer_id: SEED.BOB_ID,
      amount: 1000,
      description: "Bob の支払い",
      payment_date: "2026-01-20",
    });
    await admin.from("payment_splits").insert([
      { payment_id: PAY_B, user_id: SEED.ALICE_ID, amount: 500 },
      { payment_id: PAY_B, user_id: SEED.BOB_ID, amount: 500 },
    ]);

    // メインセッション（draft）
    await admin.from("settlement_sessions").insert({
      id: SESSION_MAIN,
      group_id: GROUP_FLOW,
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      status: "draft",
      created_by: SEED.ALICE_ID,
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;

    // settlement_entry_splits → settlement_entries → settlement_sessions
    const sessionIds = [SESSION_MAIN, SESSION_ZERO, SESSION_CONSOL1, SESSION_CONSOL2];
    for (const sid of sessionIds) {
      const { data: entries } = await admin
        .from("settlement_entries")
        .select("id")
        .eq("session_id", sid);
      if (entries && entries.length > 0) {
        const entryIds = entries.map((e) => e.id);
        await admin
          .from("settlement_entry_splits")
          .delete()
          .in("entry_id", entryIds);
      }
      await admin.from("settlement_entries").delete().eq("session_id", sid);
    }

    // payments (settlement_id をクリアしてから削除)
    const payIds = [PAY_A, PAY_B, PAY_ZERO1, PAY_ZERO2];
    await admin
      .from("payments")
      .update({ settlement_id: null })
      .in("id", payIds);
    // confirm で作成された支払いも削除
    await admin
      .from("payments")
      .update({ settlement_id: null })
      .in("settlement_id", sessionIds);

    // payment_splits → payments
    const { data: allPays } = await admin
      .from("payments")
      .select("id")
      .eq("group_id", GROUP_FLOW);
    if (allPays && allPays.length > 0) {
      await admin
        .from("payment_splits")
        .delete()
        .in("payment_id", allPays.map((p) => p.id));
      await admin
        .from("payments")
        .delete()
        .in("id", allPays.map((p) => p.id));
    }

    await admin
      .from("settlement_sessions")
      .delete()
      .in("id", sessionIds);
    await admin
      .from("group_members")
      .delete()
      .eq("group_id", GROUP_FLOW);
    await admin.from("groups").delete().eq("id", GROUP_FLOW);
  });

  // ===========================================================================
  // generate_settlement_entries
  // ===========================================================================

  describe("generate_settlement_entries", () => {
    describe("エラーケース", () => {
      it("-1: 存在しないセッション", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("generate_settlement_entries", {
          p_session_id: "00000000-0000-0000-0000-000000000000",
          p_user_id: SEED.ALICE_ID,
        });
        expect(data).toBe(-1);
      });

      it("-2: 非メンバー", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("generate_settlement_entries", {
          p_session_id: SESSION_MAIN,
          p_user_id: NON_MEMBER,
        });
        expect(data).toBe(-2);
      });

      it("-3: draft 以外のセッション", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        // CHECK 制約: settled 状態は confirmed_at/by + settled_at/by が必須
        const TEMP_SESSION = "99990300-0300-0300-0300-00000000ff03";
        await admin.from("settlement_sessions").insert({
          id: TEMP_SESSION,
          group_id: GROUP_FLOW,
          period_start: "2026-06-01",
          period_end: "2026-06-30",
          status: "settled",
          created_by: SEED.ALICE_ID,
          confirmed_at: new Date().toISOString(),
          confirmed_by: SEED.ALICE_ID,
          settled_at: new Date().toISOString(),
          settled_by: SEED.ALICE_ID,
        });

        const { data } = await admin.rpc("generate_settlement_entries", {
          p_session_id: TEMP_SESSION,
          p_user_id: SEED.ALICE_ID,
        });
        expect(data).toBe(-3);

        await admin
          .from("settlement_sessions")
          .delete()
          .eq("id", TEMP_SESSION);
      });
    });

    describe("正常系", () => {
      let entryCount: number;

      beforeAll(async () => {
        if (!dbAvailable) return;

        const { data } = await admin.rpc("generate_settlement_entries", {
          p_session_id: SESSION_MAIN,
          p_user_id: SEED.ALICE_ID,
        });
        entryCount = data as number;
      });

      it("未清算支払い 2 件を取り込む", (ctx) => {
        if (!dbAvailable) return ctx.skip();
        expect(entryCount).toBe(2);
      });

      it("entry_type = 'existing' で取り込まれる", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin
          .from("settlement_entries")
          .select("entry_type")
          .eq("session_id", SESSION_MAIN);

        expect(data!.every((e) => e.entry_type === "existing")).toBe(true);
      });

      it("source_payment_id が設定されている", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin
          .from("settlement_entries")
          .select("source_payment_id")
          .eq("session_id", SESSION_MAIN);

        const sourceIds = data!.map((e) => e.source_payment_id).sort();
        expect(sourceIds).toEqual([PAY_A, PAY_B].sort());
      });

      it("settlement_entry_splits にデータがコピーされている", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: entries } = await admin
          .from("settlement_entries")
          .select("id")
          .eq("session_id", SESSION_MAIN);

        for (const entry of entries!) {
          const { data: splits } = await admin
            .from("settlement_entry_splits")
            .select("*")
            .eq("entry_id", entry.id);

          expect(splits!.length).toBeGreaterThan(0);
        }
      });

      it("再生成で既存エントリが削除され再作成される", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: count } = await admin.rpc(
          "generate_settlement_entries",
          {
            p_session_id: SESSION_MAIN,
            p_user_id: SEED.ALICE_ID,
          }
        );

        expect(count).toBe(2);

        const { data: entries } = await admin
          .from("settlement_entries")
          .select("id")
          .eq("session_id", SESSION_MAIN);
        expect(entries).toHaveLength(2);
      });
    });
  });

  // ===========================================================================
  // confirm_settlement
  // ===========================================================================

  describe("confirm_settlement", () => {
    describe("エラーケース", () => {
      it("-1: 存在しないセッション", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("confirm_settlement", {
          p_session_id: "00000000-0000-0000-0000-000000000000",
          p_user_id: SEED.ALICE_ID,
        });
        expect(data).toBe(-1);
      });

      it("-2: 非メンバー", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("confirm_settlement", {
          p_session_id: SESSION_MAIN,
          p_user_id: NON_MEMBER,
        });
        expect(data).toBe(-2);
      });
    });

    describe("正常系", () => {
      let paymentCount: number;

      beforeAll(async () => {
        if (!dbAvailable) return;

        const { data } = await admin.rpc("confirm_settlement", {
          p_session_id: SESSION_MAIN,
          p_user_id: SEED.ALICE_ID,
        });
        paymentCount = data as number;
      });

      it("支払い処理件数を返す", (ctx) => {
        if (!dbAvailable) return ctx.skip();
        expect(paymentCount).toBe(2);
      });

      it("既存支払いに settlement_id が設定される", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: payA } = await admin
          .from("payments")
          .select("settlement_id")
          .eq("id", PAY_A)
          .single();

        expect(payA!.settlement_id).toBe(SESSION_MAIN);

        const { data: payB } = await admin
          .from("payments")
          .select("settlement_id")
          .eq("id", PAY_B)
          .single();

        expect(payB!.settlement_id).toBe(SESSION_MAIN);
      });

      it("net_transfers が計算されている", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        // Alice: paid 3000, owed (1500+500) = 2000 → balance +1000
        // Bob:   paid 1000, owed (1500+500) = 2000 → balance -1000
        // → Bob → Alice 1000

        const { data: session } = await admin
          .from("settlement_sessions")
          .select("net_transfers")
          .eq("id", SESSION_MAIN)
          .single();

        expect(session!.net_transfers).not.toBeNull();
        const transfers = session!.net_transfers as Array<{
          from_id: string;
          to_id: string;
          amount: number;
        }>;
        expect(transfers).toHaveLength(1);
        expect(transfers[0].from_id).toBe(SEED.BOB_ID);
        expect(transfers[0].to_id).toBe(SEED.ALICE_ID);
        expect(transfers[0].amount).toBe(1000);
      });

      it("status が pending_payment に遷移", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: session } = await admin
          .from("settlement_sessions")
          .select("status")
          .eq("id", SESSION_MAIN)
          .single();

        expect(session!.status).toBe("pending_payment");
      });
    });
  });

  // ===========================================================================
  // confirm_settlement_receipt
  // ===========================================================================

  describe("confirm_settlement_receipt", () => {
    describe("エラーケース", () => {
      it("-1: 存在しないセッション", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("confirm_settlement_receipt", {
          p_session_id: "00000000-0000-0000-0000-000000000000",
          p_user_id: SEED.ALICE_ID,
        });
        expect(data).toBe(-1);
      });

      it("-2: 非メンバー", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data } = await admin.rpc("confirm_settlement_receipt", {
          p_session_id: SESSION_MAIN,
          p_user_id: NON_MEMBER,
        });
        expect(data).toBe(-2);
      });
    });

    describe("正常系", () => {
      beforeAll(async () => {
        if (!dbAvailable) return;

        await admin.rpc("confirm_settlement_receipt", {
          p_session_id: SESSION_MAIN,
          p_user_id: SEED.ALICE_ID,
        });
      });

      it("status が settled に遷移", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: session } = await admin
          .from("settlement_sessions")
          .select("status")
          .eq("id", SESSION_MAIN)
          .single();

        expect(session!.status).toBe("settled");
      });

      it("settled_at と settled_by が設定される", async (ctx) => {
        if (!dbAvailable) return ctx.skip();

        const { data: session } = await admin
          .from("settlement_sessions")
          .select("settled_at, settled_by")
          .eq("id", SESSION_MAIN)
          .single();

        expect(session!.settled_at).toBeTruthy();
        expect(session!.settled_by).toBe(SEED.ALICE_ID);
      });
    });
  });

  // ===========================================================================
  // settle_consolidated_sessions
  // ===========================================================================

  describe("settle_consolidated_sessions", () => {
    beforeAll(async () => {
      if (!dbAvailable) return;

      // CHECK 制約: pending_payment は confirmed_at/by + net_transfers 必須
      const now = new Date().toISOString();
      await admin.from("settlement_sessions").insert([
        {
          id: SESSION_CONSOL1,
          group_id: GROUP_FLOW,
          period_start: "2026-02-01",
          period_end: "2026-02-15",
          status: "pending_payment",
          created_by: SEED.ALICE_ID,
          confirmed_at: now,
          confirmed_by: SEED.ALICE_ID,
          net_transfers: JSON.stringify([]),
        },
        {
          id: SESSION_CONSOL2,
          group_id: GROUP_FLOW,
          period_start: "2026-02-16",
          period_end: "2026-02-28",
          status: "pending_payment",
          created_by: SEED.ALICE_ID,
          confirmed_at: now,
          confirmed_by: SEED.ALICE_ID,
          net_transfers: JSON.stringify([]),
        },
      ]);
    });

    it("指定セッションが settled に更新される", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin.rpc("settle_consolidated_sessions", {
        p_session_ids: [SESSION_CONSOL1, SESSION_CONSOL2],
        p_user_id: SEED.ALICE_ID,
      });

      expect(data).toBe(2);

      const { data: sessions } = await admin
        .from("settlement_sessions")
        .select("status")
        .in("id", [SESSION_CONSOL1, SESSION_CONSOL2]);

      expect(sessions!.every((s) => s.status === "settled")).toBe(true);
    });

    it("既に settled のセッションは更新されない（0 件）", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      const { data } = await admin.rpc("settle_consolidated_sessions", {
        p_session_ids: [SESSION_CONSOL1],
        p_user_id: SEED.ALICE_ID,
      });

      expect(data).toBe(0);
    });
  });

  // ===========================================================================
  // ゼロ清算フロー
  // ===========================================================================

  describe("ゼロ清算（全員同額 → is_zero_settlement）", () => {
    it("generate → confirm でゼロ清算 → 即 settled", async (ctx) => {
      if (!dbAvailable) return ctx.skip();

      // セットアップ（エラーチェック付き）
      // 日付は過去（payments_payment_date_check 制約あり）
      const { error: p1 } = await admin.from("payments").insert({
        id: PAY_ZERO1,
        group_id: GROUP_FLOW,
        payer_id: SEED.ALICE_ID,
        amount: 2000,
        description: "ゼロ清算 Alice",
        payment_date: "2026-02-01",
      });
      expect(p1).toBeNull();

      const { error: p2 } = await admin.from("payments").insert({
        id: PAY_ZERO2,
        group_id: GROUP_FLOW,
        payer_id: SEED.BOB_ID,
        amount: 2000,
        description: "ゼロ清算 Bob",
        payment_date: "2026-02-02",
      });
      expect(p2).toBeNull();

      const { error: s1 } = await admin.from("payment_splits").insert([
        { payment_id: PAY_ZERO1, user_id: SEED.ALICE_ID, amount: 1000 },
        { payment_id: PAY_ZERO1, user_id: SEED.BOB_ID, amount: 1000 },
      ]);
      expect(s1).toBeNull();

      const { error: s2 } = await admin.from("payment_splits").insert([
        { payment_id: PAY_ZERO2, user_id: SEED.ALICE_ID, amount: 1000 },
        { payment_id: PAY_ZERO2, user_id: SEED.BOB_ID, amount: 1000 },
      ]);
      expect(s2).toBeNull();

      const { error: sessErr } = await admin
        .from("settlement_sessions")
        .insert({
          id: SESSION_ZERO,
          group_id: GROUP_FLOW,
          period_start: "2026-02-01",
          period_end: "2026-02-28",
          status: "draft",
          created_by: SEED.ALICE_ID,
        });
      expect(sessErr).toBeNull();

      // generate: 2 件取り込み（PAY_ZERO1 + PAY_ZERO2）
      const { data: genCount, error: genError } = await admin.rpc(
        "generate_settlement_entries",
        {
          p_session_id: SESSION_ZERO,
          p_user_id: SEED.ALICE_ID,
        }
      );
      expect(genError).toBeNull();
      // メインフローで settled な PAY_A/PAY_B は含まれず、ZERO のみ
      expect(genCount).toBe(2);

      // confirm: ゼロ清算 → 即 settled
      const { data: confirmCount, error: confirmError } = await admin.rpc(
        "confirm_settlement",
        {
          p_session_id: SESSION_ZERO,
          p_user_id: SEED.ALICE_ID,
        }
      );
      expect(confirmError).toBeNull();
      expect(confirmCount).toBe(2);

      const { data: session } = await admin
        .from("settlement_sessions")
        .select("status, is_zero_settlement, net_transfers")
        .eq("id", SESSION_ZERO)
        .single();

      expect(session!.status).toBe("settled");
      expect(session!.is_zero_settlement).toBe(true);
      expect(session!.net_transfers).toEqual([]);
    });
  });
});
