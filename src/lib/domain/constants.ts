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

// =============================================================================
// 表示メタデータレジストリ（Part 21）
//
// ステータス・タイプごとの表示設定（Tailwind クラス・i18n キー）を一元管理する。
// コンポーネント内のインライン判定をこのレジストリ参照に置き換えること。
// =============================================================================

/** 清算エントリ ステータス → 表示設定マップ */
export const ENTRY_STATUS_META: Record<
  EntryStatus,
  { borderClass: string; i18nKey: string }
> = {
  [ENTRY_STATUS.PENDING]: {
    borderClass: "border-l-theme-primary bg-theme-primary/5",
    i18nKey: "settlementSession.statusPending",
  },
  [ENTRY_STATUS.FILLED]: {
    borderClass: "border-l-theme-text",
    i18nKey: "settlementSession.statusFilled",
  },
  [ENTRY_STATUS.SKIPPED]: {
    borderClass: "border-l-theme-muted bg-theme-bg",
    i18nKey: "settlementSession.statusSkipped",
  },
} as const;

/** 清算エントリ タイプ → i18n キーマップ */
export const ENTRY_TYPE_I18N: Record<string, string> = {
  rule: "settlementSession.entryTypeRule",
  manual: "settlementSession.entryTypeManual",
  existing: "settlementSession.entryTypeExisting",
} as const;

/** 清算セッション ステータス → 表示設定マップ */
export const SESSION_STATUS_META: Record<
  SessionStatus,
  { badgeClass: string; i18nKey: string }
> = {
  [SESSION_STATUS.DRAFT]: {
    badgeClass: "bg-theme-primary/10 text-theme-primary-text",
    i18nKey: "settlementSession.statusDraft",
  },
  [SESSION_STATUS.CONFIRMED]: {
    badgeClass: "bg-theme-text/10 text-theme-text",
    i18nKey: "settlementSession.statusConfirmed",
  },
  [SESSION_STATUS.PENDING_PAYMENT]: {
    badgeClass: "bg-theme-primary/15 text-theme-primary-text",
    i18nKey: "settlementSession.statusPendingPayment",
  },
  [SESSION_STATUS.SETTLED]: {
    badgeClass: "bg-theme-muted/10 text-theme-muted",
    i18nKey: "settlementSession.statusSettled",
  },
} as const;
