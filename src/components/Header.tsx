"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import type { Profile } from "@/types/database";
import ThemeSelector from "./ThemeSelector";

type HeaderProps = {
  user: Profile | null;
};

export default function Header({ user }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="bg-theme-card-bg border-b border-theme-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-theme-headline">
              {t("common.appName")}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <ThemeSelector />
            {user && (
              <>
                <span className="text-sm text-theme-muted">
                  {user.display_name || user.email}
                </span>
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
