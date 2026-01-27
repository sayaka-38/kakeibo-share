"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Props = {
  groupId: string;
  groupName: string;
};

/**
 * グループ削除ボタン（オーナー専用）
 *
 * - 削除前に確認ダイアログを表示
 * - 削除成功後はグループ一覧へリダイレクト
 * - 他のメンバーへの影響を明示
 */
export function DeleteGroupButton({ groupId, groupName }: Props) {
  const router = useRouter();
  const [showDialog, setShowDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/groups/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 削除成功: グループ一覧へリダイレクト
        router.push("/groups");
        router.refresh();
      } else {
        // エラー表示
        setError(data.error || "削除に失敗しました");
        setIsDeleting(false);
      }
    } catch {
      setError("ネットワークエラーが発生しました");
      setIsDeleting(false);
    }
  }, [groupId, router]);

  const handleCancel = useCallback(() => {
    setShowDialog(false);
    setError(null);
  }, []);

  return (
    <>
      {/* 削除ボタン */}
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
        aria-label="グループを削除"
      >
        <svg
          className="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        削除
      </button>

      {/* 確認ダイアログ */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto"
          aria-labelledby="delete-dialog-title"
          role="dialog"
          aria-modal="true"
        >
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={handleCancel}
          />

          {/* ダイアログ本体 */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              {/* アイコン */}
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>

              {/* タイトル */}
              <h3
                id="delete-dialog-title"
                className="text-lg font-semibold text-gray-900 text-center mb-2"
              >
                グループを削除しますか？
              </h3>

              {/* グループ名 */}
              <p className="text-center text-gray-700 font-medium mb-4">
                「{groupName}」
              </p>

              {/* 警告メッセージ */}
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                <ul className="text-sm text-amber-800 space-y-1">
                  <li>・このグループに関連するすべての支払い記録が削除されます。</li>
                  <li>・他のメンバーの画面からも、このグループの記録がすべて消去されます。</li>
                  <li className="font-medium">・この操作は取り消せません。</li>
                </ul>
              </div>

              {/* エラーメッセージ */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      削除中...
                    </span>
                  ) : (
                    "削除する"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
