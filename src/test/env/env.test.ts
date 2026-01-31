import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("getSupabaseEnv", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("NEXT_PUBLIC_SUPABASE_URL が未設定の場合エラーをスローする", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { getSupabaseEnv } = await import("@/lib/env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定の場合エラーをスローする", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { getSupabaseEnv } = await import("@/lib/env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("両方未設定の場合エラーメッセージに両方の変数名を含む", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { getSupabaseEnv } = await import("@/lib/env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("両方設定済みの場合 url と anonKey を返す", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { getSupabaseEnv } = await import("@/lib/env");
    const result = getSupabaseEnv();

    expect(result).toEqual({
      url: "https://test.supabase.co",
      anonKey: "test-anon-key",
    });
  });

  it("空文字列の場合もエラーをスローする", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const { getSupabaseEnv } = await import("@/lib/env");
    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});
