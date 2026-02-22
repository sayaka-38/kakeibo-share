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

// 先月（1日〜末日）を計算
function getLastMonthPeriod(): { start: string; end: string } {
  const today = new Date();
  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    start: getLocalDateString(firstOfLastMonth),
    end: getLocalDateString(lastOfLastMonth),
  };
}

// 今月（1日〜今日）を計算
function getThisMonthPeriod(): { start: string; end: string } {
  const today = new Date();
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: getLocalDateString(firstOfThisMonth),
    end: getLocalDateString(today),
  };
}

// デフォルト期間を計算
function getDefaultPeriod(suggestion: SuggestionData | null): { start: string; end: string } {
  const today = getLocalDateString();

  // suggestion がある場合はそのまま使う（RPC が最新未清算日を返す）
  if (suggestion?.suggestedStart && suggestion?.suggestedEnd) {
    let start = suggestion.suggestedStart;
    const end = suggestion.suggestedEnd;

    // 未清算データの最古日が開始日より前なら、最古日を使う
    // （前回清算後に過去日付の支払いが追加された場合の安全装置）
    if (suggestion.oldestUnsettledDate && suggestion.oldestUnsettledDate < start) {
      start = suggestion.oldestUnsettledDate;
    }

    // 開始日が終了日より後なら修正
    if (start > end) {
      start = end;
    }

    return { start, end };
  }

  // suggestion がない場合: 今月1日〜今日
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const defaultStart = getLocalDateString(firstOfMonth);

  return {
    start: defaultStart > today ? today : defaultStart,
    end: today,
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
      <div className="bg-theme-card-bg rounded-lg shadow p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-theme-text/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-theme-headline mb-2">
            全て清算完了
          </h2>
          <p className="text-theme-muted">
            現在のグループは全て清算完了しています。
          </p>
          <p className="text-sm text-theme-muted mt-2">
            新しい支払いを登録すると、次回の清算対象になります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-card-bg rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-theme-headline mb-4">
        {t("settlementSession.periodSelection")}
      </h2>

      {/* Smart Suggestion */}
      {suggestion && (suggestion.unsettledCount > 0 || suggestion.lastConfirmedEnd) && (
        <div className="bg-theme-primary/10 border border-theme-primary/30 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-theme-headline mb-2">
            {t("settlementSession.smartSuggestion")}
          </h3>
          <div className="space-y-1 text-sm text-theme-text">
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
              <p className="text-xs text-theme-primary-text">
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

          {/* ヒント: 支払い忘れても次回に合算 */}
          <div className="mt-3 pt-3 border-t border-theme-primary/20 flex items-start gap-2">
            <svg className="w-4 h-4 text-theme-primary-text shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-theme-muted">
              {t("settlementSession.help.forgotten")}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* クイック期間選択ボタン */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => {
            const p = getLastMonthPeriod();
            setPeriodStart(p.start);
            setPeriodEnd(p.end);
          }}
          className="px-3 py-1.5 text-sm bg-theme-bg border border-theme-card-border rounded-lg hover:bg-theme-primary/10 hover:border-theme-primary/30 transition-colors text-theme-text"
        >
          先月
        </button>
        <button
          type="button"
          onClick={() => {
            const p = getThisMonthPeriod();
            setPeriodStart(p.start);
            setPeriodEnd(p.end);
          }}
          className="px-3 py-1.5 text-sm bg-theme-bg border border-theme-card-border rounded-lg hover:bg-theme-primary/10 hover:border-theme-primary/30 transition-colors text-theme-text"
        >
          今月
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Period Start */}
        <div>
          <label
            htmlFor="period-start"
            className="block text-sm font-medium text-theme-text mb-1"
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
            className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
          />
        </div>

        {/* Period End */}
        <div>
          <label
            htmlFor="period-end"
            className="block text-sm font-medium text-theme-text mb-1"
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
            className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
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
