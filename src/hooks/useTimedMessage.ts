import { useState, useEffect } from "react";

/**
 * 一定時間後に自動消去されるメッセージ状態を管理するフック
 */
export function useTimedMessage(durationMs = 5000) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);

  return { message, setMessage };
}
