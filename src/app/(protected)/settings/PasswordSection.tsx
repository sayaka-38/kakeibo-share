"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

export function PasswordSection() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (newPassword.length < 6) {
      setMessage(t("settings.password.tooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(t("settings.password.mismatch"));
      return;
    }

    setSaving(true);

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (res.ok) {
      setMessage(t("settings.password.changeSuccess"));
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json();
      setMessage(data.error || t("settings.password.changeFailed"));
    }
    setSaving(false);
  };

  return (
    <section className="bg-theme-card-bg rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-theme-headline mb-4">
        {t("settings.password.title")}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="newPassword"
            className="block text-sm font-medium text-theme-text mb-1"
          >
            {t("settings.password.newPassword")}
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("settings.password.newPasswordPlaceholder")}
            minLength={6}
            className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-theme-text mb-1"
          >
            {t("settings.password.confirmPassword")}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("settings.password.confirmPasswordPlaceholder")}
            minLength={6}
            className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
          />
        </div>
        {message && (
          <p
            className={`text-sm ${
              message === t("settings.password.changeSuccess")
                ? "text-green-600"
                : "text-theme-accent"
            }`}
          >
            {message}
          </p>
        )}
        <Button
          type="submit"
          loading={saving}
          disabled={!newPassword || !confirmPassword}
        >
          {saving ? t("settings.password.changing") : t("settings.password.change")}
        </Button>
      </form>
    </section>
  );
}
