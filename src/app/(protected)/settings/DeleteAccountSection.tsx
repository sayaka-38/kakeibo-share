"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

const LP_URL = "https://kakeibo-share.vercel.app/";

export function DeleteAccountSection() {
  const supabase = createClient();

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const isConfirmed =
    confirmText === t("settings.deleteAccount.confirmPlaceholder");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");

    const res = await fetch("/api/auth/delete-account", {
      method: "POST",
    });

    if (res.ok) {
      await supabase.auth.signOut();
      window.location.href = LP_URL;
    } else {
      const data = await res.json();
      setError(data.error || t("settings.deleteAccount.deleteFailed"));
      setDeleting(false);
    }
  };

  return (
    <section className="bg-theme-card-bg rounded-lg shadow p-6 border border-theme-accent/30">
      <h2 className="text-lg font-semibold text-theme-accent mb-2">
        {t("settings.deleteAccount.title")}
      </h2>
      <p className="text-sm text-theme-text mb-2">
        {t("settings.deleteAccount.description")}
      </p>
      <p className="text-sm font-medium text-theme-accent mb-4">
        {t("settings.deleteAccount.warning")}
      </p>
      <div className="space-y-3">
        <div>
          <label
            htmlFor="deleteConfirm"
            className="block text-sm font-medium text-theme-text mb-1"
          >
            {t("settings.deleteAccount.confirmLabel")}
          </label>
          <input
            id="deleteConfirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t("settings.deleteAccount.confirmPlaceholder")}
            className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-accent"
          />
        </div>
        {error && <p className="text-sm text-theme-accent">{error}</p>}
        <Button
          variant="danger"
          loading={deleting}
          disabled={!isConfirmed}
          onClick={handleDelete}
        >
          {deleting
            ? t("settings.deleteAccount.deleting")
            : t("settings.deleteAccount.delete")}
        </Button>
      </div>
    </section>
  );
}
