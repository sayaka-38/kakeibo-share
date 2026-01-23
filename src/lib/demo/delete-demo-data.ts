/**
 * デモデータ削除の保護機能
 *
 * 本番データを誤って削除しないよう、削除対象が
 * デモセッションに紐づいているかを検証する
 */

export interface DemoSession {
  id: string;
  userId: string;
  groupId: string;
  expiresAt: Date;
}

export interface DeletionTarget {
  type: "group" | "user";
  id: string;
  requestedBy?: string; // 削除を要求したユーザーID
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * デモデータの削除が許可されるかを検証する
 *
 * @param target - 削除対象の情報
 * @param demoSessions - 現在有効なデモセッション一覧
 * @returns 削除が許可されるかどうかと、拒否理由
 */
export function validateDemoDataDeletion(
  target: DeletionTarget,
  demoSessions: DemoSession[]
): ValidationResult {
  // 入力バリデーション: IDが空でないか
  if (!target.id || target.id.trim() === "") {
    return {
      allowed: false,
      reason: "削除対象のIDが指定されていません",
    };
  }

  // 入力バリデーション: タイプが有効か
  if (target.type !== "group" && target.type !== "user") {
    return {
      allowed: false,
      reason: "不正な削除対象タイプです",
    };
  }

  // デモセッションから該当するIDを検索
  const matchingSession = demoSessions.find((session) => {
    if (target.type === "group") {
      return session.groupId === target.id;
    } else {
      return session.userId === target.id;
    }
  });

  // デモセッションに存在しない場合は削除不可
  if (!matchingSession) {
    const entityName = target.type === "group" ? "グループ" : "ユーザー";
    return {
      allowed: false,
      reason: `この${entityName}はデモデータではないため削除できません`,
    };
  }

  // requestedBy が指定されている場合、自分のセッションのデータのみ削除可能
  if (target.requestedBy) {
    const isOwnSession = matchingSession.userId === target.requestedBy;
    if (!isOwnSession) {
      return {
        allowed: false,
        reason: "他のデモセッションのデータは削除できません",
      };
    }
  }

  // デモデータとして確認できたため削除を許可
  return {
    allowed: true,
  };
}
