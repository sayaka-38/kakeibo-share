"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { Profile, Category, NetTransfer } from "@/types/database";
import PeriodSelector from "./PeriodSelector";
import SettlementEntryList from "./SettlementEntryList";
import PendingPaymentView from "./PendingPaymentView";
import { useSettlementSession } from "./useSettlementSession";

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
  payer?: { id: string; display_name: string | null; email: string | null } | null;
  splits?: { id: string; user_id: string; amount: number; user?: Profile | null }[];
};

type SettlementSessionManagerProps = {
  groupId: string;
  currentUserId: string;
  members: Profile[];
  categories: Category[];
  existingSession: SessionData | null;
  allDraftSessions?: SessionData[];
  pendingSession?: SessionData | null;
  suggestion: SuggestionData | null;
};

export default function SettlementSessionManager({
  groupId,
  currentUserId,
  members,
  categories,
  existingSession,
  allDraftSessions = [],
  pendingSession,
  suggestion,
}: SettlementSessionManagerProps) {
  const {
    session,
    entries,
    stats,
    isLoading,
    error,
    pendingSessionState,
    pendingIsLoading,
    pendingError,
    pendingTransfers,
    hasNewUnsettled,
    hasStalePeriod,
    handleCreateSession,
    handleDeleteSession,
    handleEntryUpdated,
    handleConfirm,
    handleReportPayment,
    handleConfirmReceipt,
    handleSelectSession,
    handleRefresh,
  } = useSettlementSession({ groupId, existingSession, pendingSession, suggestion });

  // Local draft list — optimistically updated on create / delete
  const [localDraftSessions, setLocalDraftSessions] = useState<SessionData[]>(allDraftSessions);
  // true while the user wants to create a new period (shows PeriodSelector even if a draft is active)
  const [isCreating, setIsCreating] = useState(false);

  // Keep local list in sync with SSR prop (e.g. after router.refresh)
  useEffect(() => {
    setLocalDraftSessions(allDraftSessions);
  }, [allDraftSessions]);

  // When a session is created, append it to the local list (if not already present)
  const sessionId = session?.id;
  useEffect(() => {
    if (!session || !sessionId) return;
    setLocalDraftSessions((prev) => {
      if (prev.some((d) => d.id === sessionId)) return prev;
      return [...prev, session].sort((a, b) =>
        a.period_start.localeCompare(b.period_start)
      );
    });
  }, [session, sessionId]);

  // Wrapper: create new session, then exit creating mode
  const handleCreate = useCallback(
    async (periodStart: string, periodEnd: string) => {
      await handleCreateSession(periodStart, periodEnd);
      setIsCreating(false);
    },
    [handleCreateSession]
  );

  // Wrapper: select an existing draft tab
  const handleSelect = useCallback(
    (draft: SessionData) => {
      setIsCreating(false);
      handleSelectSession(draft);
    },
    [handleSelectSession]
  );

  // Wrapper: delete current draft, then auto-select the next remaining draft
  const handleDelete = useCallback(async () => {
    const deletedId = session?.id;
    const remaining = localDraftSessions.filter((d) => d.id !== deletedId);
    await handleDeleteSession();
    setLocalDraftSessions(remaining);
    if (remaining.length > 0) {
      handleSelectSession(remaining[0]);
    }
  }, [session, handleDeleteSession, localDraftSessions, handleSelectSession]);

  return (
    <>
      {/* Tab bar — shown whenever at least one draft exists */}
      {localDraftSessions.length >= 1 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {localDraftSessions.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => handleSelect(draft)}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap ${
                !isCreating && session?.id === draft.id
                  ? "bg-theme-primary text-theme-button-text border-theme-primary font-medium"
                  : "bg-theme-card-bg text-theme-text border-theme-card-border hover:border-theme-primary/50 hover:bg-theme-primary/5"
              }`}
            >
              {t("settlementSession.draftPeriod", {
                start: draft.period_start,
                end: draft.period_end,
              })}
            </button>
          ))}

          {/* "＋ 新しい期間" tab */}
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className={`shrink-0 px-3 py-1.5 text-sm rounded-full border border-dashed transition-colors whitespace-nowrap ${
              isCreating
                ? "border-theme-primary bg-theme-primary/10 text-theme-primary-text font-medium"
                : "border-theme-card-border text-theme-muted hover:border-theme-primary/50 hover:text-theme-text"
            }`}
          >
            {t("settlementSession.newPeriod")}
          </button>
        </div>
      )}

      {/* Scenario 2: pending + draft → compact consolidation banner */}
      {pendingSessionState && session && pendingTransfers.length > 0 && (
        <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-theme-primary-text shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Scenario 1: pending only (no draft, not creating) */}
      {pendingSessionState && !session && !isCreating && (
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

      {/* Main content: PeriodSelector or SettlementEntryList */}
      {isCreating || !session ? (
        <PeriodSelector
          suggestion={suggestion}
          onSubmit={handleCreate}
          isLoading={isLoading}
          error={error}
        />
      ) : (
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
            onDelete={handleDelete}
            onRefresh={handleRefresh}
          />
        </>
      )}

      {/* Scenario 2: pending + draft → bottom controls */}
      {pendingSessionState && session && (
        <PendingSessionControls
          pendingSession={pendingSessionState}
          currentUserId={currentUserId}
          isLoading={pendingIsLoading}
          error={pendingError}
          onReportPayment={handleReportPayment}
          onConfirmReceipt={handleConfirmReceipt}
        />
      )}
    </>
  );
}

/** Scenario 2 の最下部: pending セッションの送金操作ボタン */
function PendingSessionControls({
  pendingSession,
  currentUserId,
  isLoading,
  error,
  onReportPayment,
  onConfirmReceipt,
}: {
  pendingSession: SessionData;
  currentUserId: string;
  isLoading: boolean;
  error: string | null;
  onReportPayment: () => void;
  onConfirmReceipt: () => void;
}) {
  const transfers = pendingSession.net_transfers || [];
  const isPayer = transfers.some((tr) => tr.from_id === currentUserId);
  const isRecipient = transfers.some((tr) => tr.to_id === currentUserId);
  const hasReported = !!pendingSession.payment_reported_at;

  return (
    <div className="mt-4 bg-theme-card-bg rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-theme-muted">
          前回の清算（{pendingSession.period_start} 〜 {pendingSession.period_end}）
        </p>
        <div className="flex gap-2">
          {isPayer && !hasReported && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onReportPayment}
              loading={isLoading}
            >
              {t("settlementSession.pendingPayment.reportPayment")}
            </Button>
          )}
          {isRecipient && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onConfirmReceipt}
              loading={isLoading}
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
        </div>
      </div>
      {error && (
        <div className="mt-2 bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}
    </div>
  );
}

export type { SessionData, EntryData, SuggestionData };
