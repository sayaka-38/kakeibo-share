/**
 * (protected) レイアウト共通ローディング UI
 *
 * Next.js の loading.tsx 規約により、認証必須ページの
 * サーバーコンポーネント取得中に自動表示されるスケルトン。
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-bg">
      <div className="flex flex-col items-center gap-3">
        <svg
          className="w-8 h-8 animate-spin text-theme-primary"
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-sm text-theme-muted">読み込み中...</span>
      </div>
    </div>
  );
}
