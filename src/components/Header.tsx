"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import type { Profile } from "@/types/database";
import ThemeSelector from "./ThemeSelector";

const LP_URL = "https://kakeibo-share.vercel.app/";

type HeaderProps = {
  user: Profile | null;
};

export default function Header({ user }: HeaderProps) {
  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = LP_URL;
  };

  return (
    <header className="bg-theme-card-bg border-b border-theme-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link
              href={user ? "/dashboard" : LP_URL}
              className="text-xl font-bold text-theme-headline hover:opacity-80 transition-opacity"
            >
              {t("common.appName")}
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <ThemeSelector />
            {user && (
              <>
                <Link
                  href="/settings"
                  className="text-sm text-theme-muted hover:text-theme-headline transition-colors flex items-center gap-1"
                  aria-label={t("navigation.settings")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {user.display_name || user.email}
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm text-theme-text hover:text-theme-headline"
                >
                  {t("common.logout")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
