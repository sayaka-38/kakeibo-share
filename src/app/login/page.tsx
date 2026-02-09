"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

function getInitialError(searchParams: ReturnType<typeof useSearchParams>): string | null {
  const urlError = searchParams.get("error");
  if (urlError === "auth_failed") {
    return t("auth.errors.authenticationFailed");
  }
  return null;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => getInitialError(searchParams));
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleLogin} className="mt-8 space-y-6">
      {error && (
        <div className="bg-theme-accent/10 border border-theme-accent/30 text-theme-accent px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-theme-text"
          >
            {t("auth.form.email")}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            placeholder={t("auth.form.emailPlaceholder")}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-theme-text"
          >
            {t("auth.form.password")}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full px-3 py-2 border border-theme-card-border rounded-lg shadow-sm text-theme-headline placeholder:text-theme-muted/50 focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-theme-primary"
            placeholder={t("auth.form.passwordPlaceholder")}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-theme-button-text bg-theme-primary hover:bg-theme-primary/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-theme-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("auth.login.signingIn") : t("auth.login.title")}
      </button>

      <p className="text-center text-sm text-theme-muted">
        {t("auth.login.noAccount")}{" "}
        <Link
          href="/signup"
          className="font-medium text-theme-primary-text hover:text-theme-primary-text/80"
        >
          {t("auth.login.signUpLink")}
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-theme-bg px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-theme-headline">
            {t("common.appName")}
          </h1>
          <p className="mt-2 text-theme-muted">{t("auth.login.subtitle")}</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
