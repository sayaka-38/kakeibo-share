"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { Profile, Category, NetTransfer } from "@/types/database";
import PeriodSelector from "./PeriodSelector";
import SettlementEntryList from "./SettlementEntryList";
import PendingPaymentView from "./PendingPaymentView";

type SessionData = {
  id: string;
  group_id: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by: string;
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  net_transfers: NetTransfer[] | null;
  is_zero_settlement: boolean;
  payment_reported_at: string | null;
  payment_reported_by: string | null;
  settled_at: string | null;
  settled_by: string | null;
};

type SuggestionData = {
  suggestedStart: string | null;
  suggestedEnd: string | null;
  oldestUnsettledDate: string | null;
  lastConfirmedEnd: string | null;
  unsettledCount: number;
};

type EntryData = {
  id: string;
  session_id: string;
  rule_id: string | null;
  payment_id: string | null;
  description: string;
  category_id: string | null;
  expected_amount: number | null;
  actual_amount: number | null;
  payer_id: string;
  payment_date: string;
  status: string;
  split_type: string;
  entry_type: string;
  filled_by: string | null;
  filled_at: string | null;
  source_payment_id: string | null;
  category?: { id: string; name: string; icon: string | null; color: string | null } | null;
  payer?: { id: string; display_name: string | null; email: string } | null;
  splits?: { id: string; user_id: string; amount: number; user?: Profile | null }[];
};

type SettlementSessionManagerProps = {
  groupId: string;
  currentUserId: string;
  members: Profile[];
  categories: Category[];
  existingSession: SessionData | null;
  pendingSession?: SessionData | null;
  suggestion: SuggestionData | null;
};

export default function SettlementSessionManager({
  groupId,
  currentUserId,
  members,
  categories,
  existingSession,
  pendingSession,
  suggestion,
}: SettlementSessionManagerProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(existingSession);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pending セッション用の state
  const [pendingSessionState, setPendingSessionState] = useState<SessionData | null>(pendingSession ?? null);
  const [pendingIsLoading, setPendingIsLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // pending transfers を抽出
  const pendingTransfers: NetTransfer[] = pendingSessionState?.net_transfers || [];

  // セッション詳細を取得
  const fetchSessionDetails = async (sessionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${sessionId}`);
      if (!res.ok) {
        setError(t("settlementSession.errors.fetchFailed"));
        return;
      }

      const data = await res.json();
      setSession(data.session);
      setEntries(data.entries || []);
      setStats(data.stats || { total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 });
    } catch {
      setError(t("settlementSession.errors.fetchFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // pending セッション詳細を取得
  const fetchPendingSessionDetails = async (sessionId: string) => {
    setPendingIsLoading(true);
    setPendingError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${sessionId}`);
      if (!res.ok) {
        setPendingError(t("settlementSession.errors.fetchFailed"));
        return;
      }

      const data = await res.json();
      setPendingSessionState(data.session);
    } catch {
      setPendingError(t("settlementSession.errors.fetchFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  };

  // 既存セッションがあれば詳細を取得
  useEffect(() => {
    if (existingSession) {
      fetchSessionDetails(existingSession.id);
    }
  }, [existingSession]);

  // pending セッションがあれば詳細を取得
  useEffect(() => {
    if (pendingSession) {
      fetchPendingSessionDetails(pendingSession.id);
    }
  }, [pendingSession]);

  // セッション作成
  const handleCreateSession = async (periodStart: string, periodEnd: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/settlement-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, periodStart, periodEnd }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.createFailed"));
        return;
      }

      const data = await res.json();

      // RPC エラーがあった場合は警告表示
      if (data.rpcError || data.rpcErrorCode) {
        console.warn("[handleCreateSession] RPC error:", data.rpcError || data.rpcErrorMessage);
      }

      setSession(data.session);
      await fetchSessionDetails(data.session.id);
    } catch {
      setError(t("settlementSession.errors.createFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // セッション削除
  const handleDeleteSession = async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${session.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.deleteFailed"));
        return;
      }

      setSession(null);
      setEntries([]);
      setStats({ total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 });
    } catch {
      setError(t("settlementSession.errors.deleteFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // エントリ更新後のコールバック
  const handleEntryUpdated = (updatedEntry: EntryData) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
    );
    // stats を再計算
    setStats(() => {
      const newEntries = entries.map((e) =>
        e.id === updatedEntry.id ? updatedEntry : e
      );
      return {
        total: newEntries.length,
        pending: newEntries.filter((e) => e.status === "pending").length,
        filled: newEntries.filter((e) => e.status === "filled").length,
        skipped: newEntries.filter((e) => e.status === "skipped").length,
        totalAmount: newEntries
          .filter((e) => e.status === "filled")
          .reduce((sum, e) => sum + (e.actual_amount || 0), 0),
      };
    });
  };

  // 清算確定 → pending_payment or settled（0円清算）
  const handleConfirm = async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${session.id}/confirm`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.confirmFailed"));
        return;
      }

      const data = await res.json();

      // 確定後のセッション情報で更新
      if (data.session) {
        setSession(data.session);

        // 0円清算（即settled）の場合は履歴詳細ページへリダイレクト
        if (data.session.status === "settled") {
          router.push(`/groups/${groupId}/settlement/history/${session.id}`);
          router.refresh();
        }
        // pending_payment の場合: session を pending に移動し、draft をクリア
        if (data.session.status === "pending_payment") {
          setPendingSessionState(data.session);
          setSession(null);
          setEntries([]);
          setStats({ total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 });
          // Server Component を再実行して suggestion（未清算件数）を最新化
          router.refresh();
        }
      } else {
        // フォールバック: セッション詳細を再取得
        await fetchSessionDetails(session.id);
      }
    } catch {
      setError(t("settlementSession.errors.confirmFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 送金完了報告
  const handleReportPayment = async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${pendingSessionState.id}/report-payment`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPendingError(data.error || t("settlementSession.errors.reportPaymentFailed"));
        return;
      }

      // セッション情報を再取得
      await fetchPendingSessionDetails(pendingSessionState.id);
    } catch {
      setPendingError(t("settlementSession.errors.reportPaymentFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  };

  // 受取確認 → 清算完了
  const handleConfirmReceipt = async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);

    try {
      const res = await fetch(`/api/settlement-sessions/${pendingSessionState.id}/confirm-receipt`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPendingError(data.error || t("settlementSession.errors.confirmReceiptFailed"));
        return;
      }

      // 清算完了 → 履歴詳細ページへリダイレクト
      const completedSessionId = pendingSessionState.id;
      setPendingSessionState(null);
      router.push(`/groups/${groupId}/settlement/history/${completedSessionId}`);
      router.refresh();
    } catch {
      setPendingError(t("settlementSession.errors.confirmReceiptFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  };

  // 未清算件数（pending セッションの期間外の未清算）
  const hasNewUnsettled = suggestion && suggestion.unsettledCount > 0;

  // draft 状態で期間が古い場合の警告
  const hasStalePeriod =
    session?.status === "draft" &&
    suggestion?.suggestedEnd &&
    session.period_end < suggestion.suggestedEnd;

  return (
    <>
      {/* ================================================================
          Scenario 2: pending + draft → compact consolidation banner
          ================================================================ */}
      {pendingSessionState && session && pendingTransfers.length > 0 && (
        <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-theme-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <h3 className="text-sm font-semibold text-theme-headline">
              前回の送金待ち
            </h3>
          </div>
          <div className="space-y-1 mb-2">
            {pendingTransfers.map((transfer, i) => (
              <p key={i} className="text-xs text-theme-text">
                {transfer.from_name} → {transfer.to_name}: {formatCurrency(transfer.amount)}
              </p>
            ))}
          </div>
          <p className="text-xs text-theme-muted">
            確定時に相殺されます
          </p>
        </div>
      )}

      {/* ================================================================
          Scenario 1: pending のみ (no draft) → compact PendingPaymentView
          ================================================================ */}
      {pendingSessionState && !session && (
        <div className="mb-6">
          <PendingPaymentView
            session={pendingSessionState}
            members={members}
            currentUserId={currentUserId}
            isLoading={pendingIsLoading}
            error={pendingError}
            onReportPayment={handleReportPayment}
            onConfirmReceipt={handleConfirmReceipt}
          />

          {/* 新しい未清算がある場合のセパレーター */}
          {hasNewUnsettled && (
            <div className="mt-6 border-t border-theme-card-border pt-6">
              <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-theme-headline mb-1">
                  新しい未清算の支払いがあります
                </h3>
                <p className="text-xs text-theme-muted">
                  送金待ちの清算とは別に、{suggestion!.unsettledCount}件の未清算の支払いがあります。
                  新しい清算を作成して相殺できます。
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================
          Draft session or PeriodSelector
          ================================================================ */}
      {session ? (
        <>
          {hasStalePeriod && (
            <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-theme-headline">
                期間外に新しい支払いがあります
              </p>
              <p className="text-xs text-theme-muted mt-1">
                このセッションの期間（〜{session.period_end}）以降に未清算の支払いがあります。
                セッションを削除して再作成すると、最新の支払い（〜{suggestion?.suggestedEnd}）まで含まれます。
              </p>
            </div>
          )}
          <SettlementEntryList
            session={session}
            entries={entries}
            stats={stats}
            members={members}
            categories={categories}
            currentUserId={currentUserId}
            isLoading={isLoading}
            error={error}
            pendingTransfers={pendingTransfers.length > 0 ? pendingTransfers : undefined}
            onEntryUpdated={handleEntryUpdated}
            onConfirm={handleConfirm}
            onDelete={handleDeleteSession}
          />
        </>
      ) : (
        <PeriodSelector
          suggestion={suggestion}
          onSubmit={handleCreateSession}
          isLoading={isLoading}
          error={error}
        />
      )}

      {/* ================================================================
          Scenario 2: pending + draft → 最下部に控えめな送金操作ボタン
          ================================================================ */}
      {pendingSessionState && session && (
        <div className="mt-4 bg-theme-card-bg rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-theme-muted">
              前回の清算（{pendingSessionState.period_start} 〜 {pendingSessionState.period_end}）
            </p>
            <div className="flex gap-2">
              {(() => {
                const transfers = pendingSessionState.net_transfers || [];
                const isPayer = transfers.some((tr) => tr.from_id === currentUserId);
                const isRecipient = transfers.some((tr) => tr.to_id === currentUserId);
                const hasReported = !!pendingSessionState.payment_reported_at;

                return (
                  <>
                    {isPayer && !hasReported && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReportPayment}
                        loading={pendingIsLoading}
                      >
                        {t("settlementSession.pendingPayment.reportPayment")}
                      </Button>
                    )}
                    {isRecipient && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleConfirmReceipt}
                        loading={pendingIsLoading}
                        disabled={!hasReported}
                      >
                        {t("settlementSession.pendingPayment.confirmReceipt")}
                      </Button>
                    )}
                    {isPayer && hasReported && !isRecipient && (
                      <span className="text-xs text-theme-muted py-2">
                        {t("settlementSession.pendingPayment.waitingForRecipient")}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          {pendingError && (
            <div className="mt-2 bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-3 py-2 rounded text-xs">
              {pendingError}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export type { SessionData, EntryData, SuggestionData };
