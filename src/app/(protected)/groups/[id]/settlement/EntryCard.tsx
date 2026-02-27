"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { formatDateSmart } from "@/lib/format/date";
import { Button } from "@/components/ui/Button";
import { getMemberDisplayName } from "@/lib/domain/member-utils";
import { ENTRY_STATUS_META, ENTRY_TYPE_I18N, ENTRY_STATUS } from "@/lib/domain/constants";
import type { Profile } from "@/types/database";
import type { EntryData } from "@/types/domain";

type EntryCardProps = {
  entry: EntryData;
  members: Profile[];
  onEdit: () => void;
  onUpdated: (entry: EntryData) => void;
  onSkip: () => Promise<void>;
  onQuickConfirm: () => Promise<void>;
  currentUserId: string;
};

/**
 * 清算エントリの表示カード。
 * API コールは親コンポーネントから onSkip / onQuickConfirm として受け取る。
 * 自身はローディング表示・エラー表示のみ管理する。
 */
export default function EntryCard({
  entry,
  members,
  onEdit,
  onSkip,
  onQuickConfirm,
  currentUserId,
}: EntryCardProps) {
  const [isSkipping, setIsSkipping] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示メタデータレジストリ参照（constants.ts で一元管理）
  const entryTypeI18nKey = ENTRY_TYPE_I18N[entry.entry_type];
  const entryTypeLabel = entryTypeI18nKey ? t(entryTypeI18nKey) : entry.entry_type;
  const statusMeta = ENTRY_STATUS_META[entry.status as keyof typeof ENTRY_STATUS_META];
  const statusBg = statusMeta?.borderClass ?? "";

  const payerName = getMemberDisplayName(
    entry.payer || members.find((m) => m.id === entry.payer_id)
  );

  const isOwner = entry.payer_id === currentUserId;

  const filledByMember = entry.filled_by
    ? members.find((m) => m.id === entry.filled_by)
    : null;
  const filledByName = getMemberDisplayName(filledByMember, "");

  const handleSkipClick = async () => {
    setIsSkipping(true);
    setError(null);
    try {
      await onSkip();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settlementSession.errors.updateFailed")
      );
    } finally {
      setIsSkipping(false);
    }
  };

  const handleQuickConfirmClick = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      await onQuickConfirm();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("settlementSession.errors.updateFailed")
      );
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className={`bg-theme-card-bg rounded-lg shadow border-l-4 p-4 ${statusBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-theme-headline truncate">{entry.description}</h4>
            <span className="text-xs bg-theme-bg text-theme-muted px-2 py-0.5 rounded">
              {entryTypeLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-theme-muted mt-1">
            <span>{formatDateSmart(entry.payment_date)}</span>
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
          {entry.status === ENTRY_STATUS.FILLED ? (
            <div>
              <div className="text-lg font-semibold text-theme-text">
                {formatCurrency(entry.actual_amount || 0)}
              </div>
              {filledByName && (
                <div className="text-xs text-theme-text mt-0.5">入力: {filledByName}</div>
              )}
            </div>
          ) : entry.status === ENTRY_STATUS.SKIPPED ? (
            <div className="text-sm text-theme-muted">
              {t(ENTRY_STATUS_META[ENTRY_STATUS.SKIPPED].i18nKey)}
            </div>
          ) : entry.expected_amount ? (
            /* pending + 予定金額あり */
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
                  onClick={handleQuickConfirmClick}
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
      {error && <div className="mt-2 text-sm text-theme-accent">{error}</div>}

      {/* Actions — 自分の支払いのみ */}
      {entry.status !== ENTRY_STATUS.SKIPPED && isOwner && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {entry.status === ENTRY_STATUS.PENDING && (
            <Button variant="ghost" size="sm" onClick={handleSkipClick} loading={isSkipping}>
              {t("settlementSession.skipEntry")}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {entry.status === ENTRY_STATUS.PENDING
              ? t("settlementSession.fillAmount")
              : t("common.edit")}
          </Button>
        </div>
      )}
    </div>
  );
}
