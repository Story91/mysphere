"use client";

/**
 * Opinie o agencie - kolekcja `agentFeedback` w rejestrze MySphere
 * (app/utils/agents/registry.ts) zamiast nieistniejacego KYA, patrz lib/kya.ts.
 *
 * STRONICOWANIE JEST LOKALNE: opinie jednego agenta pobieramy JEDNYM
 * zapytaniem i dzielimy na strony w pamieci. Powod jest praktyczny -
 * stronicowanie po stronie Firestore wymagaloby `orderBy` razem z `where`,
 * czyli indeksu zlozonego, a brakujacy indeks to blad w konsoli i pusta lista
 * do czasu, az ktos zalozy go recznie. Liczba opinii na agenta jest mala, wiec
 * jedno zapytanie wystarcza.
 *
 * BRAK OPINII: pusta lista i `hasMore: false` - FeedbackList pokazuje wtedy
 * swoj wlasny stan "No reviews yet".
 */

import { useCallback, useEffect, useState } from "react";
import { getAgentFeedback } from "@/app/utils/agents/registry";
import type { AgentFeedbackRecord } from "@/app/utils/agents/types";

const PAGE_SIZE = 10;

export function useFeedback(agentId: string) {
  const [all, setAll] = useState<AgentFeedbackRecord[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await getAgentFeedback(agentId);
      setAll(items);
      setVisible(PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(() => {
    setVisible((prev) => prev + PAGE_SIZE);
  }, []);

  return {
    feedback: all.slice(0, visible),
    loading,
    error,
    hasMore: visible < all.length,
    loadMore,
    refresh: load,
  };
}
