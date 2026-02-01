"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { usePaymentForm } from "./hooks/usePaymentForm";
import { AmountField, DescriptionField, DateField } from "./fields";
import {
  calculateEqualSplit,
  calculateCustomSplits,
  calculateProxySplit,
} from "@/lib/calculation/split";
import type { Category, Group, Profile } from "@/types/database";

type FullPaymentFormProps = {
  groups: Group[];
  categories: Category[];
  members: { [groupId: string]: Profile[] };
  currentUserId: string;
};

/**
 * フル機能の支払い登録フォーム
 *
 * /payments/new ページで使用
 * グループ選択、カテゴリ選択、割り勘設定（均等/カスタム/全額立替）を含む
 */
export default function FullPaymentForm({
  groups,
  categories,
  members,
  currentUserId,
}: FullPaymentFormProps) {
  const router = useRouter();
  const form = usePaymentForm();
  const [error, setError] = useState<string | null>(null);

  // フル版専用の状態
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [categoryId, setCategoryId] = useState("");
  const [customSplits, setCustomSplits] = useState<{ [userId: string]: string }>(
    {}
  );

  const currentMembers = groupId ? members[groupId] || [] : [];
  const otherMembers = currentMembers.filter((m) => m.id !== currentUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 共通バリデーション（代理購入チェック含む）
    if (!form.validate({ currentUserId })) {
      return;
    }

    const supabase = createClient();
    const formData = form.getFormData();

    // Create payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        group_id: groupId,
        payer_id: currentUserId,
        amount: formData.amount,
        description: formData.description,
        category_id: categoryId || null,
        payment_date: formData.paymentDate.toISOString().split("T")[0],
      })
      .select()
      .single();

    if (paymentError || !payment) {
      setError(paymentError?.message || t("payments.errors.createFailed"));
      return;
    }

    // Create payment splits based on splitType
    let splits;
    if (formData.splitType === "proxy" && formData.proxyBeneficiaryId) {
      splits = calculateProxySplit({
        paymentId: payment.id,
        totalAmount: formData.amount,
        payerId: currentUserId,
        beneficiaryId: formData.proxyBeneficiaryId,
        allMemberIds: currentMembers.map((m) => m.id),
      });
    } else if (formData.splitType === "custom") {
      splits = calculateCustomSplits({
        paymentId: payment.id,
        customAmounts: customSplits,
      });
    } else {
      splits = calculateEqualSplit({
        paymentId: payment.id,
        totalAmount: formData.amount,
        memberIds: currentMembers.map((m) => m.id),
        payerId: currentUserId,
      });
    }

    if (splits.length > 0) {
      await supabase.from("payment_splits").insert(splits);
    }

    router.push("/payments");
    router.refresh();
  };

  if (groups.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
        <p>{t("payments.errors.noGroup")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Group Selection */}
      <div>
        <label
          htmlFor="group"
          className="block text-sm font-medium text-gray-700"
        >
          {t("payments.form.group")}
        </label>
        <select
          id="group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {/* Amount - 共通コンポーネント使用 */}
      <AmountField
        id="amount"
        value={form.amount}
        onChange={form.setAmount}
        error={form.errors.amount}
      />

      {/* Description - 共通コンポーネント使用 */}
      <DescriptionField
        id="description"
        value={form.description}
        onChange={form.setDescription}
        error={form.errors.description}
      />

      {/* Category */}
      <div>
        <label
          htmlFor="category"
          className="block text-sm font-medium text-gray-700"
        >
          {t("payments.form.category")}
        </label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">{t("payments.form.selectCategory")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Date - 共通コンポーネント使用 */}
      <DateField
        id="paymentDate"
        value={form.paymentDate}
        onChange={form.setPaymentDate}
        error={form.errors.paymentDate}
      />

      {/* Split Type - 3択ラジオ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("payments.form.split")}
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="splitType"
              value="equal"
              checked={form.splitType === "equal"}
              onChange={() => {
                form.setSplitType("equal");
                form.setProxyBeneficiaryId("");
              }}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              {t("payments.form.splitEqually")}
            </span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="splitType"
              value="custom"
              checked={form.splitType === "custom"}
              onChange={() => {
                form.setSplitType("custom");
                form.setProxyBeneficiaryId("");
              }}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              {t("payments.form.customSplit")}
            </span>
          </label>
          {otherMembers.length > 0 && (
            <label className="flex items-center">
              <input
                type="radio"
                name="splitType"
                value="proxy"
                checked={form.splitType === "proxy"}
                onChange={() => {
                  form.setSplitType("proxy");
                  // 2人グループ: 自動的に相手を受益者にセット
                  if (otherMembers.length === 1) {
                    form.setProxyBeneficiaryId(otherMembers[0].id);
                  }
                }}
                className="mr-2 accent-purple-600"
              />
              <span className="text-sm text-gray-700">
                {t("payments.form.splitProxy")}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Custom Splits */}
      {form.splitType === "custom" && currentMembers.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("payments.form.splitAmounts")}
          </label>
          {currentMembers.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-32 truncate">
                {member.display_name || member.email}
              </span>
              <input
                type="number"
                value={customSplits[member.id] || ""}
                onChange={(e) =>
                  setCustomSplits((prev) => ({
                    ...prev,
                    [member.id]: e.target.value,
                  }))
                }
                min="0"
                step="1"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      )}

      {/* Proxy Beneficiary Selection */}
      {form.splitType === "proxy" && (
        otherMembers.length === 1 ? (
          <p className="text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
            {t("payments.form.proxyAutoConfirm", {
              name: otherMembers[0].display_name || otherMembers[0].email,
            })}
          </p>
        ) : (
          <div>
            <label
              htmlFor="full-proxy-beneficiary"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("payments.form.proxyBeneficiary")}
            </label>
            <select
              id="full-proxy-beneficiary"
              value={form.proxyBeneficiaryId}
              onChange={(e) => form.setProxyBeneficiaryId(e.target.value)}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                form.errors.proxyBeneficiaryId
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              aria-invalid={!!form.errors.proxyBeneficiaryId}
              aria-describedby={
                form.errors.proxyBeneficiaryId
                  ? "full-proxy-beneficiary-error"
                  : undefined
              }
            >
              <option value="">
                {t("payments.form.selectBeneficiary")}
              </option>
              {otherMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name || member.email}
                </option>
              ))}
            </select>
            {form.errors.proxyBeneficiaryId && (
              <p
                id="full-proxy-beneficiary-error"
                className="mt-1 text-sm text-red-600"
                role="alert"
              >
                {form.errors.proxyBeneficiaryId}
              </p>
            )}
          </div>
        )
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={form.isSubmitting}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {form.isSubmitting
          ? t("payments.form.submitting")
          : t("payments.form.submit")}
      </button>
    </form>
  );
}
