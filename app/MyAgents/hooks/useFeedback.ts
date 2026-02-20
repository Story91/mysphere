"use client";

import { useState, useEffect, useCallback } from "react";
import { kya } from "@/lib/kya";
import type { FeedbackComment } from "@registrai/kya";

export function useFeedback(agentId: string) {
  const [feedback, setFeedback] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchFeedback = useCallback(async (pageNum: number, reset: boolean) => {
    if (!agentId) return;
    setLoading(true);
    try {
      const result = await kya.getFeedback(agentId, { page: pageNum, limit: 10 });
      const items: FeedbackComment[] = Array.isArray(result)
        ? result
        : (result as any).items ?? [];

      if (reset) setFeedback(items);
      else setFeedback((prev) => [...prev, ...items]);
      setHasMore(items.length === 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    setPage(1);
    fetchFeedback(1, true);
  }, [agentId]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    fetchFeedback(next, false);
  };

  const refresh = () => {
    setPage(1);
    fetchFeedback(1, true);
  };

  return { feedback, loading, error, hasMore, loadMore, refresh };
}
