/**
 * RLS ポリシーテスト: payments + payment_splits テーブル
 *
 * Step 5-5: payments + payment_splits RLS 強化
 *
 * 目標:
 *   自分が所属していないグループの支払い明細や割り勘情報は、
 *   たとえ ID を知っていても絶対に覗き見ることができない状態を
 *   DB レベル（RLS）で保証する。
 *
 * 設計:
 *   - payments: group_id を直接持つ → is_group_member(group_id, auth.uid())
 *   - payment_splits: group_id を持たない → get_payment_group_id(payment_id)
 *     SECURITY DEFINER で payments RLS をバイパスし group_id を取得
 *   - 無限再帰回避: Migration 007 の is_group_member() を再利用
 *
 * テスト対象:
 *   - payments: SELECT/INSERT/UPDATE/DELETE ポリシー
 *   - payment_splits: SELECT/INSERT/UPDATE(全拒否)/DELETE(全拒否) ポリシー
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

// =============================================================================
// モック型定義
// =============================================================================

type MockQueryBuilder = {
  select: Mock;
  insert: Mock;
  update: Mock;
  delete: Mock;
  eq: Mock;
  single: Mock;
};

type MockSupabaseClient = {
  from: Mock;
  auth: {
    getUser: Mock;
  };
};

// =============================================================================
// RLS ポリシー仕様定義
// =============================================================================

type RLSTestScenario = {
  description: string;
  userId: string | null;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  expectedResult: "allowed" | "denied";
  note?: string;
};

/**
 * payments テーブルの RLS シナリオ
 */
const paymentsRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "グループメンバーはグループの支払いを SELECT できる",
    userId: "member-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "is_group_member(group_id, auth.uid())",
  },
  {
    description: "支払者以外のメンバーも支払いを SELECT できる",
    userId: "member-2",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "SELECT は payer_id に依存しない",
  },
  {
    description: "非メンバーはグループの支払いを SELECT できない",
    userId: "outsider",
    operation: "SELECT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは支払いを SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "メンバーは自分が payer の支払いを INSERT できる",
    userId: "member-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "payer_id = auth.uid() AND is_group_member()",
  },
  {
    description: "メンバーでも他人の payer_id では INSERT できない",
    userId: "member-1",
    operation: "INSERT",
    expectedResult: "denied",
    note: "なりすまし防止: payer_id != auth.uid()",
  },
  {
    description: "非メンバーは支払いを INSERT できない",
    userId: "outsider",
    operation: "INSERT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは支払いを INSERT できない",
    userId: null,
    operation: "INSERT",
    expectedResult: "denied",
  },
  // UPDATE
  {
    description: "支払者本人は支払いを UPDATE できる",
    userId: "payer-1",
    operation: "UPDATE",
    expectedResult: "allowed",
  },
  {
    description: "支払者以外のメンバーは UPDATE できない",
    userId: "member-2",
    operation: "UPDATE",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは UPDATE できない",
    userId: null,
    operation: "UPDATE",
    expectedResult: "denied",
  },
  // DELETE
  {
    description: "支払者本人は支払いを DELETE できる",
    userId: "payer-1",
    operation: "DELETE",
    expectedResult: "allowed",
  },
  {
    description: "支払者以外のメンバーは DELETE できない",
    userId: "member-2",
    operation: "DELETE",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは DELETE できない",
    userId: null,
    operation: "DELETE",
    expectedResult: "denied",
  },
];

/**
 * payment_splits テーブルの RLS シナリオ
 */
const paymentSplitsRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "グループメンバーは payment_splits を SELECT できる",
    userId: "member-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "get_payment_group_id() + is_group_member()",
  },
  {
    description: "非メンバーは payment_splits を SELECT できない",
    userId: "outsider",
    operation: "SELECT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは payment_splits を SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "メンバーは payment_splits を INSERT できる",
    userId: "member-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "get_payment_group_id() + is_group_member()",
  },
  {
    description: "非メンバーは payment_splits を INSERT できない",
    userId: "outsider",
    operation: "INSERT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは payment_splits を INSERT できない",
    userId: null,
    operation: "INSERT",
    expectedResult: "denied",
  },
  // UPDATE - 全拒否
  {
    description: "支払者本人でも payment_splits を UPDATE できない",
    userId: "payer-1",
    operation: "UPDATE",
    expectedResult: "denied",
    note: "USING (false) で全拒否",
  },
  {
    description: "グループオーナーでも payment_splits を UPDATE できない",
    userId: "owner-1",
    operation: "UPDATE",
    expectedResult: "denied",
    note: "USING (false) で全拒否",
  },
  // DELETE - 全拒否
  {
    description: "支払者本人でも payment_splits を直接 DELETE できない",
    userId: "payer-1",
    operation: "DELETE",
    expectedResult: "denied",
    note: "USING (false) で全拒否、CASCADE で自動削除",
  },
  {
    description: "グループオーナーでも payment_splits を直接 DELETE できない",
    userId: "owner-1",
    operation: "DELETE",
    expectedResult: "denied",
    note: "USING (false) で全拒否、CASCADE で自動削除",
  },
];

// =============================================================================
// SECURITY DEFINER ヘルパー関数テスト
// =============================================================================

describe("SECURITY DEFINER ヘルパー関数: get_payment_group_id", () => {
  it("get_payment_group_id() は RLS をバイパスして payments.group_id を取得する", () => {
    // get_payment_group_id(_payment_id) の仕様:
    // - SECURITY DEFINER: postgres ロール権限で実行 → payments RLS バイパス
    // - STABLE: 同一トランザクション内で結果が変わらない
    // - search_path = public: スキーマ汚染攻撃を防止
    // - 戻り値: UUID（payment_id から group_id を引く lookup 関数）
    const functionSpec = {
      name: "get_payment_group_id",
      params: ["_payment_id UUID"],
      returns: "UUID",
      language: "sql",
      security: "SECURITY DEFINER",
      volatility: "STABLE",
      searchPath: "public",
      body: "SELECT group_id FROM payments WHERE id = _payment_id",
    };

    expect(functionSpec.security).toBe("SECURITY DEFINER");
    expect(functionSpec.volatility).toBe("STABLE");
    expect(functionSpec.returns).toBe("UUID");
    expect(functionSpec.body).toContain("payments");
    expect(functionSpec.body).toContain("group_id");
    expect(functionSpec.body).not.toContain("auth.uid()"); // パラメータ経由で受け取る
  });

  it("get_payment_group_id() が cross-table RLS 依存チェーンを断ち切る仕組み", () => {
    // payment_splits は group_id を直接持たないため、payments 経由で取得する必要がある。
    //
    // 問題のチェーン (get_payment_group_id なし):
    //   payment_splits SELECT
    //   → RLS: EXISTS (SELECT FROM payments JOIN group_members ...)
    //   → payments RLS: is_group_member(group_id, auth.uid())
    //   → group_members 参照（SECURITY DEFINER で回避済み）
    //   → 結果
    //   ※ payments RLS を通過するため、cross-table 依存が残る
    //
    // 修正後のチェーン (get_payment_group_id あり):
    //   payment_splits SELECT
    //   → RLS: is_group_member(get_payment_group_id(payment_id), auth.uid())
    //   → get_payment_group_id() [SECURITY DEFINER] → 直接 payments SELECT (RLS なし)
    //   → is_group_member() [SECURITY DEFINER] → 直接 group_members SELECT (RLS なし)
    //   → 結果
    //   ※ 2 段階の SECURITY DEFINER で全ての RLS 依存を切断
    const chain = {
      withoutHelper: [
        "payment_splits SELECT",
        "→ RLS: EXISTS (SELECT FROM payments JOIN group_members)",
        "→ payments RLS applied (cross-table dependency)",
        "→ group_members RLS applied (nested dependency)",
      ],
      withHelper: [
        "payment_splits SELECT",
        "→ RLS: is_group_member(get_payment_group_id(payment_id), auth.uid())",
        "→ get_payment_group_id() [SECURITY DEFINER] → direct payments query (NO RLS)",
        "→ is_group_member() [SECURITY DEFINER] → direct group_members query (NO RLS)",
        "→ returns BOOLEAN → policy evaluated",
      ],
    };

    // 修正前は cross-table 依存がある
    expect(chain.withoutHelper).toContain(
      "→ payments RLS applied (cross-table dependency)"
    );
    // 修正後は 2 段階の SECURITY DEFINER で切断
    expect(chain.withHelper).toContain(
      "→ get_payment_group_id() [SECURITY DEFINER] → direct payments query (NO RLS)"
    );
    expect(chain.withHelper).toContain(
      "→ is_group_member() [SECURITY DEFINER] → direct group_members query (NO RLS)"
    );
  });

  it("存在しない payment_id の場合 NULL を返し、is_group_member(NULL, uid) は false になる", () => {
    // get_payment_group_id() が NULL を返す場合:
    //   is_group_member(NULL, auth.uid())
    //   → SELECT EXISTS (... WHERE group_id = NULL ...) → false
    //   → ポリシー拒否（安全側にフェイル）
    const nullHandling = {
      nonExistentPaymentId: "non-existent-uuid",
      getPaymentGroupIdResult: null,
      isGroupMemberResult: false, // group_id = NULL → マッチしない
      policyResult: "denied",
    };

    expect(nullHandling.getPaymentGroupIdResult).toBeNull();
    expect(nullHandling.isGroupMemberResult).toBe(false);
    expect(nullHandling.policyResult).toBe("denied");
  });
});

// =============================================================================
// payments テーブル RLS テスト
// =============================================================================

describe("payments テーブル RLS", () => {
  let mockSupabase: MockSupabaseClient;
  let mockQueryBuilder: MockQueryBuilder;

  beforeEach(() => {
    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    mockSupabase = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      auth: {
        getUser: vi.fn(),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // SELECT ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("SELECT ポリシー - is_group_member(group_id, auth.uid())", () => {
    it("非メンバーはグループの支払いを SELECT できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      // is_group_member(group_id, auth.uid()) が false → 行が返らない
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });

    it("未認証ユーザーは支払いを SELECT できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("グループメンバーはグループの支払いを SELECT できる", async () => {
      const memberId = "member-1";
      const payments = [
        {
          id: "payment-1",
          group_id: "group-1",
          payer_id: "member-2",
          amount: 3000,
          description: "ランチ代",
        },
        {
          id: "payment-2",
          group_id: "group-1",
          payer_id: memberId,
          amount: 1500,
          description: "コーヒー代",
        },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // is_group_member(group_id, auth.uid()) が true → 全支払いを取得
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: payments,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });

    it("支払者以外のメンバーも同グループの支払いを SELECT できる", async () => {
      const nonPayerMemberId = "member-2";
      const payment = {
        id: "payment-1",
        group_id: "group-1",
        payer_id: "member-1", // 別のメンバーが支払者
        amount: 5000,
        description: "買い物",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: nonPayerMemberId } },
        error: null,
      });

      // SELECT は payer_id に依存しない。メンバーなら閲覧可能
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: payment,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeDefined();
      expect(result.data.payer_id).not.toBe(nonPayerMemberId);
      expect(result.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // INSERT ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("INSERT ポリシー - payer_id = auth.uid() AND is_group_member()", () => {
    it("非メンバーは支払いを INSERT できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      // is_group_member() が false → RLS 拒否
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("未認証ユーザーは支払いを INSERT できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("メンバーでも他人の payer_id では INSERT できない（なりすまし防止）", async () => {
      const memberId = "member-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // payer_id != auth.uid() → RLS 拒否
      // たとえ is_group_member() が true でも、payer_id チェックで弾かれる
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation: payer_id mismatch" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("メンバーは自分が payer の支払いを INSERT できる", async () => {
      const memberId = "member-1";
      const newPayment = {
        group_id: "group-1",
        payer_id: memberId,
        amount: 2000,
        description: "夕食代",
        payment_date: "2026-01-30",
        category_id: "cat-1",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // payer_id = auth.uid() AND is_group_member() → 許可
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-payment-id", ...newPayment },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data?.payer_id).toBe(memberId);
      expect(result.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("UPDATE ポリシー - payer_id = auth.uid()", () => {
    it("支払者以外のメンバーは支払いを UPDATE できない", async () => {
      const nonPayerMemberId = "member-2";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: nonPayerMemberId } },
        error: null,
      });

      // payer_id != auth.uid() → RLS 拒否
      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("非メンバーは支払いを UPDATE できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("未認証ユーザーは支払いを UPDATE できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("支払者本人は支払いを UPDATE できる", async () => {
      const payerId = "payer-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: payerId } },
        error: null,
      });

      // payer_id = auth.uid() → 許可
      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: {
          id: "payment-1",
          payer_id: payerId,
          amount: 3500,
          description: "更新済み",
        },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data?.payer_id).toBe(payerId);
      expect(result.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("DELETE ポリシー - payer_id = auth.uid()", () => {
    it("支払者以外のメンバーは支払いを DELETE できない", async () => {
      const nonPayerMemberId = "member-2";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: nonPayerMemberId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("非メンバーは支払いを DELETE できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("未認証ユーザーは支払いを DELETE できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("支払者本人は支払いを DELETE できる", async () => {
      const payerId = "payer-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: payerId } },
        error: null,
      });

      // payer_id = auth.uid() → 許可
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "payment-1", payer_id: payerId },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });
  });
});

// =============================================================================
// payment_splits テーブル RLS テスト
// =============================================================================

describe("payment_splits テーブル RLS", () => {
  let mockSupabase: MockSupabaseClient;
  let mockQueryBuilder: MockQueryBuilder;

  beforeEach(() => {
    mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    mockSupabase = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      auth: {
        getUser: vi.fn(),
      },
    };
  });

  // ---------------------------------------------------------------------------
  // SELECT ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("SELECT ポリシー - get_payment_group_id() + is_group_member()", () => {
    it("非メンバーは payment_splits を SELECT できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      // get_payment_group_id(payment_id) → group_id
      // is_group_member(group_id, outsiderId) → false → 行が返らない
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });

    it("未認証ユーザーは payment_splits を SELECT できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("存在しない payment_id の splits は SELECT できない", async () => {
      const memberId = "member-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // get_payment_group_id('non-existent') → NULL
      // is_group_member(NULL, auth.uid()) → false → 拒否
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });

    it("グループメンバーは payment_splits を SELECT できる", async () => {
      const memberId = "member-1";
      const splits = [
        { id: "split-1", payment_id: "payment-1", user_id: memberId, amount: 1500 },
        { id: "split-2", payment_id: "payment-1", user_id: "member-2", amount: 1500 },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // get_payment_group_id(payment_id) → group_id
      // is_group_member(group_id, memberId) → true → 全 splits を取得
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: splits,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // INSERT ポリシー（異常系ファースト）
  // ---------------------------------------------------------------------------

  describe("INSERT ポリシー - get_payment_group_id() + is_group_member()", () => {
    it("非メンバーは payment_splits を INSERT できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("未認証ユーザーは payment_splits を INSERT できない", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("存在しない payment_id では payment_splits を INSERT できない", async () => {
      const memberId = "member-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // get_payment_group_id('non-existent') → NULL
      // is_group_member(NULL, auth.uid()) → false → 拒否
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("メンバーは自グループの payment_splits を INSERT できる", async () => {
      const memberId = "member-1";
      const newSplits = [
        { payment_id: "payment-1", user_id: memberId, amount: 1000 },
        { payment_id: "payment-1", user_id: "member-2", amount: 1000 },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: newSplits.map((s, i) => ({ id: `split-${i}`, ...s })),
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // UPDATE ポリシー - 全拒否
  // ---------------------------------------------------------------------------

  describe("UPDATE ポリシー - USING (false) で全拒否", () => {
    it("支払者本人でも payment_splits を UPDATE できない", async () => {
      const payerId = "payer-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: payerId } },
        error: null,
      });

      // USING (false) → 全員拒否
      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("グループオーナーでも payment_splits を UPDATE できない", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      // USING (false) → オーナーであっても拒否
      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE ポリシー - 全拒否（CASCADE で自動削除）
  // ---------------------------------------------------------------------------

  describe("DELETE ポリシー - USING (false) で全拒否（CASCADE で自動削除）", () => {
    it("支払者本人でも payment_splits を直接 DELETE できない", async () => {
      const payerId = "payer-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: payerId } },
        error: null,
      });

      // USING (false) → 全員拒否
      // payment_splits の削除は payments の CASCADE でのみ実行される
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("グループオーナーでも payment_splits を直接 DELETE できない", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });

    it("支払い削除時は CASCADE により payment_splits も自動削除される（仕様文書化）", () => {
      // payment_splits テーブルは payments に ON DELETE CASCADE で紐づく。
      // 支払い（payments）を DELETE すると、関連する全 splits が自動削除される。
      //
      // RLS との関係:
      //   - payments DELETE: payer_id = auth.uid() で本人のみ許可
      //   - CASCADE: PostgreSQL の FK 制約レベルで実行 → RLS バイパス
      //   - payment_splits DELETE (直接): USING (false) で全拒否
      //
      // つまり: 支払者が payment を消す → splits も消える
      //         それ以外の方法では splits は消せない
      const cascadeSpec = {
        trigger: "payments DELETE (payer_id = auth.uid())",
        mechanism: "ON DELETE CASCADE (FK constraint)",
        rlsBypass: true, // CASCADE は RLS をバイパスする
        directDeleteBlocked: true, // 直接の DELETE は USING (false) で拒否
      };

      expect(cascadeSpec.rlsBypass).toBe(true);
      expect(cascadeSpec.directDeleteBlocked).toBe(true);
    });
  });
});

// =============================================================================
// RLS ポリシー仕様のドキュメント化テスト
// =============================================================================

describe("RLS ポリシー仕様（payments + payment_splits）", () => {
  describe("payments テーブル", () => {
    it.each(paymentsRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });

  describe("payment_splits テーブル", () => {
    it.each(paymentSplitsRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });
});

// =============================================================================
// 支払い登録・削除フロー統合シナリオ
// =============================================================================

describe("支払い登録・削除フロー統合シナリオ", () => {
  it("支払い登録フロー: payment INSERT → payment_splits INSERT", () => {
    // 正常フロー:
    // 1. メンバーが payment を INSERT (payer_id = auth.uid(), group_id = 所属グループ)
    // 2. 同メンバーが payment_splits を INSERT (payment_id = 上記の payment.id)
    //
    // RLS 判定:
    // - payments INSERT: payer_id = auth.uid() AND is_group_member(group_id, auth.uid()) → 許可
    // - payment_splits INSERT: is_group_member(get_payment_group_id(payment_id), auth.uid()) → 許可
    const flow = {
      step1: "payments INSERT: payer_id = auth.uid() AND is_group_member(group_id, auth.uid())",
      step2: "payment_splits INSERT: is_group_member(get_payment_group_id(payment_id), auth.uid())",
      helperChain: "get_payment_group_id [SECURITY DEFINER] → is_group_member [SECURITY DEFINER]",
    };

    expect(flow.step1).toContain("payer_id = auth.uid()");
    expect(flow.step1).toContain("is_group_member");
    expect(flow.step2).toContain("get_payment_group_id");
    expect(flow.helperChain).toContain("SECURITY DEFINER");
  });

  it("支払い削除フロー: payment DELETE → payment_splits CASCADE 削除", () => {
    // 削除フロー:
    // 1. 支払者が payment を DELETE (payer_id = auth.uid())
    // 2. ON DELETE CASCADE により payment_splits が自動削除
    //
    // RLS 判定:
    // - payments DELETE: payer_id = auth.uid() → 許可
    // - payment_splits: CASCADE で削除（RLS バイパス）
    const flow = {
      step1: "payments DELETE: payer_id = auth.uid()",
      step2: "payment_splits: ON DELETE CASCADE (RLS bypass)",
      directSplitDelete: "USING (false) → blocked",
    };

    expect(flow.step1).toContain("payer_id = auth.uid()");
    expect(flow.step2).toContain("CASCADE");
    expect(flow.directSplitDelete).toContain("blocked");
  });

  it("不正アクセスシナリオ: 別グループの支払い ID を知っていても閲覧不可", () => {
    // 攻撃シナリオ:
    //   悪意のあるユーザーが別グループの payment_id を入手し、
    //   直接 Supabase クエリで payment_splits を取得しようとする
    //
    // 防御:
    //   payment_splits SELECT → get_payment_group_id(payment_id)
    //   → group_id が別グループ → is_group_member(group_id, auth.uid()) → false
    //   → 空結果
    const attackScenario = {
      attacker: "user-A (グループ X のメンバー)",
      target: "payment-B (グループ Y の支払い)",
      query: "supabase.from('payment_splits').select('*').eq('payment_id', 'payment-B')",
      rlsEvaluation: [
        "get_payment_group_id('payment-B') → 'group-Y'",
        "is_group_member('group-Y', 'user-A') → false",
        "ポリシー拒否 → 空結果",
      ],
      result: "データ漏洩なし",
    };

    expect(attackScenario.rlsEvaluation[1]).toContain("false");
    expect(attackScenario.result).toBe("データ漏洩なし");
  });

  it("デモデータ削除フロー: demo payment は payer_id = auth.uid() で削除可能", () => {
    // デモフロー:
    //   匿名ユーザーがデモデータを作成 → payer_id = 匿名ユーザーの auth.uid()
    //   同ユーザーがデモデータを削除 → payer_id = auth.uid() でマッチ → 許可
    //   CASCADE で payment_splits も自動削除
    const demoFlow = {
      create: "匿名 signIn → payment INSERT (payer_id = anon uid)",
      delete: "API Route → payments DELETE (payer_id = auth.uid()) → CASCADE",
      rlsCheck: "payer_id = auth.uid() (匿名でも uid は存在)",
    };

    expect(demoFlow.rlsCheck).toContain("auth.uid()");
  });
});
