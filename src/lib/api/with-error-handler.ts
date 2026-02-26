import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { authenticateRequest } from "./authenticate";

type Handler<TContext = unknown> = (
  request: Request,
  context: TContext
) => Promise<NextResponse>;

/**
 * API Route ハンドラの外側 try-catch を共通化するラッパー
 *
 * - ZodError → 400（バリデーションエラー）
 * - それ以外 → 500（予期せぬサーバーエラー）
 *
 * 使用例:
 * export const GET = withErrorHandler(async (req, ctx) => { ... }, "payments/[id]");
 */
export function withErrorHandler<TContext = unknown>(
  handler: Handler<TContext>,
  routeName: string
): Handler<TContext> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues[0]?.message ?? "入力内容に誤りがあります";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error(`[${routeName}] Unexpected error:`, error);
      return NextResponse.json(
        { error: "サーバーエラーが発生しました" },
        { status: 500 }
      );
    }
  };
}

/**
 * 認証付き API Route ハンドラのラッパー
 *
 * withErrorHandler の機能に加え、authenticateRequest() を内包する。
 * 認証失敗時は自動的に 401 を返す。
 * ハンドラは (request, { params, user, supabase }) を受け取る。
 *
 * 使用例（パラメータなし）:
 * export const GET = withAuthHandler(async (req, { user, supabase }) => { ... }, "GET /api/route");
 *
 * 使用例（パラメータあり）:
 * export const GET = withAuthHandler<Promise<{ id: string }>>(
 *   async (req, { params, user, supabase }) => {
 *     const { id } = await params;
 *     ...
 *   },
 *   "GET /api/route/[id]"
 * );
 */
export type AuthedContext<TParams = unknown> = {
  params: TParams;
  user: User;
  supabase: SupabaseClient<Database>;
};

export function withAuthHandler<TParams = unknown>(
  handler: (request: Request, context: AuthedContext<TParams>) => Promise<NextResponse>,
  routeName: string
): (request: Request, context: { params: TParams }) => Promise<NextResponse> {
  return withErrorHandler<{ params: TParams }>(async (request, context) => {
    const auth = await authenticateRequest();
    if (!auth.success) return auth.response;
    const { user, supabase } = auth;
    return handler(request, { params: context.params, user, supabase });
  }, routeName);
}
