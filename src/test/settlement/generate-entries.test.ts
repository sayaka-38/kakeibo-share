/**
 * generateSettlementEntries TS 関数のモックテスト
 *
 * Supabase クライアントをモックして、エントリ生成ロジックを検証。
 */

import { describe, it, expect, vi } from "vitest";
import { generateSettlementEntries } from "@/lib/settlement/generate-entries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Supabase mock builder
function createMockSupabase(options: {
  membership?: boolean;
  session?: { id: string; status: string } | null;
  rules?: Array<{
    id: string;
    description: string;
    category_id: string | null;
    default_amount: number | null;
    default_payer_id: string;
    day_of_month: number;
    interval_months: number;
    split_type: string;
    is_active: boolean;
    created_at: string;
    splits: Array<{ user_id: string; amount: number | null; percentage: number | null }>;
  }>;
  payments?: Array<{
    id: string;
    description: string;
    category_id: string | null;
    amount: number;
    payer_id: string;
    payment_date: string;
    created_at: string;
    payment_splits: Array<{ user_id: string; amount: number }>;
  }>;
}) {
  let entryIdCounter = 0;

  const mockInsertedEntries: Array<Record<string, unknown>> = [];
  const mockInsertedSplits: Array<Record<string, unknown>> = [];

  const createChainableQuery = (
    table: string,
    returnData: unknown = null
  ) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      "select",
      "insert",
      "delete",
      "eq",
      "is",
      "lte",
      "single",
      "order",
    ];

    for (const method of methods) {
      if (method === "insert") {
        chain[method] = vi.fn((data: unknown) => {
          if (table === "settlement_entries") {
            const insertData = data as Record<string, unknown>;
            entryIdCounter++;
            const entry = { id: `entry-${entryIdCounter}` };
            mockInsertedEntries.push({ ...insertData, ...entry });
            return Object.assign(
              { data: entry, error: null },
              createChainableQuery(table, entry)
            );
          }
          if (table === "settlement_entry_splits") {
            const insertArr = Array.isArray(data) ? data : [data];
            mockInsertedSplits.push(...(insertArr as Record<string, unknown>[]));
            return { data: null, error: null };
          }
          return Object.assign(
            { data: null, error: null },
            createChainableQuery(table)
          );
        });
      } else if (method === "single") {
        chain[method] = vi.fn(() => {
          if (table === "group_members" && options.membership) {
            return { data: { id: "member-1" }, error: null };
          }
          if (table === "group_members" && !options.membership) {
            return { data: null, error: { message: "Not found" } };
          }
          if (table === "settlement_sessions") {
            return { data: options.session, error: options.session ? null : { message: "Not found" } };
          }
          if (table === "settlement_entries") {
            // Return the last inserted entry for chained .insert().select().single()
            return { data: returnData, error: null };
          }
          return { data: returnData, error: null };
        });
      } else {
        chain[method] = vi.fn(() =>
          Object.assign(
            table === "recurring_rules" && method === "eq"
              ? { data: options.rules || [], error: null }
              : table === "payments" && method === "lte"
                ? { data: options.payments || [], error: null }
                : { data: returnData, error: null },
            chain
          )
        );
      }
    }

    return chain;
  };

  const supabase = {
    from: vi.fn((table: string) => createChainableQuery(table)),
  } as unknown as SupabaseClient<Database>;

  return { supabase, mockInsertedEntries, mockInsertedSplits };
}

describe("generateSettlementEntries", () => {
  describe("エラーコード", () => {
    it("メンバーでない場合は -2 を返す", async () => {
      const { supabase } = createMockSupabase({
        membership: false,
        session: { id: "session-1", status: "draft" },
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-01-31",
        "user-1"
      );
      expect(result).toBe(-2);
    });

    it("セッションが見つからない場合は -1 を返す", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: null,
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-01-31",
        "user-1"
      );
      expect(result).toBe(-1);
    });

    it("セッションが draft でない場合は -3 を返す", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: { id: "session-1", status: "confirmed" },
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-01-31",
        "user-1"
      );
      expect(result).toBe(-3);
    });
  });

  describe("ルールベースエントリ生成", () => {
    it("毎月ルールが期間内に正しく生成される", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        rules: [
          {
            id: "rule-1",
            description: "家賃",
            category_id: "cat-1",
            default_amount: 100000,
            default_payer_id: "user-1",
            day_of_month: 25,
            interval_months: 1,
            split_type: "equal",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [],
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-03-31",
        "user-1"
      );

      // 3ヶ月で3件のエントリ
      expect(result).toBe(3);
    });

    it("隔月ルールは該当月のみ生成される", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        rules: [
          {
            id: "rule-1",
            description: "NHK受信料",
            category_id: null,
            default_amount: 2000,
            default_payer_id: "user-1",
            day_of_month: 10,
            interval_months: 2,
            split_type: "equal",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [],
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-04-30",
        "user-1"
      );

      // 4ヶ月期間で隔月: Jan, Mar の2件
      expect(result).toBe(2);
    });
  });

  describe("既存支払いの取り込み", () => {
    it("未清算支払いがエントリとして取り込まれる", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        rules: [],
        payments: [
          {
            id: "payment-1",
            description: "スーパーで買い物",
            category_id: "cat-1",
            amount: 3000,
            payer_id: "user-1",
            payment_date: "2026-01-15",
            created_at: "2026-01-15T10:00:00Z",
            payment_splits: [
              { user_id: "user-1", amount: 1500 },
              { user_id: "user-2", amount: 1500 },
            ],
          },
        ],
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-01-31",
        "user-1"
      );

      expect(result).toBe(1);
    });
  });

  describe("ルール + 既存支払いの混合", () => {
    it("両方が正しくカウントされる", async () => {
      const { supabase } = createMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        rules: [
          {
            id: "rule-1",
            description: "家賃",
            category_id: null,
            default_amount: 100000,
            default_payer_id: "user-1",
            day_of_month: 25,
            interval_months: 1,
            split_type: "equal",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [
          {
            id: "payment-1",
            description: "買い物",
            category_id: null,
            amount: 1000,
            payer_id: "user-2",
            payment_date: "2026-01-10",
            created_at: "2026-01-10T00:00:00Z",
            payment_splits: [],
          },
        ],
      });

      const result = await generateSettlementEntries(
        supabase,
        "session-1",
        "group-1",
        "2026-01-01",
        "2026-01-31",
        "user-1"
      );

      // 1 rule entry + 1 payment entry
      expect(result).toBe(2);
    });
  });
});
