/**
 * refreshSettlementEntries TS 関数のモックテスト
 *
 * スマート・マージロジックを検証:
 * - filled/skipped エントリの保護
 * - 新規支払いの追記
 * - pending ルールエントリの更新
 * - 不要な pending エントリの削除
 */

import { describe, it, expect, vi } from "vitest";
import { refreshSettlementEntries } from "@/lib/settlement/refresh-entries";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ============================================
// 型定義
// ============================================
type ExistingEntry = {
  id: string;
  rule_id: string | null;
  source_payment_id: string | null;
  payment_date: string;
  status: "pending" | "filled" | "skipped";
  description: string;
  expected_amount: number | null;
  payer_id: string;
  category_id: string | null;
};

type MockRule = {
  id: string;
  description: string;
  category_id: string | null;
  default_amount: number | null;
  default_payer_id: string;
  day_of_month: number;
  interval_months: number;
  split_type: string;
  is_active: boolean;
  start_date: string;
  end_date?: string | null;
  created_at: string;
  splits: Array<{ user_id: string; amount: number | null; percentage: number | null }>;
};

type MockPayment = {
  id: string;
  description: string;
  category_id: string | null;
  amount: number;
  payer_id: string;
  payment_date: string;
  created_at: string;
  payment_splits: Array<{ user_id: string; amount: number }>;
};

// ============================================
// モック Supabase ファクトリ
// ============================================
function createRefreshMockSupabase(options: {
  membership?: boolean;
  session?: { id: string; status: string } | null;
  existingEntries?: ExistingEntry[];
  rules?: MockRule[];
  payments?: MockPayment[];
}) {
  let entryIdCounter = 100;
  const deletedEntryIds: string[] = [];
  const updatedEntries: Array<{ id: string; data: Record<string, unknown> }> = [];
  const insertedEntries: Array<Record<string, unknown>> = [];
  const insertedSplits: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    // ============ group_members ============
    if (table === "group_members") {
      const chain: Record<string, unknown> = {};
      const single = vi.fn(() => ({
        data: options.membership ? { id: "member-1" } : null,
        error: options.membership ? null : { message: "Not found" },
      }));
      const eq2 = vi.fn(() => ({ ...chain, single }));
      const eq1 = vi.fn(() => ({ ...chain, eq: eq2, single }));
      const select = vi.fn(() => ({ ...chain, eq: eq1, single }));
      Object.assign(chain, { select, eq: eq1, single });
      return chain;
    }

    // ============ settlement_sessions ============
    if (table === "settlement_sessions") {
      const single = vi.fn(() => ({
        data: options.session,
        error: options.session ? null : { message: "Not found" },
      }));
      const eq = vi.fn(() => ({ single }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }

    // ============ recurring_rules ============
    if (table === "recurring_rules") {
      const chain: Record<string, unknown> = {};
      const eqIsActive = vi.fn(() => ({
        data: options.rules ?? [],
        error: null,
      }));
      const eqGroupId = vi.fn(() => ({ ...chain, eq: eqIsActive }));
      const select = vi.fn(() => ({ ...chain, eq: eqGroupId }));
      Object.assign(chain, { select, eq: eqGroupId });
      return chain;
    }

    // ============ payments ============
    if (table === "payments") {
      const result = {
        data: options.payments ?? [],
        error: null,
      };
      const lte = vi.fn(() => result);
      const is = vi.fn(() => ({ lte }));
      const eq = vi.fn(() => ({ is, lte }));
      const select = vi.fn(() => ({ eq }));
      return { select };
    }

    // ============ settlement_entry_splits ============
    if (table === "settlement_entry_splits") {
      const insert = vi.fn((data: unknown) => {
        const arr = Array.isArray(data) ? data : [data];
        insertedSplits.push(...(arr as Record<string, unknown>[]));
        return { data: null, error: null };
      });
      return { insert };
    }

    // ============ settlement_entries ============
    if (table === "settlement_entries") {
      // .select(...).eq("session_id", id) → return existing entries
      const selectChain = {
        eq: vi.fn(() => ({
          data: options.existingEntries ?? [],
          error: null,
        })),
      };

      // .delete().eq("id", id) → record deletion
      const deleteChain = {
        eq: vi.fn((field: string, value: string) => {
          if (field === "id") deletedEntryIds.push(value);
          return { data: null, error: null };
        }),
      };

      // .update({...}).eq("id", id) → record update
      const updateFn = vi.fn((data: Record<string, unknown>) => ({
        eq: vi.fn((field: string, value: string) => {
          if (field === "id") updatedEntries.push({ id: value, data });
          return { data: null, error: null };
        }),
      }));

      // .insert({...}).select("id").single() → return new entry
      const insertFn = vi.fn((data: Record<string, unknown>) => {
        entryIdCounter++;
        const newId = `entry-${entryIdCounter}`;
        insertedEntries.push({ ...data, id: newId });
        const single = vi.fn(() => ({ data: { id: newId }, error: null }));
        const selectAfterInsert = vi.fn(() => ({ single }));
        return { select: selectAfterInsert, single };
      });

      return {
        select: vi.fn(() => selectChain),
        delete: vi.fn(() => deleteChain),
        update: updateFn,
        insert: insertFn,
      };
    }

    return {};
  });

  const supabase = { from } as unknown as SupabaseClient<Database>;

  return {
    supabase,
    deletedEntryIds,
    updatedEntries,
    insertedEntries,
    insertedSplits,
  };
}

// ============================================
// テスト
// ============================================
describe("refreshSettlementEntries", () => {
  // ============================================
  // エラーコード（異常系ファースト）
  // ============================================
  describe("エラーコード", () => {
    it("メンバーでない場合は -2 を返す", async () => {
      const { supabase } = createRefreshMockSupabase({
        membership: false,
        session: { id: "session-1", status: "draft" },
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );
      expect(result).toBe(-2);
    });

    it("セッションが見つからない場合は -1 を返す", async () => {
      const { supabase } = createRefreshMockSupabase({
        membership: true,
        session: null,
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );
      expect(result).toBe(-1);
    });

    it("セッションが draft でない場合は -3 を返す", async () => {
      const { supabase } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "confirmed" },
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );
      expect(result).toBe(-3);
    });
  });

  // ============================================
  // filled/skipped エントリの保護
  // ============================================
  describe("filled/skipped エントリの保護", () => {
    it("filled エントリはルールが現役でも削除されない（追加なし → 0 を返す）", async () => {
      const { supabase, deletedEntryIds } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [
          {
            id: "entry-filled-1",
            rule_id: "rule-1",
            source_payment_id: null,
            payment_date: "2026-01-25",
            status: "filled",
            description: "家賃",
            expected_amount: 100000,
            payer_id: "user-1",
            category_id: null,
          },
        ],
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
            start_date: "2026-01-01",
            end_date: null,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(0);
      expect(deletedEntryIds).not.toContain("entry-filled-1");
    });

    it("skipped エントリは削除されない", async () => {
      const { supabase, deletedEntryIds } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [
          {
            id: "entry-skipped-1",
            rule_id: "rule-1",
            source_payment_id: null,
            payment_date: "2026-01-25",
            status: "skipped",
            description: "家賃",
            expected_amount: 100000,
            payer_id: "user-1",
            category_id: null,
          },
        ],
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
            start_date: "2026-01-01",
            end_date: null,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(0);
      expect(deletedEntryIds).not.toContain("entry-skipped-1");
    });

    it("ルールが無効化されても filled エントリは削除されない", async () => {
      const { supabase, deletedEntryIds } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [
          {
            id: "entry-filled-stale",
            rule_id: "rule-deleted",
            source_payment_id: null,
            payment_date: "2026-01-25",
            status: "filled",
            description: "廃止済み固定費",
            expected_amount: 5000,
            payer_id: "user-1",
            category_id: null,
          },
        ],
        rules: [], // rule-deleted is no longer active
        payments: [],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(0);
      expect(deletedEntryIds).not.toContain("entry-filled-stale");
    });
  });

  // ============================================
  // 新規支払いの追記（正常系）
  // ============================================
  describe("新規支払いの追記", () => {
    it("ドラフト作成後の新規支払いが追記される", async () => {
      const { supabase, insertedEntries } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [], // no existing entries yet
        rules: [],
        payments: [
          {
            id: "payment-new",
            description: "スーパー",
            category_id: null,
            amount: 3000,
            payer_id: "user-1",
            payment_date: "2026-01-15",
            created_at: "2026-01-15T10:00:00Z",
            payment_splits: [],
          },
        ],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(1);
      expect(insertedEntries).toHaveLength(1);
      expect(insertedEntries[0]).toMatchObject({
        source_payment_id: "payment-new",
        description: "スーパー",
        status: "filled",
        entry_type: "existing",
      });
    });

    it("既に source_payment_id エントリがある支払いは重複追加されない", async () => {
      const { supabase, insertedEntries } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [
          {
            id: "entry-existing-1",
            rule_id: null,
            source_payment_id: "payment-existing",
            payment_date: "2026-01-10",
            status: "filled",
            description: "買い物",
            expected_amount: 2000,
            payer_id: "user-2",
            category_id: null,
          },
        ],
        rules: [],
        payments: [
          {
            id: "payment-existing",
            description: "買い物",
            category_id: null,
            amount: 2000,
            payer_id: "user-2",
            payment_date: "2026-01-10",
            created_at: "2026-01-10T00:00:00Z",
            payment_splits: [],
          },
        ],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(0);
      expect(insertedEntries).toHaveLength(0);
    });
  });

  // ============================================
  // pending ルールエントリの更新（正常系）
  // ============================================
  describe("pending ルールエントリの更新", () => {
    it("pending エントリはルール最新設定（説明・金額）で更新される", async () => {
      const { supabase, updatedEntries, insertedEntries } =
        createRefreshMockSupabase({
          membership: true,
          session: { id: "session-1", status: "draft" },
          existingEntries: [
            {
              id: "entry-pending-1",
              rule_id: "rule-1",
              source_payment_id: null,
              payment_date: "2026-01-25",
              status: "pending",
              description: "家賃（旧）", // 古い説明
              expected_amount: 90000,     // 古い金額
              payer_id: "user-1",
              category_id: null,
            },
          ],
          rules: [
            {
              id: "rule-1",
              description: "家賃（新）", // 更新された説明
              category_id: null,
              default_amount: 100000,     // 更新された金額
              default_payer_id: "user-1",
              day_of_month: 25,
              interval_months: 1,
              split_type: "equal",
              is_active: true,
              start_date: "2026-01-01",
              end_date: null,
              created_at: "2026-01-01T00:00:00Z",
              splits: [],
            },
          ],
          payments: [],
        });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      // No new entries should be added
      expect(result).toBe(0);
      expect(insertedEntries).toHaveLength(0);
      // The pending entry should be updated with latest rule data
      expect(updatedEntries).toHaveLength(1);
      expect(updatedEntries[0].id).toBe("entry-pending-1");
      expect(updatedEntries[0].data).toMatchObject({
        description: "家賃（新）",
        expected_amount: 100000,
      });
    });
  });

  // ============================================
  // 不要な pending エントリの削除（正常系）
  // ============================================
  describe("不要な pending エントリの削除", () => {
    it("ルールが無効化された pending エントリは削除される", async () => {
      const { supabase, deletedEntryIds } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [
          {
            id: "entry-stale-pending",
            rule_id: "rule-deleted",
            source_payment_id: null,
            payment_date: "2026-01-25",
            status: "pending",
            description: "廃止済み固定費",
            expected_amount: 5000,
            payer_id: "user-1",
            category_id: null,
          },
        ],
        rules: [], // rule-deleted は is_active=false / 削除済み
        payments: [],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(0);
      expect(deletedEntryIds).toContain("entry-stale-pending");
    });

    it("新規ルールエントリが追加される", async () => {
      const { supabase, insertedEntries } = createRefreshMockSupabase({
        membership: true,
        session: { id: "session-1", status: "draft" },
        existingEntries: [], // no entries yet
        rules: [
          {
            id: "rule-new",
            description: "電気代",
            category_id: null,
            default_amount: 8000,
            default_payer_id: "user-1",
            day_of_month: 10,
            interval_months: 1,
            split_type: "equal",
            is_active: true,
            start_date: "2026-01-01",
            end_date: null,
            created_at: "2026-01-01T00:00:00Z",
            splits: [],
          },
        ],
        payments: [],
      });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      expect(result).toBe(1);
      expect(insertedEntries).toHaveLength(1);
      expect(insertedEntries[0]).toMatchObject({
        rule_id: "rule-new",
        description: "電気代",
        status: "pending",
        entry_type: "rule",
      });
    });
  });

  // ============================================
  // 複合シナリオ
  // ============================================
  describe("複合シナリオ", () => {
    it("filled 保護 + 新規支払い追記 の組み合わせ", async () => {
      const { supabase, deletedEntryIds, insertedEntries } =
        createRefreshMockSupabase({
          membership: true,
          session: { id: "session-1", status: "draft" },
          existingEntries: [
            {
              id: "entry-filled-rule",
              rule_id: "rule-1",
              source_payment_id: null,
              payment_date: "2026-01-25",
              status: "filled",
              description: "家賃",
              expected_amount: 100000,
              payer_id: "user-1",
              category_id: null,
            },
          ],
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
              start_date: "2026-01-01",
              end_date: null,
              created_at: "2026-01-01T00:00:00Z",
              splits: [],
            },
          ],
          payments: [
            {
              id: "payment-new",
              description: "コンビニ",
              category_id: null,
              amount: 500,
              payer_id: "user-2",
              payment_date: "2026-01-20",
              created_at: "2026-01-20T10:00:00Z",
              payment_splits: [],
            },
          ],
        });

      const result = await refreshSettlementEntries(
        supabase, "session-1", "group-1",
        "2026-01-01", "2026-01-31", "user-1"
      );

      // 1 new payment added, 1 existing filled entry preserved
      expect(result).toBe(1);
      expect(deletedEntryIds).not.toContain("entry-filled-rule");
      expect(insertedEntries).toHaveLength(1);
      expect(insertedEntries[0].source_payment_id).toBe("payment-new");
    });
  });
});
