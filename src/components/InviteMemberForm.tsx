"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type InviteMemberFormProps = {
  groupId: string;
};

export default function InviteMemberForm({ groupId }: InviteMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();

    // Find user by email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!profile) {
      setError(t("groups.invite.errors.userNotFound"));
      setLoading(false);
      return;
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", profile.id)
      .single();

    if (existingMember) {
      setError(t("groups.invite.errors.alreadyMember"));
      setLoading(false);
      return;
    }

    // Add member
    const { error: addError } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: profile.id,
      role: "member",
    });

    if (addError) {
      setError(t("groups.invite.errors.addFailed") + addError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setEmail("");
    setLoading(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-theme-text">
        {t("groups.invite.addMember")}
      </label>

      {error && (
        <p className="text-sm text-theme-accent">{error}</p>
      )}

      {success && (
        <p className="text-sm text-theme-text">{t("groups.invite.success")}</p>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t("groups.invite.emailPlaceholder")}
          className="flex-1 px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-sm text-theme-headline placeholder:text-theme-muted/70 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-theme-button-text bg-theme-primary hover:bg-theme-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("groups.invite.adding") : t("groups.invite.add")}
        </button>
      </div>
    </form>
  );
}
