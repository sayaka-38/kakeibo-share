type StatusHandlerProps = {
  isLoading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Loading / Error / Empty の表示を一元管理するラッパーコンポーネント。
 * レンダリング優先順位: isLoading → error → isEmpty → children
 */
export function StatusHandler({
  isLoading,
  error,
  isEmpty,
  emptyState,
  loadingFallback,
  children,
}: StatusHandlerProps) {
  if (isLoading) {
    return (
      <>
        {loadingFallback ?? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme-primary" />
          </div>
        )}
      </>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  if (isEmpty) {
    return <>{emptyState ?? null}</>;
  }

  return <>{children}</>;
}
