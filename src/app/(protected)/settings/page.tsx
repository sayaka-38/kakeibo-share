"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

const LP_URL = "https://kakeibo-share.vercel.app/";

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");

  // Password state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");

  // Delete account state
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load profile
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
      setProfileLoading(false);
    }
    loadProfile();
  }, [supabase]);

  // Profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });

    if (res.ok) {
      setProfileMessage(t("settings.profile.updateSuccess"));
      setOriginalName(displayName);
      router.refresh();
    } else {
      const data = await res.json();
      setProfileMessage(data.error || t("settings.profile.updateFailed"));
    }
    setProfileSaving(false);
  };

  // Password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword.length < 6) {
      setPasswordMessage(t("settings.password.tooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage(t("settings.password.mismatch"));
      return;
    }

    setPasswordSaving(true);

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (res.ok) {
      setPasswordMessage(t("settings.password.changeSuccess"));
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json();
      setPasswordMessage(data.error || t("settings.password.changeFailed"));
    }
    setPasswordSaving(false);
  };

  // Delete account
  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");

    const res = await fetch("/api/auth/delete-account", {
      method: "POST",
    });

    if (res.ok) {
      await supabase.auth.signOut();
      window.location.href = LP_URL;
    } else {
      const data = await res.json();
      setDeleteError(data.error || t("settings.deleteAccount.deleteFailed"));
      setDeleting(false);
    }
  };

  const isDeleteConfirmed = deleteConfirmText === "削除";

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-theme-headline">
        {t("settings.title")}
      </h1>

      {/* Profile Section */}
      <section className="bg-theme-card-bg rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-theme-headline mb-4">
          {t("settings.profile.title")}
        </h2>
        <form onSubmit={handleProfileUpdate} className="space-y-4">
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
              disabled={profileLoading}
              className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-primary"
            />
          </div>
          {profileMessage && (
            <p
              className={`text-sm ${
                profileMessage === t("settings.profile.updateSuccess")
                  ? "text-green-600"
                  : "text-theme-accent"
              }`}
            >
              {profileMessage}
            </p>
          )}
          <Button
            type="submit"
            loading={profileSaving}
            disabled={
              profileLoading || !displayName.trim() || displayName === originalName
            }
          >
            {profileSaving
              ? t("settings.profile.updating")
              : t("settings.profile.update")}
          </Button>
        </form>
      </section>

      {/* Password Section */}
      <section className="bg-theme-card-bg rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-theme-headline mb-4">
          {t("settings.password.title")}
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-4">
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
          {passwordMessage && (
            <p
              className={`text-sm ${
                passwordMessage === t("settings.password.changeSuccess")
                  ? "text-green-600"
                  : "text-theme-accent"
              }`}
            >
              {passwordMessage}
            </p>
          )}
          <Button
            type="submit"
            loading={passwordSaving}
            disabled={!newPassword || !confirmPassword}
          >
            {passwordSaving
              ? t("settings.password.changing")
              : t("settings.password.change")}
          </Button>
        </form>
      </section>

      {/* Delete Account Section */}
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
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={t("settings.deleteAccount.confirmPlaceholder")}
              className="w-full rounded-lg border border-theme-card-border bg-theme-bg px-3 py-2 text-theme-text placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-accent"
            />
          </div>
          {deleteError && (
            <p className="text-sm text-theme-accent">{deleteError}</p>
          )}
          <Button
            variant="danger"
            loading={deleting}
            disabled={!isDeleteConfirmed}
            onClick={handleDeleteAccount}
          >
            {deleting
              ? t("settings.deleteAccount.deleting")
              : t("settings.deleteAccount.delete")}
          </Button>
        </div>
      </section>
    </div>
  );
}
