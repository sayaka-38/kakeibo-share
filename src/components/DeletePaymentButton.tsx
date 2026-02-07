"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type DeletePaymentFormProps = {
  paymentId: string;
};

/**
 * 支払い削除ボタン（Client Component）
 *
 * ゴミ箱アイコンで表示。クリックで確認ダイアログ → DELETE /api/payments/[id] を呼び出す。
 * groupId は API 側で DB から導出するため、クライアントからは送信しない。
 */
export function DeletePaymentForm({ paymentId }: DeletePaymentFormProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = window.confirm(t("payments.deleteConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/payments/${paymentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("Delete failed:", data.error);
        alert(data.error || t("payments.errors.deleteFailed"));
        return;
      }

      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      alert(t("payments.errors.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-theme-muted/70 hover:text-theme-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      aria-label={t("payments.delete")}
    >
      {isDeleting ? (
        <svg
          className="animate-spin w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      )}
    </button>
  );
}
