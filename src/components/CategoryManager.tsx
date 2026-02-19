"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { getCategoryStyle } from "@/lib/format/color";
import { ColorPicker } from "./ColorPicker";
import type { Category } from "@/types/database";

type CategoryManagerProps = {
  groupId: string;
  categories: Category[];
};

type FormState = {
  name: string;
  icon: string;
  color: string | null;
};

const INITIAL_FORM: FormState = { name: "", icon: "", color: null };

export function CategoryManager({ groupId, categories }: CategoryManagerProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultCategories = categories.filter((c) => c.is_default);
  const customCategories = categories.filter((c) => !c.is_default);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }, []);

  const handleEdit = (cat: Category) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, icon: cat.icon || "", color: cat.color || null });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const isEdit = !!editingId;
      const url = isEdit ? `/api/categories/${editingId}` : "/api/categories";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? {} : { groupId }),
          name: form.name,
          icon: form.icon || null,
          color: form.color,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error ||
            t(isEdit ? "categories.management.updateFailed" : "categories.management.createFailed")
        );
        return;
      }

      resetForm();
      router.refresh();
    } catch {
      setError(t("categories.management.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("categories.management.deleteConfirm"))) return;

    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("categories.management.deleteFailed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("categories.management.deleteFailed"));
    }
  };

  return (
    <div>
      {/* Default categories (read-only list) */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1.5">
          {defaultCategories.map((cat) => {
            const style = getCategoryStyle(cat.color);
            return (
              <span
                key={cat.id}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full${!style ? " bg-theme-bg text-theme-muted" : ""}`}
                style={style || undefined}
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* Custom categories (editable) */}
      {customCategories.length > 0 && (
        <ul className="space-y-2 mb-3">
          {customCategories.map((cat) => {
            const style = getCategoryStyle(cat.color);
            return (
              <li key={cat.id} className="flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0${!style ? " bg-theme-bg" : ""}`}
                    style={style ? { backgroundColor: style.backgroundColor } : undefined}
                  >
                    {cat.icon || "·"}
                  </span>
                  <span className="text-sm text-theme-text truncate">{cat.name}</span>
                  <span className="text-[10px] text-theme-muted px-1 py-0.5 bg-theme-bg rounded">
                    {t("categories.management.customBadge")}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(cat)}
                    className="p-1 text-theme-muted hover:text-theme-primary-text transition-colors"
                    aria-label={t("categories.management.edit")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    className="p-1 text-theme-muted hover:text-theme-accent transition-colors"
                    aria-label={t("common.delete")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-3 text-sm text-theme-accent bg-theme-accent/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3 bg-theme-bg rounded-lg p-3">
          <div className="text-sm font-medium text-theme-headline">
            {editingId ? t("categories.management.edit") : t("categories.management.add")}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder={t("categories.management.iconPlaceholder")}
              className="w-14 px-2 py-1.5 text-center border border-theme-card-border rounded-lg text-lg bg-theme-card-bg text-theme-headline"
              maxLength={2}
            />
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t("categories.management.namePlaceholder")}
              className="flex-1 px-3 py-1.5 border border-theme-card-border rounded-lg text-sm bg-theme-card-bg text-theme-headline placeholder:text-theme-muted/70"
              maxLength={50}
              required
            />
          </div>

          <div>
            <label className="block text-xs text-theme-muted mb-1">
              {t("categories.management.color")}
            </label>
            <ColorPicker
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm text-theme-muted hover:text-theme-text transition-colors"
            >
              {t("categories.management.cancel")}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3 py-1.5 text-sm font-medium text-theme-button-text bg-theme-primary rounded-lg hover:bg-theme-primary/80 disabled:opacity-50"
            >
              {isSubmitting ? t("categories.management.saving") : t("categories.management.save")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditingId(null); setForm(INITIAL_FORM); }}
          className="w-full py-2 text-sm text-theme-primary-text hover:bg-theme-primary/10 rounded-lg transition-colors border border-dashed border-theme-card-border"
        >
          + {t("categories.management.add")}
        </button>
      )}
    </div>
  );
}
