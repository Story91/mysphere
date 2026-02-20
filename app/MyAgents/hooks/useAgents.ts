"use client";

import { useState, useEffect, useCallback } from "react";
import { kya } from "@/lib/kya";
import type { AgentSummary } from "@registrai/kya";
import type { AgentFilters } from "../types";

const PAGE_SIZE = 24;

export function useAgents(filters: AgentFilters = {}) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchAgents = useCallback(async (pageNum: number, reset: boolean) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const result = await kya.listAgents({
        page: pageNum,
        limit: PAGE_SIZE,
        network: filters.network || "mainnet",
      });

      const items: AgentSummary[] = Array.isArray(result)
        ? result
        : (result as any).items ?? (result as any).agents ?? [];

      if (reset) {
        setAgents(items);
      } else {
        setAgents((prev) => [...prev, ...items]);
      }
      setHasMore(items.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters.network]);

  useEffect(() => {
    setPage(1);
    fetchAgents(1, true);
  }, [filters.network]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAgents(nextPage, false);
  };

  return { agents, loading, loadingMore, error, hasMore, loadMore };
}
