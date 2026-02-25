import { NextResponse } from "next/server";
import { t } from "@/lib/i18n";

type RpcErrorRule = {
  pattern: RegExp;
  key: string;
  status: number;
};

const LEAVE_GROUP_ERRORS: RpcErrorRule[] = [
  { pattern: /Must transfer ownership/i, key: "groups.leave.ownerWarning", status: 409 },
  { pattern: /Not a member/i, key: "groups.leave.notMember", status: 404 },
];

const TRANSFER_OWNERSHIP_ERRORS: RpcErrorRule[] = [
  { pattern: /Cannot transfer ownership to yourself/i, key: "groups.transferOwner.selfTransfer", status: 400 },
  { pattern: /Only the owner/i, key: "groups.transferOwner.notOwner", status: 403 },
  { pattern: /not a member/i, key: "groups.transferOwner.targetNotMember", status: 404 },
];

const ARCHIVE_PAYMENT_ERRORS: RpcErrorRule[] = [
  { pattern: /not_found/i, key: "payments.errors.paymentNotFound", status: 404 },
  { pattern: /not_payer/i, key: "payments.errors.deleteNotAuthorized", status: 403 },
  { pattern: /settled/i, key: "payments.errors.deleteSettled", status: 403 },
];

const RPC_ERROR_MAP: Record<string, { rules: RpcErrorRule[]; fallbackKey: string }> = {
  leave_group: { rules: LEAVE_GROUP_ERRORS, fallbackKey: "groups.leave.failed" },
  transfer_group_ownership: { rules: TRANSFER_OWNERSHIP_ERRORS, fallbackKey: "groups.transferOwner.failed" },
  archive_payment: { rules: ARCHIVE_PAYMENT_ERRORS, fallbackKey: "payments.errors.deleteFailed" },
};

export function translateRpcError(
  rpcName: string,
  errorMessage: string
): { message: string; status: number } {
  const config = RPC_ERROR_MAP[rpcName];
  if (!config) {
    return { message: t("common.error"), status: 500 };
  }

  for (const rule of config.rules) {
    if (rule.pattern.test(errorMessage)) {
      return { message: t(rule.key), status: rule.status };
    }
  }

  return { message: t(config.fallbackKey), status: 500 };
}

/**
 * HTTP ステータスコードを i18n メッセージに変換する
 *
 * Supabase のレート制限 (429) など、RPC 以外の HTTP エラーを
 * 共通フォーマットで処理するためのユーティリティ。
 *
 * @param status - HTTP ステータスコード (0 = ネットワーク到達不能)
 * @returns ユーザー向けメッセージ
 */
export function translateHttpError(status: number): string {
  if (status === 0) return t("common.networkError");
  if (status === 429) return t("common.rateLimited");
  return t("common.error");
}

/**
 * RPC の整数エラーコードを NextResponse に変換するヘルパー
 *
 * 共通コード:
 *   -1 → 404 (notFound)
 *   -2 → 403 (グループメンバーでない — メッセージ固定)
 *   -3 → 400 (wrongState)
 *   -4 → 400 (noEntries)
 *   その他負値 → 500
 *
 * @returns null (成功) または NextResponse (エラー)
 */
export function rpcCodeToResponse(
  code: number | null | undefined,
  messages: {
    notFound?: string;
    wrongState?: string;
    noEntries?: string;
  } = {}
): NextResponse | null {
  if (code === null || code === undefined || code >= 0) return null;
  if (code === -1)
    return NextResponse.json(
      { error: messages.notFound ?? "リソースが見つかりません" },
      { status: 404 }
    );
  if (code === -2)
    return NextResponse.json(
      { error: "このグループのメンバーではありません" },
      { status: 403 }
    );
  if (code === -3)
    return NextResponse.json(
      { error: messages.wrongState ?? "セッションの状態が不正です" },
      { status: 400 }
    );
  if (code === -4)
    return NextResponse.json(
      { error: messages.noEntries ?? "対象エントリがありません" },
      { status: 400 }
    );
  return NextResponse.json(
    { error: "サーバーエラーが発生しました" },
    { status: 500 }
  );
}

/**
 * fetch の catch エラーを i18n メッセージに変換する
 *
 * "Failed to fetch" / "NetworkError" 等はネットワーク到達不能として扱う。
 *
 * @param error - catch した unknown エラー
 * @returns ユーザー向けメッセージ
 */
export function translateFetchError(error: unknown): string {
  if (
    error instanceof TypeError &&
    /fetch|network/i.test(error.message)
  ) {
    return t("common.networkError");
  }
  return t("common.error");
}
