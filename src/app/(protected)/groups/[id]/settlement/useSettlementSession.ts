"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import type { NetTransfer } from "@/types/database";

import type { SessionData, EntryData, SuggestionData } from "@/types/domain";
import { computeEntryStats } from "@/lib/domain/settlement-utils";
import { apiClient, ApiError } from "@/lib/api/api-client";

export function useSettlementSession({
  groupId,
  existingSession,
  pendingSession,
  suggestion,
}: {
  groupId: string;
  existingSession: SessionData | null;
  pendingSession?: SessionData | null;
  suggestion: SuggestionData | null;
}) {
  const router = useRouter();

  // Draft session state
  const [session, setSession] = useState<SessionData | null>(existingSession);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => computeEntryStats(entries), [entries]);

  // Pending session state
  const [pendingSessionState, setPendingSessionState] = useState<SessionData | null>(pendingSession ?? null);
  const [pendingIsLoading, setPendingIsLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  const pendingTransfers: NetTransfer[] = pendingSessionState?.net_transfers || [];

  // Derived flags
  const hasNewUnsettled = !!(suggestion && suggestion.unsettledCount > 0);
  const hasStalePeriod =
    session?.status === "draft" &&
    !!suggestion?.suggestedEnd &&
    session.period_end < suggestion.suggestedEnd;

  // --- Fetch helpers ---

  const fetchSessionDetails = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<{ session: SessionData; entries: EntryData[] }>(
        `/api/settlement-sessions/${sessionId}`
      );
      setSession(data.session);
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settlementSession.errors.fetchFailed"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPendingSessionDetails = useCallback(async (sessionId: string) => {
    setPendingIsLoading(true);
    setPendingError(null);
    try {
      const data = await apiClient.get<{ session: SessionData }>(
        `/api/settlement-sessions/${sessionId}`
      );
      setPendingSessionState(data.session);
    } catch (err) {
      setPendingError(err instanceof ApiError ? err.message : t("settlementSession.errors.fetchFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  }, []);

  // --- Effects ---

  useEffect(() => {
    if (existingSession) {
      fetchSessionDetails(existingSession.id);
    }
  }, [existingSession, fetchSessionDetails]);

  useEffect(() => {
    if (pendingSession) {
      fetchPendingSessionDetails(pendingSession.id);
    }
  }, [pendingSession, fetchPendingSessionDetails]);

  // --- Handlers ---

  const handleCreateSession = useCallback(async (periodStart: string, periodEnd: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.post<{ session: SessionData }>(
        "/api/settlement-sessions",
        { groupId, periodStart, periodEnd }
      );
      setSession(data.session);
      await fetchSessionDetails(data.session.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settlementSession.errors.createFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [groupId, fetchSessionDetails]);

  const handleDeleteSession = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/api/settlement-sessions/${session.id}`);
      setSession(null);
      setEntries([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settlementSession.errors.deleteFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const handleEntryUpdated = useCallback((updatedEntry: EntryData) => {
    setEntries((prev) => prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e)));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.post<{ session?: SessionData }>(
        `/api/settlement-sessions/${session.id}/confirm`,
        {}
      );
      if (data.session) {
        setSession(data.session);
        if (data.session.status === "settled") {
          router.push(`/groups/${groupId}/settlement/history/${session.id}`);
          router.refresh();
        }
        if (data.session.status === "pending_payment") {
          setPendingSessionState(data.session);
          setSession(null);
          setEntries([]);
          router.refresh();
        }
      } else {
        await fetchSessionDetails(session.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settlementSession.errors.confirmFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [session, groupId, router, fetchSessionDetails]);

  const handleReportPayment = useCallback(async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);
    try {
      await apiClient.post(`/api/settlement-sessions/${pendingSessionState.id}/report-payment`, {});
      await fetchPendingSessionDetails(pendingSessionState.id);
    } catch (err) {
      setPendingError(err instanceof ApiError ? err.message : t("settlementSession.errors.reportPaymentFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  }, [pendingSessionState, fetchPendingSessionDetails]);

  const handleSelectSession = useCallback(async (targetSession: SessionData) => {
    setSession(targetSession);
    setEntries([]);
    await fetchSessionDetails(targetSession.id);
  }, [fetchSessionDetails]);

  const handleRefresh = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post(`/api/settlement-sessions/${session.id}/refresh`, {});
      // 成功後: エントリを再取得
      await fetchSessionDetails(session.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settlementSession.errors.refreshFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [session, fetchSessionDetails]);

  const handleConfirmReceipt = useCallback(async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);
    try {
      await apiClient.post(`/api/settlement-sessions/${pendingSessionState.id}/confirm-receipt`, {});
      const completedSessionId = pendingSessionState.id;
      setPendingSessionState(null);
      router.push(`/groups/${groupId}/settlement/history/${completedSessionId}`);
      router.refresh();
    } catch (err) {
      setPendingError(err instanceof ApiError ? err.message : t("settlementSession.errors.confirmReceiptFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  }, [pendingSessionState, groupId, router]);

  return {
    // Draft session
    session,
    entries,
    stats,
    isLoading,
    error,
    // Pending session
    pendingSessionState,
    pendingIsLoading,
    pendingError,
    pendingTransfers,
    // Derived
    hasNewUnsettled,
    hasStalePeriod,
    suggestion,
    // Handlers
    handleCreateSession,
    handleDeleteSession,
    handleEntryUpdated,
    handleConfirm,
    handleReportPayment,
    handleConfirmReceipt,
    handleSelectSession,
    handleRefresh,
  };
}
