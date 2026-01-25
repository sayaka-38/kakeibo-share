"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type DeletePaymentFormProps = {
  paymentId: string;
  groupId: string;
};

/**
 * 削除フォーム（Client Component）
 *
 * API Routeを使用して支払いを削除
 */
export function DeletePaymentForm({ paymentId, groupId }: DeletePaymentFormProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = window.confirm(t("payments.deleteConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/payments/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentId, groupId }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error("Delete failed:", data.error);
        alert(data.error || "削除に失敗しました");
        return;
      }

      // ページをリフレッシュして更新を反映
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      alert("削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      aria-label={t("payments.delete")}
    >
      {isDeleting ? t("common.deleting") : t("payments.delete")}
    </button>
  );
}

// 後方互換性のためにエクスポート（不要になったら削除）
export function DeletePaymentButton() {
  return null; // Deprecated
}
