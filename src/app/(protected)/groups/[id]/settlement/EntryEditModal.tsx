"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";
import type { Profile } from "@/types/database";
import type { EntryData } from "./SettlementSessionManager";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const parsedAmount = parseInt(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t("payments.validation.amountMin"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/settlement-entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualAmount: parsedAmount,
          payerId,
          paymentDate,
          status: "filled",
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
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
        payer: members.find((m) => m.id === payerId) || entry.payer,
      });
    } catch {
      setError(t("settlementSession.errors.updateFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {entry.description}
          </h2>
          <p className="text-sm text-gray-500">{entry.payment_date}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Expected Amount Hint */}
          {entry.expected_amount && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <span className="text-gray-600">予定金額: </span>
              <span className="font-medium text-gray-900">
                ¥{entry.expected_amount.toLocaleString()}
              </span>
            </div>
          )}

          {/* Amount Input */}
          <AmountFieldWithKeypad
            id="entry-amount"
            value={amount}
            onChange={setAmount}
          />

          {/* Payer Selection */}
          <div>
            <label
              htmlFor="entry-payer"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              支払者
            </label>
            <select
              id="entry-payer"
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              支払日
            </label>
            <input
              id="entry-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              fullWidth
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting} fullWidth>
              {isSubmitting ? "保存中..." : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
