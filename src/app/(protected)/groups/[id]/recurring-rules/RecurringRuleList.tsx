"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import type { Category, Profile } from "@/types/database";
import RecurringRuleCard from "./RecurringRuleCard";
import RecurringRuleForm from "./RecurringRuleForm";

// API レスポンスの型
type RuleWithRelations = {
  id: string;
  group_id: string;
  category_id: string | null;
  description: string;
  default_amount: number | null;
  is_variable: boolean;
  day_of_month: number;
  default_payer_id: string;
  split_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  default_payer: { id: string; display_name: string | null; email: string | null } | null;
  splits: {
    id: string;
    user_id: string;
    amount: number | null;
    percentage: number | null;
    user: { id: string; display_name: string | null; email: string | null } | null;
  }[];
};

type RecurringRuleListProps = {
  groupId: string;
  rules: RuleWithRelations[];
  members: Profile[];
  categories: Category[];
  currentUserId: string;
  isOwner: boolean;
};

export default function RecurringRuleList({
  groupId,
  rules: initialRules,
  members,
  categories,
  currentUserId,
  isOwner,
}: RecurringRuleListProps) {
  const [rules, setRules] = useState(initialRules);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleWithRelations | null>(null);

  const handleAddClick = () => {
    setEditingRule(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (rule: RuleWithRelations) => {
    setEditingRule(rule);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingRule(null);
  };

  const handleRuleCreated = (newRule: RuleWithRelations) => {
    setRules((prev) => [...prev, newRule].sort((a, b) => {
      if (a.day_of_month !== b.day_of_month) {
        return a.day_of_month - b.day_of_month;
      }
      return a.description.localeCompare(b.description);
    }));
    handleFormClose();
  };

  const handleRuleUpdated = (updatedRule: RuleWithRelations) => {
    setRules((prev) =>
      prev
        .map((r) => (r.id === updatedRule.id ? updatedRule : r))
        .sort((a, b) => {
          if (a.day_of_month !== b.day_of_month) {
            return a.day_of_month - b.day_of_month;
          }
          return a.description.localeCompare(b.description);
        })
    );
    handleFormClose();
  };

  const handleRuleDeleted = (ruleId: string) => {
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
  };

  return (
    <div className="space-y-4">
      {/* Add Button */}
      <div className="flex justify-end">
        <Button onClick={handleAddClick} size="sm">
          + {t("recurringRules.addRule")}
        </Button>
      </div>

      {/* Rule Cards */}
      {rules.length === 0 ? (
        <div className="bg-theme-bg rounded-lg p-8 text-center">
          <p className="text-theme-muted mb-2">{t("recurringRules.noRules")}</p>
          <p className="text-sm text-theme-muted">{t("recurringRules.noRulesHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RecurringRuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => handleEditClick(rule)}
              onDelete={() => handleRuleDeleted(rule.id)}
              isOwner={isOwner}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <RecurringRuleForm
          groupId={groupId}
          members={members}
          categories={categories}
          currentUserId={currentUserId}
          editingRule={editingRule}
          onClose={handleFormClose}
          onCreated={handleRuleCreated}
          onUpdated={handleRuleUpdated}
        />
      )}
    </div>
  );
}

export type { RuleWithRelations };
