"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";
import type { Category, Profile } from "@/types/database";
import type { RuleWithRelations } from "./RecurringRuleList";

type RecurringRuleFormProps = {
  groupId: string;
  members: Profile[];
  categories: Category[];
  currentUserId: string;
  editingRule: RuleWithRelations | null;
  onClose: () => void;
  onCreated: (rule: RuleWithRelations) => void;
  onUpdated: (rule: RuleWithRelations) => void;
};

export default function RecurringRuleForm({
  groupId,
  members,
  categories,
  currentUserId,
  editingRule,
  onClose,
  onCreated,
  onUpdated,
}: RecurringRuleFormProps) {
  const isEditMode = !!editingRule;

  // Form state
  const [description, setDescription] = useState(editingRule?.description || "");
  const [categoryId, setCategoryId] = useState(editingRule?.category_id || "");
  const [isVariable, setIsVariable] = useState(editingRule?.is_variable ?? false);
  const [amount, setAmount] = useState(
    editingRule?.default_amount ? String(editingRule.default_amount) : ""
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    editingRule?.day_of_month ? String(editingRule.day_of_month) : ""
  );
  const [defaultPayerId, setDefaultPayerId] = useState(
    editingRule?.default_payer_id || currentUserId
  );
  const [splitType, setSplitType] = useState<"equal" | "custom">(
    (editingRule?.split_type as "equal" | "custom") || "equal"
  );

  // カスタム分割: パーセンテージ
  const [percentages, setPercentages] = useState<{ [userId: string]: string }>(() => {
    if (editingRule?.split_type === "custom" && editingRule.splits.length > 0) {
      const initial: { [userId: string]: string } = {};
      editingRule.splits.forEach((s) => {
        if (s.percentage !== null) {
          initial[s.user_id] = String(s.percentage);
        }
      });
      return initial;
    }
    // デフォルト: 均等割り
    const equalPercent = members.length > 0 ? (100 / members.length).toFixed(1) : "0";
    const initial: { [userId: string]: string } = {};
    members.forEach((m) => {
      initial[m.id] = equalPercent;
    });
    return initial;
  });

  // Validation state
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // パーセンテージ合計
  const percentageTotal = Object.values(percentages).reduce((sum, val) => {
    const parsed = parseFloat(val);
    return sum + (isNaN(parsed) ? 0 : parsed);
  }, 0);

  const handlePercentageChange = useCallback((userId: string, value: string) => {
    setPercentages((prev) => ({ ...prev, [userId]: value }));
  }, []);

  // Validation
  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!description.trim()) {
      newErrors.description = t("recurringRules.validation.descriptionRequired");
    }

    if (!dayOfMonth) {
      newErrors.dayOfMonth = t("recurringRules.validation.dayRequired");
    }

    if (!defaultPayerId) {
      newErrors.defaultPayerId = t("recurringRules.validation.payerRequired");
    }

    if (!isVariable && (!amount || parseInt(amount) <= 0)) {
      newErrors.amount = t("recurringRules.validation.amountRequired");
    }

    if (splitType === "custom" && Math.abs(percentageTotal - 100) > 0.1) {
      newErrors.percentages = t("recurringRules.percentageMismatch");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const body = {
        groupId,
        description: description.trim(),
        categoryId: categoryId || null,
        isVariable,
        defaultAmount: isVariable ? null : parseInt(amount),
        dayOfMonth: parseInt(dayOfMonth),
        defaultPayerId,
        splitType,
        splits:
          splitType === "custom"
            ? members.map((m) => ({
                userId: m.id,
                percentage: parseFloat(percentages[m.id] || "0"),
              }))
            : undefined,
      };

      const url = isEditMode
        ? `/api/recurring-rules/${editingRule.id}`
        : "/api/recurring-rules";

      const res = await fetch(url, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          data.error ||
            t(
              isEditMode
                ? "recurringRules.errors.updateFailed"
                : "recurringRules.errors.createFailed"
            )
        );
        return;
      }

      const { rule } = await res.json();

      // ルール単体で返ってくるので、関連データを追加してコールバック
      // 実際のAPIレスポンスには関連データが含まれないので、再フェッチするか手動で構築
      // ここでは簡易的に構築
      const ruleWithRelations: RuleWithRelations = {
        ...rule,
        category: categories.find((c) => c.id === rule.category_id) || null,
        default_payer: members.find((m) => m.id === rule.default_payer_id) || null,
        splits:
          splitType === "custom"
            ? members.map((m) => ({
                id: `temp-${m.id}`,
                user_id: m.id,
                amount: null,
                percentage: parseFloat(percentages[m.id] || "0"),
                user: m,
              }))
            : [],
      };

      if (isEditMode) {
        onUpdated(ruleWithRelations);
      } else {
        onCreated(ruleWithRelations);
      }
    } catch {
      setSubmitError(
        t(
          isEditMode
            ? "recurringRules.errors.updateFailed"
            : "recurringRules.errors.createFailed"
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditMode ? t("recurringRules.editRule") : t("recurringRules.addRule")}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {submitError}
            </div>
          )}

          {/* Description */}
          <div>
            <label
              htmlFor="rule-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("recurringRules.form.description")}
            </label>
            <input
              id="rule-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("recurringRules.form.descriptionPlaceholder")}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.description ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="rule-category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("recurringRules.form.category")}
            </label>
            <select
              id="rule-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">{t("recurringRules.form.selectCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("recurringRules.isVariable")}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="isVariable"
                  checked={!isVariable}
                  onChange={() => setIsVariable(false)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  {t("recurringRules.fixedAmount")}
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="isVariable"
                  checked={isVariable}
                  onChange={() => setIsVariable(true)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  {t("recurringRules.variableAmount")}
                </span>
              </label>
            </div>
            {isVariable && (
              <p className="mt-1 text-xs text-gray-500">
                {t("recurringRules.variableAmountHint")}
              </p>
            )}
          </div>

          {/* Amount (only for fixed) */}
          {!isVariable && (
            <AmountFieldWithKeypad
              id="rule-amount"
              value={amount}
              onChange={setAmount}
              error={errors.amount}
            />
          )}

          {/* Day of Month */}
          <div>
            <label
              htmlFor="rule-day"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("recurringRules.dayOfMonth")}
            </label>
            <select
              id="rule-day"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.dayOfMonth ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">{t("recurringRules.form.selectDay")}</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}日
                </option>
              ))}
            </select>
            {errors.dayOfMonth && (
              <p className="mt-1 text-sm text-red-600">{errors.dayOfMonth}</p>
            )}
            {dayOfMonth === "31" && (
              <p className="mt-1 text-xs text-amber-600">
                {t("recurringRules.dayOfMonthEndHint")}
              </p>
            )}
          </div>

          {/* Default Payer */}
          <div>
            <label
              htmlFor="rule-payer"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("recurringRules.defaultPayer")}
            </label>
            <select
              id="rule-payer"
              value={defaultPayerId}
              onChange={(e) => setDefaultPayerId(e.target.value)}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                errors.defaultPayerId ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">{t("recurringRules.form.selectPayer")}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.display_name || member.email}
                </option>
              ))}
            </select>
            {errors.defaultPayerId && (
              <p className="mt-1 text-sm text-red-600">{errors.defaultPayerId}</p>
            )}
          </div>

          {/* Split Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("recurringRules.splitType")}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="splitType"
                  checked={splitType === "equal"}
                  onChange={() => setSplitType("equal")}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  {t("recurringRules.splitEqual")}
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="splitType"
                  checked={splitType === "custom"}
                  onChange={() => setSplitType("custom")}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">
                  {t("recurringRules.splitCustom")}
                </span>
              </label>
            </div>
          </div>

          {/* Custom Split Percentages */}
          {splitType === "custom" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  {t("recurringRules.splitPercentage")}
                </label>
                <span
                  className={`text-xs font-medium ${
                    Math.abs(percentageTotal - 100) < 0.1
                      ? "text-green-600"
                      : "text-amber-600"
                  }`}
                >
                  {t("recurringRules.percentageTotal", {
                    total: percentageTotal.toFixed(1),
                  })}
                  {Math.abs(percentageTotal - 100) < 0.1 && " ✓"}
                </span>
              </div>
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-32 truncate">
                    {member.display_name || member.email}
                  </span>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={percentages[member.id] || ""}
                      onChange={(e) =>
                        handlePercentageChange(member.id, e.target.value)
                      }
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      %
                    </span>
                  </div>
                </div>
              ))}
              {errors.percentages && (
                <p className="text-sm text-red-600">{errors.percentages}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              fullWidth
            >
              {t("recurringRules.form.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting} fullWidth>
              {isSubmitting
                ? t("recurringRules.form.saving")
                : t("recurringRules.form.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
