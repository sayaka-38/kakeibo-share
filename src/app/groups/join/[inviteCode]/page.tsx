"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type Props = {
  params: Promise<{ inviteCode: string }>;
};

type JoinState =
  | { status: "loading" }
  | { status: "success"; groupId: string; groupName: string }
  | { status: "error"; message: string; needsLogin?: boolean };

/**
 * API レスポンスのステータスコードに応じたメッセージを返す
 * ルームメイトに配慮した柔らかい表現を使用
 */
function getErrorMessageByStatus(status: number, apiError?: string): { message: string; needsLogin: boolean } {
  switch (status) {
    case 400:
      // 招待コードの形式が不正
      return {
        message: t("groups.invite.errors.invalidCode"),
        needsLogin: false,
      };
    case 401:
      // 未認証
      return {
        message: t("groups.invite.errors.notAuthenticated"),
        needsLogin: true,
      };
    case 403:
      // グループが満員
      return {
        message: "このグループは現在メンバーがいっぱいです。オーナーにお問い合わせください。",
        needsLogin: false,
      };
    case 404:
      // 招待コードが無効
      return {
        message: "この招待リンクは無効か、既に使用できなくなっています。新しいリンクをリクエストしてください。",
        needsLogin: false,
      };
    case 409:
      // 既にメンバー
      return {
        message: "すでにこのグループのメンバーです。グループ一覧からアクセスできます。",
        needsLogin: false,
      };
    default:
      // その他のエラー
      return {
        message: apiError || "予期せぬエラーが発生しました。しばらく経ってからお試しください。",
        needsLogin: false,
      };
  }
}

export default function JoinGroupPage({ params }: Props) {
  const [state, setState] = useState<JoinState>({ status: "loading" });
  const router = useRouter();

  useEffect(() => {
    const handleJoin = async () => {
      const { inviteCode } = await params;

      try {
        // API Route 経由でグループに参加
        // RLS をバイパスするため、サーバーサイドで service role を使用
        const response = await fetch("/api/groups/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inviteCode }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setState({
            status: "success",
            groupId: data.groupId,
            groupName: data.groupName,
          });

          // 3秒後に自動でグループダッシュボードへリダイレクト
          setTimeout(() => {
            router.push(`/groups/${data.groupId}`);
          }, 3000);
        } else {
          const { message, needsLogin } = getErrorMessageByStatus(
            response.status,
            data.error
          );
          setState({
            status: "error",
            message,
            needsLogin,
          });
        }
      } catch {
        // ネットワークエラーなど
        setState({
          status: "error",
          message: "ネットワークエラーが発生しました。接続を確認してください。",
          needsLogin: false,
        });
      }
    };

    handleJoin();
  }, [params, router]);

  // ローディング中
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-primary mx-auto mb-4"></div>
          <p className="text-theme-text">{t("groups.invite.join.joining")}</p>
        </div>
      </div>
    );
  }

  // 成功
  if (state.status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="max-w-md w-full mx-4">
          <div className="bg-theme-card-bg rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-theme-text/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-theme-text"
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
            </div>
            <h1 className="text-xl font-bold text-theme-headline mb-2">
              {t("groups.invite.join.success")}
            </h1>
            <p className="text-theme-text mb-2">
              {t("groups.invite.join.welcomeMessage", {
                groupName: state.groupName,
              })}
            </p>
            <p className="text-sm text-theme-muted mb-6">
              まもなくグループページへ移動します...
            </p>
            <Link
              href={`/groups/${state.groupId}`}
              className="inline-flex items-center justify-center w-full px-4 py-3 bg-theme-primary text-white font-medium rounded-lg hover:bg-theme-primary/80 transition-colors"
            >
              {t("groups.invite.join.goToGroup")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // エラー
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-bg">
      <div className="max-w-md w-full mx-4">
        <div className="bg-theme-card-bg rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-theme-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-theme-accent"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-theme-headline mb-2">
            {t("common.error")}
          </h1>
          <p className="text-theme-text mb-6">{state.message}</p>

          {state.needsLogin ? (
            <div className="space-y-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full px-4 py-3 bg-theme-primary text-white font-medium rounded-lg hover:bg-theme-primary/80 transition-colors"
              >
                {t("auth.login.title")}
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center w-full px-4 py-3 bg-theme-bg text-theme-text font-medium rounded-lg hover:bg-theme-card-border transition-colors"
              >
                {t("auth.signup.title")}
              </Link>
            </div>
          ) : (
            <Link
              href="/groups"
              className="inline-flex items-center justify-center w-full px-4 py-3 bg-theme-bg text-theme-text font-medium rounded-lg hover:bg-theme-card-border transition-colors"
            >
              {t("groups.backToGroups")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
