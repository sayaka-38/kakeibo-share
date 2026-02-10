import { describe, it, expect } from "vitest";
import { translateAuthError } from "@/lib/auth/translate-error";

describe("translateAuthError", () => {
  it("Invalid login credentials を日本語に変換する", () => {
    const result = translateAuthError("Invalid login credentials");
    expect(result).toBe("メールアドレスまたはパスワードが正しくありません");
  });

  it("Email not confirmed を日本語に変換する", () => {
    const result = translateAuthError("Email not confirmed");
    expect(result).toBe(
      "メールアドレスの確認が完了していません。受信トレイを確認してください。"
    );
  });

  it("User already registered を日本語に変換する", () => {
    const result = translateAuthError("User already registered");
    expect(result).toBe("このメールアドレスはすでに登録されています");
  });

  it("Password too short を日本語に変換する", () => {
    const result = translateAuthError(
      "Password should be at least 6 characters"
    );
    expect(result).toBe("パスワードは6文字以上で入力してください");
  });

  it("Rate limit を日本語に変換する", () => {
    const result = translateAuthError("Request rate limit reached");
    expect(result).toBe(
      "リクエスト回数の上限に達しました。しばらくしてからお試しください。"
    );
  });

  it("Invalid email を日本語に変換する", () => {
    const result = translateAuthError(
      "Unable to validate email address: invalid format"
    );
    expect(result).toBe("有効なメールアドレスを入力してください");
  });

  it("Same password を日本語に変換する", () => {
    const result = translateAuthError(
      "New password should be different from the old password"
    );
    expect(result).toBe(
      "新しいパスワードは現在のパスワードと異なるものを入力してください"
    );
  });

  it("Network error を日本語に変換する", () => {
    const result = translateAuthError("Failed to fetch");
    expect(result).toBe(
      "ネットワークエラーが発生しました。接続を確認してください。"
    );
  });

  it("不明なエラーは汎用メッセージを返す", () => {
    const result = translateAuthError("Some unknown error from supabase");
    expect(result).toBe("エラーが発生しました。もう一度お試しください。");
  });

  it("大文字小文字を区別しない", () => {
    const result = translateAuthError("INVALID LOGIN CREDENTIALS");
    expect(result).toBe("メールアドレスまたはパスワードが正しくありません");
  });
});
