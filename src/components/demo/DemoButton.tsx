"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { createClient } from "@/lib/supabase/client";
import { createDemoSession } from "@/lib/demo/create-demo-session";
import { getTurnstileSiteKey } from "@/lib/env";
import { t } from "@/lib/i18n";

const SITE_KEY = getTurnstileSiteKey();

export function DemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const handleStartDemo = async () => {
    // Turnstile が有効で未検証の場合はブロック
    if (SITE_KEY && !turnstileToken) {
      setError(t("landing.demo.captchaRequired"));
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const result = await createDemoSession(
      supabase,
      turnstileToken ?? undefined
    );

    if (!result.success) {
      setError(result.error?.message ?? t("common.error"));
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {SITE_KEY && (
        <Turnstile
          siteKey={SITE_KEY}
          onSuccess={setTurnstileToken}
          onError={() => setError(t("landing.demo.captchaError"))}
          options={{ theme: "auto" }}
        />
      )}
      <button
        onClick={handleStartDemo}
        disabled={loading || (!!SITE_KEY && !turnstileToken)}
        className="inline-flex items-center justify-center px-6 py-3 border-2 border-dashed border-theme-card-border text-base font-medium rounded-lg text-theme-muted bg-theme-card-bg hover:bg-theme-bg hover:border-theme-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("landing.demo.starting") : t("landing.demo.button")}
      </button>
      <p className="text-sm text-theme-text">{t("landing.demo.subtitle")}</p>
      {error && (
        <p className="text-sm text-theme-accent mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
