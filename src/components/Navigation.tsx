"use client";

import { useSyncExternalStore, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

const LAST_GROUP_KEY = "kakeibo_last_group_id";

// localStorage を subscribe して変更を監視
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLastGroupIdSnapshot() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_GROUP_KEY);
}

function getServerSnapshot() {
  return null;
}

function getNavItems(lastGroupId: string | null) {
  const settlementHref = lastGroupId
    ? `/groups/${lastGroupId}/settlement`
    : "/groups";
  return [
    { href: "/dashboard", labelKey: "navigation.dashboard", icon: "home" },
    { href: "/payments", labelKey: "navigation.payments", icon: "receipt" },
    { href: settlementHref, labelKey: "navigation.settlement", icon: "calculator" },
    { href: "/groups", labelKey: "navigation.groups", icon: "users" },
  ];
}

export default function Navigation() {
  const pathname = usePathname();
  const lastGroupId = useSyncExternalStore(
    subscribeToStorage,
    getLastGroupIdSnapshot,
    getServerSnapshot
  );

  // グループ詳細ページを訪問時に localStorage に保存
  useEffect(() => {
    const groupMatch = pathname.match(/^\/groups\/([a-f0-9-]+)/);
    if (groupMatch) {
      const groupId = groupMatch[1];
      const current = localStorage.getItem(LAST_GROUP_KEY);
      if (current !== groupId) {
        localStorage.setItem(LAST_GROUP_KEY, groupId);
        // 同一タブでも storage イベントを発火させる
        window.dispatchEvent(new StorageEvent("storage", { key: LAST_GROUP_KEY }));
      }
    }
  }, [pathname]);

  const navItems = getNavItems(lastGroupId);

  // 清算リンクのアクティブ判定（グループの清算準備室も含む）
  const isSettlementActive = (href: string) => {
    if (href.includes("/settlement")) {
      return pathname.includes("/settlement");
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-theme-card-bg border-b border-theme-card-border md:border-b-0 md:border-r md:w-64 md:min-h-[calc(100vh-4rem)]">
      {/* Mobile navigation */}
      <div className="md:hidden flex overflow-x-auto">
        {navItems.map((item) => {
          const isActive = isSettlementActive(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              className={`flex-1 flex flex-col items-center py-3 px-4 text-xs ${
                isActive
                  ? "text-theme-primary border-b-2 border-theme-primary"
                  : "text-theme-text hover:text-theme-headline"
              }`}
            >
              <NavIcon name={item.icon} />
              <span className="mt-1">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>

      {/* Desktop navigation */}
      <div className="hidden md:block p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const isActive = isSettlementActive(item.href);
            return (
              <li key={item.labelKey}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm ${
                    isActive
                      ? "bg-theme-primary/15 text-theme-primary"
                      : "text-theme-muted hover:bg-theme-bg"
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case "home":
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      );
    case "receipt":
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      );
    case "calculator":
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      );
    case "users":
      return (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}
