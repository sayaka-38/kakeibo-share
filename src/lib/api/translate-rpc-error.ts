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

const RPC_ERROR_MAP: Record<string, { rules: RpcErrorRule[]; fallbackKey: string }> = {
  leave_group: { rules: LEAVE_GROUP_ERRORS, fallbackKey: "groups.leave.failed" },
  transfer_group_ownership: { rules: TRANSFER_OWNERSHIP_ERRORS, fallbackKey: "groups.transferOwner.failed" },
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
