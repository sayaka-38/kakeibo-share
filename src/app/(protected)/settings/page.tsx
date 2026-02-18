"use client";

import { t } from "@/lib/i18n";
import { LanguageSection } from "./LanguageSection";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DeleteAccountSection } from "./DeleteAccountSection";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-theme-headline">
        {t("settings.title")}
      </h1>
      <LanguageSection />
      <ProfileSection />
      <PasswordSection />
      <DeleteAccountSection />
    </div>
  );
}
