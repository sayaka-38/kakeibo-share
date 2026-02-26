"use client";

import { useState, useEffect, useCallback } from "react";
import { t } from "@/lib/i18n";
import { validateRecurringRule } from "@/lib/validation/recurring-rule";
import type { Category, Profile } from "@/types/database";
import type { RuleWithRelations } from "@/types/domain";

type UseRecurringRuleFormArgs = {
  groupId: string;
  members: Profile[];
  categories: Category[];
  currentUserId: string;
  editingRule: RuleWithRelations | null;
  onClose: () => void;
  onCreated: (rule: RuleWithRelations) => void;
  onUpdated: (rule: RuleWithRelations) => void;
};

export function useRecurringRuleForm({
  groupId,
  members,
  categories,
  currentUserId,
  editingRule,
  onClose,
  onCreated,
  onUpdated,
}: UseRecurringRuleFormArgs) {
  const isEditMode = !!editingRule;

  const defaultStartDate = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  })();

  // フォームステート
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
    editingRule?.is_variable
      ? "equal"
      : (editingRule?.split_type as "equal" | "custom") || "equal"
  );
  const [intervalMonths, setIntervalMonths] = useState(
    String(editingRule?.interval_months ?? 1)
  );
  const [startDate, setStartDate] = useState(
    editingRule?.start_date || defaultStartDate
  );
  const [endDate, setEndDate] = useState(editingRule?.end_date || "");

  // カスタム分割パーセンテージ（整数のみ）
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
    if (members.length === 0) return {};
    const perPerson = Math.floor(100 / members.length);
    const remainder = 100 - perPerson * members.length;
    const initial: { [userId: string]: string } = {};
    members.forEach((m, i) => {
      initial[m.id] = String(i === members.length - 1 ? perPerson + remainder : perPerson);
    });
    return initial;
  });

  // バリデーション / 送信ステート
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 変動費に切り替えたら split を均等にリセット
  useEffect(() => {
    if (isVariable) setSplitType("equal");
  }, [isVariable]);

  // ESC キーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isSubmitting]);

  // パーセンテージ合計（整数）
  const percentageTotal = Object.values(percentages).reduce((sum, val) => {
    const parsed = parseInt(val);
    return sum + (isNaN(parsed) ? 0 : parsed);
  }, 0);

  // 1人の % を変えたら残りを他メンバーに均等配分
  const handlePercentageChange = useCallback(
    (userId: string, value: string) => {
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
            updated[uid] = String(remaining - distributed);
          } else {
            updated[uid] = String(perPerson);
            distributed += perPerson;
          }
        });
        return updated;
      });
    },
    [members]
  );

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

  return {
    // フォームフィールド
    description,
    setDescription,
    categoryId,
    setCategoryId,
    isVariable,
    setIsVariable,
    amount,
    setAmount,
    dayOfMonth,
    setDayOfMonth,
    defaultPayerId,
    setDefaultPayerId,
    splitType,
    setSplitType,
    intervalMonths,
    setIntervalMonths,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    percentages,
    percentageTotal,
    // バリデーション / 送信
    errors,
    isSubmitting,
    submitError,
    isEditMode,
    // ハンドラ
    handlePercentageChange,
    handleSubmit,
  };
}
