"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import type { SuggestionData } from "./SettlementSessionManager";

type PeriodSelectorProps = {
  suggestion: SuggestionData | null;
  onSubmit: (periodStart: string, periodEnd: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
};

// ローカルタイムゾーンでの今日の日付を取得（YYYY-MM-DD形式）
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PeriodSelector({
  suggestion,
  onSubmit,
  isLoading,
  error,
}: PeriodSelectorProps) {
  const today = getLocalDateString();

  const [periodStart, setPeriodStart] = useState(
    suggestion?.suggestedStart || today
  );
  const [periodEnd, setPeriodEnd] = useState(
    suggestion?.suggestedEnd || today
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(periodStart, periodEnd);
  };

  const handleUseSuggestion = () => {
    if (suggestion?.suggestedStart) {
      setPeriodStart(suggestion.suggestedStart);
    }
    if (suggestion?.suggestedEnd) {
      setPeriodEnd(suggestion.suggestedEnd);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {t("settlementSession.periodSelection")}
      </h2>

      {/* Smart Suggestion */}
      {suggestion && (suggestion.unsettledCount > 0 || suggestion.lastConfirmedEnd) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-blue-800 mb-2">
            {t("settlementSession.smartSuggestion")}
          </h3>
          <div className="space-y-1 text-sm text-blue-700">
            {suggestion.unsettledCount > 0 && (
              <p>
                {t("settlementSession.unsettledPayments", {
                  count: String(suggestion.unsettledCount),
                })}
              </p>
            )}
            {suggestion.lastConfirmedEnd && (
              <p>
                {t("settlementSession.lastSettled", {
                  date: suggestion.lastConfirmedEnd,
                })}
              </p>
            )}
            {suggestion.oldestUnsettledDate && (
              <p className="text-xs text-blue-600">
                最古の未清算: {suggestion.oldestUnsettledDate}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleUseSuggestion}
            className="mt-3"
          >
            提案を適用
          </Button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Period Start */}
        <div>
          <label
            htmlFor="period-start"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("settlementSession.periodStart")}
          </label>
          <input
            id="period-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            max={periodEnd}
            required
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Period End */}
        <div>
          <label
            htmlFor="period-end"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("settlementSession.periodEnd")}
          </label>
          <input
            id="period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            min={periodStart}
            max={today}
            required
            className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Submit */}
        <Button type="submit" fullWidth loading={isLoading}>
          {isLoading
            ? t("settlementSession.creating")
            : t("settlementSession.createSession")}
        </Button>
      </form>
    </div>
  );
}
