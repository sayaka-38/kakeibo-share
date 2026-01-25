/**
 * 清算ロジックモジュール
 *
 * 使い方:
 * ```typescript
 * import { calculateBalances, suggestSettlements } from "@/lib/settlement";
 *
 * const balances = calculateBalances(members, payments);
 * const { settlements, unsettledRemainder } = suggestSettlements(balances);
 * ```
 */

// 端数処理
export { floorToYen, splitEqually, type SplitResult } from "./rounding";

// 残高計算（エクセル方式: 全支払い合計後に1回だけ切り捨て）
export {
  calculateBalances,
  type Member,
  type Payment,
  type Balance,
} from "./calculate-balances";

// 清算提案
export {
  suggestSettlements,
  type SettlementSuggestion,
  type SettlementResult,
} from "./suggest-settlements";
