"use client";

import { formatCurrency } from "@/lib/format/currency";
import type { Profile } from "@/types/database";
import type { EntryData, SessionData } from "./SettlementSessionManager";

type SettlementResultCardProps = {
  session: SessionData;
  entries: EntryData[];
  members: Profile[];
  currentUserId: string;
};

type MemberBalance = {
  id: string;
  name: string;
  paid: number; // 支払った金額
  owed: number; // 負担すべき金額
  balance: number; // paid - owed（プラスならもらう、マイナスなら支払う）
};

export default function SettlementResultCard({
  session,
  entries,
  members,
  currentUserId,
}: SettlementResultCardProps) {
  // filled 状態のエントリのみ対象
  const filledEntries = entries.filter((e) => e.status === "filled");

  if (filledEntries.length === 0) {
    return null;
  }

  // 各メンバーの支払い・負担を計算
  const balances: MemberBalance[] = members.map((member) => {
    // 支払った金額（payer_id が自分のエントリの actual_amount 合計）
    const paid = filledEntries
      .filter((e) => e.payer_id === member.id)
      .reduce((sum, e) => sum + (e.actual_amount || 0), 0);

    // 負担すべき金額（splits から計算、なければ均等割り）
    let owed = 0;
    filledEntries.forEach((entry) => {
      const splits = entry.splits || [];
      const mySplit = splits.find((s) => s.user_id === member.id);

      if (mySplit) {
        // カスタム分割
        owed += mySplit.amount;
      } else if (splits.length === 0) {
        // 均等割り（splits がない場合）
        const amount = entry.actual_amount || 0;
        const share = Math.floor(amount / members.length);
        owed += share;
        // 端数は payer が負担
        if (entry.payer_id === member.id) {
          owed += amount - share * members.length;
        }
      }
    });

    return {
      id: member.id,
      name: member.display_name || member.email || "Unknown",
      paid,
      owed,
      balance: paid - owed,
    };
  });

  // 自分のバランス
  const myBalance = balances.find((b) => b.id === currentUserId);
  // 相手のバランス（2人グループの場合）
  const otherBalance = balances.find((b) => b.id !== currentUserId);

  // 総支出
  const totalExpense = filledEntries.reduce(
    (sum, e) => sum + (e.actual_amount || 0),
    0
  );

  // 確定済みかどうか
  const isConfirmed = session.status === "confirmed";

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border border-blue-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
        {isConfirmed ? "清算結果" : "清算プレビュー"}
      </h3>

      {/* 相殺結果（メイン表示） */}
      {myBalance && (
        <div className="text-center mb-6">
          {myBalance.balance > 0 ? (
            <div>
              <p className="text-sm text-gray-600">あなたは</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(myBalance.balance)}
              </p>
              <p className="text-sm text-gray-600">
                {otherBalance ? `${otherBalance.name}から` : "相手から"}もらう
              </p>
            </div>
          ) : myBalance.balance < 0 ? (
            <div>
              <p className="text-sm text-gray-600">あなたは</p>
              <p className="text-3xl font-bold text-red-600">
                {formatCurrency(Math.abs(myBalance.balance))}
              </p>
              <p className="text-sm text-gray-600">
                {otherBalance ? `${otherBalance.name}に` : "相手に"}支払う
              </p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-gray-600">精算なし</p>
              <p className="text-sm text-gray-500">お互い公平です</p>
            </div>
          )}
        </div>
      )}

      {/* 計算根拠 */}
      <div className="bg-white/60 rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">期間の総支出</span>
          <span className="font-medium">{formatCurrency(totalExpense)}</span>
        </div>

        {myBalance && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">あなたの支払い</span>
              <span className="font-medium text-blue-600">
                {formatCurrency(myBalance.paid)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">あなたの負担分</span>
              <span className="font-medium text-gray-900">
                {formatCurrency(myBalance.owed)}
              </span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-medium">
              <span className="text-gray-700">差額</span>
              <span
                className={
                  myBalance.balance > 0
                    ? "text-green-600"
                    : myBalance.balance < 0
                    ? "text-red-600"
                    : "text-gray-600"
                }
              >
                {formatCurrency(myBalance.balance, { showSign: true })}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 期間情報 */}
      <div className="mt-4 text-center text-xs text-gray-500">
        {session.period_start} 〜 {session.period_end}
      </div>
    </div>
  );
}
