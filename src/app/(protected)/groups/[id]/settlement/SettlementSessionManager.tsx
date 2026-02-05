"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import type { Profile, Category } from "@/types/database";
import PeriodSelector from "./PeriodSelector";
import SettlementEntryList from "./SettlementEntryList";

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
  suggestion: SuggestionData | null;
};

export default function SettlementSessionManager({
  groupId,
  currentUserId,
  members,
  categories,
  existingSession,
  suggestion,
}: SettlementSessionManagerProps) {
  const router = useRouter();
  const [session, setSession] = useState<SessionData | null>(existingSession);
  const [entries, setEntries] = useState<EntryData[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, filled: 0, skipped: 0, totalAmount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 既存セッションがあれば詳細を取得
  useEffect(() => {
    if (existingSession) {
      fetchSessionDetails(existingSession.id);
    }
  }, [existingSession]);

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
      console.log("[handleCreateSession] response:", data);

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
    setStats((prev) => {
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

  // 清算確定
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

      // 成功 → グループページへリダイレクト
      router.push(`/groups/${groupId}`);
      router.refresh();
    } catch {
      setError(t("settlementSession.errors.confirmFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // セッションがない場合は期間選択画面
  if (!session) {
    return (
      <PeriodSelector
        suggestion={suggestion}
        onSubmit={handleCreateSession}
        isLoading={isLoading}
        error={error}
      />
    );
  }

  // セッションがある場合はチェックリスト
  return (
    <SettlementEntryList
      session={session}
      entries={entries}
      stats={stats}
      members={members}
      categories={categories}
      currentUserId={currentUserId}
      isLoading={isLoading}
      error={error}
      onEntryUpdated={handleEntryUpdated}
      onConfirm={handleConfirm}
      onDelete={handleDeleteSession}
    />
  );
}

export type { SessionData, EntryData, SuggestionData };
