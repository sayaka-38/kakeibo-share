import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { DemoButton } from "@/components/demo/DemoButton";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect authenticated users to dashboard
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-theme-primary/10 to-theme-card-bg">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        {/* Header */}
        <header className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-theme-headline mb-4">
            {t("common.appName")}
          </h1>
          <p className="text-xl text-theme-muted max-w-2xl mx-auto">
            {t("landing.tagline")}
          </p>
        </header>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-theme-primary hover:bg-theme-primary/80 transition-colors"
          >
            {t("landing.getStarted")}
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 border border-theme-card-border text-base font-medium rounded-lg shadow-sm text-theme-text bg-theme-card-bg hover:bg-theme-bg transition-colors"
          >
            {t("landing.signIn")}
          </Link>
        </div>

        {/* Demo Button */}
        <div className="mb-16">
          <DemoButton />
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-theme-card-bg rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-theme-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-theme-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-theme-headline mb-2">
              {t("landing.features.easyRecording.title")}
            </h3>
            <p className="text-theme-muted">
              {t("landing.features.easyRecording.description")}
            </p>
          </div>

          <div className="bg-theme-card-bg rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-theme-text/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-theme-text"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-theme-headline mb-2">
              {t("landing.features.autoSettlement.title")}
            </h3>
            <p className="text-theme-muted">
              {t("landing.features.autoSettlement.description")}
            </p>
          </div>

          <div className="bg-theme-card-bg rounded-xl shadow-sm p-6 text-center">
            <div className="w-12 h-12 bg-theme-secondary/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-theme-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-theme-headline mb-2">
              {t("landing.features.groupSharing.title")}
            </h3>
            <p className="text-theme-muted">
              {t("landing.features.groupSharing.description")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
