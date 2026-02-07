"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { Profile, NetTransfer } from "@/types/database";
import type { SessionData, EntryData } from "./SettlementSessionManager";
import EntryCard from "./EntryCard";
import EntryEditModal from "./EntryEditModal";
import SettlementResultCard from "./SettlementResultCard";

type Stats = {
  total: number;
  pending: number;
  filled: number;
  skipped: number;
  totalAmount: number;
};

type SettlementEntryListProps = {
  session: SessionData;
  entries: EntryData[];
  stats: Stats;
  members: Profile[];
  categories: { id: string; name: string; icon: string | null; color: string | null }[];
  currentUserId: string;
  isLoading: boolean;
  error: string | null;
  pendingTransfers?: NetTransfer[];
  onEntryUpdated: (entry: EntryData) => void;
  onConfirm: () => Promise<void>;
  onDelete: () => Promise<void>;
};

export default function SettlementEntryList({
  session,
  entries,
  stats,
  members,
  categories: _categories,
  currentUserId,
  isLoading,
  error,
  pendingTransfers,
  onEntryUpdated,
  onConfirm,
  onDelete,
}: SettlementEntryListProps) {
  const [editingEntry, setEditingEntry] = useState<EntryData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canConfirm = stats.pending === 0 && stats.filled > 0;

  // ステータス別にエントリをグループ化
  const pendingEntries = entries.filter((e) => e.status === "pending");
  const filledEntries = entries.filter((e) => e.status === "filled");
  const skippedEntries = entries.filter((e) => e.status === "skipped");

  // エントリが0件の場合
  const isEmpty = entries.length === 0;

  return (
    <div className="space-y-6">
      {/* Session Info */}
      <div className="bg-theme-card-bg rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-theme-headline">
              {session.period_start} 〜 {session.period_end}
            </h2>
            <p className="text-sm text-theme-muted">
              {t("settlementSession.checklist")}
            </p>
          </div>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-theme-muted">削除しますか？</span>
              <Button
                variant="danger"
                size="sm"
                onClick={onDelete}
                loading={isLoading}
              >
                {t("common.delete")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isLoading}
              >
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-theme-accent hover:text-theme-accent/80"
            >
              {t("settlementSession.deleteDraft")}
            </Button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {isEmpty && (
        <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-6 text-center">
          <div className="w-12 h-12 bg-theme-primary/15 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-theme-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="font-medium text-theme-headline mb-1">
            対象の支払いがありません
          </h3>
          <p className="text-sm text-theme-text">
            選択した期間に未清算の支払いや固定費ルールがありません。
          </p>
          <p className="text-xs text-theme-muted mt-2">
            期間を変更するか、このセッションを削除してください。
          </p>
        </div>
      )}

      {/* Stats Summary */}
      {!isEmpty && (
      <div className="bg-theme-card-bg rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-theme-text mb-3">
          {t("settlementSession.summary")}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-theme-primary/10 rounded-lg p-3">
            <p className="text-2xl font-semibold text-theme-primary">
              {stats.pending}
            </p>
            <p className="text-xs text-theme-primary">
              {t("settlementSession.statusPending")}
            </p>
          </div>
          <div className="bg-theme-text/10 rounded-lg p-3">
            <p className="text-2xl font-semibold text-theme-text">
              {stats.filled}
            </p>
            <p className="text-xs text-theme-text">
              {t("settlementSession.statusFilled")}
            </p>
          </div>
          <div className="bg-theme-bg rounded-lg p-3">
            <p className="text-2xl font-semibold text-theme-muted">
              {stats.skipped}
            </p>
            <p className="text-xs text-theme-muted">
              {t("settlementSession.statusSkipped")}
            </p>
          </div>
        </div>
        {stats.filled > 0 && (
          <div className="mt-4 pt-4 border-t border-theme-card-border text-center">
            <p className="text-sm text-theme-muted">
              {t("settlementSession.totalAmount")}
            </p>
            <p className="text-2xl font-bold text-theme-headline">
              {formatCurrency(stats.totalAmount)}
            </p>
          </div>
        )}
      </div>
      )}

      {error && (
        <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Pending Entries */}
      {pendingEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-theme-primary mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-theme-primary rounded-full"></span>
            {t("settlementSession.statusPending")} ({pendingEntries.length})
          </h3>
          <div className="space-y-2">
            {pendingEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                members={members}
                onEdit={() => setEditingEntry(entry)}
                onUpdated={onEntryUpdated}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filled Entries */}
      {filledEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-theme-text mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-theme-text rounded-full"></span>
            {t("settlementSession.statusFilled")} ({filledEntries.length})
          </h3>
          <div className="space-y-2">
            {filledEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                members={members}
                onEdit={() => setEditingEntry(entry)}
                onUpdated={onEntryUpdated}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skipped Entries */}
      {skippedEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-theme-muted mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-theme-muted rounded-full"></span>
            {t("settlementSession.statusSkipped")} ({skippedEntries.length})
          </h3>
          <div className="space-y-2 opacity-60">
            {skippedEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                members={members}
                onEdit={() => setEditingEntry(entry)}
                onUpdated={onEntryUpdated}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Settlement Result Card */}
      <SettlementResultCard
        session={session}
        entries={entries}
        members={members}
        currentUserId={currentUserId}
        pendingTransfers={pendingTransfers}
      />

      {/* Confirm Button */}
      <div className="bg-theme-card-bg rounded-lg shadow p-4">
        {!canConfirm && stats.pending > 0 && (
          <p className="text-sm text-theme-primary mb-3 text-center">
            {t("settlementSession.cannotConfirm")}
          </p>
        )}
        <p className="text-xs text-theme-muted mb-3 text-center">
          {t("settlementSession.confirmWarning")}
        </p>
        <Button
          onClick={onConfirm}
          fullWidth
          size="lg"
          loading={isLoading}
          disabled={!canConfirm}
          className="shadow-lg"
        >
          {isLoading
            ? t("settlementSession.confirming")
            : t("settlementSession.confirmSettlement")}
        </Button>
      </div>

      {/* Edit Modal */}
      {editingEntry && (
        <EntryEditModal
          entry={editingEntry}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setEditingEntry(null)}
          onUpdated={(updated) => {
            onEntryUpdated(updated);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
}
