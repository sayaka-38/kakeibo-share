import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient, ApiError } from "@/lib/api/api-client";

function mockFetch(status: number, body: unknown, ok?: boolean) {
  return vi.fn().mockResolvedValue({
    ok: ok ?? status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchJsonFail(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.reject(new Error("invalid json")),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("apiClient.get", () => {
  it("正常レスポンス: JSON を返す", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { id: "1" }));
    const result = await apiClient.get<{ id: string }>("/api/test");
    expect(result).toEqual({ id: "1" });
  });

  it("エラーレスポンス: ApiError を throw する", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: "見つかりません" }));
    await expect(apiClient.get("/api/test")).rejects.toThrow(ApiError);
    await expect(apiClient.get("/api/test")).rejects.toMatchObject({
      status: 404,
      message: "見つかりません",
    });
  });

  it("JSON parse 失敗時: フォールバックメッセージを使用", async () => {
    vi.stubGlobal("fetch", mockFetchJsonFail(500));
    await expect(apiClient.get("/api/test")).rejects.toMatchObject({
      status: 500,
      message: "エラーが発生しました",
    });
  });
});

describe("apiClient.post", () => {
  it("正常レスポンス: POST で JSON を返す", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { created: true }));
    const result = await apiClient.post<{ created: boolean }>("/api/test", { name: "foo" });
    expect(result).toEqual({ created: true });
  });

  it("Content-Type ヘッダと body を付与してリクエストする", async () => {
    const fetchMock = mockFetch(200, {});
    vi.stubGlobal("fetch", fetchMock);
    await apiClient.post("/api/test", { key: "value" });
    expect(fetchMock).toHaveBeenCalledWith("/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "value" }),
    });
  });

  it("エラーレスポンス: ApiError を throw する", async () => {
    vi.stubGlobal("fetch", mockFetch(400, { error: "バリデーションエラー" }));
    await expect(apiClient.post("/api/test", {})).rejects.toMatchObject({
      status: 400,
      message: "バリデーションエラー",
    });
  });
});

describe("apiClient.put", () => {
  it("正常レスポンス: PUT で JSON を返す", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { updated: true }));
    const result = await apiClient.put<{ updated: boolean }>("/api/test/1", { name: "bar" });
    expect(result).toEqual({ updated: true });
  });

  it("エラーレスポンス: ApiError を throw する", async () => {
    vi.stubGlobal("fetch", mockFetch(403, { error: "権限がありません" }));
    await expect(apiClient.put("/api/test/1", {})).rejects.toMatchObject({
      status: 403,
      message: "権限がありません",
    });
  });
});

describe("apiClient.delete", () => {
  it("204 No Content: undefined を返す", async () => {
    vi.stubGlobal("fetch", mockFetch(204, null));
    const result = await apiClient.delete("/api/test/1");
    expect(result).toBeUndefined();
  });

  it("エラーレスポンス: ApiError を throw する", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: "リソースが存在しません" }));
    await expect(apiClient.delete("/api/test/1")).rejects.toMatchObject({
      status: 404,
      message: "リソースが存在しません",
    });
  });
});

describe("ApiError", () => {
  it("name が 'ApiError' である", () => {
    const err = new ApiError(500, "server error");
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(500);
    expect(err.message).toBe("server error");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });
});
