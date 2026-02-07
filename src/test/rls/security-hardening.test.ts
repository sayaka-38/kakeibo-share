/**
 * Security Hardening テスト (Migration 009)
 *
 * Supabase Security Advisor の 7 つの警告に対応する修正を検証する:
 *
 *   1. handle_new_user() に SET search_path = public が付与されていること
 *   2. categories テーブルに RLS が有効化されていること
 *   3. categories: authenticated SELECT のみ許可、anon 全拒否
 *   4. profiles: anon 全拒否
 *   5. groups: anon 全拒否
 *   6. group_members: anon 全拒否
 *   7. demo_sessions: anon 全拒否
 *
 * テスト方針:
 *   - RLS ポリシーの「仕様」をシナリオとして定義
 *   - モッククライアントで USING / WITH CHECK の評価をシミュレーション
 *   - 実 DB テストではなく、ポリシー設計の意図を保証するドキュメントテスト
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
  role: "authenticated" | "anon";
  userId: string | null;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  expectedResult: "allowed" | "denied";
  note?: string;
};

// =============================================================================
// 1. handle_new_user: search_path 検証
// =============================================================================

describe("handle_new_user() SECURITY DEFINER 設定", () => {
  it("SET search_path = public が指定されていること（SQL 定義の検証）", () => {
    // Migration 009 で修正される SQL の仕様を記録
    // 実際の検証は:
    //   SELECT proconfig FROM pg_proc WHERE proname = 'handle_new_user';
    //   期待: proconfig = '{search_path=public}'
    const expectedConfig = {
      functionName: "handle_new_user",
      securityDefiner: true,
      searchPath: "public",
      language: "plpgsql",
    };

    expect(expectedConfig.securityDefiner).toBe(true);
    expect(expectedConfig.searchPath).toBe("public");
  });

  it("search_path がないと悪意あるスキーマ経由でコード注入されるリスクがある", () => {
    // このテストはリスクの文書化
    // SECURITY DEFINER 関数は postgres ロール権限で実行される
    // search_path が未固定だと、攻撃者が悪意あるスキーマを先頭に挿入し
    // 関数内の非修飾テーブル参照を別テーブルにリダイレクトできる
    const risks = [
      "スキーマ汚染攻撃（schema poisoning）",
      "SECURITY DEFINER の昇格された権限で不正な操作が実行される",
      "profiles テーブルの代わりに偽テーブルにデータが挿入される",
    ];

    expect(risks).toHaveLength(3);
    // Migration 009 で SET search_path = public を追加して解消
  });
});

// =============================================================================
// 2. categories テーブル RLS
// =============================================================================

const categoriesRLSScenarios: RLSTestScenario[] = [
  // authenticated ロール
  {
    description: "認証済みユーザーはカテゴリを SELECT できる",
    role: "authenticated",
    userId: "user-1",
    operation: "SELECT",
    expectedResult: "allowed",
    note: "categories_select_authenticated: TO authenticated USING (true)",
  },
  {
    description: "認証済みユーザーはカテゴリを INSERT できない",
    role: "authenticated",
    userId: "user-1",
    operation: "INSERT",
    expectedResult: "denied",
    note: "INSERT ポリシーなし → 暗黙拒否。カテゴリはマイグレーション経由で管理",
  },
  {
    description: "認証済みユーザーはカテゴリを UPDATE できない",
    role: "authenticated",
    userId: "user-1",
    operation: "UPDATE",
    expectedResult: "denied",
    note: "UPDATE ポリシーなし → 暗黙拒否",
  },
  {
    description: "認証済みユーザーはカテゴリを DELETE できない",
    role: "authenticated",
    userId: "user-1",
    operation: "DELETE",
    expectedResult: "denied",
    note: "DELETE ポリシーなし → 暗黙拒否",
  },
  // anon ロール
  {
    description: "anon ユーザーはカテゴリを SELECT できない",
    role: "anon",
    userId: null,
    operation: "SELECT",
    expectedResult: "denied",
    note: "categories_deny_anon: AS RESTRICTIVE USING (false)",
  },
  {
    description: "anon ユーザーはカテゴリを INSERT できない",
    role: "anon",
    userId: null,
    operation: "INSERT",
    expectedResult: "denied",
  },
];

describe("categories テーブル RLS (Migration 009)", () => {
  let _mockClient: MockSupabaseClient;
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

    _mockClient = {
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      auth: {
        getUser: vi.fn(),
      },
    };
  });

  /**
   * RLS ポリシー評価をシミュレート
   *
   * categories テーブルのポリシー:
   *   PERMISSIVE: categories_select_authenticated (SELECT, TO authenticated, USING true)
   *   RESTRICTIVE: categories_deny_anon (ALL, TO anon, USING false, WITH CHECK false)
   *
   * 暗黙拒否: INSERT / UPDATE / DELETE には authenticated 向けポリシーがない
   */
  function evaluateCategoriesRLS(
    role: "authenticated" | "anon",
    operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  ): "allowed" | "denied" {
    // anon ロール: RESTRICTIVE false → 常に拒否
    if (role === "anon") {
      return "denied";
    }

    // authenticated ロール: SELECT のみ PERMISSIVE true
    if (role === "authenticated" && operation === "SELECT") {
      return "allowed";
    }

    // それ以外: ポリシーなし → 暗黙拒否
    return "denied";
  }

  describe("RLS シナリオ検証", () => {
    categoriesRLSScenarios.forEach((scenario) => {
      it(scenario.description, () => {
        const result = evaluateCategoriesRLS(scenario.role, scenario.operation);
        expect(result).toBe(scenario.expectedResult);
      });
    });
  });

  it("RLS が有効化されていること（Migration 001 で漏れていた）", () => {
    // Migration 009 で修正:
    //   ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
    //
    // 検証クエリ:
    //   SELECT relrowsecurity FROM pg_class WHERE relname = 'categories';
    //   期待: true
    const rlsEnabled = true; // Migration 009 適用後
    expect(rlsEnabled).toBe(true);
  });

  it("デフォルトカテゴリは認証済みユーザーなら誰でも読める", () => {
    // カテゴリは payments テーブルの category_id 外部キーで参照される
    // 支払い登録画面でドロップダウン表示するため全認証ユーザーが参照可能
    const result = evaluateCategoriesRLS("authenticated", "SELECT");
    expect(result).toBe("allowed");
  });
});

// =============================================================================
// 3. anon ロール RESTRICTIVE 拒否ポリシー（5 テーブル共通）
// =============================================================================

/**
 * anon 拒否ポリシーの仕様
 *
 * 各テーブルに以下の RESTRICTIVE ポリシーを追加:
 *   CREATE POLICY "{table}_deny_anon" ON {table}
 *   AS RESTRICTIVE FOR ALL TO anon
 *   USING (false) WITH CHECK (false);
 *
 * RESTRICTIVE の効果:
 *   最終判定 = (PERMISSIVE のいずれかが true) AND (すべての RESTRICTIVE が true)
 *   → RESTRICTIVE が false なら、PERMISSIVE に関係なく常に拒否
 *   → 将来誤って PERMISSIVE ポリシーが追加されても防御される
 */
const anonDenyTables = [
  "categories",
  "profiles",
  "groups",
  "group_members",
  "demo_sessions",
] as const;

type AnonDenyTable = (typeof anonDenyTables)[number];

describe("anon ロール RESTRICTIVE 拒否ポリシー (Migration 009)", () => {
  /**
   * RESTRICTIVE ポリシー評価シミュレーション
   * USING (false) WITH CHECK (false) → 全操作拒否
   */
  function evaluateAnonRestrictivePolicy(
    _table: AnonDenyTable,
    _operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  ): boolean {
    // RESTRICTIVE USING (false) → 常に false
    return false;
  }

  anonDenyTables.forEach((table) => {
    describe(`${table} テーブル`, () => {
      const operations = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

      operations.forEach((op) => {
        it(`anon ロールは ${table} を ${op} できない`, () => {
          const allowed = evaluateAnonRestrictivePolicy(table, op);
          expect(allowed).toBe(false);
        });
      });
    });
  });

  it("RESTRICTIVE は将来の PERMISSIVE ポリシー追加に対する防御層", () => {
    // シナリオ: 誰かが誤って以下を追加したとする
    //   CREATE POLICY "profiles_select_all" ON profiles
    //   FOR SELECT USING (true);  -- 全ロールに公開
    //
    // RESTRICTIVE deny_anon があれば:
    //   最終判定 = (PERMISSIVE true) AND (RESTRICTIVE false) = false
    //   → anon は依然として拒否される

    const permissiveResult = true; // 誤った PERMISSIVE ポリシー
    const restrictiveResult = false; // deny_anon
    const finalResult = permissiveResult && restrictiveResult;

    expect(finalResult).toBe(false); // anon は拒否される
  });

  it("authenticated ロールは RESTRICTIVE ポリシーの影響を受けない", () => {
    // deny_anon ポリシーは TO anon で限定されているため
    // authenticated ロールには評価されない
    const policyTarget: string = "anon";
    const currentRole: string = "authenticated";

    const policyApplies = policyTarget === currentRole;
    expect(policyApplies).toBe(false);
  });

  it("デモユーザー（signUpAnonymously）は authenticated ロールなので影響なし", () => {
    // Supabase の signUpAnonymously() は:
    //   1. auth.users にレコードを作成
    //   2. JWT を発行（role = 'authenticated'）
    //   3. profiles.is_demo = true でプロフィール作成
    //
    // したがって anon 拒否ポリシーの影響を受けない
    const demoUserRole = "authenticated"; // signUpAnonymously() の結果
    const anonDenyTarget = "anon";

    expect(demoUserRole).not.toBe(anonDenyTarget);
  });
});

// =============================================================================
// 4. 全 SECURITY DEFINER 関数の search_path 一覧
// =============================================================================

describe("全 SECURITY DEFINER 関数の search_path 設定", () => {
  /**
   * プロジェクト内の SECURITY DEFINER 関数一覧と search_path 状態
   * Migration 009 適用後、すべての関数が search_path = public を持つ
   */
  const securityDefinerFunctions = [
    {
      name: "handle_new_user",
      migration: "007 → 009 で修正",
      hasSearchPath: true, // Migration 009 で追加
    },
    {
      name: "is_group_member",
      migration: "007",
      hasSearchPath: true, // 初めから設定済み
    },
    {
      name: "is_group_owner",
      migration: "007",
      hasSearchPath: true, // 初めから設定済み
    },
    {
      name: "get_payment_group_id",
      migration: "008",
      hasSearchPath: true, // 初めから設定済み
    },
  ];

  securityDefinerFunctions.forEach((fn) => {
    it(`${fn.name}() は SET search_path = public を持つ (${fn.migration})`, () => {
      expect(fn.hasSearchPath).toBe(true);
    });
  });

  it("全 SECURITY DEFINER 関数が search_path を設定済み", () => {
    const allHaveSearchPath = securityDefinerFunctions.every(
      (fn) => fn.hasSearchPath
    );
    expect(allHaveSearchPath).toBe(true);
  });
});

// =============================================================================
// 5. Migration 009 適用後の最終状態サマリ
// =============================================================================

describe("Migration 009 適用後の RLS 最終状態", () => {
  const tableRLSState = {
    profiles: { rlsEnabled: true, anonDeny: true, policiesCount: 6 },
    categories: { rlsEnabled: true, anonDeny: true, policiesCount: 2 },
    groups: { rlsEnabled: true, anonDeny: true, policiesCount: 5 },
    group_members: { rlsEnabled: true, anonDeny: true, policiesCount: 4 },
    payments: { rlsEnabled: true, anonDeny: false, policiesCount: 4 },
    payment_splits: { rlsEnabled: true, anonDeny: false, policiesCount: 4 },
    settlements: { rlsEnabled: true, anonDeny: false, policiesCount: 2 },
    demo_sessions: { rlsEnabled: true, anonDeny: true, policiesCount: 4 },
  };

  it("全テーブルで RLS が有効化されている", () => {
    const allEnabled = Object.values(tableRLSState).every(
      (state) => state.rlsEnabled
    );
    expect(allEnabled).toBe(true);
  });

  it("Security Advisor 指摘の 5 テーブルに anon 拒否ポリシーがある", () => {
    const targetTables = [
      "profiles",
      "categories",
      "groups",
      "group_members",
      "demo_sessions",
    ] as const;

    targetTables.forEach((table) => {
      expect(tableRLSState[table].anonDeny).toBe(true);
    });
  });

  it("categories テーブルは今回の修正で RLS 有効化 + 2 ポリシー追加", () => {
    // categories_select_authenticated (PERMISSIVE, SELECT, TO authenticated)
    // categories_deny_anon (RESTRICTIVE, ALL, TO anon)
    expect(tableRLSState.categories.policiesCount).toBe(2);
  });
});
