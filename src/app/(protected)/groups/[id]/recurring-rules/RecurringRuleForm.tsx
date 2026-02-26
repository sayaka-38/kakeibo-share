"use client";

import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { AmountFieldWithKeypad } from "@/components/payment-form/fields/AmountFieldWithKeypad";
import { getMemberDisplayName } from "@/lib/domain/member-utils";
import { useRecurringRuleForm } from "./useRecurringRuleForm";
import type { Category, Profile } from "@/types/database";
import type { RuleWithRelations } from "@/types/domain";

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

export default function RecurringRuleForm(props: RecurringRuleFormProps) {
  const {
    description, setDescription,
    categoryId, setCategoryId,
    isVariable, setIsVariable,
    amount, setAmount,
    dayOfMonth, setDayOfMonth,
    defaultPayerId, setDefaultPayerId,
    splitType, setSplitType,
    intervalMonths, setIntervalMonths,
    startDate, setStartDate,
    endDate, setEndDate,
    percentages, percentageTotal,
    errors,
    isSubmitting,
    submitError,
    isEditMode,
    handlePercentageChange,
    handleSubmit,
  } = useRecurringRuleForm(props);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => { if (!isSubmitting) props.onClose(); }}
    >
      <div
        className="bg-theme-card-bg rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-theme-card-bg border-b px-6 py-4 rounded-t-xl flex items-center justify-between">
          <h2 className="text-lg font-semibold text-theme-headline">
            {isEditMode ? t("recurringRules.editRule") : t("recurringRules.addRule")}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2.5 -m-2.5 text-theme-muted hover:text-theme-text transition-colors"
            aria-label="閉じる"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
            <label htmlFor="rule-description" className="block text-sm font-medium text-theme-text mb-1">
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
            <label htmlFor="rule-category" className="block text-sm font-medium text-theme-text mb-1">
              {t("recurringRules.form.category")}
            </label>
            <select
              id="rule-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            >
              <option value="">{t("recurringRules.form.selectCategory")}</option>
              {props.categories.map((cat) => (
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
                <span className="text-sm text-theme-text">{t("recurringRules.fixedAmount")}</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="isVariable"
                  checked={isVariable}
                  onChange={() => setIsVariable(true)}
                  className="mr-2"
                />
                <span className="text-sm text-theme-text">{t("recurringRules.variableAmount")}</span>
              </label>
            </div>
          </div>

          {/* Amount */}
          <AmountFieldWithKeypad
            id="rule-amount"
            value={amount}
            onChange={setAmount}
            error={errors.amount}
            disabled={isVariable}
          />

          {/* Day of Month */}
          <div>
            <label htmlFor="rule-day" className="block text-sm font-medium text-theme-text mb-1">
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
            <label htmlFor="rule-interval" className="block text-sm font-medium text-theme-text mb-1">
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
            <label htmlFor="rule-start-date" className="block text-sm font-medium text-theme-text mb-1">
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
            <label htmlFor="rule-end-date" className="block text-sm font-medium text-theme-text mb-1">
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
            <label htmlFor="rule-payer" className="block text-sm font-medium text-theme-text mb-1">
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
              {props.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {getMemberDisplayName(member)}
                </option>
              ))}
            </select>
            {errors.defaultPayerId && (
              <p className="mt-1 text-sm text-theme-accent">{errors.defaultPayerId}</p>
            )}
          </div>

          {/* Split Type — 変動費では不要 */}
          {!isVariable && (
            <>
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
                    <span className="text-sm text-theme-text">{t("recurringRules.splitEqual")}</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="splitType"
                      checked={splitType === "custom"}
                      onChange={() => setSplitType("custom")}
                      className="mr-2"
                    />
                    <span className="text-sm text-theme-text">{t("recurringRules.splitCustom")}</span>
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
                        percentageTotal === 100 ? "text-theme-text" : "text-theme-primary-text"
                      }`}
                    >
                      {t("recurringRules.percentageTotal", { total: String(percentageTotal) })}
                      {percentageTotal === 100 && " ✓"}
                    </span>
                  </div>
                  {props.members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <span className="text-sm text-theme-muted w-32 truncate">
                        {getMemberDisplayName(member)}
                      </span>
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          value={percentages[member.id] || ""}
                          onChange={(e) => handlePercentageChange(member.id, e.target.value)}
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
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="secondary"
              onClick={props.onClose}
              disabled={isSubmitting}
              fullWidth
            >
              {t("recurringRules.form.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting} fullWidth>
              {isSubmitting ? t("recurringRules.form.saving") : t("recurringRules.form.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
