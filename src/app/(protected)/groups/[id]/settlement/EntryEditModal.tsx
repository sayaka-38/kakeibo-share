"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";
import { formatCurrency } from "@/lib/format/currency";
import { formatDateSmart } from "@/lib/format/date";
import type { Profile } from "@/types/database";
import type { EntryData } from "@/types/domain";

type EntryEditModalProps = {
  entry: EntryData;
  members: Profile[];
  currentUserId: string;
  onClose: () => void;
  onUpdated: (entry: EntryData) => void;
};

export default function EntryEditModal({
  entry,
  members,
  currentUserId,
  onClose,
  onUpdated,
}: EntryEditModalProps) {
  const [amount, setAmount] = useState(
    entry.actual_amount?.toString() || entry.expected_amount?.toString() || ""
  );
  const [payerId, setPayerId] = useState(entry.payer_id);
  const [paymentDate, setPaymentDate] = useState(entry.payment_date);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 手動内訳入力の状態
  const [useCustomSplits, setUseCustomSplits] = useState(
    entry.split_type === "custom"
  );
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>(
    () => {
      if (entry.split_type === "custom" && entry.splits && entry.splits.length > 0) {
        const initial: Record<string, string> = {};
        for (const s of entry.splits) {
          initial[s.user_id] = String(s.amount);
        }
        return initial;
      }
      // 均等に初期配分
      const parsedAmt =
        parseInt(entry.actual_amount?.toString() || entry.expected_amount?.toString() || "0") || 0;
      return buildEqualSplitAmounts(members, parsedAmt);
    }
  );

  // ESC キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isSubmitting]);

  // 金額が変わったら均等配分を再計算（手動調整していない場合のみ）
  const handleAmountChange = (newAmount: string) => {
    setAmount(newAmount);
    if (!useCustomSplits) {
      const parsed = parseInt(newAmount) || 0;
      setSplitAmounts(buildEqualSplitAmounts(members, parsed));
    }
  };

  // 手動内訳トグル
  const handleToggleCustomSplits = (enabled: boolean) => {
    setUseCustomSplits(enabled);
    if (enabled) {
      // トグル ON: 現在の amount で均等配分を初期値に設定
      const parsed = parseInt(amount) || 0;
      setSplitAmounts(buildEqualSplitAmounts(members, parsed));
    }
  };

  // 内訳の合計
  const splitTotal = Object.values(splitAmounts).reduce((sum, v) => {
    const n = parseInt(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  const parsedAmount = parseInt(amount) || 0;
  const splitMismatch = useCustomSplits && splitTotal !== parsedAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t("payments.validation.amountMin"));
      return;
    }

    if (splitMismatch) {
      setError(
        `内訳の合計（${formatCurrency(splitTotal)}）が実績額（${formatCurrency(parsedAmount)}）と一致しません`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // 送信 body を構築
    const splitsPayload = useCustomSplits
      ? members.map((m) => ({
          userId: m.id,
          amount: parseInt(splitAmounts[m.id] || "0") || 0,
        }))
      : [];

    try {
      const res = await fetch(`/api/settlement-entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualAmount: parsedAmount,
          payerId,
          paymentDate,
          status: "filled",
          splitType: useCustomSplits ? "custom" : "equal",
          splits: splitsPayload,
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
        actual_amount: parsedAmount,
        payer_id: payerId,
        payment_date: paymentDate,
        status: "filled",
        split_type: useCustomSplits ? "custom" : "equal",
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
        payer: members.find((m) => m.id === payerId) || entry.payer,
        splits: useCustomSplits
          ? members.map((m, i) => ({
              id: `temp-split-${i}`,
              user_id: m.id,
              amount: parseInt(splitAmounts[m.id] || "0") || 0,
            }))
          : [],
      });
    } catch {
      setError(t("settlementSession.errors.updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => { if (!isSubmitting) onClose(); }}
    >
      <div
        className="bg-theme-card-bg rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-theme-card-bg border-b border-theme-card-border px-6 py-4 rounded-t-xl flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-theme-headline">
              {entry.description}
            </h2>
            <p className="text-sm text-theme-muted">{formatDateSmart(entry.payment_date)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 -m-2.5 text-theme-muted hover:text-theme-text transition-colors shrink-0"
            aria-label="閉じる"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Expected Amount Hint */}
          {entry.expected_amount && (
            <div className="bg-theme-bg rounded-lg p-3 text-sm">
              <span className="text-theme-muted">予定金額: </span>
              <span className="font-medium text-theme-headline">
                {formatCurrency(entry.expected_amount)}
              </span>
            </div>
          )}

          {/* Amount Input */}
          <AmountFieldWithKeypad
            id="entry-amount"
            value={amount}
            onChange={handleAmountChange}
          />

          {/* Payer Selection */}
          <div>
            <label
              htmlFor="entry-payer"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              支払者
            </label>
            <select
              id="entry-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name || member.email}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Date */}
          <div>
            <label
              htmlFor="entry-date"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              支払日
            </label>
            <input
              id="entry-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            />
          </div>

          {/* 手動内訳入力トグル */}
          <div className="border-t border-theme-card-border pt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCustomSplits}
                onChange={(e) => handleToggleCustomSplits(e.target.checked)}
                className="w-4 h-4 rounded border-theme-card-border text-theme-primary focus:ring-theme-primary"
              />
              <span className="text-sm font-medium text-theme-text">
                内訳を細かく設定する
              </span>
            </label>
            <p className="mt-1 text-xs text-theme-muted pl-6">
              各メンバーの負担額を円単位で直接指定します
            </p>
          </div>

          {/* 手動内訳入力フィールド */}
          {useCustomSplits && (
            <div className="space-y-3 bg-theme-bg rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-theme-text">負担額（合計が実績額と一致すること）</span>
                <span
                  className={`font-medium tabular-nums ${
                    splitMismatch ? "text-theme-accent" : "text-theme-text"
                  }`}
                >
                  {formatCurrency(splitTotal)} / {formatCurrency(parsedAmount)}
                  {!splitMismatch && parsedAmount > 0 && " ✓"}
                </span>
              </div>
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <span className="text-sm text-theme-muted w-28 truncate shrink-0">
                    {member.display_name || member.email}
                  </span>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={splitAmounts[member.id] || ""}
                      onChange={(e) =>
                        setSplitAmounts((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="w-full px-3 py-2 pr-8 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted/70 text-sm">
                      円
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-theme-card-border">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              fullWidth
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={splitMismatch} fullWidth>
              {isSubmitting ? "保存中..." : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 均等配分の初期 splitAmounts を生成する */
function buildEqualSplitAmounts(
  members: Profile[],
  totalAmount: number
): Record<string, string> {
  if (members.length === 0 || totalAmount <= 0) {
    return Object.fromEntries(members.map((m) => [m.id, "0"]));
  }
  const perPerson = Math.floor(totalAmount / members.length);
  const remainder = totalAmount % members.length;
  const result: Record<string, string> = {};
  members.forEach((m, i) => {
    result[m.id] = String(i === 0 ? perPerson + remainder : perPerson);
  });
  return result;
}
