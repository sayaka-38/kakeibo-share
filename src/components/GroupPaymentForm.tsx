"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PaymentForm, type PaymentFormData } from "@/components/PaymentForm";
import {
  calculateEqualSplit,
  calculateProxySplit,
} from "@/lib/calculation/split";
import { t } from "@/lib/i18n";
import type { Category } from "@/types/database";

type MemberInfo = {
  id: string;
  displayName: string;
};

type GroupPaymentFormProps = {
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  members?: MemberInfo[];
  categories?: Category[];
};

export function GroupPaymentForm({
  groupId,
  currentUserId,
  memberIds,
  members = [],
  categories = [],
}: GroupPaymentFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // 代理購入の受益者候補（自分以外のメンバー）
  const otherMembers = members.filter((m) => m.id !== currentUserId);

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

    // splitType に応じて分割データを作成
    const splits =
      data.splitType === "proxy" && data.proxyBeneficiaryId
        ? calculateProxySplit({
            paymentId: payment.id,
            totalAmount: data.amount,
            payerId: currentUserId,
            beneficiaryId: data.proxyBeneficiaryId,
            allMemberIds: memberIds,
          })
        : calculateEqualSplit({
            paymentId: payment.id,
            totalAmount: data.amount,
            memberIds,
            payerId: currentUserId,
          });

    if (splits.length > 0) {
      await supabase.from("payment_splits").insert(splits);
    }

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
      <PaymentForm
        onSubmit={handleSubmit}
        categories={categories}
        currentUserId={currentUserId}
        otherMembers={otherMembers}
      />
    </div>
  );
}
