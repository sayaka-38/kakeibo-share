/**
 * 統合テスト共通ヘルパー
 *
 * ローカル Supabase を使う統合テスト向けのユーティリティ。
 * - createAdminClient: service_role 権限の Supabase クライアント
 * - checkDbAvailable: DB 接続チェック（未起動時 false → テストスキップ用）
 * - SEED: seed.sql の UUID 定数
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// ローカル Supabase の標準開発キー（supabase init で生成される公開済みキー）
const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** seed.sql の確定 UUID */
export const SEED = {
  ALICE_ID: "a1111111-1111-1111-1111-111111111111",
  BOB_ID: "b2222222-2222-2222-2222-222222222222",
  GROUP_ID: "c3333333-3333-3333-3333-333333333333",
  GROUP2_ID: "f6666666-6666-6666-6666-666666666666",
  PAYMENT1_ID: "d4444444-4444-4444-4444-444444444444",
  PAYMENT2_ID: "e5555555-5555-5555-5555-555555555555",
  PAYMENT3_ID: "a7777777-7777-7777-7777-777777777777",
} as const;

/** service_role 権限のクライアントを生成 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** anon 権限のクライアントを生成（signInWithPassword で認証後に使う） */
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(LOCAL_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** ローカル DB が利用可能か確認。未起動時は warn して false を返す */
export async function checkDbAvailable(
  admin: SupabaseClient<Database>
): Promise<boolean> {
  try {
    const { error } = await admin.from("payments").select("id").limit(1);
    if (error) {
      console.warn("⚠ ローカル Supabase 未起動 — 統合テストスキップ");
      return false;
    }
    return true;
  } catch {
    console.warn("⚠ ローカル Supabase 接続失敗 — 統合テストスキップ");
    return false;
  }
}
