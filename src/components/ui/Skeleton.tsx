/**
 * Skeleton コンポーネント
 *
 * Phase 2-2: UI/UX最適化 - スケルトンローディング
 * 空白画面を見せないためのプレースホルダーコンポーネント
 */
import { type HTMLAttributes } from "react";

type SkeletonVariant = "rect" | "circle";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
  variant?: SkeletonVariant;
}

export function Skeleton({
  width,
  height,
  variant = "rect",
  className = "",
  ...props
}: SkeletonProps) {
  const baseClasses = "animate-pulse bg-gray-200";
  const shapeClass = variant === "circle" ? "rounded-full" : "rounded";
  const sizeClasses = [width, height].filter(Boolean).join(" ");

  return (
    <div
      className={`${baseClasses} ${shapeClass} ${sizeClasses} ${className}`.trim()}
      aria-hidden="true"
      {...props}
    />
  );
}

type SkeletonTextSize = "sm" | "md" | "lg";

interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  size?: SkeletonTextSize;
}

const textSizeMap: Record<SkeletonTextSize, string> = {
  sm: "h-3",
  md: "h-4",
  lg: "h-6",
};

export function SkeletonText({
  lines = 1,
  size = "md",
  className = "",
  ...props
}: SkeletonTextProps) {
  const heightClass = textSizeMap[size];

  return (
    <div className={`space-y-2 ${className}`.trim()} {...props}>
      {Array.from({ length: lines }).map((_, index) => {
        const isLastLine = index === lines - 1 && lines > 1;
        const widthClass = isLastLine ? "w-3/4" : "w-full";
        return (
          <Skeleton
            key={index}
            width={widthClass}
            height={heightClass}
          />
        );
      })}
    </div>
  );
}

interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {}

export function SkeletonCard({ className = "", ...props }: SkeletonCardProps) {
  return (
    <div
      className={`bg-white rounded-lg shadow p-4 ${className}`.trim()}
      {...props}
    >
      <div className="space-y-3">
        <Skeleton height="h-4" width="w-3/4" />
        <Skeleton height="h-4" width="w-1/2" />
        <Skeleton height="h-8" width="w-full" />
      </div>
    </div>
  );
}
