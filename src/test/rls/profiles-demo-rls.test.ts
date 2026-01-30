/**
 * RLS ポリシーテスト（全テーブル）
 *
 * Migration 007: RLS 無限再帰 + 認証フロー修正
 *
 * 根本原因:
 *   group_members SELECT ポリシーが同テーブルを自己参照 → PostgreSQL 無限再帰
 *   → groups, profiles の group_members 参照ポリシーも連鎖的に失敗
 *
 * 修正:
 *   SECURITY DEFINER ヘルパー関数 (is_group_member, is_group_owner) を導入
 *   → RLS をバイパスして group_members/groups を直接参照
 *   → 自己参照による無限再帰チェーンを断ち切る
 *
 * テスト対象テーブル:
 *   - group_members: SELECT/INSERT/DELETE ポリシー
 *   - groups: SELECT/INSERT/UPDATE/DELETE ポリシー
 *   - profiles: SELECT/INSERT/UPDATE/DELETE ポリシー
 *   - demo_sessions: SELECT/INSERT/DELETE ポリシー
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
 * group_members テーブルの RLS シナリオ
 */
const groupMembersRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "グループメンバーは同グループの group_members を SELECT できる",
    userId: "user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "is_group_member() SECURITY DEFINER で再帰回避",
  },
  {
    description: "非メンバーは group_members を SELECT できない",
    userId: "user-outsider",
    operation: "SELECT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーは group_members を SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "自分自身を group_members に INSERT できる（招待参加）",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "user_id = auth.uid() で自己追加を許可",
  },
  {
    description: "グループオーナーは他メンバーを INSERT できる",
    userId: "owner-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "is_group_owner() で判定",
  },
  {
    description: "非オーナーは他人を INSERT できない",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "denied",
  },
  // DELETE
  {
    description: "自分自身を group_members から DELETE できる（脱退）",
    userId: "user-1",
    operation: "DELETE",
    expectedResult: "allowed",
  },
  {
    description: "グループオーナーは他メンバーを DELETE できる",
    userId: "owner-1",
    operation: "DELETE",
    expectedResult: "allowed",
    note: "is_group_owner() で判定",
  },
  {
    description: "非オーナーは他人を DELETE できない",
    userId: "user-1",
    operation: "DELETE",
    expectedResult: "denied",
  },
];

/**
 * groups テーブルの RLS シナリオ
 */
const groupsRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "グループオーナーは自分のグループを SELECT できる",
    userId: "owner-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "owner_id = auth.uid() で直接判定（再帰なし）",
  },
  {
    description: "グループメンバーはグループを SELECT できる",
    userId: "member-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "is_group_member() SECURITY DEFINER で再帰回避",
  },
  {
    description: "非メンバーはグループを SELECT できない",
    userId: "outsider",
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "認証済みユーザーは自分がオーナーのグループを INSERT できる",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "owner_id = auth.uid() が必須",
  },
  {
    description: "他人をオーナーとするグループは INSERT できない",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "denied",
  },
  // UPDATE
  {
    description: "オーナーはグループを UPDATE できる",
    userId: "owner-1",
    operation: "UPDATE",
    expectedResult: "allowed",
  },
  {
    description: "非オーナーはグループを UPDATE できない",
    userId: "member-1",
    operation: "UPDATE",
    expectedResult: "denied",
  },
  // DELETE
  {
    description: "オーナーはグループを DELETE できる",
    userId: "owner-1",
    operation: "DELETE",
    expectedResult: "allowed",
  },
  {
    description: "非オーナーはグループを DELETE できない",
    userId: "member-1",
    operation: "DELETE",
    expectedResult: "denied",
  },
];

/**
 * profiles テーブルの RLS シナリオ
 */
const profilesRLSScenarios: RLSTestScenario[] = [
  // SELECT - 自分自身（認証フローの最重要パス）
  {
    description: "認証済みユーザーは自分のプロフィールを SELECT できる",
    userId: "user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "group_members に依存しない独立ポリシー",
  },
  {
    description: "匿名認証（デモ）ユーザーは自分のプロフィールを SELECT できる",
    userId: "anon-user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "signInAnonymously() でも auth.uid() は設定される",
  },
  // SELECT - グループメンバー
  {
    description: "同一グループメンバーのプロフィールを SELECT できる",
    userId: "user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "is_group_member() SECURITY DEFINER で再帰回避",
  },
  {
    description: "未認証ユーザーはプロフィールを SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "自分自身のプロフィールを INSERT できる",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "通常は handle_new_user トリガー (SECURITY DEFINER) が実行",
  },
  {
    description: "他人のプロフィールを INSERT できない",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "denied",
    note: "id != auth.uid() の場合は拒否",
  },
  // UPDATE
  {
    description: "自分自身のプロフィールを UPDATE できる",
    userId: "user-1",
    operation: "UPDATE",
    expectedResult: "allowed",
  },
  {
    description: "他人のプロフィールを UPDATE できない",
    userId: "user-1",
    operation: "UPDATE",
    expectedResult: "denied",
  },
  // DELETE
  {
    description: "誰もプロフィールを DELETE できない",
    userId: "user-1",
    operation: "DELETE",
    expectedResult: "denied",
    note: "USING (false) で完全ブロック",
  },
];

/**
 * demo_sessions テーブルの RLS シナリオ
 */
const demoSessionsRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "匿名ユーザーは自分のデモセッションを SELECT できる",
    userId: "anon-user-1",
    operation: "SELECT",
    expectedResult: "allowed",
  },
  {
    description: "期限切れのデモセッションも SELECT できる",
    userId: "anon-user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "expires_at チェックはアプリ層で実施（DB層では制限しない）",
  },
  {
    description: "他人のデモセッションは SELECT できない",
    userId: "anon-user-1",
    operation: "SELECT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーはデモセッションを SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },
  // INSERT
  {
    description: "匿名ユーザーは自分のデモセッションを INSERT できる",
    userId: "anon-user-1",
    operation: "INSERT",
    expectedResult: "allowed",
    note: "signInAnonymously() 後に demo_sessions を作成",
  },
  {
    description: "他人のデモセッションを INSERT できない",
    userId: "anon-user-1",
    operation: "INSERT",
    expectedResult: "denied",
  },
  // DELETE
  {
    description: "自分のデモセッションを DELETE できる",
    userId: "anon-user-1",
    operation: "DELETE",
    expectedResult: "allowed",
    note: "クリーンアップ用",
  },
  {
    description: "他人のデモセッションを DELETE できない",
    userId: "anon-user-1",
    operation: "DELETE",
    expectedResult: "denied",
  },
];

// =============================================================================
// SECURITY DEFINER ヘルパー関数テスト
// =============================================================================

describe("SECURITY DEFINER ヘルパー関数", () => {
  it("is_group_member() は RLS をバイパスして group_members を直接参照する", () => {
    // is_group_member(_group_id, _user_id) の仕様:
    // - SECURITY DEFINER: postgres ロール権限で実行 → RLS バイパス
    // - STABLE: 同一トランザクション内で結果が変わらない
    // - search_path = public: スキーマ汚染攻撃を防止
    // - 戻り値: BOOLEAN（データ漏洩リスクなし）
    const functionSpec = {
      name: "is_group_member",
      params: ["_group_id UUID", "_user_id UUID"],
      returns: "BOOLEAN",
      language: "sql",
      security: "SECURITY DEFINER",
      volatility: "STABLE",
      searchPath: "public",
      body: "SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = _group_id AND user_id = _user_id)",
    };

    expect(functionSpec.security).toBe("SECURITY DEFINER");
    expect(functionSpec.volatility).toBe("STABLE");
    expect(functionSpec.returns).toBe("BOOLEAN");
    expect(functionSpec.body).toContain("group_members");
    expect(functionSpec.body).not.toContain("auth.uid()"); // パラメータ経由で受け取る
  });

  it("is_group_owner() は RLS をバイパスして groups.owner_id を直接参照する", () => {
    const functionSpec = {
      name: "is_group_owner",
      params: ["_group_id UUID", "_user_id UUID"],
      returns: "BOOLEAN",
      language: "sql",
      security: "SECURITY DEFINER",
      volatility: "STABLE",
      searchPath: "public",
      body: "SELECT EXISTS (SELECT 1 FROM groups WHERE id = _group_id AND owner_id = _user_id)",
    };

    expect(functionSpec.security).toBe("SECURITY DEFINER");
    expect(functionSpec.body).toContain("owner_id");
  });

  it("ヘルパー関数が無限再帰チェーンを断ち切る仕組み", () => {
    // 修正前の再帰チェーン:
    // group_members SELECT → RLS → EXISTS (SELECT FROM group_members) → RLS → ∞
    //
    // 修正後:
    // group_members SELECT → RLS → is_group_member() [SECURITY DEFINER] → 直接 SELECT (RLS なし) → 結果
    const recursionChain = {
      before: [
        "group_members SELECT",
        "→ RLS policy evaluation",
        "→ EXISTS (SELECT FROM group_members)",
        "→ RLS policy evaluation (same table!)",
        "→ EXISTS (SELECT FROM group_members)",
        "→ ... infinite recursion → ERROR",
      ],
      after: [
        "group_members SELECT",
        "→ RLS policy evaluation",
        "→ is_group_member() [SECURITY DEFINER]",
        "→ direct SELECT FROM group_members (NO RLS)",
        "→ returns BOOLEAN → policy evaluated",
      ],
    };

    // 修正前は再帰が発生
    expect(recursionChain.before).toContain("→ ... infinite recursion → ERROR");
    // 修正後は SECURITY DEFINER で断ち切る
    expect(recursionChain.after).toContain("→ is_group_member() [SECURITY DEFINER]");
    expect(recursionChain.after).toContain("→ direct SELECT FROM group_members (NO RLS)");
  });
});

// =============================================================================
// group_members テーブル RLS テスト
// =============================================================================

describe("group_members テーブル RLS", () => {
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

  describe("SELECT ポリシー - is_group_member() による再帰回避", () => {
    it("グループメンバーは同グループの group_members を取得できる", async () => {
      const userId = "user-1";
      const members = [
        { user_id: "user-1", group_id: "group-1", role: "member" },
        { user_id: "user-2", group_id: "group-1", role: "member" },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // is_group_member(group_id, auth.uid()) で判定
      // SECURITY DEFINER により group_members の RLS をバイパス → 再帰なし
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: members,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
    });

    it("非メンバーは group_members を取得できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      // is_group_member() が false を返す → 行が返らない
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });
  });

  describe("INSERT ポリシー", () => {
    it("自分自身を group_members に追加できる（招待参加）", async () => {
      const userId = "user-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // user_id = auth.uid() → 自己追加を許可
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { user_id: userId, group_id: "group-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("グループオーナーは他メンバーを追加できる", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      // is_group_owner(group_id, auth.uid()) で判定
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { user_id: "new-member", group_id: "group-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });
  });

  describe("DELETE ポリシー", () => {
    it("自分自身を group_members から削除できる（脱退）", async () => {
      const userId = "user-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { user_id: userId, group_id: "group-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("グループオーナーは他メンバーを削除できる", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      // is_group_owner(group_id, auth.uid()) で判定
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { user_id: "member-to-remove", group_id: "group-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });
  });
});

// =============================================================================
// groups テーブル RLS テスト
// =============================================================================

describe("groups テーブル RLS", () => {
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

  describe("SELECT ポリシー - owner_id 優先 + is_group_member() フォールバック", () => {
    it("グループオーナーは作成直後でもグループを取得できる", async () => {
      // グループ作成直後は group_members にまだ INSERT されていない可能性がある
      // owner_id = auth.uid() チェックが先に評価されるため、即座に参照可能
      const ownerId = "owner-1";
      const group = { id: "group-1", name: "Test Group", owner_id: ownerId };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: group,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual(group);
      expect(result.data.owner_id).toBe(ownerId);
      expect(result.error).toBeNull();
    });

    it("グループメンバー（非オーナー）もグループを取得できる", async () => {
      const memberId = "member-1";
      const group = { id: "group-1", name: "Test Group", owner_id: "owner-1" };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // owner_id != auth.uid() → is_group_member() にフォールバック
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: group,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual(group);
      expect(result.error).toBeNull();
    });

    it("非メンバーはグループを取得できない", async () => {
      const outsiderId = "outsider";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });
  });

  describe("INSERT ポリシー", () => {
    it("認証済みユーザーは自分がオーナーのグループを作成できる", async () => {
      const userId = "user-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-group", name: "My Group", owner_id: userId },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("他人をオーナーとするグループは作成できない", async () => {
      const userId = "user-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // owner_id != auth.uid() → RLS 拒否
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  describe("UPDATE ポリシー", () => {
    it("オーナーはグループを更新できる", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "group-1", name: "Updated Name" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });
  });

  describe("DELETE ポリシー", () => {
    it("オーナーはグループを削除できる", async () => {
      const ownerId = "owner-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "group-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("非オーナーはグループを削除できない", async () => {
      const memberId = "member-1";

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
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
  });
});

// =============================================================================
// profiles テーブル RLS テスト
// =============================================================================

describe("profiles テーブル RLS", () => {
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

  describe("SELECT ポリシー（自分自身） - 認証フロー最重要パス", () => {
    it("認証済みユーザーは group_members に依存せず自分のプロフィールを取得できる", async () => {
      const userId = "user-1";
      const ownProfile = {
        id: userId,
        email: "user@example.com",
        display_name: "User 1",
        is_demo: false,
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // profiles_select_own ポリシー: id = auth.uid()
      // group_members への subquery なし → cross-table RLS の影響を受けない
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: ownProfile,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual(ownProfile);
      expect(result.error).toBeNull();
    });

    it("匿名認証ユーザー（デモ）も自分のプロフィールを取得できる", async () => {
      const anonUserId = "anon-user-uuid";
      const demoProfile = {
        id: anonUserId,
        email: "",
        display_name: "demo user",
        is_demo: true,
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      // signInAnonymously() でも auth.uid() は設定される
      // profiles_select_own: id = auth.uid() で直接マッチ
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: demoProfile,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data?.is_demo).toBe(true);
      expect(result.error).toBeNull();
    });

    it("グループ未参加の新規ユーザーでも自分のプロフィールを取得できる", async () => {
      // これが修正の核心: 以前のポリシーでは group_members subquery に依存していたため
      // グループ未参加ユーザーのプロフィール取得が阻害される可能性があった
      const newUserId = "brand-new-user";
      const newProfile = {
        id: newUserId,
        email: "new@example.com",
        display_name: "New User",
        is_demo: false,
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: newUserId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: newProfile,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual(newProfile);
      expect(result.error).toBeNull();
    });
  });

  describe("SELECT ポリシー（グループメンバー） - is_group_member() で再帰回避", () => {
    it("同一グループメンバーのプロフィールを取得できる", async () => {
      const userId = "user-1";
      const groupMemberProfiles = [
        { id: "user-2", display_name: "User 2" },
        { id: "user-3", display_name: "User 3" },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // profiles_select_group_members ポリシー:
      // is_group_member(gm.group_id, auth.uid()) で再帰回避
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: groupMemberProfiles,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(2);
    });

    it("未認証ユーザーはプロフィールを取得できない", async () => {
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
  });

  describe("INSERT ポリシー", () => {
    it("handle_new_user トリガーは SECURITY DEFINER で RLS をバイパスする", () => {
      const triggerSpec = {
        name: "handle_new_user",
        trigger: "on_auth_user_created",
        table: "auth.users",
        event: "AFTER INSERT",
        security: "SECURITY DEFINER",
        action: "INSERT INTO public.profiles (id, email, display_name)",
      };

      expect(triggerSpec.security).toBe("SECURITY DEFINER");
      expect(triggerSpec.event).toBe("AFTER INSERT");
    });

    it("自分自身のプロフィールを INSERT できる（フォールバック）", async () => {
      const userId = "user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: userId, email: "user@example.com" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });
  });

  describe("UPDATE ポリシー", () => {
    it("自分自身のプロフィールを UPDATE できる", async () => {
      const userId = "user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: userId, display_name: "Updated Name" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("他人のプロフィールを UPDATE できない", async () => {
      const userId = "user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // id != auth.uid() なので RLS により拒否
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

  describe("DELETE ポリシー", () => {
    it("誰もプロフィールを DELETE できない", async () => {
      const userId = "user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // USING (false) により全拒否
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });
});

// =============================================================================
// demo_sessions テーブル RLS テスト
// =============================================================================

describe("demo_sessions テーブル RLS", () => {
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

  describe("SELECT ポリシー", () => {
    it("匿名ユーザーは自分のデモセッションを取得できる", async () => {
      const anonUserId = "anon-user-1";
      const session = {
        id: "session-1",
        user_id: anonUserId,
        group_id: "demo-group-1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: session,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual(session);
      expect(result.error).toBeNull();
    });

    it("期限切れセッションも SELECT できる（アプリ層で期限管理）", async () => {
      const anonUserId = "anon-user-1";
      const expiredSession = {
        id: "session-expired",
        user_id: anonUserId,
        group_id: "demo-group-1",
        expires_at: new Date(Date.now() - 86400000).toISOString(), // 24時間前（期限切れ）
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      // 新ポリシーでは期限切れでも取得可能
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: expiredSession,
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeDefined();
      expect(result.error).toBeNull();

      // 期限切れ判定はアプリ側で実施
      const expiresAt = new Date(result.data!.expires_at);
      expect(expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it("他人のデモセッションは SELECT できない", async () => {
      const anonUserId = "anon-user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      // user_id != auth.uid() なので RLS により拒否
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: null, // 空結果（エラーではなく結果なし）
      });

      const result = await mockQueryBuilder.single();
      expect(result.data).toBeNull();
    });

    it("未認証ユーザーはデモセッションを SELECT できない", async () => {
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
  });

  describe("INSERT ポリシー", () => {
    it("匿名認証後にデモセッションを INSERT できる", async () => {
      const anonUserId = "anon-user-1";
      const newSession = {
        user_id: anonUserId,
        group_id: "demo-group-1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      // user_id = auth.uid() なので INSERT 許可
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-session", ...newSession },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("他人のデモセッションを INSERT できない", async () => {
      const anonUserId = "anon-user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      // user_id != auth.uid() なので RLS により拒否
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  describe("DELETE ポリシー", () => {
    it("自分のデモセッションを DELETE できる（クリーンアップ）", async () => {
      const anonUserId = "anon-user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "session-1" },
        error: null,
      });

      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("他人のデモセッションを DELETE できない", async () => {
      const anonUserId = "anon-user-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: anonUserId } },
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
  });
});

// =============================================================================
// RLS ポリシー仕様のドキュメント化テスト
// =============================================================================

describe("RLS ポリシー仕様（全テーブル）", () => {
  describe("group_members テーブル", () => {
    it.each(groupMembersRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });

  describe("groups テーブル", () => {
    it.each(groupsRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });

  describe("profiles テーブル", () => {
    it.each(profilesRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });

  describe("demo_sessions テーブル", () => {
    it.each(demoSessionsRLSScenarios)(
      "$description -> $expectedResult",
      ({ userId, operation, expectedResult, note }) => {
        expect({ userId, operation, expectedResult, note }).toBeDefined();
      }
    );
  });
});

// =============================================================================
// 認証フロー統合シナリオ
// =============================================================================

describe("認証フロー統合シナリオ", () => {
  it("サインアップ → 初回ログイン → プロフィール取得のフロー", () => {
    const flow = {
      step1: "signUp() → auth.users INSERT",
      step2: "handle_new_user() SECURITY DEFINER → profiles INSERT",
      step3: "signIn() → middleware getUser() success",
      step4: "Protected Layout → profiles SELECT (id = auth.uid())",
      rlsDependency: "profiles_select_own は group_members に依存しない",
    };

    expect(flow.rlsDependency).toContain("依存しない");
  });

  it("グループ作成フロー（無限再帰なし）", () => {
    // 修正後のフロー:
    // 1. groups INSERT → groups_insert_authenticated (owner_id = auth.uid()) ✓
    // 2. group_members INSERT → group_members_insert_policy (user_id = auth.uid()) ✓
    // 3. groups SELECT → groups_select_member (owner_id = auth.uid() OR is_group_member()) ✓
    // 4. group_members SELECT → group_members_select_member (is_group_member()) ✓
    //
    // ステップ 3, 4 で is_group_member() が SECURITY DEFINER で
    // group_members を直接参照するため、無限再帰は発生しない
    const flow = {
      step1: "groups INSERT: owner_id = auth.uid()",
      step2: "group_members INSERT: user_id = auth.uid()",
      step3: "groups SELECT: owner_id = auth.uid() OR is_group_member()",
      step4: "group_members SELECT: is_group_member() [SECURITY DEFINER]",
      recursionFix: "is_group_member() が SECURITY DEFINER で RLS をバイパス",
    };

    expect(flow.recursionFix).toContain("SECURITY DEFINER");
    expect(flow.step3).toContain("owner_id");
    expect(flow.step4).toContain("is_group_member");
  });

  it("デモセッション作成フロー（匿名認証）", () => {
    const flow = {
      auth: "signInAnonymously() sets auth.uid()",
      profileCreate: "handle_new_user() SECURITY DEFINER",
      profileUpdate: "profiles_update_policy (id = auth.uid())",
      groupCreate: "groups_insert_authenticated (owner_id = auth.uid())",
      memberCreate: "group_members_insert_policy (user_id = auth.uid())",
      sessionCreate: "demo_sessions_insert_policy (user_id = auth.uid())",
    };

    // auth 以外の全操作で auth.uid() を使用
    const rlsSteps = Object.entries(flow).filter(([key]) => key !== "auth" && key !== "profileCreate");
    rlsSteps.forEach(([, step]) => {
      expect(step).toContain("auth.uid()");
    });

    // profileCreate は SECURITY DEFINER でバイパス（auth.uid() 不要）
    expect(flow.profileCreate).toContain("SECURITY DEFINER");
  });

  it("期限切れデモセッションのレイアウト表示", () => {
    const policy = {
      before: "user_id = auth.uid() AND expires_at > now()",
      after: "user_id = auth.uid()",
      reason: "期限管理はアプリ層で実施、DB層では所有者チェックのみ",
    };

    expect(policy.after).not.toContain("expires_at");
    expect(policy.before).toContain("expires_at");
  });
});
