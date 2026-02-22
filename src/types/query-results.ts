/**
 * Supabaseクエリ結果の型定義
 *
 * 各ページコンポーネントで重複していたインライン型定義を統合
 * リレーションクエリの結果型を一元管理する
 */

/**
 * グループメンバーシップのクエリ結果（基本）
 * group_members.select("group_id, groups(id, name)") の戻り値
 */
export type GroupMembershipResult = {
  group_id: string;
  groups: { id: string; name: string } | null;
};

/**
 * グループメンバーシップのクエリ結果（説明付き）
 * group_members.select("group_id, groups(id, name, description)") の戻り値
 */
export type GroupMembershipWithDescriptionResult = {
  group_id: string;
  groups: { id: string; name: string; description: string | null } | null;
};

/**
 * グループメンバーシップのクエリ結果（role + created_at付き）
 * group_members.select("group_id, role, groups(...)") の戻り値
 */
export type GroupMembershipFullResult = {
  group_id: string;
  role: string;
  groups: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
  } | null;
};

/**
 * グループ詳細のクエリ結果
 * groups.select("*") の戻り値
 */
export type GroupResult = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
};

/**
 * グループメンバーのクエリ結果
 * group_members.select("user_id, profiles(id, display_name, email)") の戻り値
 */
export type MemberResult = {
  user_id: string;
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
  } | null;
};

/**
 * グループメンバー詳細のクエリ結果（role + created_at付き）
 * group_members.select("role, created_at, profiles(...)") の戻り値
 */
export type GroupMemberDetailResult = {
  role: string;
  created_at: string;
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
  } | null;
};

/**
 * ダッシュボード用支払いクエリ結果
 */
export type DashboardPaymentResult = {
  id: string;
  description: string;
  amount: number;
  payment_date: string;
  profiles: {
    display_name: string | null;
    email: string | null;
  } | null;
};

/**
 * プロフィールのクエリ結果
 */
export type ProfileResult = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_demo: boolean;
};

/**
 * グループメンバーシップ結果（Group全体を含む）
 * group_members.select("group_id, groups(*)") の戻り値
 */
export type GroupMembershipWithGroupResult<T> = {
  group_id: string;
  groups: T | null;
};

/**
 * メンバー結果（Profile全体を含む）
 * group_members.select("profiles(*)") の戻り値
 */
export type MemberWithProfileResult<T> = {
  profiles: T | null;
};

/**
 * 残高計算の結果
 */
export type Balance = {
  id: string;
  displayName: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
};

/**
 * 清算提案の結果
 */
export type SettlementSuggestion = {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
};

// ============================================================
// 支払い一覧コンポーネント用型（旧 payment-list/types.ts から移行）
// ============================================================

export type PaymentSplitRow = {
  user_id: string;
  amount: number;
  profiles: { display_name: string | null; email: string | null } | null;
};

/** PaymentRow コンポーネントが要求する基本型 */
export type PaymentRowData = {
  id: string;
  amount: number;
  description: string;
  payer_id: string;
  settlement_id: string | null;
  categories: { name: string; icon: string | null; color: string | null } | null;
  profiles: { display_name: string | null; email: string | null } | null;
  payment_splits: PaymentSplitRow[];
  groups?: { name: string } | null;
};

/** /payments ページで使用する拡張型（group_id・タイムスタンプ含む） */
export type PaymentWithRelations = PaymentRowData & {
  group_id: string;
  category_id: string | null;
  payment_date: string;
  created_at: string;
  updated_at: string;
  groups: { name: string } | null;
};
