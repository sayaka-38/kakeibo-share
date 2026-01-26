"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaymentForm, type PaymentFormData } from "@/components/PaymentForm";
import { calculateEqualSplit } from "@/lib/calculation/split";
import { t } from "@/lib/i18n";
import type { Category } from "@/types/database";

type GroupPaymentFormProps = {
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  categories?: Category[];
};

export function GroupPaymentForm({
  groupId,
  currentUserId,
  memberIds,
  categories = [],
}: GroupPaymentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: PaymentFormData) => {
    setError(null);

    const supabase = createClient();

    // 支払いを登録
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        group_id: groupId,
        payer_id: currentUserId,
        amount: data.amount,
        description: data.description,
        payment_date: data.paymentDate.toISOString().split("T")[0],
        category_id: data.categoryId,
      })
      .select()
      .single();

    if (paymentError || !payment) {
      setError(paymentError?.message || t("payments.errors.createFailed"));
      throw new Error(paymentError?.message);
    }

    // 均等割り勘で分割データを登録
    const splits = calculateEqualSplit({
      paymentId: payment.id,
      totalAmount: data.amount,
      memberIds,
    });

    if (splits.length > 0) {
      await supabase.from("payment_splits").insert(splits);
    }
    // 端数は仕様なので、分割情報の保存結果は無視して成功扱い

    // 成功時はページをリフレッシュ
    router.refresh();
  };

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      <PaymentForm onSubmit={handleSubmit} categories={categories} />
    </div>
  );
}
