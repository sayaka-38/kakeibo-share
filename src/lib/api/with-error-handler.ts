import { NextResponse } from "next/server";
import { ZodError } from "zod";

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
