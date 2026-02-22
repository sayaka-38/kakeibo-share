"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

type Props = {
  messages: Record<string, string>;
};

export function FlashMessage({ messages }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URLパラムからメッセージを直接導出（setState 不要）
  const flashKey = searchParams.get("flash");
  const message = flashKey ? (messages[flashKey] ?? null) : null;

  const [dismissed, setDismissed] = useState(false);
  const cleanupDone = useRef(false);

  // URLパラムのクリーンアップ（マウント時のみ。setStateなし）
  useEffect(() => {
    if (!message || cleanupDone.current) return;
    cleanupDone.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("flash");
    const newUrl = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 4秒後に自動消去（タイマーコールバック内での setState は許容パターン）
  useEffect(() => {
    if (!message || dismissed) return;
    const timer = setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(timer);
  }, [message, dismissed]);

  if (!message || dismissed) return null;

  return (
    <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {message}
    </div>
  );
}
