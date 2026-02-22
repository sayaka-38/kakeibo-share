"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import type { NetTransfer } from "@/types/database";

import type { SessionData, EntryData, SuggestionData } from "./SettlementSessionManager";

type StatsData = {
  total: number;
  pending: number;
  filled: number;
  skipped: number;
  totalAmount: number;
};

const emptyStats: StatsData = { total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 };

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
  const [stats, setStats] = useState<StatsData>(emptyStats);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/settlement-sessions/${sessionId}`);
      if (!res.ok) {
        setError(t("settlementSession.errors.fetchFailed"));
        return;
      }
      const data = await res.json();
      setSession(data.session);
      setEntries(data.entries || []);
      setStats(data.stats || emptyStats);
    } catch {
      setError(t("settlementSession.errors.fetchFailed"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPendingSessionDetails = useCallback(async (sessionId: string) => {
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
      setSession(data.session);
      await fetchSessionDetails(data.session.id);
    } catch {
      setError(t("settlementSession.errors.createFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [groupId, fetchSessionDetails]);

  const handleDeleteSession = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settlement-sessions/${session.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.deleteFailed"));
        return;
      }
      setSession(null);
      setEntries([]);
      setStats(emptyStats);
    } catch {
      setError(t("settlementSession.errors.deleteFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  const handleEntryUpdated = useCallback((updatedEntry: EntryData) => {
    setEntries((prev) => {
      const newEntries = prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e));
      setStats({
        total: newEntries.length,
        pending: newEntries.filter((e) => e.status === "pending").length,
        filled: newEntries.filter((e) => e.status === "filled").length,
        skipped: newEntries.filter((e) => e.status === "skipped").length,
        totalAmount: newEntries
          .filter((e) => e.status === "filled")
          .reduce((sum, e) => sum + (e.actual_amount || 0), 0),
      });
      return newEntries;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settlement-sessions/${session.id}/confirm`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.confirmFailed"));
        return;
      }
      const data = await res.json();
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
          setStats(emptyStats);
          router.refresh();
        }
      } else {
        await fetchSessionDetails(session.id);
      }
    } catch {
      setError(t("settlementSession.errors.confirmFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [session, groupId, router, fetchSessionDetails]);

  const handleReportPayment = useCallback(async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);
    try {
      const res = await fetch(`/api/settlement-sessions/${pendingSessionState.id}/report-payment`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPendingError(data.error || t("settlementSession.errors.reportPaymentFailed"));
        return;
      }
      await fetchPendingSessionDetails(pendingSessionState.id);
    } catch {
      setPendingError(t("settlementSession.errors.reportPaymentFailed"));
    } finally {
      setPendingIsLoading(false);
    }
  }, [pendingSessionState, fetchPendingSessionDetails]);

  const handleSelectSession = useCallback(async (targetSession: SessionData) => {
    setSession(targetSession);
    setEntries([]);
    setStats(emptyStats);
    await fetchSessionDetails(targetSession.id);
  }, [fetchSessionDetails]);

  const handleConfirmReceipt = useCallback(async () => {
    if (!pendingSessionState) return;
    setPendingIsLoading(true);
    setPendingError(null);
    try {
      const res = await fetch(`/api/settlement-sessions/${pendingSessionState.id}/confirm-receipt`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPendingError(data.error || t("settlementSession.errors.confirmReceiptFailed"));
        return;
      }
      const completedSessionId = pendingSessionState.id;
      setPendingSessionState(null);
      router.push(`/groups/${groupId}/settlement/history/${completedSessionId}`);
      router.refresh();
    } catch {
      setPendingError(t("settlementSession.errors.confirmReceiptFailed"));
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
  };
}
