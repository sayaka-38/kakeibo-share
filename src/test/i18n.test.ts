import { describe, it, expect } from "vitest";
import { t } from "@/lib/i18n";
import ja from "@/locales/ja.json";

describe("i18n - t function", () => {
  describe("Login page translations", () => {
    it("should return correct Japanese translation for common.appName", () => {
      expect(t("common.appName")).toBe("Kakeibo Share");
    });

    it("should return correct Japanese translation for auth.login.title", () => {
      expect(t("auth.login.title")).toBe("ログイン");
    });

    it("should return correct Japanese translation for auth.login.subtitle", () => {
      expect(t("auth.login.subtitle")).toBe("共有家計簿を管理する");
    });

    it("should return correct Japanese translation for auth.login.signingIn", () => {
      expect(t("auth.login.signingIn")).toBe("ログイン中...");
    });

    it("should return correct Japanese translation for auth.login.noAccount", () => {
      expect(t("auth.login.noAccount")).toBe("アカウントをお持ちでないですか？");
    });

    it("should return correct Japanese translation for auth.login.signUpLink", () => {
      expect(t("auth.login.signUpLink")).toBe("新規登録");
    });

    it("should return correct Japanese translation for auth.form.email", () => {
      expect(t("auth.form.email")).toBe("メールアドレス");
    });

    it("should return correct Japanese translation for auth.form.emailPlaceholder", () => {
      expect(t("auth.form.emailPlaceholder")).toBe("you@example.com");
    });

    it("should return correct Japanese translation for auth.form.password", () => {
      expect(t("auth.form.password")).toBe("パスワード");
    });

    it("should return correct Japanese translation for auth.form.passwordPlaceholder", () => {
      expect(t("auth.form.passwordPlaceholder")).toBe("パスワードを入力");
    });
  });

  describe("Translation key matches ja.json", () => {
    it("all login page keys should match ja.json values exactly", () => {
      // Verify that t() returns the same value as direct ja.json access
      expect(t("common.appName")).toBe(ja.common.appName);
      expect(t("auth.login.title")).toBe(ja.auth.login.title);
      expect(t("auth.login.subtitle")).toBe(ja.auth.login.subtitle);
      expect(t("auth.login.signingIn")).toBe(ja.auth.login.signingIn);
      expect(t("auth.login.noAccount")).toBe(ja.auth.login.noAccount);
      expect(t("auth.login.signUpLink")).toBe(ja.auth.login.signUpLink);
      expect(t("auth.form.email")).toBe(ja.auth.form.email);
      expect(t("auth.form.emailPlaceholder")).toBe(ja.auth.form.emailPlaceholder);
      expect(t("auth.form.password")).toBe(ja.auth.form.password);
      expect(t("auth.form.passwordPlaceholder")).toBe(ja.auth.form.passwordPlaceholder);
    });
  });

  describe("Missing key handling", () => {
    it("should return the key itself when translation is not found", () => {
      expect(t("non.existent.key")).toBe("non.existent.key");
    });
  });

  describe("Parameter interpolation", () => {
    it("should interpolate parameters correctly", () => {
      // groups.memberCount uses {count} parameter
      expect(t("groups.memberCount", { count: 5 })).toBe("5人のメンバー");
      expect(t("groups.memberCount", { count: 1 })).toBe("1人のメンバー");
    });
  });
});
