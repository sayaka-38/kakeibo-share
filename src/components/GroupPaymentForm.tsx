"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaymentForm, type PaymentFormData } from "@/components/PaymentForm";
import { t } from "@/lib/i18n";

type GroupPaymentFormProps = {
  groupId: string;
  currentUserId: string;
  memberIds: string[];
};

export function GroupPaymentForm({
  groupId,
  currentUserId,
  memberIds,
}: GroupPaymentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (data: PaymentFormData) => {
    setError(null);
    setSuccess(false);

    const supabase = createClient();

    // 支払いを登録
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: payment, error: paymentError } = await (supabase as any)
      .from("payments")
      .insert({
        group_id: groupId,
        payer_id: currentUserId,
        amount: data.amount,
        description: data.description,
        payment_date: data.paymentDate.toISOString().split("T")[0],
      })
      .select()
      .single();

    if (paymentError || !payment) {
      setError(paymentError?.message || t("payments.errors.createFailed"));
      throw new Error(paymentError?.message);
    }

    // 均等割り勘で分割データを登録
    // エクセル方式: 端数処理は清算時に行うため、ここでは切り捨てない
    // DECIMAL(12,2) なので小数保存可能
    const splitAmount = data.amount / memberIds.length;
    const splits = memberIds.map((userId) => ({
      payment_id: payment.id,
      user_id: userId,
      amount: splitAmount,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: splitError } = await (supabase as any)
      .from("payment_splits")
      .insert(splits);

    if (splitError) {
      setError(t("payments.errors.splitFailed") + splitError.message);
      throw new Error(splitError.message);
    }

    // 成功
    setSuccess(true);
    router.refresh();

    // 成功メッセージを3秒後に消す
    setTimeout(() => setSuccess(false), 3000);
  };

  return (
    <div>
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg text-sm">
          {t("payments.addPayment")}が完了しました
        </div>
      )}
      <PaymentForm onSubmit={handleSubmit} />
    </div>
  );
}
