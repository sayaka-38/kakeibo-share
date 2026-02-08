"use client";

import { formatCurrency } from "@/lib/format/currency";
import { consolidateTransfers } from "@/lib/settlement/consolidate";
import type { Profile, NetTransfer } from "@/types/database";
import type { EntryData, SessionData } from "./SettlementSessionManager";

type SettlementResultCardProps = {
  session: SessionData;
  entries: EntryData[];
  members: Profile[];
  currentUserId: string;
  pendingTransfers?: NetTransfer[];
};

type MemberBalance = {
  id: string;
  name: string;
  paid: number; // 支払った金額
  owed: number; // 負担すべき金額
  balance: number; // paid - owed（プラスならもらう、マイナスなら支払う）
};

/**
 * balances からグリーディマッチングで transfers を導出
 */
function balancesToTransfers(
  balances: MemberBalance[]
): NetTransfer[] {
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ id: b.id, name: b.name, amount: -b.balance }));
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ id: b.id, name: b.name, amount: b.balance }));

  const result: NetTransfer[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const settleAmount = Math.min(debtors[dIdx].amount, creditors[cIdx].amount);

    if (settleAmount > 0) {
      result.push({
        from_id: debtors[dIdx].id,
        from_name: debtors[dIdx].name,
        to_id: creditors[cIdx].id,
        to_name: creditors[cIdx].name,
        amount: settleAmount,
      });
    }

    debtors[dIdx].amount -= settleAmount;
    creditors[cIdx].amount -= settleAmount;

    if (debtors[dIdx].amount <= 0) dIdx++;
    if (creditors[cIdx].amount <= 0) cIdx++;
  }

  return result;
}

export default function SettlementResultCard({
  session,
  entries,
  members,
  currentUserId,
  pendingTransfers,
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

  // 総支出
  const totalExpense = filledEntries.reduce(
    (sum, e) => sum + (e.actual_amount || 0),
    0
  );

  // 確定済みかどうか（pending_payment, settled, confirmed を含む）
  const isConfirmed = session.status !== "draft";

  // net_transfers がセッションに保存されている場合はそれを使用
  const netTransfers = session.net_transfers || [];

  // 確定済み + net_transfers がある場合、送金指示ベースの自分のバランスを計算
  let myTransferBalance: number | null = null;
  if (isConfirmed && netTransfers.length > 0) {
    let bal = 0;
    for (const tr of netTransfers) {
      if (tr.to_id === currentUserId) bal += tr.amount;
      if (tr.from_id === currentUserId) bal -= tr.amount;
    }
    myTransferBalance = bal;
  }

  // エントリベースと送金指示ベースの差（統合による調整額）
  const entryBalance = myBalance?.balance ?? 0;
  const consolidationDiff = myTransferBalance !== null ? myTransferBalance - entryBalance : 0;
  const hasConsolidationDiff = Math.abs(consolidationDiff) > 0;

  // 確定済みで送金指示がある場合はそちらをメイン表示額にする
  const mainDisplayBalance = myTransferBalance !== null ? myTransferBalance : entryBalance;

  // 統合プレビュー: draft + pendingTransfers がある場合
  const hasPendingConsolidation =
    !isConfirmed && pendingTransfers && pendingTransfers.length > 0;
  let consolidatedTransfers: NetTransfer[] | null = null;
  let myConsolidatedBalance: number | null = null;

  if (hasPendingConsolidation) {
    const draftTransfers = balancesToTransfers(balances);
    const memberNames = new Map<string, string>();
    for (const b of balances) {
      memberNames.set(b.id, b.name);
    }
    for (const t of pendingTransfers) {
      memberNames.set(t.from_id, t.from_name);
      memberNames.set(t.to_id, t.to_name);
    }

    const consolidated = consolidateTransfers(
      [draftTransfers, pendingTransfers],
      memberNames
    );
    consolidatedTransfers = consolidated.transfers;

    // 統合後の自分のバランスを計算
    let balance = 0;
    for (const t of consolidatedTransfers) {
      if (t.from_id === currentUserId) balance -= t.amount;
      if (t.to_id === currentUserId) balance += t.amount;
    }
    myConsolidatedBalance = balance;
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
              let pendingBalance = 0;
              for (const t of pendingTransfers) {
                if (t.from_id === currentUserId) pendingBalance -= t.amount;
                if (t.to_id === currentUserId) pendingBalance += t.amount;
              }
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
              <span className="font-medium text-theme-primary">
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
