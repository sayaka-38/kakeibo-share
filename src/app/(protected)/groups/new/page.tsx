"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError(t("auth.errors.loginRequired"));
      setLoading(false);
      return;
    }

    // Create group
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({
        name,
        description: description || null,
        owner_id: user.id,
      })
      .select()
      .single();

    if (groupError || !group) {
      setError(groupError?.message || t("groups.errors.createFailed"));
      setLoading(false);
      return;
    }

    // Add creator as owner
    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      setError(t("groups.errors.addOwnerFailed") + memberError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(`/groups/${group.id}?flash=groupCreated`);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-theme-headline mb-6">
        {t("groups.createGroup")}
      </h1>

      <div className="bg-theme-card-bg rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-theme-accent/10 border border-theme-accent text-theme-accent px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-theme-text"
            >
              {t("groups.form.groupName")}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
              placeholder={t("groups.form.groupNamePlaceholder")}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-theme-text"
            >
              {t("groups.form.description")}
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
              placeholder={t("groups.form.descriptionPlaceholder")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-theme-button-text bg-theme-primary hover:bg-theme-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t("groups.form.creating") : t("groups.form.create")}
          </button>
        </form>
      </div>
    </div>
  );
}
