"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { joinGroupByInviteCode } from "@/lib/invite/join-group";
import { t } from "@/lib/i18n";

type Props = {
  params: Promise<{ inviteCode: string }>;
};

type JoinState =
  | { status: "loading" }
  | { status: "success"; groupId: string; groupName: string }
  | { status: "error"; message: string; needsLogin?: boolean };

// エラーコードをメッセージに変換
function getErrorMessage(code: string): string {
  switch (code) {
    case "NOT_AUTHENTICATED":
      return t("groups.invite.errors.notAuthenticated");
    case "INVALID_INVITE_CODE":
      return t("groups.invite.errors.invalidCode");
    case "ALREADY_MEMBER":
      return t("groups.invite.errors.alreadyMember");
    case "GROUP_FULL":
      return t("groups.invite.errors.groupFull");
    default:
      return t("groups.invite.errors.joinFailed");
  }
}

export default function JoinGroupPage({ params }: Props) {
  const [state, setState] = useState<JoinState>({ status: "loading" });

  useEffect(() => {
    const handleJoin = async () => {
      const { inviteCode } = await params;
      const supabase = createClient();

      const result = await joinGroupByInviteCode(supabase, inviteCode);

      if (result.success) {
        setState({
          status: "success",
          groupId: result.data.groupId,
          groupName: result.data.groupName,
        });
      } else {
        const needsLogin = result.error.code === "NOT_AUTHENTICATED";
        setState({
          status: "error",
          message: getErrorMessage(result.error.code),
          needsLogin,
        });
      }
    };

    handleJoin();
  }, [params]);

  // ローディング中
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-700">{t("groups.invite.join.joining")}</p>
        </div>
      </div>
    );
  }

  // 成功
  if (state.status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
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
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {t("groups.invite.join.success")}
            </h1>
            <p className="text-gray-700 mb-6">
              {t("groups.invite.join.welcomeMessage", {
                groupName: state.groupName,
              })}
            </p>
            <Link
              href={`/groups/${state.groupId}`}
              className="inline-flex items-center justify-center w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
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
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {t("common.error")}
          </h1>
          <p className="text-gray-700 mb-6">{state.message}</p>

          {state.needsLogin ? (
            <div className="space-y-3">
              <Link
                href="/login"
                className="inline-flex items-center justify-center w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("auth.login.title")}
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center w-full px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("auth.signup.title")}
              </Link>
            </div>
          ) : (
            <Link
              href="/groups"
              className="inline-flex items-center justify-center w-full px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t("groups.backToGroups")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
