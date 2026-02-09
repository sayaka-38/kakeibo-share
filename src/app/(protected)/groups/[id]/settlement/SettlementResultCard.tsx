"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/format/currency";
import {
  balancesToTransfers,
  calculateMyTransferBalance,
  consolidateTransfers,
} from "@/lib/settlement/consolidate";
import type { MemberBalance } from "@/lib/settlement/consolidate";
import type { Profile, NetTransfer } from "@/types/database";
import type { EntryData, SessionData } from "./SettlementSessionManager";

type SettlementResultCardProps = {
  session: SessionData;
  entries: EntryData[];
  members: Profile[];
  currentUserId: string;
  pendingTransfers?: NetTransfer[];
};

export default function SettlementResultCard({
  session,
  entries,
  members,
  currentUserId,
  pendingTransfers,
}: SettlementResultCardProps) {
  // filled 状態のエントリのみ対象
  const filledEntries = useMemo(
    () => entries.filter((e) => e.status === "filled"),
    [entries]
  );

  // 各メンバーの支払い・負担を計算
  const balances: MemberBalance[] = useMemo(() => {
    return members.map((member) => {
      const paid = filledEntries
        .filter((e) => e.payer_id === member.id)
        .reduce((sum, e) => sum + (e.actual_amount || 0), 0);

      let owed = 0;
      filledEntries.forEach((entry) => {
        const splits = entry.splits || [];
        const mySplit = splits.find((s) => s.user_id === member.id);

        if (mySplit) {
          owed += mySplit.amount;
        } else if (splits.length === 0) {
          const amount = entry.actual_amount || 0;
          const share = Math.floor(amount / members.length);
          owed += share;
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
  }, [filledEntries, members]);

  const myBalance = balances.find((b) => b.id === currentUserId);
  const totalExpense = filledEntries.reduce((sum, e) => sum + (e.actual_amount || 0), 0);

  const isConfirmed = session.status !== "draft";
  const netTransfers = session.net_transfers || [];

  const myTransferBalance: number | null =
    isConfirmed && netTransfers.length > 0
      ? calculateMyTransferBalance(netTransfers, currentUserId)
      : null;

  const entryBalance = myBalance?.balance ?? 0;
  const consolidationDiff = myTransferBalance !== null ? myTransferBalance - entryBalance : 0;
  const hasConsolidationDiff = Math.abs(consolidationDiff) > 0;
  const mainDisplayBalance = myTransferBalance !== null ? myTransferBalance : entryBalance;

  // 統合プレビュー: draft + pendingTransfers がある場合
  const hasPendingConsolidation =
    !isConfirmed && pendingTransfers && pendingTransfers.length > 0;

  const { consolidatedTransfers, myConsolidatedBalance } = useMemo(() => {
    if (!hasPendingConsolidation || !pendingTransfers) {
      return { consolidatedTransfers: null, myConsolidatedBalance: null };
    }
    const draftTransfers = balancesToTransfers(balances);
    const memberNames = new Map<string, string>();
    for (const b of balances) memberNames.set(b.id, b.name);
    for (const t of pendingTransfers) {
      memberNames.set(t.from_id, t.from_name);
      memberNames.set(t.to_id, t.to_name);
    }
    const consolidated = consolidateTransfers([draftTransfers, pendingTransfers], memberNames);
    return {
      consolidatedTransfers: consolidated.transfers,
      myConsolidatedBalance: calculateMyTransferBalance(consolidated.transfers, currentUserId),
    };
  }, [hasPendingConsolidation, pendingTransfers, balances, currentUserId]);

  if (filledEntries.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-theme-primary/10 to-theme-secondary/10 rounded-lg shadow-lg p-6 border border-theme-primary/25">
      <h3 className="text-lg font-semibold text-theme-headline mb-4 text-center">
        {hasPendingConsolidation
          ? "清算プレビュー（統合）"
          : isConfirmed
          ? "清算結果"
          : "清算プレビュー"}
      </h3>

      {/* メイン表示: 統合プレビューがあればそれを表示 */}
      {hasPendingConsolidation && consolidatedTransfers ? (
        <div className="text-center mb-6">
          {myConsolidatedBalance !== null && myConsolidatedBalance > 0 ? (
            <div>
              <p className="text-sm text-theme-muted">あなたは</p>
              <p className="text-3xl font-bold text-theme-text">
                {formatCurrency(myConsolidatedBalance)}
              </p>
              <p className="text-sm text-theme-muted">もらう</p>
            </div>
          ) : myConsolidatedBalance !== null && myConsolidatedBalance < 0 ? (
            <div>
              <p className="text-sm text-theme-muted">あなたは</p>
              <p className="text-3xl font-bold text-theme-accent">
                {formatCurrency(Math.abs(myConsolidatedBalance))}
              </p>
              <p className="text-sm text-theme-muted">支払う</p>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-theme-muted">精算なし</p>
              <p className="text-sm text-theme-muted">相殺で送金不要です</p>
            </div>
          )}
        </div>
      ) : (
        /* 通常表示: 確定済みで送金指示がある場合は送金額をメインに表示 */
        myBalance && (
          <div className="text-center mb-6">
            {mainDisplayBalance > 0 ? (
              <div>
                <p className="text-sm text-theme-muted">あなたは</p>
                <p className="text-3xl font-bold text-theme-text">
                  {formatCurrency(mainDisplayBalance)}
                </p>
                <p className="text-sm text-theme-muted">
                  {balances.find((b) => b.id !== currentUserId)
                    ? `${balances.find((b) => b.id !== currentUserId)!.name}から`
                    : "相手から"}
                  もらう
                </p>
              </div>
            ) : mainDisplayBalance < 0 ? (
              <div>
                <p className="text-sm text-theme-muted">あなたは</p>
                <p className="text-3xl font-bold text-theme-accent">
                  {formatCurrency(Math.abs(mainDisplayBalance))}
                </p>
                <p className="text-sm text-theme-muted">
                  {balances.find((b) => b.id !== currentUserId)
                    ? `${balances.find((b) => b.id !== currentUserId)!.name}に`
                    : "相手に"}
                  支払う
                </p>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-bold text-theme-muted">精算なし</p>
                <p className="text-sm text-theme-muted">
                  {isConfirmed && hasConsolidationDiff ? "相殺で送金不要です" : "お互い公平です"}
                </p>
              </div>
            )}
            {/* 統合による差額がある場合の内訳注釈 */}
            {isConfirmed && hasConsolidationDiff && mainDisplayBalance !== 0 && (
              <div className="mt-2 text-xs text-theme-muted space-y-0.5">
                <p>（今回の清算額: {formatCurrency(entryBalance, { showSign: true })} / 過去の調整: {formatCurrency(consolidationDiff, { showSign: true })}）</p>
              </div>
            )}
          </div>
        )
      )}

      {/* net_transfers 送金指示（確定済みの場合） */}
      {isConfirmed && netTransfers.length > 0 && (
        <div className="bg-theme-card-bg/80 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-theme-text mb-2 text-center">
            送金指示
          </h4>
          <div className="space-y-2">
            {netTransfers.map((transfer, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-1">
                  <span className={transfer.from_id === currentUserId ? "font-bold text-theme-accent" : "text-theme-text"}>
                    {transfer.from_name}
                  </span>
                  <span className="text-theme-muted mx-1">&rarr;</span>
                  <span className={transfer.to_id === currentUserId ? "font-bold text-theme-text" : "text-theme-text"}>
                    {transfer.to_name}
                  </span>
                </div>
                <span className="font-semibold text-theme-headline">
                  {formatCurrency(transfer.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 統合プレビュー: 計算の内訳 */}
      {hasPendingConsolidation && myBalance && (
        <div className="bg-theme-card-bg/80 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-theme-text mb-2 text-center">
            計算の内訳
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-theme-muted">今回の差額</span>
              <span className={
                myBalance.balance > 0
                  ? "font-medium text-theme-text"
                  : myBalance.balance < 0
                  ? "font-medium text-theme-accent"
                  : "font-medium text-theme-muted"
              }>
                {formatCurrency(myBalance.balance, { showSign: true })}
              </span>
            </div>
            {pendingTransfers && (() => {
              const pendingBalance = calculateMyTransferBalance(pendingTransfers, currentUserId);
              return (
                <div className="flex justify-between">
                  <span className="text-theme-muted">前回の送金残高</span>
                  <span className={
                    pendingBalance > 0
                      ? "font-medium text-theme-text"
                      : pendingBalance < 0
                      ? "font-medium text-theme-accent"
                      : "font-medium text-theme-muted"
                  }>
                    {formatCurrency(pendingBalance, { showSign: true })}
                  </span>
                </div>
              );
            })()}
            <div className="border-t border-theme-card-border pt-2 flex justify-between font-medium">
              <span className="text-theme-text">最終送金額</span>
              <span className={
                myConsolidatedBalance !== null && myConsolidatedBalance > 0
                  ? "text-theme-text"
                  : myConsolidatedBalance !== null && myConsolidatedBalance < 0
                  ? "text-theme-accent"
                  : "text-theme-muted"
              }>
                {myConsolidatedBalance !== null
                  ? formatCurrency(myConsolidatedBalance, { showSign: true })
                  : formatCurrency(0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 計算根拠 */}
      <div className="bg-theme-card-bg/60 rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-theme-muted">期間の総支出</span>
          <span className="font-medium text-theme-headline">{formatCurrency(totalExpense)}</span>
        </div>

        {myBalance && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-theme-muted">あなたの支払い</span>
              <span className="font-medium text-theme-primary-text">
                {formatCurrency(myBalance.paid)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-theme-muted">あなたの負担分</span>
              <span className="font-medium text-theme-headline">
                {formatCurrency(myBalance.owed)}
              </span>
            </div>
            <div className="border-t border-theme-card-border pt-2 flex justify-between text-sm font-medium">
              <span className="text-theme-text">差額</span>
              <span
                className={
                  myBalance.balance > 0
                    ? "text-theme-text"
                    : myBalance.balance < 0
                    ? "text-theme-accent"
                    : "text-theme-muted"
                }
              >
                {formatCurrency(myBalance.balance, { showSign: true })}
              </span>
            </div>
          </>
        )}
      </div>

      {/* 期間情報 */}
      <div className="mt-4 text-center text-xs text-theme-muted">
        {session.period_start} 〜 {session.period_end}
      </div>
    </div>
  );
}
