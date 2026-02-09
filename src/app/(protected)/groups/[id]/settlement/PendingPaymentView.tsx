"use client";

import { formatCurrency } from "@/lib/format/currency";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/types/database";
import type { SessionData } from "./SettlementSessionManager";

type PendingPaymentViewProps = {
  session: SessionData;
  members: Profile[];
  currentUserId: string;
  isLoading: boolean;
  error: string | null;
  onReportPayment: () => Promise<void>;
  onConfirmReceipt: () => Promise<void>;
};

export default function PendingPaymentView({
  session,
  members,
  currentUserId,
  isLoading,
  error,
  onReportPayment,
  onConfirmReceipt,
}: PendingPaymentViewProps) {
  const transfers = session.net_transfers || [];
  const hasReported = !!session.payment_reported_at;
  const reporterName = session.payment_reported_by
    ? members.find((m) => m.id === session.payment_reported_by)?.display_name ||
      members.find((m) => m.id === session.payment_reported_by)?.email ||
      "Unknown"
    : null;

  // 自分が送金する側か受取る側かを判定
  const myTransferOut = transfers.find((tr) => tr.from_id === currentUserId);
  const myTransferIn = transfers.find((tr) => tr.to_id === currentUserId);
  const isPayer = !!myTransferOut;
  const isRecipient = !!myTransferIn;

  // 送金報告日時のフォーマット（suppressHydrationWarning で S/C 差異を許容）
  const reportedTimeStr = session.payment_reported_at
    ? new Date(session.payment_reported_at).toLocaleString("ja-JP")
    : "";

  return (
    <div className="bg-theme-card-bg rounded-lg shadow p-4 space-y-4">
      {/* ヘッダー: ステータス + 期間 (コンパクト) */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-theme-primary/15 rounded-full flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-theme-primary-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 className="font-medium text-theme-headline">
            {t("settlementSession.pendingPayment.title")}
          </h2>
          <p className="text-xs text-theme-muted">
            {session.period_start} 〜 {session.period_end}
          </p>
        </div>
      </div>

      {/* 送金指示 (インライン) */}
      {transfers.length > 0 && (
        <div className="space-y-2">
          {transfers.map((transfer, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-theme-bg rounded-lg p-3"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-theme-text">
                  {transfer.from_name}
                </span>
                <svg className="w-4 h-4 text-theme-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span className="font-medium text-theme-text">
                  {transfer.to_name}
                </span>
              </div>
              <span className="text-lg font-bold text-theme-headline">
                {formatCurrency(transfer.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 送金報告済みバナー */}
      {hasReported && (
        <div className="bg-theme-text/10 border border-theme-text/20 rounded-lg p-3 text-center">
          <p className="text-sm text-theme-text">
            {reporterName
              ? t("settlementSession.pendingPayment.reportedBy", { name: reporterName })
              : t("settlementSession.pendingPayment.reported")}
          </p>
          {reportedTimeStr && (
            <p className="text-xs text-theme-muted mt-1" suppressHydrationWarning>
              {reportedTimeStr}
            </p>
          )}
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* アクションボタン (secondary スタイル) */}
      <div className="flex gap-2">
        {/* 送金側: まだ報告してなければ「送金完了」ボタン */}
        {isPayer && !hasReported && (
          <Button
            variant="secondary"
            onClick={onReportPayment}
            fullWidth
            loading={isLoading}
          >
            {isLoading
              ? t("settlementSession.pendingPayment.reporting")
              : t("settlementSession.pendingPayment.reportPayment")}
          </Button>
        )}

        {/* 受取側: 「受取確認」ボタン */}
        {isRecipient && (
          <Button
            variant="secondary"
            onClick={onConfirmReceipt}
            fullWidth
            loading={isLoading}
            disabled={!hasReported}
          >
            {isLoading
              ? t("settlementSession.pendingPayment.confirming")
              : t("settlementSession.pendingPayment.confirmReceipt")}
          </Button>
        )}

        {/* 送金報告済みの場合の説明 */}
        {isPayer && hasReported && !isRecipient && (
          <p className="text-sm text-center text-theme-muted w-full py-2">
            {t("settlementSession.pendingPayment.waitingForRecipient")}
          </p>
        )}

        {/* 安全装置: どちらでもない場合 */}
        {!isPayer && !isRecipient && transfers.length > 0 && (
          <Button
            variant="secondary"
            onClick={onConfirmReceipt}
            fullWidth
            loading={isLoading}
          >
            {t("settlementSession.pendingPayment.confirmReceipt")}
          </Button>
        )}
      </div>
    </div>
  );
}
