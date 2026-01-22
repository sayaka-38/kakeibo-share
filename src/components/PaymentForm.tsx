"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import type { Category, Group, Profile } from "@/types/database";

type PaymentFormProps = {
  groups: Group[];
  categories: Category[];
  members: { [groupId: string]: Profile[] };
  currentUserId: string;
};

export default function PaymentForm({
  groups,
  categories,
  members,
  currentUserId,
}: PaymentFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [splitType, setSplitType] = useState<"equal" | "custom">("equal");
  const [customSplits, setCustomSplits] = useState<{ [userId: string]: string }>(
    {}
  );

  const currentMembers = groupId ? members[groupId] || [] : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      setError(t("payments.errors.invalidAmount"));
      setLoading(false);
      return;
    }

    // Create payment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: payment, error: paymentError } = await (supabase as any)
      .from("payments")
      .insert({
        group_id: groupId,
        paid_by: currentUserId,
        amount: numAmount,
        description,
        category_id: categoryId || null,
        payment_date: paymentDate,
      })
      .select()
      .single();

    if (paymentError || !payment) {
      setError(paymentError?.message || t("payments.errors.createFailed"));
      setLoading(false);
      return;
    }

    // Create payment splits
    const splits =
      splitType === "equal"
        ? currentMembers.map((member) => ({
            payment_id: payment.id,
            user_id: member.id,
            amount: numAmount / currentMembers.length,
          }))
        : currentMembers
            .filter((member) => customSplits[member.id])
            .map((member) => ({
              payment_id: payment.id,
              user_id: member.id,
              amount: parseFloat(customSplits[member.id]) || 0,
            }));

    if (splits.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: splitError } = await (supabase as any)
        .from("payment_splits")
        .insert(splits);

      if (splitError) {
        setError(t("payments.errors.splitFailed") + splitError.message);
        setLoading(false);
        return;
      }
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
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-gray-700"
        >
          {t("payments.form.amount")}
        </label>
        <input
          id="amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          min="1"
          step="1"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={t("payments.form.amountPlaceholder")}
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium text-gray-700"
        >
          {t("payments.form.description")}
        </label>
        <input
          id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={t("payments.form.descriptionPlaceholder")}
        />
      </div>

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
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">{t("payments.form.selectCategory")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Date */}
      <div>
        <label
          htmlFor="paymentDate"
          className="block text-sm font-medium text-gray-700"
        >
          {t("payments.form.date")}
        </label>
        <input
          id="paymentDate"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Split Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t("payments.form.split")}
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="splitType"
              value="equal"
              checked={splitType === "equal"}
              onChange={() => setSplitType("equal")}
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
              checked={splitType === "custom"}
              onChange={() => setSplitType("custom")}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">
              {t("payments.form.customSplit")}
            </span>
          </label>
        </div>
      </div>

      {/* Custom Splits */}
      {splitType === "custom" && currentMembers.length > 0 && (
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0"
              />
            </div>
          ))}
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("payments.form.adding") : t("payments.form.add")}
      </button>
    </form>
  );
}
