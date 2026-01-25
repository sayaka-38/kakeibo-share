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

// 残高計算
export {
  calculateBalances,
  type Member,
  type Payment,
  type PaymentSplit,
  type Balance,
} from "./calculate-balances";

// 清算提案
export {
  suggestSettlements,
  type SettlementSuggestion,
  type SettlementResult,
} from "./suggest-settlements";
