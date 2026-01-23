import Link from "next/link";
import { t } from "@/lib/i18n";

interface DemoBannerProps {
  isDemo: boolean;
  expiresAt?: Date;
}

/**
 * 残り時間を「約X時間」の形式で返す
 */
function formatRemainingTime(expiresAt: Date): string {
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();

  if (diffMs <= 0) {
    return "まもなく終了";
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours >= 1) {
    return `残り約${diffHours}時間`;
  }

  return `残り約${diffMinutes}分`;
}

export function DemoBanner({ isDemo, expiresAt }: DemoBannerProps) {
  if (!isDemo) {
    return null;
  }

  return (
    <header
      role="banner"
      className="bg-amber-50 border-b border-amber-200 px-4 py-3"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            {t("demo.banner")}
          </span>
          <span className="text-sm text-amber-700">
            {t("demo.expirationNotice")}
          </span>
          {expiresAt && (
            <span className="text-xs text-amber-600">
              ({formatRemainingTime(expiresAt)})
            </span>
          )}
        </div>
        <Link
          href="/signup"
          className="text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
        >
          {t("demo.signUpPrompt")}
        </Link>
      </div>
    </header>
  );
}
