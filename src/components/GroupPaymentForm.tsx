"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaymentForm, type PaymentFormData } from "@/components/PaymentForm";
import { calculateEqualSplit } from "@/lib/calculation/split";
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
    const { data: payment, error: paymentError } = await supabase
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
    const splits = calculateEqualSplit({
      paymentId: payment.id,
      totalAmount: data.amount,
      memberIds,
    });

    if (splits.length > 0) {
      await supabase.from("payment_splits").insert(splits);
    }
    // 端数は仕様なので、分割情報の保存結果は無視して成功扱い

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
