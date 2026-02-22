"use client";

import { useState, useEffect, useCallback } from "react";

export type FrequentPayment = {
  description: string;
  category_id: string | null;
};

/**
 * グループの頻出支払い履歴を取得するカスタムフック
 *
 * @param groupId グループID（未指定・空文字時はフェッチしない）
 * @returns suggestions（全件）、filter（インクリメンタルサーチ用）、isLoading
 */
export function useFrequentPayments(groupId: string | undefined) {
  const [suggestions, setSuggestions] = useState<FrequentPayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;

    let cancelled = false;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/payments/frequent?groupId=${encodeURIComponent(groupId)}&limit=6`
        );
        const data = await res.json();
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        // サイレントフェイル — UI への影響なし
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  /** クエリ文字列で suggestions をインクリメンタルに絞り込む */
  const filter = useCallback(
    (query: string): FrequentPayment[] => {
      if (!query) return suggestions;
      const lower = query.toLowerCase();
      return suggestions.filter((s) =>
        s.description.toLowerCase().includes(lower)
      );
    },
    [suggestions]
  );

  return { suggestions, filter, isLoading };
}
