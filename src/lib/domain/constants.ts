/**
 * ドメイン定数
 *
 * アプリ全体で使用するステータス・タイプ文字列をここに集約する。
 * 生文字列リテラルの代わりに必ずこれらの定数を参照すること。
 */

// =============================================================================
// 清算セッション ステータス
// =============================================================================

export const SESSION_STATUS = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  PENDING_PAYMENT: "pending_payment",
  SETTLED: "settled",
} as const;

export const SESSION_STATUS_VALUES = [
  SESSION_STATUS.DRAFT,
  SESSION_STATUS.CONFIRMED,
  SESSION_STATUS.PENDING_PAYMENT,
  SESSION_STATUS.SETTLED,
] as const;

export type SessionStatus = (typeof SESSION_STATUS_VALUES)[number];

// =============================================================================
// 清算エントリ ステータス
// =============================================================================

export const ENTRY_STATUS = {
  PENDING: "pending",
  FILLED: "filled",
  SKIPPED: "skipped",
} as const;

export const ENTRY_STATUS_VALUES = [
  ENTRY_STATUS.PENDING,
  ENTRY_STATUS.FILLED,
  ENTRY_STATUS.SKIPPED,
] as const;

export type EntryStatus = (typeof ENTRY_STATUS_VALUES)[number];

// =============================================================================
// 清算エントリ 分割タイプ
// =============================================================================

export const ENTRY_SPLIT_TYPE = {
  EQUAL: "equal",
  CUSTOM: "custom",
} as const;

export const ENTRY_SPLIT_TYPE_VALUES = [
  ENTRY_SPLIT_TYPE.EQUAL,
  ENTRY_SPLIT_TYPE.CUSTOM,
] as const;

export type EntrySplitType = (typeof ENTRY_SPLIT_TYPE_VALUES)[number];

// =============================================================================
// 支払い・固定費ルール 分割タイプ
// =============================================================================

export const PAYMENT_SPLIT_TYPE = {
  EQUAL: "equal",
  RATIO: "ratio",
  PROXY: "proxy",
} as const;

export const PAYMENT_SPLIT_TYPE_VALUES = [
  PAYMENT_SPLIT_TYPE.EQUAL,
  PAYMENT_SPLIT_TYPE.RATIO,
  PAYMENT_SPLIT_TYPE.PROXY,
] as const;

export type PaymentSplitType = (typeof PAYMENT_SPLIT_TYPE_VALUES)[number];
