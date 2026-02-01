"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { formatCurrency } from "@/lib/format/currency";
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

  // --- カスタム割り勘: 自動補完ロジック ---
  const lastEditedRef = useRef<string | null>(null);

  /** 合計金額（パース済み） */
  const totalAmount = parseFloat(form.amount) || 0;

  /** カスタム割り勘の内訳合計 */
  const customSplitTotal = Object.values(customSplits).reduce((sum, val) => {
    const parsed = parseFloat(val);
    return sum + (isNaN(parsed) || parsed < 0 ? 0 : Math.floor(parsed));
  }, 0);

  /** 残り金額 */
  const splitRemaining = totalAmount - customSplitTotal;

  /** 3人以上の場合、最後のメンバーが自動補完対象 */
  const autoCompleteTargetId =
    currentMembers.length >= 3
      ? currentMembers[currentMembers.length - 1].id
      : null;

  /** カスタム割り勘の入力変更ハンドラ（自動補完付き） */
  const handleCustomSplitChange = (memberId: string, value: string) => {
    lastEditedRef.current = memberId;

    setCustomSplits((prev) => {
      const newSplits = { ...prev, [memberId]: value };
      const total = parseFloat(form.amount) || 0;

      if (total > 0 && currentMembers.length === 2) {
        // 2人: もう一方を自動計算
        const otherMember = currentMembers.find((m) => m.id !== memberId);
        if (otherMember) {
          const entered = Math.floor(parseFloat(value) || 0);
          const remaining = total - entered;
          newSplits[otherMember.id] =
            remaining >= 0 ? String(remaining) : "0";
        }
      } else if (
        total > 0 &&
        currentMembers.length >= 3 &&
        memberId !== currentMembers[currentMembers.length - 1].id
      ) {
        // 3人以上: 最後のメンバーを自動計算
        const lastMemberId = currentMembers[currentMembers.length - 1].id;
        const othersSum = currentMembers
          .filter((m) => m.id !== lastMemberId)
          .reduce((sum, m) => {
            const val = m.id === memberId ? value : newSplits[m.id] || "0";
            return sum + Math.floor(parseFloat(val) || 0);
          }, 0);
        const remaining = total - othersSum;
        newSplits[lastMemberId] =
          remaining >= 0 ? String(remaining) : "0";
      }

      return newSplits;
    });
  };

  /** 金額変更時にカスタム割り勘の自動補完を再計算 */
  const handleAmountChange = (value: string) => {
    form.setAmount(value);
    const newTotal = parseFloat(value.replace(/[^0-9]/g, "")) || 0;

    if (form.splitType !== "custom" || currentMembers.length < 2 || newTotal <= 0) return;

    setCustomSplits((prev) => {
      const newSplits = { ...prev };

      if (currentMembers.length === 2) {
        const editedId = lastEditedRef.current || currentMembers[0].id;
        const otherId = currentMembers.find((m) => m.id !== editedId)?.id;
        if (otherId) {
          const editedVal = Math.floor(parseFloat(prev[editedId] || "0") || 0);
          const remaining = newTotal - editedVal;
          newSplits[otherId] = remaining >= 0 ? String(remaining) : "0";
        }
      } else {
        const lastMemberId = currentMembers[currentMembers.length - 1].id;
        const othersSum = currentMembers
          .filter((m) => m.id !== lastMemberId)
          .reduce(
            (sum, m) => sum + Math.floor(parseFloat(prev[m.id] || "0") || 0),
            0
          );
        const remaining = newTotal - othersSum;
        newSplits[lastMemberId] = remaining >= 0 ? String(remaining) : "0";
      }

      return newSplits;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 共通バリデーション（代理購入チェック含む）
    if (!form.validate({ currentUserId })) {
      return;
    }

    // カスタム割り勘: 合計金額バリデーション
    const formData = form.getFormData();
    if (formData.splitType === "custom") {
      const splitTotal = Object.values(customSplits).reduce((sum, val) => {
        const parsed = parseFloat(val);
        return sum + (isNaN(parsed) || parsed < 0 ? 0 : Math.floor(parsed));
      }, 0);
      if (splitTotal !== formData.amount) {
        setError(
          t("payments.validation.customSplitMismatch", {
            splitTotal: formatCurrency(splitTotal),
            total: formatCurrency(formData.amount),
          })
        );
        return;
      }
    }

    const supabase = createClient();

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
        onChange={handleAmountChange}
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
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              {t("payments.form.splitAmounts")}
            </label>
            {totalAmount > 0 && (
              <span
                className={`text-xs font-medium ${
                  splitRemaining === 0
                    ? "text-green-600"
                    : splitRemaining > 0
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {t("payments.form.splitRemaining", {
                  amount: formatCurrency(Math.abs(splitRemaining)),
                })}
                {splitRemaining === 0 && " ✓"}
              </span>
            )}
          </div>
          {currentMembers.map((member) => {
            const isAutoTarget = autoCompleteTargetId === member.id;
            return (
              <div key={member.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-32 truncate">
                  {member.display_name || member.email}
                </span>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={customSplits[member.id] || ""}
                    onChange={(e) =>
                      handleCustomSplitChange(member.id, e.target.value)
                    }
                    readOnly={isAutoTarget}
                    min="0"
                    step="1"
                    className={`w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      isAutoTarget
                        ? "border-gray-200 bg-gray-50 text-gray-500"
                        : "border-gray-300"
                    }`}
                    placeholder="0"
                  />
                  {isAutoTarget && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      {t("payments.form.autoCalculated")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
