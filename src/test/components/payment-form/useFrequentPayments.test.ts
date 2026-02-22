import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFrequentPayments } from "@/components/payment-form/hooks/useFrequentPayments";

const mockFetch = vi.fn();

describe("useFrequentPayments", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ============================================
  // 異常系テスト（TDD: 異常系→正常系の順）
  // ============================================
  describe("異常系", () => {
    it("groupId が未指定の場合はフェッチしない", () => {
      renderHook(() => useFrequentPayments(undefined));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("groupId が空文字の場合はフェッチしない", () => {
      renderHook(() => useFrequentPayments(""));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("フェッチエラー時は suggestions が空のままになる", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.suggestions).toHaveLength(0);
    });

    it("API が空配列を返した場合 suggestions は空になる", async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ suggestions: [] }),
      });

      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.suggestions).toHaveLength(0);
    });
  });

  // ============================================
  // 正常系テスト
  // ============================================
  describe("正常系", () => {
    it("groupId 指定時に正しいエンドポイントへフェッチする", async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ suggestions: [] }),
      });

      renderHook(() => useFrequentPayments("group-abc"));

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("groupId=group-abc")
      );
    });

    it("フェッチした suggestions を返す", async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            suggestions: [
              { description: "スーパーで買い物", category_id: "cat-1" },
              { description: "コンビニ", category_id: null },
            ],
          }),
      });

      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => {
        expect(result.current.suggestions).toHaveLength(2);
      });

      expect(result.current.suggestions[0]).toEqual({
        description: "スーパーで買い物",
        category_id: "cat-1",
      });
      expect(result.current.suggestions[1]).toEqual({
        description: "コンビニ",
        category_id: null,
      });
    });

    it("groupId が変更されると再フェッチする", async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ suggestions: [] }),
      });

      const { rerender } = renderHook(
        ({ groupId }: { groupId: string }) => useFrequentPayments(groupId),
        { initialProps: { groupId: "group-1" } }
      );

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

      rerender({ groupId: "group-2" });

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("groupId=group-2")
      );
    });

    it("フェッチ中は isLoading が true になる", async () => {
      let resolveFetch!: (value: unknown) => void;
      mockFetch.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { result } = renderHook(() => useFrequentPayments("group-1"));

      expect(result.current.isLoading).toBe(true);

      resolveFetch({
        json: () => Promise.resolve({ suggestions: [] }),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  // ============================================
  // インクリメンタルサーチテスト
  // ============================================
  describe("filter（インクリメンタルサーチ）", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            suggestions: [
              { description: "スーパーで買い物", category_id: "cat-1" },
              { description: "コンビニ", category_id: null },
              { description: "スーパー銭湯", category_id: "cat-2" },
              { description: "電気代", category_id: "cat-3" },
            ],
          }),
      });
    });

    it("クエリが空の場合は全件返す", async () => {
      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => expect(result.current.suggestions).toHaveLength(4));

      expect(result.current.filter("")).toHaveLength(4);
    });

    it("部分一致でフィルタリングできる", async () => {
      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => expect(result.current.suggestions).toHaveLength(4));

      const filtered = result.current.filter("スーパー");
      expect(filtered).toHaveLength(2);
      expect(filtered.map((s) => s.description)).toEqual([
        "スーパーで買い物",
        "スーパー銭湯",
      ]);
    });

    it("大文字小文字を区別しない", async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            suggestions: [
              { description: "Netflix", category_id: "cat-1" },
              { description: "netflixプレミアム", category_id: "cat-1" },
              { description: "Spotify", category_id: "cat-2" },
            ],
          }),
      });

      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => expect(result.current.suggestions).toHaveLength(3));

      const filtered = result.current.filter("netflix");
      expect(filtered).toHaveLength(2);
    });

    it("マッチしない場合は空配列を返す", async () => {
      const { result } = renderHook(() => useFrequentPayments("group-1"));

      await waitFor(() => expect(result.current.suggestions).toHaveLength(4));

      expect(result.current.filter("zzz")).toHaveLength(0);
    });
  });
});
