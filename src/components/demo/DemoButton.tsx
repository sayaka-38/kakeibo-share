"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createDemoSession } from "@/lib/demo/create-demo-session";
import { t } from "@/lib/i18n";

export function DemoButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartDemo = async () => {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const result = await createDemoSession(supabase);

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
      <button
        onClick={handleStartDemo}
        disabled={loading}
        className="inline-flex items-center justify-center px-6 py-3 border-2 border-dashed border-gray-300 text-base font-medium rounded-lg text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("landing.demo.starting") : t("landing.demo.button")}
      </button>
      <p className="text-sm text-gray-700">{t("landing.demo.subtitle")}</p>
      {error && (
        <p className="text-sm text-red-600 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
