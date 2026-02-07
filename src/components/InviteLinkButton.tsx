"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { t } from "@/lib/i18n";

// navigator.share の有無をクライアント/サーバーで安全に判定
function useCanShare() {
  return useSyncExternalStore(
    () => () => {}, // subscribe: 静的な値なので何もしない
    () => typeof navigator !== "undefined" && "share" in navigator, // クライアント
    () => false // サーバー
  );
}

type Props = {
  inviteCode: string;
};

export function InviteLinkButton({ inviteCode }: Props) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/groups/join/${inviteCode}`
      : `/groups/join/${inviteCode}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // フォールバック: execCommand を使用
      const textarea = document.createElement("textarea");
      textarea.value = inviteUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [inviteUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t("groups.invite.link.title"),
          text: t("groups.invite.link.description"),
          url: inviteUrl,
        });
      } catch {
        // ユーザーがキャンセルした場合など
      }
    } else {
      // Web Share API が使えない場合はコピーにフォールバック
      handleCopy();
    }
  }, [inviteUrl, handleCopy]);

  return (
    <div className="bg-theme-primary/10 rounded-lg p-4">
      <h3 className="text-sm font-medium text-theme-headline mb-2">
        {t("groups.invite.link.title")}
      </h3>
      <p className="text-xs text-theme-primary mb-3">
        {t("groups.invite.link.description")}
      </p>

      <div className="flex gap-2">
        {/* コピーボタン */}
        <button
          onClick={handleCopy}
          className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            copied
              ? "bg-theme-text text-white"
              : "bg-theme-primary text-white hover:bg-theme-primary/80 active:scale-95"
          }`}
        >
          {copied ? (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {t("groups.invite.link.copied")}
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              {t("groups.invite.link.copy")}
            </>
          )}
        </button>

        {/* 共有ボタン（モバイル向け） */}
        {canShare && (
          <button
            onClick={handleShare}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-theme-card-bg border border-theme-primary text-theme-primary rounded-lg font-medium text-sm hover:bg-theme-primary/10 active:scale-95 transition-all"
            aria-label={t("groups.invite.link.share")}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
