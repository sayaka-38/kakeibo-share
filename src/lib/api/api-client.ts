import type { z } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      (data as { error?: string }).error ?? "エラーが発生しました"
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(url: string) => request<T>(url),
  /** レスポンスを Zod スキーマでパースして型安全に返す */
  validatedGet: async <S extends z.ZodTypeAny>(
    url: string,
    schema: S
  ): Promise<z.infer<S>> => {
    const data = await request<unknown>(url);
    return schema.parse(data);
  },
  post: <T>(url: string, body: unknown) =>
    request<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  delete: (url: string) => request<void>(url, { method: "DELETE" }),
};
