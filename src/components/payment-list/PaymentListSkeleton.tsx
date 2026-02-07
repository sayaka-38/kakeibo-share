/**
 * PaymentListSkeleton コンポーネント
 *
 * Phase 2-2: UI/UX最適化 - 支払い一覧のスケルトンローディング
 *
 * 支払い一覧の読み込み中に表示するスケルトン。
 * 実際の支払いアイテムのレイアウトを模倣。
 */
import { Skeleton } from "@/components/ui/Skeleton";
import { t } from "@/lib/i18n";

interface PaymentListSkeletonProps {
  count?: number;
}

export function PaymentListSkeleton({ count = 3 }: PaymentListSkeletonProps) {
  return (
    <ul
      data-testid="payment-list-skeleton"
      className="divide-y divide-theme-card-border"
      aria-busy="true"
      aria-label={t("common.loading")}
    >
      {Array.from({ length: count }).map((_, index) => (
        <PaymentSkeletonItem key={index} />
      ))}
    </ul>
  );
}

function PaymentSkeletonItem() {
  return (
    <li data-testid="payment-skeleton-item" className="px-4 py-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 space-y-2">
          {/* 説明のスケルトン */}
          <Skeleton height="h-4" width="w-3/4" />
          {/* 支払者・日付のスケルトン */}
          <Skeleton height="h-3" width="w-1/2" />
        </div>
        {/* 金額のスケルトン */}
        <Skeleton height="h-5" width="w-20" />
      </div>
    </li>
  );
}
