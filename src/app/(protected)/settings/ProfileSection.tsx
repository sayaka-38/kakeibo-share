"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

export function ProfileSection() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name || "");
        setOriginalName(profile.display_name || "");
      }
      setLoading(false);
    }
    loadProfile();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });

    if (res.ok) {
      setMessage(t("settings.profile.updateSuccess"));
      setOriginalName(displayName);
      router.refresh();
    } else {
      const data = await res.json();
      setMessage(data.error || t("settings.profile.updateFailed"));
    }
    setSaving(false);
  };

  return (
    <section className="bg-theme-card-bg rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-theme-headline mb-4">
        {t("settings.profile.title")}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-theme-text mb-1"
          >
            {t("settings.profile.displayName")}
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("settings.profile.displayNamePlaceholder")}
            maxLength={30}
            disabled={loading}
            className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
          />
        </div>
        {message && (
          <p
            className={`text-sm ${
              message === t("settings.profile.updateSuccess")
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
          disabled={loading || !displayName.trim() || displayName === originalName}
        >
          {saving ? t("settings.profile.updating") : t("settings.profile.update")}
        </Button>
      </form>
    </section>
  );
}
