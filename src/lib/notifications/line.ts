/**
 * LINE通知の器（スタブ）
 *
 * 将来の拡張で LINE Messaging API と接続する。
 * 現時点では console.log で出力するのみ。
 *
 * 想定される通知タイプ:
 * - "settlement_confirmed": 清算確定時（pending_payment 開始）
 * - "payment_reported": 送金完了報告時
 * - "settlement_completed": 清算完了時（settled）
 * - "entry_filled": エントリ入力完了時（片方の入力完了）
 */

export type LineNotificationType =
  | "settlement_confirmed"
  | "payment_reported"
  | "settlement_completed"
  | "entry_filled";

/**
 * LINE通知を送信する（現時点ではスタブ）
 *
 * @param type - 通知タイプ
 * @param data - 通知データ（型は将来的に厳密化する）
 */
export async function sendLineNotification(
  type: string,
  data: Record<string, unknown>
): Promise<void> {
  console.log(`[LINE通知] type: ${type}, data:`, JSON.stringify(data));
}
