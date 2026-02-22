"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LAST_GROUP_KEY = "kakeibo_last_group_id";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLastGroupSnapshot() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_GROUP_KEY);
}

type GroupItem = { id: string; name: string };

export default function GroupSelector() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [groups, setGroups] = useState<GroupItem[] | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const lastGroupId = useSyncExternalStore(
    subscribeToStorage,
    getLastGroupSnapshot,
    () => null
  );

  // グループ一覧を取得
  useEffect(() => {
    const fetchGroups = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("group_members")
        .select("group_id, groups(id, name)");

      if (data) {
        const items = data
          .map((m) => {
            const g = m.groups as { id: string; name: string } | null;
            return g ? { id: g.id, name: g.name } : null;
          })
          .filter((g): g is GroupItem => g !== null);
        setGroups(items);
      }
    };
    fetchGroups();
  }, []);

  // 外部クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback(
    (groupId: string) => {
      localStorage.setItem(LAST_GROUP_KEY, groupId);
      window.dispatchEvent(new StorageEvent("storage", { key: LAST_GROUP_KEY }));
      setIsOpen(false);
      router.push(`/groups/${groupId}`);
    },
    [router]
  );

  // 2グループ以上の場合のみ表示
  if (!groups || groups.length <= 1) return null;

  const currentGroup = lastGroupId ? groups.find((g) => g.id === lastGroupId) : null;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-theme-muted hover:text-theme-headline hover:bg-theme-bg rounded-lg transition-colors"
        title="グループを切替"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        <span className="hidden sm:block truncate max-w-[72px]">
          {currentGroup?.name ?? "グループ"}
        </span>
        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-theme-card-bg border border-theme-card-border rounded-lg shadow-lg z-50 overflow-hidden">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => handleSelect(group.id)}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-theme-bg transition-colors ${
                group.id === lastGroupId
                  ? "text-theme-primary-text font-medium bg-theme-primary/10"
                  : "text-theme-text"
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
