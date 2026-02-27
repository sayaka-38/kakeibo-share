/**
 * ユーザー・メンバーのテストファクトリ
 */

import type { MemberRef } from "@/types/domain";

const MEMBER_DEFAULTS: MemberRef = {
  id: "user-1",
  display_name: "テストユーザー",
  email: "test@example.com",
};

/**
 * MemberRef モックを生成する
 */
export function createMockMember(
  overrides: Partial<MemberRef> = {}
): MemberRef {
  return { ...MEMBER_DEFAULTS, ...overrides };
}

/** よく使うテストユーザーのプリセット */
export const MOCK_USERS = {
  alice: createMockMember({ id: "user-alice", display_name: "Alice", email: "alice@example.com" }),
  bob: createMockMember({ id: "user-bob", display_name: "Bob", email: "bob@example.com" }),
} as const;
