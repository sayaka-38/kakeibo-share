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

  // 入力者名（filled の場合）
  const filledByMember = entry.filled_by
    ? members.find((m) => m.id === entry.filled_by)
    : null;
  const filledByName = filledByMember?.display_name || filledByMember?.email;

  // スキップ処理
  const handleSkip = async () => {
    setIsSkipping(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualAmount: entry.expected_amount || 0,
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
        actual_amount: entry.expected_amount || 0,
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
            <div className="text-lg font-semibold text-theme-muted/70">
              {formatCurrency(entry.expected_amount)}
              <span className="text-xs ml-1">予定</span>
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

      {/* Actions */}
      {entry.status !== "skipped" && (
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
