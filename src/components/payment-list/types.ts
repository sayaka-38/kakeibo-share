/**
 * Shared types for payment list components
 */

export type PaymentSplitRow = {
  user_id: string;
  amount: number;
  profiles: { display_name: string | null; email: string | null } | null;
};

/** Base payment data required by PaymentRow */
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

/** Extended type for /payments page (includes group, timestamps) */
export type PaymentWithRelations = PaymentRowData & {
  group_id: string;
  category_id: string | null;
  payment_date: string;
  created_at: string;
  updated_at: string;
  groups: { name: string } | null;
};
