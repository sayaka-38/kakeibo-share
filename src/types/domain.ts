import type { Profile, NetTransfer } from "./database";

// =============================================================================
// 共通参照型
// =============================================================================

/** カテゴリの軽量参照型（JOIN結果の部分選択） */
export type CategoryRef = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

/** メンバーの軽量参照型（JOIN結果の部分選択） */
export type MemberRef = {
  id: string;
  display_name: string | null;
  email: string | null;
};

// =============================================================================
// Settlement Session / Entry 型
// =============================================================================

export type SessionData = {
  id: string;
  group_id: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by: string;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  net_transfers: NetTransfer[] | null;
  is_zero_settlement: boolean;
  payment_reported_at: string | null;
  payment_reported_by: string | null;
  settled_at: string | null;
  settled_by: string | null;
};

export type SuggestionData = {
  suggestedStart: string | null;
  suggestedEnd: string | null;
  oldestUnsettledDate: string | null;
  lastConfirmedEnd: string | null;
  unsettledCount: number;
};

export type EntryData = {
  id: string;
  session_id: string;
  rule_id: string | null;
  payment_id: string | null;
  description: string;
  category_id: string | null;
  expected_amount: number | null;
  actual_amount: number | null;
  payer_id: string;
  payment_date: string;
  status: string;
  split_type: string;
  entry_type: string;
  filled_by: string | null;
  filled_at: string | null;
  source_payment_id: string | null;
  category?: CategoryRef | null;
  payer?: MemberRef | null;
  splits?: { id: string; user_id: string; amount: number; user?: Profile | null }[];
};

// =============================================================================
// Recurring Rule 型
// =============================================================================

export type RuleWithRelations = {
  id: string;
  group_id: string;
  category_id: string | null;
  description: string;
  default_amount: number | null;
  is_variable: boolean;
  day_of_month: number;
  default_payer_id: string;
  split_type: string;
  is_active: boolean;
  interval_months: number;
  start_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
  category: CategoryRef | null;
  default_payer: MemberRef | null;
  splits: {
    id: string;
    user_id: string;
    amount: number | null;
    percentage: number | null;
    user: MemberRef | null;
  }[];
};
