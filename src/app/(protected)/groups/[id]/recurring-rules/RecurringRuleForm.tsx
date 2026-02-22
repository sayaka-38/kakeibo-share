"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";
import { validateRecurringRule } from "@/lib/validation/recurring-rule";
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

  // 新規作成時のデフォルト開始日：現在の月の1日
  const defaultStartDate = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

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
  const [intervalMonths, setIntervalMonths] = useState(
    String(editingRule?.interval_months ?? 1)
  );
  const [startDate, setStartDate] = useState(
    editingRule?.start_date || defaultStartDate
  );
  const [endDate, setEndDate] = useState(editingRule?.end_date || "");

  // カスタム分割: パーセンテージ（整数のみ）
  const [percentages, setPercentages] = useState<{ [userId: string]: string }>(() => {
    if (editingRule?.split_type === "custom" && editingRule.splits.length > 0) {
      const initial: { [userId: string]: string } = {};
      editingRule.splits.forEach((s) => {
        if (s.percentage !== null) {
          initial[s.user_id] = String(Math.round(Number(s.percentage)));
        }
      });
      return initial;
    }
    // デフォルト: 均等割り（整数・端数は最後の人に加算）
    if (members.length === 0) return {};
    const perPerson = Math.floor(100 / members.length);
    const remainder = 100 - perPerson * members.length;
    const initial: { [userId: string]: string } = {};
    members.forEach((m, i) => {
      initial[m.id] = String(i === members.length - 1 ? perPerson + remainder : perPerson);
    });
    return initial;
  });

  // Validation state
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // パーセンテージ合計（整数）
  const percentageTotal = Object.values(percentages).reduce((sum, val) => {
    const parsed = parseInt(val);
    return sum + (isNaN(parsed) ? 0 : parsed);
  }, 0);

  // 1人の％を変えたら残りを他のメンバーに均等配分（案Aロジック）
  const handlePercentageChange = useCallback((userId: string, value: string) => {
    // 整数のみ許可（0〜100 にクランプ）
    const raw = parseInt(value);
    const newVal = isNaN(raw) ? 0 : Math.min(100, Math.max(0, raw));
    const newValStr = value === "" ? "" : String(newVal);

    setPercentages((prev) => {
      const updated = { ...prev, [userId]: newValStr };
      const otherIds = members.filter((m) => m.id !== userId).map((m) => m.id);
      if (otherIds.length === 0) return updated;

      const remaining = 100 - newVal;
      const perPerson = Math.floor(remaining / otherIds.length);
      let distributed = 0;
      otherIds.forEach((uid, i) => {
        if (i === otherIds.length - 1) {
          // 最後の人: 端数調整
          updated[uid] = String(remaining - distributed);
        } else {
          updated[uid] = String(perPerson);
          distributed += perPerson;
        }
      });
      return updated;
    });
  }, [members]);

  // Validation (shared with API)
  const validate = (): boolean => {
    const result = validateRecurringRule({
      description,
      dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : NaN,
      defaultPayerId,
      isVariable,
      defaultAmount: isVariable ? undefined : (amount ? parseInt(amount) : undefined),
      intervalMonths: parseInt(intervalMonths) || 1,
      splitType,
      percentageTotal: splitType === "custom" ? percentageTotal : undefined,
    });
    if (!result.success) {
      setErrors(result.errors);
      return false;
    }
    setErrors({});
    return true;
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
        intervalMonths: parseInt(intervalMonths),
        startDate,
        endDate: endDate || null,
        splits:
          splitType === "custom"
            ? members.map((m) => ({
                userId: m.id,
                percentage: parseInt(percentages[m.id] || "0"),
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
                percentage: parseInt(percentages[m.id] || "0"),
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
        className="bg-theme-card-bg rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-theme-card-bg border-b px-6 py-4 rounded-t-xl">
          <h2 className="text-lg font-semibold text-theme-headline">
            {isEditMode ? t("recurringRules.editRule") : t("recurringRules.addRule")}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {submitError && (
            <div className="bg-theme-accent/10 border border-theme-accent text-theme-accent px-4 py-3 rounded-lg text-sm">
              {submitError}
            </div>
          )}

          {/* Description */}
          <div>
            <label
              htmlFor="rule-description"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.form.description")}
            </label>
            <input
              id="rule-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("recurringRules.form.descriptionPlaceholder")}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary ${
                errors.description ? "border-theme-accent" : "border-theme-card-border"
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-theme-accent">{errors.description}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="rule-category"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.form.category")}
            </label>
            <select
              id="rule-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
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
            <label className="block text-sm font-medium text-theme-text mb-2">
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
                <span className="text-sm text-theme-text">
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
                <span className="text-sm text-theme-text">
                  {t("recurringRules.variableAmount")}
                </span>
              </label>
            </div>
            {isVariable && (
              <p className="mt-1 text-xs text-theme-muted">
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
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.dayOfMonth")}
            </label>
            <select
              id="rule-day"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary ${
                errors.dayOfMonth ? "border-theme-accent" : "border-theme-card-border"
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
              <p className="mt-1 text-sm text-theme-accent">{errors.dayOfMonth}</p>
            )}
            {dayOfMonth === "31" && (
              <p className="mt-1 text-xs text-theme-primary-text">
                {t("recurringRules.dayOfMonthEndHint")}
              </p>
            )}
          </div>

          {/* Interval Months */}
          <div>
            <label
              htmlFor="rule-interval"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.interval")}
            </label>
            <select
              id="rule-interval"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            >
              <option value="1">{t("recurringRules.intervalMonthly")}</option>
              <option value="2">{t("recurringRules.intervalEveryNMonths", { n: "2" })}</option>
              <option value="3">{t("recurringRules.intervalEveryNMonths", { n: "3" })}</option>
              <option value="6">{t("recurringRules.intervalEveryNMonths", { n: "6" })}</option>
              <option value="12">{t("recurringRules.intervalEveryNMonths", { n: "12" })}</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label
              htmlFor="rule-start-date"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.form.startDate")}
            </label>
            <input
              id="rule-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            />
          </div>

          {/* End Date */}
          <div>
            <label
              htmlFor="rule-end-date"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.form.endDate")}
            </label>
            <input
              id="rule-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            />
            <p className="mt-1 text-xs text-theme-muted">
              {t("recurringRules.form.endDateHint")}
            </p>
          </div>

          {/* Default Payer */}
          <div>
            <label
              htmlFor="rule-payer"
              className="block text-sm font-medium text-theme-text mb-1"
            >
              {t("recurringRules.defaultPayer")}
            </label>
            <select
              id="rule-payer"
              value={defaultPayerId}
              onChange={(e) => setDefaultPayerId(e.target.value)}
              className={`block w-full px-3 py-2 border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary ${
                errors.defaultPayerId ? "border-theme-accent" : "border-theme-card-border"
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
              <p className="mt-1 text-sm text-theme-accent">{errors.defaultPayerId}</p>
            )}
          </div>

          {/* Split Type */}
          <div>
            <label className="block text-sm font-medium text-theme-text mb-2">
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
                <span className="text-sm text-theme-text">
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
                <span className="text-sm text-theme-text">
                  {t("recurringRules.splitCustom")}
                </span>
              </label>
            </div>
          </div>

          {/* Custom Split Percentages */}
          {splitType === "custom" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-theme-text">
                  {t("recurringRules.splitPercentage")}
                </label>
                <span
                  className={`text-xs font-medium ${
                    percentageTotal === 100
                      ? "text-theme-text"
                      : "text-theme-primary-text"
                  }`}
                >
                  {t("recurringRules.percentageTotal", {
                    total: String(percentageTotal),
                  })}
                  {percentageTotal === 100 && " ✓"}
                </span>
              </div>
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <span className="text-sm text-theme-muted w-32 truncate">
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
                      step="1"
                      className="w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted/70">
                      %
                    </span>
                  </div>
                </div>
              ))}
              {errors.percentages && (
                <p className="text-sm text-theme-accent">{errors.percentages}</p>
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
