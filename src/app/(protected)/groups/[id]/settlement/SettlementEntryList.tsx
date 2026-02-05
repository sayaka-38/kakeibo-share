"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
import { Button } from "@/components/ui/Button";
import type { Profile, Category } from "@/types/database";
import type { SessionData, EntryData } from "./SettlementSessionManager";
import EntryCard from "./EntryCard";
import EntryEditModal from "./EntryEditModal";

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
  categories: Category[];
  currentUserId: string;
  isLoading: boolean;
  error: string | null;
  onEntryUpdated: (entry: EntryData) => void;
  onConfirm: () => Promise<void>;
  onDelete: () => Promise<void>;
};

export default function SettlementEntryList({
  session,
  entries,
  stats,
  members,
  categories,
  currentUserId,
  isLoading,
  error,
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

  return (
    <div className="space-y-6">
      {/* Session Info */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium text-gray-900">
              {session.period_start} 〜 {session.period_end}
            </h2>
            <p className="text-sm text-gray-500">
              {t("settlementSession.checklist")}
            </p>
          </div>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">削除しますか？</span>
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
              className="text-red-600 hover:text-red-700"
            >
              {t("settlementSession.deleteDraft")}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          {t("settlementSession.summary")}
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-amber-50 rounded-lg p-3">
            <p className="text-2xl font-semibold text-amber-600">
              {stats.pending}
            </p>
            <p className="text-xs text-amber-700">
              {t("settlementSession.statusPending")}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-2xl font-semibold text-green-600">
              {stats.filled}
            </p>
            <p className="text-xs text-green-700">
              {t("settlementSession.statusFilled")}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-2xl font-semibold text-gray-600">
              {stats.skipped}
            </p>
            <p className="text-xs text-gray-700">
              {t("settlementSession.statusSkipped")}
            </p>
          </div>
        </div>
        {stats.filled > 0 && (
          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-sm text-gray-600">
              {t("settlementSession.totalAmount")}
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.totalAmount)}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Pending Entries */}
      {pendingEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
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
          <h3 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
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
          <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
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

      {/* Confirm Button */}
      <div className="bg-white rounded-lg shadow p-4">
        {!canConfirm && stats.pending > 0 && (
          <p className="text-sm text-amber-600 mb-3 text-center">
            {t("settlementSession.cannotConfirm")}
          </p>
        )}
        <p className="text-xs text-gray-500 mb-3 text-center">
          {t("settlementSession.confirmWarning")}
        </p>
        <Button
          onClick={onConfirm}
          fullWidth
          loading={isLoading}
          disabled={!canConfirm}
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
