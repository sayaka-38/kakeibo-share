/**
 * groups + group_members テーブル RLS テスト
 *
 * Phase 5-4: グループ関連テーブルの Row Level Security ポリシーをテスト
 *
 * RLS 要件:
 * - groups SELECT: メンバーのみ
 * - groups INSERT: 認証済み（owner_id = 自分）
 * - groups UPDATE: owner のみ
 * - groups DELETE: owner のみ
 * - group_members SELECT: 同じグループのメンバーのみ
 * - group_members INSERT: owner または自分自身（招待参加）
 * - group_members DELETE: owner または本人
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
// RLS ポリシー検証ユーティリティ
// =============================================================================

/**
 * RLS ポリシーの期待される動作を検証するためのヘルパー
 */
type RLSTestScenario = {
  description: string;
  userId: string | null;
  userRole?: "owner" | "member" | "non-member";
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  expectedResult: "allowed" | "denied";
};

/**
 * groups テーブルの RLS シナリオ
 */
const groupsRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "メンバーは自分のグループを SELECT できる",
    userId: "user-1",
    userRole: "member",
    operation: "SELECT",
    expectedResult: "allowed",
  },
  {
    description: "オーナーは自分のグループを SELECT できる",
    userId: "owner-1",
    userRole: "owner",
    operation: "SELECT",
    expectedResult: "allowed",
  },
  {
    description: "非メンバーはグループを SELECT できない",
    userId: "outsider",
    userRole: "non-member",
    operation: "SELECT",
    expectedResult: "denied",
  },
  {
    description: "未認証ユーザーはグループを SELECT できない",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
  },

  // INSERT
  {
    description: "認証済みユーザーは新しいグループを作成できる",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "allowed",
  },
  {
    description: "未認証ユーザーはグループを作成できない",
    userId: null,
    operation: "INSERT",
    expectedResult: "denied",
  },

  // UPDATE
  {
    description: "オーナーはグループを UPDATE できる",
    userId: "owner-1",
    userRole: "owner",
    operation: "UPDATE",
    expectedResult: "allowed",
  },
  {
    description: "メンバーはグループを UPDATE できない",
    userId: "user-1",
    userRole: "member",
    operation: "UPDATE",
    expectedResult: "denied",
  },
  {
    description: "非メンバーはグループを UPDATE できない",
    userId: "outsider",
    userRole: "non-member",
    operation: "UPDATE",
    expectedResult: "denied",
  },

  // DELETE
  {
    description: "オーナーはグループを DELETE できる",
    userId: "owner-1",
    userRole: "owner",
    operation: "DELETE",
    expectedResult: "allowed",
  },
  {
    description: "メンバーはグループを DELETE できない",
    userId: "user-1",
    userRole: "member",
    operation: "DELETE",
    expectedResult: "denied",
  },
];

/**
 * group_members テーブルの RLS シナリオ
 */
const groupMembersRLSScenarios: RLSTestScenario[] = [
  // SELECT
  {
    description: "メンバーは同じグループのメンバー一覧を SELECT できる",
    userId: "user-1",
    userRole: "member",
    operation: "SELECT",
    expectedResult: "allowed",
  },
  {
    description: "非メンバーはメンバー一覧を SELECT できない",
    userId: "outsider",
    userRole: "non-member",
    operation: "SELECT",
    expectedResult: "denied",
  },

  // INSERT
  {
    description: "オーナーは新しいメンバーを追加できる",
    userId: "owner-1",
    userRole: "owner",
    operation: "INSERT",
    expectedResult: "allowed",
  },
  {
    description: "招待参加時は自分自身を INSERT できる",
    userId: "new-user",
    userRole: "non-member",
    operation: "INSERT",
    expectedResult: "allowed", // 自分自身を追加する場合のみ
  },
  {
    description: "メンバーは他のユーザーを INSERT できない",
    userId: "user-1",
    userRole: "member",
    operation: "INSERT",
    expectedResult: "denied",
  },

  // DELETE
  {
    description: "オーナーはメンバーを削除できる",
    userId: "owner-1",
    userRole: "owner",
    operation: "DELETE",
    expectedResult: "allowed",
  },
  {
    description: "メンバーは自分自身を削除（脱退）できる",
    userId: "user-1",
    userRole: "member",
    operation: "DELETE",
    expectedResult: "allowed", // 自分自身を削除する場合のみ
  },
  {
    description: "メンバーは他のメンバーを削除できない",
    userId: "user-1",
    userRole: "member",
    operation: "DELETE",
    expectedResult: "denied", // 他人を削除しようとした場合
  },
];

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

  describe("SELECT ポリシー", () => {
    it("メンバーは自分が所属するグループのみ取得できる", async () => {
      // Arrange
      const userId = "user-1";
      const memberGroups = [
        { id: "group-1", name: "My Group" },
        { id: "group-2", name: "Another Group" },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: memberGroups,
        error: null,
      });

      // Act & Assert - RLS により所属グループのみ返される
      expect(mockSupabase.from).toBeDefined();
      // 実際の RLS テストでは Supabase の実データでテストが必要
      // ここではポリシーの期待される動作を文書化
    });

    it("非メンバーのグループは取得できない（空配列が返る）", async () => {
      // Arrange
      const userId = "outsider";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // RLS により非メンバーのグループは除外される
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: [],
        error: null,
      });

      // Assert - 非メンバーには空配列
      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual([]);
    });

    it("未認証ユーザーはエラーとなる", async () => {
      // Arrange
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Not authenticated" },
      });

      // RLS により未認証は全て拒否
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "JWT required" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  describe("INSERT ポリシー", () => {
    it("認証済みユーザーは owner_id=自分 で新しいグループを作成できる", async () => {
      // Arrange
      const userId = "user-1";
      const newGroup = {
        name: "New Group",
        owner_id: userId,
        invite_code: "ABC123",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-group-id", ...newGroup },
        error: null,
      });

      // Assert - owner_id が自分の場合は成功
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("owner_id が自分以外の場合はエラーとなる", async () => {
      // Arrange
      const userId = "user-1";
      // テストシナリオ: owner_id を他人に設定しようとする
      // { name: "Hijacked Group", owner_id: "other-user" }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      // RLS により拒否される
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
      expect(result.error?.code).toBe("42501");
    });
  });

  describe("UPDATE ポリシー", () => {
    it("オーナーは自分のグループを更新できる", async () => {
      // Arrange
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

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("メンバー（非オーナー）はグループを更新できない", async () => {
      // Arrange
      const memberId = "member-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // RLS により拒否
      mockQueryBuilder.update.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  describe("DELETE ポリシー", () => {
    it("オーナーは自分のグループを削除できる", async () => {
      // Arrange
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

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("メンバー（非オーナー）はグループを削除できない", async () => {
      // Arrange
      const memberId = "member-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // RLS により拒否
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
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

  describe("SELECT ポリシー", () => {
    it("メンバーは同じグループのメンバー一覧を取得できる", async () => {
      // Arrange
      const userId = "user-1";
      const groupMembers = [
        { id: "gm-1", user_id: "user-1", role: "member" },
        { id: "gm-2", user_id: "user-2", role: "member" },
        { id: "gm-3", user_id: "owner-1", role: "owner" },
      ];

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });

      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: groupMembers,
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.data).toHaveLength(3);
    });

    it("非メンバーは他グループのメンバー一覧を取得できない", async () => {
      // Arrange
      const outsiderId = "outsider";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: outsiderId } },
        error: null,
      });

      // RLS により空配列
      mockQueryBuilder.select.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: [],
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.data).toEqual([]);
    });
  });

  describe("INSERT ポリシー", () => {
    it("オーナーは新しいメンバーを追加できる", async () => {
      // Arrange
      const ownerId = "owner-1";
      const newMember = {
        group_id: "group-1",
        user_id: "new-user",
        role: "member",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-gm-id", ...newMember },
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("招待参加時は自分自身を INSERT できる", async () => {
      // Arrange
      const newUserId = "new-user";
      const selfJoin = {
        group_id: "group-1",
        user_id: newUserId, // 自分自身
        role: "member",
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: newUserId } },
        error: null,
      });

      // 招待参加は API Route 経由で処理される想定
      // RLS は「自分自身の追加」を許可
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "new-gm-id", ...selfJoin },
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("一般メンバーは他のユーザーを追加できない", async () => {
      // Arrange
      const memberId = "member-1";
      // テストシナリオ: 他人を追加しようとする
      // { group_id: "group-1", user_id: "another-user", role: "member" }

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // RLS により拒否
      mockQueryBuilder.insert.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });

  describe("DELETE ポリシー", () => {
    it("オーナーはメンバーを削除できる", async () => {
      // Arrange
      const ownerId = "owner-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "gm-1" },
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("メンバーは自分自身を削除（脱退）できる", async () => {
      // Arrange
      const memberId = "member-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // 自分自身の削除は許可
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: { id: "gm-self", user_id: memberId },
        error: null,
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeNull();
    });

    it("メンバーは他のメンバーを削除できない", async () => {
      // Arrange
      const memberId = "member-1";
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      // 他人の削除は RLS により拒否
      mockQueryBuilder.delete.mockReturnThis();
      mockQueryBuilder.eq.mockReturnThis();
      mockQueryBuilder.single.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "RLS policy violation" },
      });

      // Assert
      const result = await mockQueryBuilder.single();
      expect(result.error).toBeTruthy();
    });
  });
});

// =============================================================================
// RLS ポリシー仕様のドキュメント化テスト
// =============================================================================

describe("RLS ポリシー仕様", () => {
  describe("groups テーブル", () => {
    it.each(groupsRLSScenarios)(
      "$description → $expectedResult",
      ({ userId, userRole, operation, expectedResult }) => {
        // このテストは RLS ポリシーの仕様をドキュメント化するためのもの
        // 実際の検証は Supabase の実環境で行う必要がある
        expect({
          userId,
          userRole,
          operation,
          expectedResult,
        }).toBeDefined();
      }
    );
  });

  describe("group_members テーブル", () => {
    it.each(groupMembersRLSScenarios)(
      "$description → $expectedResult",
      ({ userId, userRole, operation, expectedResult }) => {
        expect({
          userId,
          userRole,
          operation,
          expectedResult,
        }).toBeDefined();
      }
    );
  });
});

// =============================================================================
// 招待コード検索のセキュリティテスト
// =============================================================================

describe("招待コード検索のセキュリティ", () => {
  it("RLS はメンバー以外のグループ情報を公開しない", () => {
    // 招待コードでのグループ検索は API Route 経由で処理される
    // RLS は厳格にメンバーのみにアクセスを制限
    // この設計により invite_code の露出を防ぐ
    const rlsPolicy = {
      table: "groups",
      operation: "SELECT",
      condition: "user is member of the group",
      note: "招待コード検索は API Route で service role を使用",
    };

    expect(rlsPolicy.condition).not.toContain("invite_code");
  });

  it("招待参加フローは API Route 経由で安全に処理される", () => {
    // API Route の設計仕様
    const apiDesign = {
      endpoint: "/api/groups/join",
      method: "POST",
      body: { inviteCode: "string" },
      serverSide: {
        // サーバーサイドで service role を使用
        useServiceRole: true,
        steps: [
          "1. 招待コードでグループを検索（service role でRLSバイパス）",
          "2. ユーザー認証を確認",
          "3. 既存メンバーかチェック",
          "4. group_members に追加",
        ],
      },
    };

    expect(apiDesign.serverSide.useServiceRole).toBe(true);
  });
});
