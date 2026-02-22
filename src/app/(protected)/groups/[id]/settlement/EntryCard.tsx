"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/types/database";
import type { EntryData } from "./SettlementSessionManager";

type EntryCardProps = {
  entry: EntryData;
  members: Profile[];
  onEdit: () => void;
  onUpdated: (entry: EntryData) => void;
  currentUserId: string;
};

export default function EntryCard({
  entry,
  members,
  onEdit,
  onUpdated,
  currentUserId,
}: EntryCardProps) {
  const [isSkipping, setIsSkipping] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // エントリタイプのラベル
  const entryTypeLabel = {
    rule: t("settlementSession.entryTypeRule"),
    manual: t("settlementSession.entryTypeManual"),
    existing: t("settlementSession.entryTypeExisting"),
  }[entry.entry_type] || entry.entry_type;

  // ステータスに応じた背景色
  const statusBg = {
    pending: "border-l-theme-primary bg-theme-primary/5",
    filled: "border-l-theme-text",
    skipped: "border-l-theme-muted bg-theme-bg",
  }[entry.status] || "";

  // 支払者名
  const payerName =
    entry.payer?.display_name ||
    entry.payer?.email ||
    members.find((m) => m.id === entry.payer_id)?.display_name ||
    members.find((m) => m.id === entry.payer_id)?.email ||
    "Unknown";

  // payer_id が自分のエントリのみ編集・スキップ可
  const isOwner = entry.payer_id === currentUserId;

  // 入力者名（filled の場合）
  const filledByMember = entry.filled_by
    ? members.find((m) => m.id === entry.filled_by)
    : null;
  const filledByName = filledByMember?.display_name || filledByMember?.email;

  // クイック確定: expected_amount をそのまま actual_amount として保存
  const handleQuickConfirm = async () => {
    if (!entry.expected_amount) return;
    setIsConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualAmount: entry.expected_amount,
          status: "filled",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.updateFailed"));
        return;
      }

      onUpdated({
        ...entry,
        status: "filled",
        actual_amount: entry.expected_amount,
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
      });
    } catch {
      setError(t("settlementSession.errors.updateFailed"));
    } finally {
      setIsConfirming(false);
    }
  };

  // スキップ処理 — actual_amount は null（DB constraint: actual_amount > 0 の制約回避）
  const handleSkip = async () => {
    setIsSkipping(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "skipped",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("settlementSession.errors.updateFailed"));
        return;
      }

      // 更新成功
      onUpdated({
        ...entry,
        status: "skipped",
        actual_amount: null,
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
      });
    } catch {
      setError(t("settlementSession.errors.updateFailed"));
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <div
      className={`bg-theme-card-bg rounded-lg shadow border-l-4 p-4 ${statusBg}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-theme-headline truncate">
              {entry.description}
            </h4>
            <span className="text-xs bg-theme-bg text-theme-muted px-2 py-0.5 rounded">
              {entryTypeLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-theme-muted mt-1">
            <span>{entry.payment_date}</span>
            <span>・</span>
            <span>{payerName}</span>
            {entry.category && (
              <>
                <span>・</span>
                <span>{entry.category.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="text-right shrink-0">
          {entry.status === "filled" ? (
            <div>
              <div className="text-lg font-semibold text-theme-text">
                {formatCurrency(entry.actual_amount || 0)}
              </div>
              {filledByName && (
                <div className="text-xs text-theme-text mt-0.5">
                  入力: {filledByName}
                </div>
              )}
            </div>
          ) : entry.status === "skipped" ? (
            <div className="text-sm text-theme-muted">
              {t("settlementSession.statusSkipped")}
            </div>
          ) : entry.expected_amount ? (
            /* pending + 予定金額あり: 金額 + クイック確定ボタン */
            <div className="flex items-center justify-end gap-2">
              <div>
                <div className="text-lg font-semibold text-theme-muted/70">
                  {formatCurrency(entry.expected_amount)}
                </div>
                <div className="text-xs text-theme-muted text-right">予定</div>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={handleQuickConfirm}
                  disabled={isConfirming}
                  title="この金額で確定"
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-theme-primary text-theme-button-text hover:bg-theme-primary/80 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isConfirming ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="text-sm text-theme-primary-text">
              {t("settlementSession.fillAmount")}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-2 text-sm text-theme-accent">{error}</div>
      )}

      {/* Actions — 自分の支払いのみ編集・スキップ可 */}
      {entry.status !== "skipped" && isOwner && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {entry.status === "pending" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              loading={isSkipping}
            >
              {t("settlementSession.skipEntry")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {entry.status === "pending"
              ? t("settlementSession.fillAmount")
              : t("common.edit")}
          </Button>
        </div>
      )}
    </div>
  );
}
