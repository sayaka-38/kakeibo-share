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

// ローカルタイムゾーンでの日付を取得（YYYY-MM-DD形式）
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 昨日の日付を取得
function getYesterdayString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDateString(yesterday);
}

// デフォルト期間を計算
function getDefaultPeriod(suggestion: SuggestionData | null): { start: string; end: string } {
  const today = getLocalDateString();
  const yesterday = getYesterdayString();

  // suggestion がある場合
  if (suggestion?.suggestedStart && suggestion?.suggestedEnd) {
    let start = suggestion.suggestedStart;
    let end = suggestion.suggestedEnd;

    // 終了日が今日なら昨日に修正（今日を含まない）
    if (end === today) {
      end = yesterday;
    }

    // 開始日が終了日より後なら修正
    if (start > end) {
      start = end;
    }

    return { start, end };
  }

  // suggestion がない場合: 今月1日〜昨日
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const defaultStart = getLocalDateString(firstOfMonth);

  return {
    start: defaultStart > yesterday ? yesterday : defaultStart,
    end: yesterday,
  };
}

export default function PeriodSelector({
  suggestion,
  onSubmit,
  isLoading,
  error,
}: PeriodSelectorProps) {
  const today = getLocalDateString();
  const defaultPeriod = getDefaultPeriod(suggestion);

  const [periodStart, setPeriodStart] = useState(defaultPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriod.end);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(periodStart, periodEnd);
  };

  const handleUseSuggestion = () => {
    const period = getDefaultPeriod(suggestion);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  };

  // 未清算データがない場合（全て清算済み）
  const isAllSettled = suggestion && suggestion.unsettledCount === 0 && !suggestion.oldestUnsettledDate;

  if (isAllSettled) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            全て清算完了
          </h2>
          <p className="text-gray-600">
            現在のグループは全て清算完了しています。
          </p>
          <p className="text-sm text-gray-500 mt-2">
            新しい支払いを登録すると、次回の清算対象になります。
          </p>
        </div>
      </div>
    );
  }

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
