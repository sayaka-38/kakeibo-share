"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import type { Profile } from "@/types/database";
import ThemeSelector from "./ThemeSelector";
import GroupSelector from "./GroupSelector";

const LP_URL = "https://kakeibo-share.vercel.app/";

type HeaderProps = {
  user: Profile | null;
};

export default function Header({ user }: HeaderProps) {
  const handleLogout = async () => {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // signOut failure should not prevent redirect
    }
    // Use window.location.replace to prevent back-button returning to protected page
    window.location.replace(LP_URL);
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

          <div className="flex items-center gap-3">
            <ThemeSelector />
            {user && <GroupSelector />}
            {user && (
              <div className="flex items-center gap-2">
                <Link
                  href="/settings"
                  className="text-sm text-theme-muted hover:text-theme-headline transition-colors flex items-center gap-1"
                  aria-label={t("navigation.settings")}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate max-w-[120px]">{user.display_name || user.email}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-1 text-theme-muted hover:text-theme-headline transition-colors"
                  aria-label={t("common.logout")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
